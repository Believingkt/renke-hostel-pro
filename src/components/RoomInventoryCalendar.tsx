import { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, DollarSign, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RoomInventoryCalendarProps {
  roomTypeId: string;
  roomTypeName: string;
}

interface DayInventory {
  date: string;
  price: number | null;
  availableRooms: number | null;
  isAvailable: boolean;
}

export function RoomInventoryCalendar({ roomTypeId, roomTypeName }: RoomInventoryCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<Record<string, DayInventory>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, [roomTypeId, currentMonth]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('room_inventory_pricing')
        .select('*')
        .eq('room_type_id', roomTypeId)
        .gte('date', format(monthStart, 'yyyy-MM-dd'))
        .lte('date', format(monthEnd, 'yyyy-MM-dd'));

      if (error) throw error;

      const inventoryMap: Record<string, DayInventory> = {};
      data?.forEach((item) => {
        inventoryMap[item.date] = {
          date: item.date,
          price: item.price,
          availableRooms: item.available_rooms,
          isAvailable: item.is_available,
        };
      });

      setInventory(inventoryMap);
    } catch (error) {
      console.error('載入庫存失敗:', error);
      toast.error('載入庫存資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // 計算月曆起始日（週一）
  const startDay = monthStart.getDay();
  const paddingDays = startDay === 0 ? 6 : startDay - 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{roomTypeName}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold min-w-[120px] text-center">
              {format(currentMonth, 'yyyy年 M月', { locale: zhTW })}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {/* 星期標題 */}
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <div
                key={day}
                className="text-center text-sm font-medium text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}

            {/* 填充空白日期 */}
            {Array.from({ length: paddingDays }).map((_, index) => (
              <div key={`padding-${index}`} className="aspect-square" />
            ))}

            {/* 日期格子 */}
            {daysInMonth.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayInventory = inventory[dateStr];
              const hasData = dayInventory !== undefined;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);

              return (
                <div
                  key={dateStr}
                  className={cn(
                    "aspect-square border rounded-lg p-1 flex flex-col items-center justify-center text-xs transition-colors",
                    isTodayDate && "border-primary border-2",
                    !isCurrentMonth && "opacity-50",
                    hasData && dayInventory.isAvailable ? "bg-green-50 hover:bg-green-100" : "",
                    hasData && !dayInventory.isAvailable ? "bg-gray-100" : "",
                    !hasData && "hover:bg-muted cursor-pointer"
                  )}
                >
                  <div className={cn(
                    "font-medium mb-1",
                    isTodayDate && "text-primary font-bold"
                  )}>
                    {format(day, 'd')}
                  </div>
                  {hasData ? (
                    <>
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        <span>{dayInventory.price}</span>
                      </div>
                      <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Package className="h-3 w-3" />
                        <span>{dayInventory.availableRooms}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">未設定</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 圖例 */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-50 border rounded"></div>
            <span>有庫存</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border rounded"></div>
            <span>無庫存</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border rounded"></div>
            <span>未設定</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary rounded"></div>
            <span>今天</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
