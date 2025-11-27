import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Package, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  Edit, 
  X, 
  Calendar,
  CalendarDays,
  CalendarRange,
  Briefcase,
  Copy
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameMonth, 
  isToday, 
  addMonths, 
  subMonths,
  isWeekend as isWeekendDate,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RoomType {
  id: string;
  name: string;
  room_count: number;
}

interface InventoryData {
  [date: string]: {
    availableRooms: number;
    id?: string;
  };
}

interface InventoryManagementProps {
  accommodationId: string;
}

export function InventoryManagement({ accommodationId }: InventoryManagementProps) {
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<InventoryData>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchInventory, setBatchInventory] = useState("");
  const [saving, setSaving] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [copiedInventory, setCopiedInventory] = useState<number | null>(null);

  useEffect(() => {
    if (accommodationId) {
      loadRoomTypes();
    }
  }, [accommodationId]);

  useEffect(() => {
    if (selectedRoomType) {
      loadInventoryData();
    }
  }, [selectedRoomType, currentMonth]);

  // 批量編輯對話框鍵盤快捷鍵
  useEffect(() => {
    if (!batchEditDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBatchEditDialogOpen(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (batchInventory && !saving) {
          confirmBatchEdit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [batchEditDialogOpen, batchInventory, saving]);

  const loadRoomTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name, room_count')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      setRoomTypes(data || []);
      if (data && data.length > 0) {
        setSelectedRoomType(data[0].id);
      }
    } catch (error) {
      console.error('載入房型失敗:', error);
      toast.error('載入房型資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadInventoryData = async () => {
    if (!selectedRoomType) return;

    try {
      setLoading(true);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('room_inventory_pricing')
        .select('*')
        .eq('room_type_id', selectedRoomType)
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'));

      if (error) throw error;

      const inventoryMap: InventoryData = {};
      data?.forEach((item) => {
        inventoryMap[item.date] = {
          availableRooms: item.available_rooms,
          id: item.id,
        };
      });

      setInventory(inventoryMap);
    } catch (error) {
      console.error('載入庫存資料失敗:', error);
      toast.error('載入庫存資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
    setSelectedDates(new Set());
    setCopiedInventory(null);
    setIsCopyMode(false);
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
    setSelectedDates(new Set());
    setCopiedInventory(null);
    setIsCopyMode(false);
  };

  const handleStartBatchEdit = () => {
    setIsSelectionMode(true);
    setSelectedDates(new Set());
    setCopiedInventory(null);
    setIsCopyMode(false);
  };

  const toggleDateSelection = (dateStr: string) => {
    if (!isSelectionMode) return;

    if (isCopyMode) {
      const dayInventory = inventory[dateStr];
      if (dayInventory && dayInventory.availableRooms !== null) {
        setCopiedInventory(dayInventory.availableRooms);
        setIsCopyMode(false);
        setSelectedDates(new Set());
        toast.success(`已複製庫存設定：${dayInventory.availableRooms} 間`);
      } else {
        toast.error('此日期尚未設定庫存');
      }
      return;
    }

    const newSelected = new Set(selectedDates);
    if (newSelected.has(dateStr)) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    setSelectedDates(newSelected);
  };

  const handleOpenBatchEdit = () => {
    if (selectedDates.size === 0) {
      toast.error('請先選擇要編輯的日期');
      return;
    }
    setBatchEditDialogOpen(true);
  };

  const confirmBatchEdit = async () => {
    if (!batchInventory || isNaN(parseInt(batchInventory))) {
      toast.error('請輸入有效的庫存數量');
      return;
    }

    const inventoryValue = parseInt(batchInventory);

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map((dateStr) => {
        const existing = inventory[dateStr];
        
        return {
          room_type_id: selectedRoomType,
          date: dateStr,
          available_rooms: inventoryValue,
          price: existing?.id ? undefined : 0,
        };
      });

      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(updates, {
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;
      
      toast.success(`已成功更新 ${selectedDates.size} 個日期的庫存`);
      setBatchEditDialogOpen(false);
      setBatchInventory("");
      setSelectedDates(new Set());
      setIsSelectionMode(false);
      loadInventoryData();
    } catch (error) {
      console.error('批次更新失敗:', error);
      toast.error('批次更新失敗，請重試');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyCopiedInventory = async () => {
    if (copiedInventory === null) {
      toast.error('尚未複製任何設定');
      return;
    }
    
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map((dateStr) => {
        const existing = inventory[dateStr];
        
        return {
          room_type_id: selectedRoomType,
          date: dateStr,
          available_rooms: copiedInventory,
          price: existing?.id ? undefined : 0,
        };
      });

      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(updates, {
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success(`已成功套用到 ${selectedDates.size} 個日期`);
      setSelectedDates(new Set());
      setCopiedInventory(null);
      setIsSelectionMode(false);
      loadInventoryData();
    } catch (error) {
      console.error('套用失敗:', error);
      toast.error('套用失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleStartCopyMode = () => {
    setIsCopyMode(true);
    setSelectedDates(new Set());
    setCopiedInventory(null);
    toast.info('請點擊要複製的日期');
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedDates(new Set());
    setCopiedInventory(null);
    setIsCopyMode(false);
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

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const paddingDays = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const selectedRoomTypeData = roomTypes.find(rt => rt.id === selectedRoomType);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                <Package className="h-5 w-5" />
                房型選擇
              </CardTitle>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="w-full sm:max-w-[300px]">
                  <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇房型" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedRoomTypeData && (
                  <div className="text-sm text-muted-foreground">
                    總房間數：{selectedRoomTypeData.room_count || 1} 間
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {selectedRoomType && roomTypes.length > 0 && (
        <Card>
          <CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg md:text-xl">
                  {roomTypes.find(r => r.id === selectedRoomType)?.name || ''} - 庫存管理
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handlePrevMonth}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[140px] text-center font-semibold">
                    {format(currentMonth, 'yyyy年 MM月', { locale: zhTW })}
                  </div>
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
                  {/* 提示訊息 */}
                  {isCopyMode && (
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-200">
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4" />
                        <span>請點擊一個已設定的日期來複製其庫存設定</span>
                      </div>
                    </div>
                  )}
                  
                  {copiedInventory !== null && !isCopyMode && (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                          <span className="text-green-800 dark:text-green-200">
                            已複製：房數 {copiedInventory} 間
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCopiedInventory(null);
                            setSelectedDates(new Set());
                          }}
                          className="h-6 px-2"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">請選擇要套用的目標日期</p>
                    </div>
                  )}

                  {/* 快速選擇按鈕組 */}
                  <div className="flex flex-wrap gap-2">
                    {copiedInventory === null && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleStartCopyMode}
                        className="gap-2"
                        disabled={isCopyMode}
                      >
                        <Copy className="h-4 w-4" />
                        複製設定
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWeekends}
                      className="gap-2"
                      disabled={isCopyMode}
                    >
                      <Calendar className="h-4 w-4" />
                      選擇週末
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWeekdays}
                      className="gap-2"
                      disabled={isCopyMode}
                    >
                      <Briefcase className="h-4 w-4" />
                      選擇工作日
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectCurrentWeek}
                      className="gap-2"
                      disabled={isCopyMode}
                    >
                      <CalendarDays className="h-4 w-4" />
                      選擇本週
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectWholeMonth}
                      className="gap-2"
                      disabled={isCopyMode}
                    >
                      <CalendarRange className="h-4 w-4" />
                      選擇整月
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      className="gap-2"
                      disabled={selectedDates.size === 0 || isCopyMode}
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
                      {copiedInventory !== null && !isCopyMode ? (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleApplyCopiedInventory}
                          disabled={selectedDates.size === 0 || saving}
                          className="gap-2"
                        >
                          <Check className="h-4 w-4" />
                          {saving ? '套用中...' : '套用複製設定'}
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleOpenBatchEdit}
                          disabled={selectedDates.size === 0 || isCopyMode}
                          className="gap-2"
                        >
                          <Check className="h-4 w-4" />
                          編輯選中日期
                        </Button>
                      )}
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
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs sm:text-sm font-medium text-muted-foreground py-1 sm:py-2"
                  >
                    {day}
                  </div>
                ))}

                {Array.from({ length: paddingDays }).map((_, index) => (
                  <div key={`padding-${index}`} className="min-h-[80px] sm:min-h-[90px] md:min-h-[100px]" />
                ))}

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
                        "relative min-h-[80px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-center transition-all",
                        isTodayDate && "border-blue-600 border-2",
                        !isCurrentMonth && "opacity-50",
                        isSelectionMode && "cursor-pointer hover:scale-105",
                        isCopyMode && hasData && "ring-2 ring-blue-400 animate-pulse",
                        isCopyMode && !hasData && "opacity-30 cursor-not-allowed",
                        isSelected && !isCopyMode && "bg-blue-50 dark:bg-blue-950 ring-2 ring-blue-500"
                      )}
                    >
                      <div className={cn(
                        "font-semibold mb-1 sm:mb-1.5 md:mb-2 text-sm sm:text-base",
                        isTodayDate && "text-blue-600 font-bold",
                        isSelected && "text-blue-700 font-bold"
                      )}>
                        {format(day, 'd')}
                      </div>
                      {hasData ? (
                        <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs">
                          <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                          <span className="font-medium">{dayInventory.availableRooms} 間</span>
                        </div>
                      ) : (
                        <div className="text-[10px] sm:text-xs text-muted-foreground">未設定</div>
                      )}
                      {isSelected && !isCopyMode && (
                        <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5">
                          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批次編輯庫存</DialogTitle>
            <DialogDescription>
              設定選中 {selectedDates.size} 個日期的庫存數量
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batch-inventory">可用房間數量</Label>
              <Input
                id="batch-inventory"
                type="number"
                min="0"
                value={batchInventory}
                onChange={(e) => setBatchInventory(e.target.value)}
                placeholder="輸入庫存數量"
                autoFocus
              />
            </div>
            {selectedRoomTypeData && (
              <div className="text-sm text-muted-foreground">
                提示：該房型總共有 {selectedRoomTypeData.room_count || 1} 間房
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmBatchEdit} disabled={saving}>
              {saving ? '更新中...' : '確認更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
