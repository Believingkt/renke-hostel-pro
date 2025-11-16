import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { Order } from "@/types/order";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { detectBookingConflict } from "@/utils/bookingConflictDetection";
import { useAccommodation } from "@/contexts/AccommodationContext";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
  weekday_2_meals_price?: number;
  weekday_3_meals_price?: number;
  weekend_2_meals_price?: number;
  weekend_3_meals_price?: number;
}

interface EditOrderDialogProps {
  open: boolean;
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  onSave: (form: { 
    order_status: string; 
    payment_status: string; 
    notes: string;
    check_in_date: string;
    check_out_date: string;
    room_type_id: string;
    guest_count: number;
    total_price: number;
    final_price: number;
  }) => Promise<void>;
}

export function EditOrderDialog({ open, order, onOpenChange, onSave }: EditOrderDialogProps) {
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const [isSaving, setIsSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [calculatedPrice, setCalculatedPrice] = useState({ total: 0, final: 0 });
  const [editForm, setEditForm] = useState({
    order_status: "",
    payment_status: "",
    notes: "",
    check_in_date: "",
    check_out_date: "",
    room_type_id: "",
    guest_count: 2,
  });

  // Fetch room types and public holidays
  useEffect(() => {
    const fetchData = async () => {
      if (!currentAccommodationId) return;
      
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name, capacity, weekday_2_meals_price, weekday_3_meals_price, weekend_2_meals_price, weekend_3_meals_price")
        .eq("accommodation_id", currentAccommodationId)
        .order("display_order");

      if (!error && data) {
        setRoomTypes(data);
      }

      // Fetch public holidays
      const { data: holidaysData } = await supabase
        .from("public_holidays")
        .select("holiday_date")
        .eq("accommodation_id", currentAccommodationId);

      if (holidaysData) {
        setPublicHolidays(holidaysData.map(h => h.holiday_date));
      }
    };

    fetchData();
  }, [currentAccommodationId]);

  // 當 order 變化時更新表單
  useEffect(() => {
    if (order) {
      setEditForm({
        order_status: order.order_status,
        payment_status: order.payment_status,
        notes: order.notes || "",
        check_in_date: order.check_in_date,
        check_out_date: order.check_out_date,
        room_type_id: order.room_types?.id || "",
        guest_count: order.guest_count,
      });
    }
  }, [order]);

  // Helper functions for price calculation
  const isSaturday = (date: Date) => date.getDay() === 6;
  
  const isPublicHoliday = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return publicHolidays.includes(dateStr);
  };
  
  const isWeekend = (date: Date) => isSaturday(date) || isPublicHoliday(date);

  const calculateNights = () => {
    if (!editForm.check_in_date || !editForm.check_out_date) return 0;
    const start = new Date(editForm.check_in_date);
    const end = new Date(editForm.check_out_date);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const calculatePrice = () => {
    if (!editForm.room_type_id || !editForm.check_in_date || !editForm.check_out_date) {
      return { total: 0, final: 0 };
    }

    const selectedRoomType = roomTypes.find(r => r.id === editForm.room_type_id);
    if (!selectedRoomType) return { total: 0, final: 0 };

    const nights = calculateNights();
    if (nights === 0) return { total: 0, final: 0 };

    let total = 0;
    const start = new Date(editForm.check_in_date);

    // Assuming 3 meals plan (一泊三食) - you can make this dynamic if needed
    for (let i = 0; i < nights; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      
      const isWeekendDay = isWeekend(currentDate);
      let pricePerNight = 0;
      
      // Use 3 meals pricing
      pricePerNight = isWeekendDay
        ? (selectedRoomType.weekend_3_meals_price || selectedRoomType.weekday_3_meals_price || 0)
        : (selectedRoomType.weekday_3_meals_price || 0);
      
      total += pricePerNight;
    }

    return { total, final: total };
  };

  // Recalculate price when dates or room type change
  useEffect(() => {
    const newPrice = calculatePrice();
    setCalculatedPrice(newPrice);
  }, [editForm.check_in_date, editForm.check_out_date, editForm.room_type_id, roomTypes, publicHolidays]);

  const handleSave = async () => {
    // Validate dates
    if (!editForm.check_in_date || !editForm.check_out_date) {
      toast({
        title: "日期錯誤",
        description: "請選擇入住和退房日期",
        variant: "destructive",
      });
      return;
    }

    const checkInDate = parseISO(editForm.check_in_date);
    const checkOutDate = parseISO(editForm.check_out_date);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      toast({
        title: "日期錯誤",
        description: "日期格式不正確",
        variant: "destructive",
      });
      return;
    }

    if (!isAfter(checkOutDate, checkInDate)) {
      toast({
        title: "日期錯誤",
        description: "退房日期必須在入住日期之後",
        variant: "destructive",
      });
      return;
    }

    if (!editForm.room_type_id) {
      toast({
        title: "房型錯誤",
        description: "請選擇房型",
        variant: "destructive",
      });
      return;
    }

    // Check for booking conflicts if dates or room type changed
    if (
      order &&
      currentAccommodationId &&
      (editForm.check_in_date !== order.check_in_date ||
        editForm.check_out_date !== order.check_out_date ||
        editForm.room_type_id !== order.room_types?.id)
    ) {
      setIsValidating(true);
      try {
        const conflict = await detectBookingConflict(
          editForm.room_type_id,
          editForm.check_in_date,
          editForm.check_out_date,
          currentAccommodationId,
          order.id
        );

        if (conflict.hasConflict) {
          toast({
            title: "訂單衝突",
            description: conflict.message,
            variant: "destructive",
          });
          setIsValidating(false);
          return;
        }
      } catch (error) {
        console.error("Error checking conflicts:", error);
        toast({
          title: "驗證錯誤",
          description: "無法驗證訂單衝突，請稍後再試",
          variant: "destructive",
        });
        setIsValidating(false);
        return;
      }
      setIsValidating(false);
    }

    setIsSaving(true);
    try {
      await onSave({
        ...editForm,
        total_price: calculatedPrice.total,
        final_price: calculatedPrice.final,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯訂單</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>訂單編號</Label>
            <Input value={order.order_number} disabled />
          </div>
          <div className="space-y-2">
            <Label>訂購人</Label>
            <Input value={order.guest_name} disabled />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>入住日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editForm.check_in_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editForm.check_in_date ? format(parseISO(editForm.check_in_date), "yyyy/MM/dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editForm.check_in_date ? parseISO(editForm.check_in_date) : undefined}
                    onSelect={(date) => {
                      if (date && !isNaN(date.getTime())) {
                        const newCheckIn = format(date, "yyyy-MM-dd");
                        setEditForm({...editForm, check_in_date: newCheckIn});
                        
                        // Clear checkout if it's before new check-in
                        if (editForm.check_out_date && !isAfter(parseISO(editForm.check_out_date), date)) {
                          setEditForm({...editForm, check_in_date: newCheckIn, check_out_date: ""});
                        }
                      }
                    }}
                    disabled={(date) => isBefore(date, new Date(new Date().setHours(0, 0, 0, 0)))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>退房日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editForm.check_out_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editForm.check_out_date ? format(parseISO(editForm.check_out_date), "yyyy/MM/dd") : "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editForm.check_out_date ? parseISO(editForm.check_out_date) : undefined}
                    onSelect={(date) => {
                      if (date && !isNaN(date.getTime())) {
                        if (editForm.check_in_date && isAfter(date, parseISO(editForm.check_in_date))) {
                          setEditForm({...editForm, check_out_date: format(date, "yyyy-MM-dd")});
                        } else {
                          toast({
                            title: "日期錯誤",
                            description: "退房日期必須在入住日期之後",
                            variant: "destructive",
                          });
                        }
                      }
                    }}
                    disabled={(date) => {
                      if (!editForm.check_in_date) return true;
                      return !isAfter(date, parseISO(editForm.check_in_date));
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>房型</Label>
              <Select value={editForm.room_type_id} onValueChange={(value) => setEditForm({...editForm, room_type_id: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇房型" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} (最多{room.capacity}人)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>入住人數</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={editForm.guest_count}
                onChange={(e) => setEditForm({...editForm, guest_count: parseInt(e.target.value) || 1})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>訂單狀態</Label>
            <Select value={editForm.order_status} onValueChange={(value) => setEditForm({...editForm, order_status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">待確認</SelectItem>
                <SelectItem value="confirmed">已確認</SelectItem>
                <SelectItem value="checked_in">已入住</SelectItem>
                <SelectItem value="checked_out">已退房</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>付款狀態</Label>
            <Select value={editForm.payment_status} onValueChange={(value) => setEditForm({...editForm, payment_status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="deposit_paid">已付訂金</SelectItem>
                <SelectItem value="paid">已付清</SelectItem>
                <SelectItem value="overdue">已逾期</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>備註</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
              rows={4}
              placeholder="輸入訂單備註..."
            />
          </div>

          {/* Price Display */}
          {calculatedPrice.total > 0 && (
            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">住宿天數</span>
                <span className="font-medium">{calculateNights()} 晚</span>
              </div>
              <div className="flex justify-between items-center py-3 bg-primary/5 px-4 rounded-lg">
                <span className="font-semibold">總金額</span>
                <span className="font-bold text-lg text-primary">
                  NT$ {calculatedPrice.final.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isValidating}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isValidating}>
            {isValidating ? "驗證中..." : isSaving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
