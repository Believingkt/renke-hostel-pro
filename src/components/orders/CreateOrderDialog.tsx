import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Tag, X, Loader2 } from "lucide-react";
import { format, parseISO, isAfter, isBefore, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RoomType {
  id: string;
  name: string;
  capacity: number;
}

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateOrderDialog({ open, onOpenChange, onSuccess }: CreateOrderDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const [isSaving, setIsSaving] = useState(false);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
  const [calculatedPrice, setCalculatedPrice] = useState({ total: 0, discount: 0, final: 0 });
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; type: "percentage" | "amount"; value: number } | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  
  const [form, setForm] = useState({
    guest_name: "",
    guest_phone: "",
    guest_email: "",
    check_in_date: "",
    check_out_date: "",
    room_type_id: "",
    guest_count: 2,
    order_status: "confirmed",
    payment_status: "unpaid",
    notes: "",
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        guest_name: "",
        guest_phone: "",
        guest_email: "",
        check_in_date: "",
        check_out_date: "",
        room_type_id: "",
        guest_count: 2,
        order_status: "confirmed",
        payment_status: "unpaid",
        notes: "",
      });
      setDiscountCode("");
      setAppliedDiscount(null);
      setCalculatedPrice({ total: 0, discount: 0, final: 0 });
    }
  }, [open]);

  // Fetch room types and public holidays
  useEffect(() => {
    const fetchData = async () => {
      if (!currentAccommodationId) return;
      
      const { data, error } = await supabase
        .from("room_types")
        .select("id, name, capacity")
        .eq("accommodation_id", currentAccommodationId)
        .order("display_order");

      if (!error && data) {
        setRoomTypes(data);
      }

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

  const calculateNights = () => {
    if (!form.check_in_date || !form.check_out_date) return 0;
    const start = new Date(form.check_in_date);
    const end = new Date(form.check_out_date);
    const diff = end.getTime() - start.getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  const calculateDiscount = (total: number) => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.type === "percentage") {
      return Math.round(total * (appliedDiscount.value / 100));
    }
    return appliedDiscount.value;
  };

  const calculatePrice = async () => {
    if (!form.room_type_id || !form.check_in_date || !form.check_out_date) {
      return { total: 0, discount: 0, final: 0 };
    }

    const nights = calculateNights();
    if (nights === 0) return { total: 0, discount: 0, final: 0 };

    let total = 0;
    const start = new Date(form.check_in_date);

    for (let i = 0; i < nights; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      const dateStr = format(currentDate, "yyyy-MM-dd");
      
      const { data: inventoryData } = await supabase
        .from("room_inventory_pricing")
        .select("price")
        .eq("room_type_id", form.room_type_id)
        .eq("date", dateStr)
        .maybeSingle();
      
      if (inventoryData?.price) {
        total += inventoryData.price;
      }
    }

    const discount = calculateDiscount(total);
    const final = Math.max(0, total - discount);

    return { total, discount, final };
  };

  useEffect(() => {
    const fetchPrice = async () => {
      const newPrice = await calculatePrice();
      setCalculatedPrice(newPrice);
    };
    fetchPrice();
  }, [form.check_in_date, form.check_out_date, form.room_type_id, appliedDiscount]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !currentAccommodationId) {
      toast({
        title: "請輸入折扣代碼",
        variant: "destructive",
      });
      return;
    }

    setIsValidatingCode(true);
    
    try {
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: discountCode.trim().toUpperCase(),
        p_accommodation_id: currentAccommodationId,
        p_order_amount: calculatedPrice.total,
        p_room_type_id: form.room_type_id || null,
        p_check_in_date: form.check_in_date || null
      });

      if (error) throw error;

      const result = data[0];
      
      if (result.is_valid) {
        setAppliedDiscount({
          code: discountCode.trim().toUpperCase(),
          type: result.discount_type as "percentage" | "amount",
          value: result.discount_value
        });
        toast({
          title: "折扣代碼已套用",
          description: `已套用 ${
            result.discount_type === "percentage"
              ? `${result.discount_value}% 折扣`
              : `NT$ ${result.discount_value} 折扣`
          }`,
        });
      } else {
        toast({
          title: "折扣代碼無效",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error validating discount code:", error);
      toast({
        title: "驗證失敗",
        description: "無法驗證折扣代碼，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCode("");
    toast({
      title: "已移除折扣",
      description: "折扣代碼已清除",
    });
  };

  const handleSave = async () => {
    // Validate required fields
    if (!form.guest_name.trim()) {
      toast({
        title: "請輸入訂購人姓名",
        variant: "destructive",
      });
      return;
    }

    if (!form.guest_phone.trim()) {
      toast({
        title: "請輸入聯絡電話",
        variant: "destructive",
      });
      return;
    }

    if (!form.check_in_date || !form.check_out_date) {
      toast({
        title: "日期錯誤",
        description: "請選擇入住和退房日期",
        variant: "destructive",
      });
      return;
    }

    const checkInDate = parseISO(form.check_in_date);
    const checkOutDate = parseISO(form.check_out_date);

    if (!isAfter(checkOutDate, checkInDate)) {
      toast({
        title: "日期錯誤",
        description: "退房日期必須在入住日期之後",
        variant: "destructive",
      });
      return;
    }

    if (!form.room_type_id) {
      toast({
        title: "房型錯誤",
        description: "請選擇房型",
        variant: "destructive",
      });
      return;
    }

    if (!currentAccommodationId) {
      toast({
        title: "系統錯誤",
        description: "無法取得住宿資訊",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Generate order number
      const { data: orderNumber, error: orderNumberError } = await supabase.rpc('generate_order_number');
      
      if (orderNumberError) throw orderNumberError;

      const { error } = await supabase.from("orders").insert({
        accommodation_id: currentAccommodationId,
        order_number: orderNumber,
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim(),
        guest_email: form.guest_email.trim() || null,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        room_type_id: form.room_type_id,
        guest_count: form.guest_count,
        order_status: form.order_status,
        payment_status: form.payment_status,
        notes: form.notes.trim() || null,
        total_price: calculatedPrice.total,
        discount_amount: calculatedPrice.discount,
        final_price: calculatedPrice.final,
        discount_code: appliedDiscount?.code || null,
        confirmed_at: form.order_status === "confirmed" ? new Date().toISOString() : null,
      });

      if (error) throw error;

      toast({
        title: "新增成功",
        description: `訂單 ${orderNumber} 已建立`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating order:", error);
      toast({
        title: "新增失敗",
        description: "無法建立訂單，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formContent = (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>訂購人姓名 <span className="text-destructive">*</span></Label>
          <Input
            value={form.guest_name}
            onChange={(e) => setForm({...form, guest_name: e.target.value})}
            placeholder="輸入姓名"
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label>聯絡電話 <span className="text-destructive">*</span></Label>
          <Input
            value={form.guest_phone}
            onChange={(e) => setForm({...form, guest_phone: e.target.value})}
            placeholder="輸入電話"
            className="h-12 text-base sm:h-10 sm:text-sm"
            type="tel"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>電子郵件</Label>
        <Input
          value={form.guest_email}
          onChange={(e) => setForm({...form, guest_email: e.target.value})}
          placeholder="輸入電子郵件"
          className="h-12 text-base sm:h-10 sm:text-sm"
          type="email"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>入住日期 <span className="text-destructive">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  !form.check_in_date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.check_in_date ? format(parseISO(form.check_in_date), "yyyy/MM/dd") : "選擇日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.check_in_date ? parseISO(form.check_in_date) : undefined}
                onSelect={(date) => {
                  if (date && !isNaN(date.getTime())) {
                    const newCheckIn = format(date, "yyyy-MM-dd");
                    setForm({...form, check_in_date: newCheckIn});
                    
                    if (form.check_out_date && !isAfter(parseISO(form.check_out_date), date)) {
                      setForm({...form, check_in_date: newCheckIn, check_out_date: ""});
                    }
                  }
                }}
                disabled={(date) => isBefore(date, new Date(new Date().setHours(0, 0, 0, 0)))}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>退房日期 <span className="text-destructive">*</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal h-12 sm:h-10",
                  !form.check_out_date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {form.check_out_date ? format(parseISO(form.check_out_date), "yyyy/MM/dd") : "選擇日期"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={form.check_out_date ? parseISO(form.check_out_date) : undefined}
                onSelect={(date) => {
                  if (date && !isNaN(date.getTime())) {
                    if (form.check_in_date && isAfter(date, parseISO(form.check_in_date))) {
                      setForm({...form, check_out_date: format(date, "yyyy-MM-dd")});
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
                  if (!form.check_in_date) return true;
                  return !isAfter(date, parseISO(form.check_in_date));
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>房型 <span className="text-destructive">*</span></Label>
          <Select value={form.room_type_id} onValueChange={(value) => setForm({...form, room_type_id: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
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
            max="20"
            value={form.guest_count}
            onChange={(e) => setForm({...form, guest_count: parseInt(e.target.value) || 1})}
            className="h-12 text-base sm:h-10 sm:text-sm"
            inputMode="numeric"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>訂單狀態</Label>
          <Select value={form.order_status} onValueChange={(value) => setForm({...form, order_status: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
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
          <Select value={form.payment_status} onValueChange={(value) => setForm({...form, payment_status: value})}>
            <SelectTrigger className="h-12 text-base sm:h-10 sm:text-sm">
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
      </div>

      <div className="space-y-2">
        <Label>備註</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm({...form, notes: e.target.value})}
          rows={3}
          placeholder="輸入訂單備註..."
          className="text-base sm:text-sm min-h-[80px]"
        />
      </div>

      {/* Discount Code Section */}
      <div className="space-y-2 pt-4 border-t">
        <Label className="flex items-center gap-2">
          <Tag className="h-4 w-4" />
          折扣碼
        </Label>
        
        {appliedDiscount ? (
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <Badge variant="secondary" className="text-sm">
              {appliedDiscount.code}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {appliedDiscount.type === "percentage"
                ? `${appliedDiscount.value}% 折扣`
                : `NT$ ${appliedDiscount.value.toLocaleString()} 折扣`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemoveDiscount}
              className="ml-auto h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              placeholder="輸入折扣碼"
              className="flex-1 h-12 text-base sm:h-10 sm:text-sm"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleApplyDiscount}
              disabled={isValidatingCode || !discountCode.trim()}
              className="h-12 sm:h-10 px-4"
            >
              {isValidatingCode ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "套用"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Price Summary */}
      <div className="space-y-2 pt-4 border-t">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">住宿天數</span>
          <span>{calculateNights()} 晚</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">原價</span>
          <span>NT$ {calculatedPrice.total.toLocaleString()}</span>
        </div>
        {calculatedPrice.discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>折扣</span>
            <span>- NT$ {calculatedPrice.discount.toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-lg pt-2 border-t">
          <span>應付金額</span>
          <span className="text-primary">NT$ {calculatedPrice.final.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  const footerButtons = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
        取消
      </Button>
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            建立中...
          </>
        ) : (
          "建立訂單"
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>新增訂單</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="flex-1 px-4 overflow-y-auto">
            {formContent}
          </ScrollArea>
          <DrawerFooter className="flex-row justify-end gap-2 border-t pt-4">
            {footerButtons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>新增訂單</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4">
          {formContent}
        </ScrollArea>
        <DialogFooter className="border-t pt-4">
          {footerButtons}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
