import { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWeekend as isWeekendDate, startOfWeek, endOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, DollarSign, Package, Edit, X, Check, Calendar, CalendarDays, CalendarRange, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchEditData, setBatchEditData] = useState({
    price: "",
    availableRooms: "",
    isAvailable: true,
  });
  const [saving, setSaving] = useState(false);

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

  const toggleDateSelection = (dateStr: string) => {
    if (!isSelectionMode) return;
    
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  };

  const handleStartBatchEdit = () => {
    setIsSelectionMode(true);
    setSelectedDates(new Set());
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedDates(new Set());
  };

  const handleOpenBatchEdit = () => {
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }
    setBatchEditData({
      price: "",
      availableRooms: "",
      isAvailable: true,
    });
    setBatchEditDialogOpen(true);
  };

  const handleBatchUpdate = async () => {
    if (!batchEditData.price || !batchEditData.availableRooms) {
      toast.error('請填寫價格和可用房數');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(date => ({
        room_type_id: roomTypeId,
        date,
        price: parseInt(batchEditData.price),
        available_rooms: parseInt(batchEditData.availableRooms),
        is_available: batchEditData.isAvailable,
      }));

      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(updates, {
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success(`已成功更新 ${selectedDates.size} 個日期的價格和庫存`);
      setBatchEditDialogOpen(false);
      setIsSelectionMode(false);
      setSelectedDates(new Set());
      loadInventory();
    } catch (error) {
      console.error('批量更新失敗:', error);
      toast.error('批量更新失敗');
    } finally {
      setSaving(false);
    }
  };

  // 快速選擇功能
  const selectWeekends = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weekendDates = days
      .filter(day => isWeekendDate(day))
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekendDates));
    toast.success(`已選擇 ${weekendDates.length} 個週末日期`);
  };

  const selectWeekdays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weekdayDates = days
      .filter(day => !isWeekendDate(day))
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekdayDates));
    toast.success(`已選擇 ${weekdayDates.length} 個工作日日期`);
  };

  const selectCurrentWeek = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    
    const weekDates = days.map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekDates));
    toast.success(`已選擇本週 ${weekDates.length} 個日期`);
  };

  const selectWholeMonth = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const monthDates = days.map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(monthDates));
    toast.success(`已選擇整月 ${monthDates.length} 個日期`);
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
    toast.success('已清除選擇');
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
        <div className="flex flex-col gap-3">
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

          {/* 批量編輯工具列 */}
          {!isSelectionMode ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartBatchEdit}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                批量編輯
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 快速選擇按鈕組 */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekends}
                  className="gap-2"
                >
                  <Calendar className="h-4 w-4" />
                  選擇週末
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekdays}
                  className="gap-2"
                >
                  <Briefcase className="h-4 w-4" />
                  選擇工作日
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectCurrentWeek}
                  className="gap-2"
                >
                  <CalendarDays className="h-4 w-4" />
                  選擇本週
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWholeMonth}
                  className="gap-2"
                >
                  <CalendarRange className="h-4 w-4" />
                  選擇整月
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="gap-2"
                  disabled={selectedDates.size === 0}
                >
                  <X className="h-4 w-4" />
                  清除選擇
                </Button>
              </div>

              {/* 操作按鈕 */}
              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg">
                <span className="text-sm font-medium">
                  已選擇 {selectedDates.size} 個日期
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleOpenBatchEdit}
                    disabled={selectedDates.size === 0}
                    className="gap-2"
                  >
                    <Check className="h-4 w-4" />
                    編輯選中日期
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSelection}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    取消
                  </Button>
                </div>
              </div>
            </div>
          )}
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
              const isSelected = selectedDates.has(dateStr);

              return (
                <div
                  key={dateStr}
                  onClick={() => toggleDateSelection(dateStr)}
                  className={cn(
                    "relative aspect-square border rounded-lg p-1 flex flex-col items-center justify-center text-xs transition-all",
                    isTodayDate && "border-primary border-2",
                    !isCurrentMonth && "opacity-50",
                    isSelectionMode && "cursor-pointer hover:scale-105",
                    isSelected && "bg-primary/20 border-primary shadow-md",
                    !isSelected && hasData && dayInventory.isAvailable && "bg-green-50 hover:bg-green-100",
                    !isSelected && hasData && !dayInventory.isAvailable && "bg-gray-100",
                    !isSelected && !hasData && "hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "font-medium mb-1",
                    isTodayDate && "text-primary font-bold",
                    isSelected && "text-primary font-bold"
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
                  {isSelected && (
                    <div className="absolute top-1 right-1">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
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
          {isSelectionMode && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-primary/20 border border-primary rounded"></div>
              <span>已選擇</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* 批量編輯對話框 */}
      <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量編輯</DialogTitle>
            <DialogDescription>
              將對 {selectedDates.size} 個日期進行統一設定
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="price">房價 *</Label>
              <Input
                id="price"
                type="number"
                min="0"
                placeholder="輸入房價"
                value={batchEditData.price}
                onChange={(e) => setBatchEditData({ ...batchEditData, price: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="availableRooms">可用房數 *</Label>
              <Input
                id="availableRooms"
                type="number"
                min="0"
                placeholder="輸入可用房數"
                value={batchEditData.availableRooms}
                onChange={(e) => setBatchEditData({ ...batchEditData, availableRooms: e.target.value })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="isAvailable"
                checked={batchEditData.isAvailable}
                onCheckedChange={(checked) => setBatchEditData({ ...batchEditData, isAvailable: checked })}
              />
              <Label htmlFor="isAvailable" className="cursor-pointer">
                開放預訂
              </Label>
            </div>

            {/* 顯示選中的日期 */}
            <div className="border rounded-lg p-3 bg-muted/50">
              <p className="text-sm font-medium mb-2">選中的日期：</p>
              <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                {Array.from(selectedDates).sort().map(date => (
                  <div key={date}>{format(parseISO(date), 'yyyy年 M月 d日', { locale: zhTW })}</div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchEditDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              onClick={handleBatchUpdate}
              disabled={saving || !batchEditData.price || !batchEditData.availableRooms}
            >
              {saving ? '更新中...' : '確認更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
