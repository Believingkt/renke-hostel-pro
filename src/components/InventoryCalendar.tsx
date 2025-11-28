import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, User, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface RoomType {
  id: string;
  name: string;
  room_count: number;
}

interface BookingCount {
  date: string;
  room_type_id: string;
  booked_rooms: number;
}

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  final_price: number;
  guest_count: number;
}

interface InventoryCalendarProps {
  accommodationId: string;
}

export const InventoryCalendar = ({ accommodationId }: InventoryCalendarProps) => {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bookingCounts, setBookingCounts] = useState<BookingCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedRoomType, setSelectedRoomType] = useState<RoomType | null>(null);
  const [dialogOrders, setDialogOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  useEffect(() => {
    loadData();
  }, [accommodationId, currentDate]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // 載入房型資料
      const { data: roomTypesData, error: roomTypesError } = await supabase
        .from("room_types")
        .select("id, name, room_count")
        .eq("accommodation_id", accommodationId)
        .order("display_order");

      if (roomTypesError) throw roomTypesError;
      setRoomTypes(roomTypesData || []);

      // 載入當月預訂資料
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("check_in_date, check_out_date, room_type_id")
        .eq("accommodation_id", accommodationId)
        .in("order_status", ["pending", "confirmed", "checked_in"])
        .gte("check_out_date", format(monthStart, "yyyy-MM-dd"))
        .lte("check_in_date", format(monthEnd, "yyyy-MM-dd"));

      if (ordersError) throw ordersError;

      // 計算每個日期每個房型的預訂數量
      const counts: BookingCount[] = [];
      daysInMonth.forEach((day) => {
        const dayStr = format(day, "yyyy-MM-dd");
        roomTypesData?.forEach((roomType) => {
          const bookedCount = (ordersData || []).filter((order) => {
            const checkIn = new Date(order.check_in_date);
            const checkOut = new Date(order.check_out_date);
            return (
              order.room_type_id === roomType.id &&
              day >= checkIn &&
              day < checkOut
            );
          }).length;

          counts.push({
            date: dayStr,
            room_type_id: roomType.id,
            booked_rooms: bookedCount,
          });
        });
      });

      setBookingCounts(counts);
    } catch (error: any) {
      console.error("載入庫存資料時發生錯誤:", error);
      toast.error("載入庫存資料失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const getBookingCount = (date: Date, roomTypeId: string): number => {
    const dateStr = format(date, "yyyy-MM-dd");
    const booking = bookingCounts.find(
      (b) => b.date === dateStr && b.room_type_id === roomTypeId
    );
    return booking?.booked_rooms || 0;
  };

  const getAvailabilityColor = (booked: number): string => {
    if (booked === 0) return "bg-success/20 text-success-foreground";
    return "bg-destructive/20 text-destructive-foreground";
  };

  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleCellClick = async (date: Date, roomType: RoomType) => {
    setSelectedDate(date);
    setSelectedRoomType(roomType);
    setDialogOpen(true);
    setIsLoadingOrders(true);

    try {
      const dateStr = format(date, "yyyy-MM-dd");
      
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, order_status, payment_status, final_price, guest_count")
        .eq("accommodation_id", accommodationId)
        .eq("room_type_id", roomType.id)
        .in("order_status", ["pending", "confirmed", "checked_in"])
        .lte("check_in_date", dateStr)
        .gt("check_out_date", dateStr)
        .order("check_in_date");

      if (error) throw error;
      setDialogOrders(data || []);
    } catch (error: any) {
      console.error("載入訂單詳情時發生錯誤:", error);
      toast.error("載入訂單詳情失敗");
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "待確認", variant: "outline" },
      confirmed: { label: "已確認", variant: "default" },
      checked_in: { label: "已入住", variant: "secondary" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      unpaid: { label: "未付款", variant: "destructive" },
      partial: { label: "部分付款", variant: "outline" },
      paid: { label: "已付款", variant: "default" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>庫存管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[600px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>庫存管理 - 房型預訂狀態</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePreviousMonth} className="h-10 sm:h-9 touch-manipulation">
              <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
            <span className="text-base sm:text-lg font-semibold min-w-[150px] text-center">
              {format(currentDate, "yyyy年 M月", { locale: zhTW })}
            </span>
            <Button variant="outline" size="sm" onClick={handleNextMonth} className="h-10 sm:h-9 touch-manipulation">
              <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {roomTypes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>尚無房型資料，請先新增房型</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* 日期標題列 */}
              <div className="grid gap-1 mb-2" style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, 1fr)` }}>
                <div className="font-semibold text-sm p-2 bg-muted rounded">房型</div>
                {daysInMonth.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={`text-center text-xs p-2 rounded ${
                      isSameDay(day, new Date())
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "bg-muted"
                    }`}
                  >
                    <div>{format(day, "M/d", { locale: zhTW })}</div>
                    <div className="text-[10px] opacity-80">
                      {format(day, "EEE", { locale: zhTW })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 房型列 */}
              {roomTypes.map((roomType) => (
                <div
                  key={roomType.id}
                  className="grid gap-1 mb-1"
                  style={{ gridTemplateColumns: `200px repeat(${daysInMonth.length}, 1fr)` }}
                >
                  <div className="font-medium text-sm p-2 bg-muted rounded flex items-center">
                    <span className="truncate" title={roomType.name}>
                      {roomType.name}
                    </span>
                  </div>
                  {daysInMonth.map((day) => {
                    const booked = getBookingCount(day, roomType.id);
                    const available = booked === 0 ? 1 : 0;

                    return (
                      <div
                        key={`${roomType.id}-${day.toISOString()}`}
                        className={`text-center text-xs p-2 rounded transition-colors cursor-pointer hover:opacity-80 ${getAvailabilityColor(
                          booked
                        )}`}
                        title={`${booked > 0 ? '已預訂' : '可預訂'}\n點擊查看詳情`}
                        onClick={() => handleCellClick(day, roomType)}
                      >
                        <div className="font-semibold">
                          {booked > 0 ? '已訂' : '可訂'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* 圖例 */}
            <div className="flex items-center gap-4 mt-6 pt-4 border-t text-sm">
              <span className="font-semibold">圖例：</span>
              <div className="flex items-center gap-2">
                <div className="w-12 h-8 rounded bg-success/20 border border-success/30"></div>
                <span>可預訂</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-8 rounded bg-destructive/20 border border-destructive/30"></div>
                <span>已預訂</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                ※ 每個房型每天只能接受一筆訂單
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* 訂單詳情對話框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {selectedDate && selectedRoomType && (
                <>
                  {format(selectedDate, "yyyy年M月d日 (EEEE)", { locale: zhTW })} - {selectedRoomType.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              此房型在當天的所有預訂訂單
            </DialogDescription>
          </DialogHeader>

          {isLoadingOrders ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : dialogOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>此日期沒有預訂記錄</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dialogOrders.map((order) => (
                <Card key={order.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-lg mb-1">
                          訂單號: {order.order_number}
                        </div>
                        <div className="flex gap-2">
                          {getStatusBadge(order.order_status)}
                          {getPaymentBadge(order.payment_status)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                          ${order.final_price.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <Separator className="my-3" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">客人姓名:</span>
                          <span className="font-medium">{order.guest_name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">聯絡電話:</span>
                          <span className="font-medium">{order.guest_phone}</span>
                        </div>
                        {order.guest_email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">電子郵件:</span>
                            <span className="font-medium">{order.guest_email}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">入住日期:</span>
                          <span className="font-medium">
                            {format(new Date(order.check_in_date), "yyyy/MM/dd")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">退房日期:</span>
                          <span className="font-medium">
                            {format(new Date(order.check_out_date), "yyyy/MM/dd")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">入住人數:</span>
                          <span className="font-medium">{order.guest_count} 人</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
