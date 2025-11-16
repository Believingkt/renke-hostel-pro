import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

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

interface InventoryCalendarProps {
  accommodationId: string;
}

export const InventoryCalendar = ({ accommodationId }: InventoryCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [bookingCounts, setBookingCounts] = useState<BookingCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const getAvailabilityColor = (booked: number, total: number): string => {
    if (booked === 0) return "bg-success/20 text-success-foreground";
    if (booked >= total) return "bg-destructive/20 text-destructive-foreground";
    return "bg-warning/20 text-warning-foreground";
  };

  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
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
            <Button variant="outline" size="sm" onClick={handlePreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[150px] text-center">
              {format(currentDate, "yyyy年 M月", { locale: zhTW })}
            </span>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
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
                    const total = roomType.room_count || 1;
                    const available = total - booked;

                    return (
                      <div
                        key={`${roomType.id}-${day.toISOString()}`}
                        className={`text-center text-xs p-2 rounded transition-colors ${getAvailabilityColor(
                          booked,
                          total
                        )}`}
                        title={`已訂: ${booked}/${total} 間\n可訂: ${available} 間`}
                      >
                        <div className="font-semibold">{booked}/{total}</div>
                        <div className="text-[10px] opacity-80">
                          剩{available}
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
                <span>空房</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-8 rounded bg-warning/20 border border-warning/30"></div>
                <span>部分預訂</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-8 rounded bg-destructive/20 border border-destructive/30"></div>
                <span>已滿房</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
