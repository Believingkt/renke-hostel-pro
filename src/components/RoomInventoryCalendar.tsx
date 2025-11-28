import { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWeekend as isWeekendDate, startOfWeek, endOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, DollarSign, Package, Edit, X, Check, Calendar, CalendarDays, CalendarRange, Briefcase, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface RoomInventoryCalendarProps {
  roomTypeId: string;
  roomTypeName: string;
}

interface DayInventory {
  date: string;
  price: number | null;
  price_2_meals: number | null;
  price_3_meals: number | null;
  availableRooms: number | null;
  isAvailable: boolean;
}

export function RoomInventoryCalendar({ roomTypeId, roomTypeName }: RoomInventoryCalendarProps) {
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<Record<string, DayInventory>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [batchEditDialogOpen, setBatchEditDialogOpen] = useState(false);
  const [batchEditData, setBatchEditData] = useState({
    price: "",
    price_2_meals: "",
    price_3_meals: "",
    mealPlan: "2meals" as "2meals" | "3meals",
    availableRooms: "",
    isAvailable: true,
  });
  const [saving, setSaving] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [copiedData, setCopiedData] = useState<DayInventory | null>(null);
  const [singleEditDialogOpen, setSingleEditDialogOpen] = useState(false);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [singleEditData, setSingleEditData] = useState({
    price: "",
    price_2_meals: "",
    price_3_meals: "",
    mealPlan: "2meals" as "2meals" | "3meals",
    availableRooms: "",
    isAvailable: true,
  });

  useEffect(() => {
    loadInventory();
  }, [roomTypeId, currentMonth]);

  // 批量編輯對話框鍵盤快捷鍵
  useEffect(() => {
    if (!batchEditDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBatchEditDialogOpen(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const hasRequiredData = batchEditData.availableRooms && 
          (batchEditData.mealPlan === '2meals' ? batchEditData.price_2_meals :
           batchEditData.price_3_meals);
        if (hasRequiredData && !saving) {
          handleBatchUpdate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [batchEditDialogOpen, batchEditData, saving]);

  // 單日期編輯對話框鍵盤快捷鍵
  useEffect(() => {
    if (!singleEditDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSingleEditDialogOpen(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const hasRequiredData = singleEditData.availableRooms && 
          (singleEditData.mealPlan === '2meals' ? singleEditData.price_2_meals :
           singleEditData.price_3_meals);
        if (hasRequiredData && !saving) {
          handleSingleDateUpdate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [singleEditDialogOpen, singleEditData, saving]);

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
          price_2_meals: item.price_2_meals,
          price_3_meals: item.price_3_meals,
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
    
    // 如果在複製模式下，點擊有資料的日期會複製它
    if (isCopyMode && inventory[dateStr]) {
      const dayData = inventory[dateStr];
      setCopiedData(dayData);
      setIsCopyMode(false);
      setSelectedDates(new Set());
      toast.success(`已複製 ${format(parseISO(dateStr), 'M月d日', { locale: zhTW })} 的設定`);
      return;
    }
    
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
    setIsCopyMode(false);
    setCopiedData(null);
  };

  const handleOpenBatchEdit = () => {
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }
    setBatchEditData({
      price: "",
      price_2_meals: "",
      price_3_meals: "",
      mealPlan: "2meals",
      availableRooms: "",
      isAvailable: true,
    });
    setBatchEditDialogOpen(true);
  };

  const handleBatchUpdate = async () => {
    if (!batchEditData.availableRooms) {
      toast.error('請填寫可用房數');
      return;
    }

    // 驗證價格：根據選擇的方案檢查對應價格是否填寫
    if (batchEditData.mealPlan === '2meals' && !batchEditData.price_2_meals) {
      toast.error('請填寫一泊二食價格');
      return;
    }
    if (batchEditData.mealPlan === '3meals' && !batchEditData.price_3_meals) {
      toast.error('請填寫一泊三食價格');
      return;
    }

    try {
      setSaving(true);
      
      // 根據選擇的方案構建更新資料
      const updates = Array.from(selectedDates).map(date => {
        const updateData: any = {
          room_type_id: roomTypeId,
          date,
          available_rooms: parseInt(batchEditData.availableRooms),
          is_available: batchEditData.isAvailable,
        };
        
        // 只更新選中的價格欄位
        if (batchEditData.mealPlan === '2meals') {
          updateData.price_2_meals = parseInt(batchEditData.price_2_meals);
        } else {
          updateData.price_3_meals = parseInt(batchEditData.price_3_meals);
        }
        
        return updateData;
      });

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

  const handleStartCopyMode = () => {
    setIsCopyMode(true);
    setSelectedDates(new Set());
    setCopiedData(null);
    toast.info('請點擊要複製的日期');
  };

  const handleApplyCopiedData = async () => {
    if (!copiedData) {
      toast.error('尚未複製任何設定');
      return;
    }
    
    if (selectedDates.size === 0) {
      toast.error('請至少選擇一個日期');
      return;
    }

    try {
      setSaving(true);
      const updates = Array.from(selectedDates).map(date => ({
        room_type_id: roomTypeId,
        date,
        price: copiedData.price!,
        available_rooms: copiedData.availableRooms!,
        is_available: copiedData.isAvailable,
      }));

      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(updates, {
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success(`已成功套用到 ${selectedDates.size} 個日期`);
      setIsSelectionMode(false);
      setSelectedDates(new Set());
      setCopiedData(null);
      loadInventory();
    } catch (error) {
      console.error('套用複製設定失敗:', error);
      toast.error('套用複製設定失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSingleClick = (dateStr: string) => {
    if (isSelectionMode) {
      // 在批量編輯模式下執行選擇邏輯
      toggleDateSelection(dateStr);
    } else {
      // 在一般模式下開啟單日編輯對話框
      const dayData = inventory[dateStr];
      setEditingDate(dateStr);
      
      // 判斷預設選擇哪個方案 - 優先選擇一泊二食
      let defaultMealPlan: "2meals" | "3meals" = "2meals";
      if (dayData?.price_3_meals && !dayData?.price_2_meals) {
        // 如果只有一泊三食，則選擇一泊三食
        defaultMealPlan = "3meals";
      }
      
      setSingleEditData({
        price: dayData?.price?.toString() || "",
        price_2_meals: dayData?.price_2_meals?.toString() || "",
        price_3_meals: dayData?.price_3_meals?.toString() || "",
        mealPlan: defaultMealPlan,
        availableRooms: dayData?.availableRooms?.toString() || "",
        isAvailable: dayData?.isAvailable ?? true,
      });
      setSingleEditDialogOpen(true);
    }
  };

  const handleSingleDateUpdate = async () => {
    if (!editingDate || !singleEditData.availableRooms) {
      toast.error('請填寫可用房數');
      return;
    }

    // 驗證價格：根據選擇的方案檢查對應價格是否填寫
    if (singleEditData.mealPlan === '2meals' && !singleEditData.price_2_meals) {
      toast.error('請填寫一泊二食價格');
      return;
    }
    if (singleEditData.mealPlan === '3meals' && !singleEditData.price_3_meals) {
      toast.error('請填寫一泊三食價格');
      return;
    }

    try {
      setSaving(true);
      
      // 根據選擇的方案構建更新資料
      const updateData: any = {
        room_type_id: roomTypeId,
        date: editingDate,
        available_rooms: parseInt(singleEditData.availableRooms),
        is_available: singleEditData.isAvailable,
      };
      
      // 只更新選中的價格欄位
      if (singleEditData.mealPlan === '2meals') {
        updateData.price_2_meals = parseInt(singleEditData.price_2_meals);
      } else {
        updateData.price_3_meals = parseInt(singleEditData.price_3_meals);
      }
      
      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(updateData, {
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false,
        });

      if (error) throw error;

      toast.success('已成功更新日期資料');
      setSingleEditDialogOpen(false);
      setEditingDate(null);
      loadInventory();
    } catch (error) {
      console.error('更新失敗:', error);
      toast.error('更新日期資料失敗');
    } finally {
      setSaving(false);
    }
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
            <CardTitle className="text-base sm:text-lg">{roomTypeName}</CardTitle>
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 touch-manipulation"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <span className="font-semibold min-w-[100px] sm:min-w-[120px] text-center text-sm sm:text-base">
                {format(currentMonth, 'yyyy年 M月', { locale: zhTW })}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 touch-manipulation"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
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
                className="gap-1 sm:gap-2 h-11 sm:h-8 px-3 touch-manipulation"
              >
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">批量編輯</span>
                <span className="sm:hidden">編輯</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 提示訊息 */}
              {isCopyMode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    <span>請點擊一個已設定的日期來複製其價格和庫存設定</span>
                  </div>
                </div>
              )}
              
              {copiedData && !isCopyMode && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="text-green-800">
                        已複製：價格 NT$ {copiedData.price?.toLocaleString()} / 房數 {copiedData.availableRooms}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCopiedData(null);
                        setSelectedDates(new Set());
                      }}
                      className="h-6 px-2 touch-manipulation"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-green-700 mt-1">請選擇要套用的目標日期</p>
                </div>
              )}

              {/* 快速選擇按鈕組 */}
              <div className="flex flex-wrap gap-2">
                {!copiedData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartCopyMode}
                    className="gap-2 h-11 sm:h-8 touch-manipulation"
                    disabled={isCopyMode}
                  >
                    <Copy className="h-4 w-4" />
                    <span className="hidden sm:inline">複製設定</span>
                    <span className="sm:hidden">複製</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekends}
                  className="gap-2 h-11 sm:h-8 touch-manipulation"
                  disabled={isCopyMode}
                >
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">選擇週末</span>
                  <span className="sm:hidden">週末</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekdays}
                  className="gap-2 h-11 sm:h-8 touch-manipulation"
                  disabled={isCopyMode}
                >
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden sm:inline">選擇工作日</span>
                  <span className="sm:hidden">工作日</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectCurrentWeek}
                  className="gap-2 h-11 sm:h-8 touch-manipulation"
                  disabled={isCopyMode}
                >
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">選擇本週</span>
                  <span className="sm:hidden">本週</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWholeMonth}
                  className="gap-2 h-11 sm:h-8 touch-manipulation"
                  disabled={isCopyMode}
                >
                  <CalendarRange className="h-4 w-4" />
                  <span className="hidden sm:inline">選擇整月</span>
                  <span className="sm:hidden">整月</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="gap-2 h-11 sm:h-8 touch-manipulation"
                  disabled={selectedDates.size === 0 || isCopyMode}
                >
                  <X className="h-4 w-4" />
                  <span className="hidden sm:inline">清除選擇</span>
                  <span className="sm:hidden">清除</span>
                </Button>
              </div>

              {/* 操作按鈕 */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-muted/50 p-3 rounded-lg gap-3 sm:gap-0">
                <span className="text-sm font-medium text-center sm:text-left">
                  已選擇 {selectedDates.size} 個日期
                </span>
                <div className="flex gap-2">
                  {copiedData && !isCopyMode ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyCopiedData}
                      disabled={selectedDates.size === 0 || saving}
                      className="gap-2 flex-1 sm:flex-none h-11 sm:h-8 touch-manipulation"
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
                      className="gap-2 flex-1 sm:flex-none h-11 sm:h-8 touch-manipulation"
                    >
                      <Check className="h-4 w-4" />
                      編輯選中日期
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSelection}
                    className="gap-2 flex-1 sm:flex-none h-11 sm:h-8 touch-manipulation"
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden sm:inline">取消</span>
                    <span className="sm:hidden">取消</span>
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
          <div className="grid grid-cols-7 gap-1 sm:gap-1">{/* 星期標題 */}
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <div
                key={day}
                className="text-center text-xs sm:text-sm font-medium text-muted-foreground py-2 sm:py-2"
              >
                {day}
              </div>
            ))}

            {/* 填充空白日期 */}
            {Array.from({ length: paddingDays }).map((_, index) => (
              <div key={`padding-${index}`} className="min-h-[80px] sm:min-h-[90px] md:min-h-[100px]" />
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
                  onClick={() => handleSingleClick(dateStr)}
                  className={cn(
                    "relative min-h-[90px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-2 sm:p-2 flex flex-col items-center justify-center transition-all touch-manipulation active:scale-95",
                    isTodayDate && "border-blue-600 border-2",
                    !isCurrentMonth && "opacity-50",
                    isSelectionMode && "cursor-pointer",
                    !isSelectionMode && "cursor-pointer hover:shadow-md",
                    isCopyMode && hasData && "ring-2 ring-blue-400 animate-pulse",
                    isCopyMode && !hasData && "opacity-30 cursor-not-allowed",
                    isSelected && "bg-blue-100 border-blue-600 shadow-md",
                    !isSelected && hasData && dayInventory.isAvailable && "bg-blue-50 hover:bg-blue-100",
                    !isSelected && hasData && !dayInventory.isAvailable && "bg-gray-100",
                    !isSelected && !hasData && "hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "font-semibold mb-1.5 sm:mb-1.5 md:mb-2 text-base sm:text-base",
                    isTodayDate && "text-blue-600 font-bold",
                    isSelected && "text-blue-700 font-bold"
                  )}>
                    {format(day, 'd')}
                  </div>
                  {hasData ? (
                    <div className="space-y-0.5">
                      {dayInventory.price_2_meals && (
                        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span className="font-medium">二:{dayInventory.price_2_meals}</span>
                        </div>
                      )}
                      {dayInventory.price_3_meals && (
                        <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          <span className="font-medium">三:{dayInventory.price_3_meals}</span>
                        </div>
                      )}
                      {!dayInventory.price_2_meals && !dayInventory.price_3_meals && dayInventory.price && (
                        <div className="flex items-center gap-1 text-xs sm:text-xs text-muted-foreground">
                          <DollarSign className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5" />
                          <span className="font-medium">{dayInventory.price}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                        <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        <span className="font-medium">{dayInventory.availableRooms}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs sm:text-xs text-muted-foreground">未設定</div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5">
                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 圖例 */}
        <div className="space-y-3 mt-4 pt-4 border-t">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border rounded"></div>
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
              <div className="w-4 h-4 border-2 border-blue-600 rounded"></div>
              <span>今天</span>
            </div>
            {isSelectionMode && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-100 border border-blue-600 rounded"></div>
                <span>已選擇</span>
              </div>
            )}
          </div>
          {!isSelectionMode && (
            <div className="text-xs sm:text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5 sm:py-2">
              💡 提示：<span className="hidden sm:inline">點擊日期可快速編輯當天的價格和庫存</span><span className="sm:hidden">點擊日期快速編輯</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* 批量編輯對話框 - 響應式版本 */}
      {isMobile ? (
        <Drawer open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>批量編輯</DrawerTitle>
              <DrawerDescription>
                將對 {selectedDates.size} 個日期進行統一設定
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 space-y-4 overflow-y-auto">
              {/* 餐飲方案選擇 */}
              <div className="space-y-3">
                <Label>餐飲方案 *</Label>
                <RadioGroup
                  value={batchEditData.mealPlan}
                  onValueChange={(value: "2meals" | "3meals") => 
                    setBatchEditData({ ...batchEditData, mealPlan: value })
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2meals" id="batch-meal-2" />
                    <Label htmlFor="batch-meal-2" className="cursor-pointer font-normal">一泊二食</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3meals" id="batch-meal-3" />
                    <Label htmlFor="batch-meal-3" className="cursor-pointer font-normal">一泊三食</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 價格輸入 - 根據選擇的方案顯示對應欄位 */}
              {batchEditData.mealPlan === '2meals' && (
                <div className="space-y-2">
                  <Label htmlFor="batch-price-2meals">一泊二食價格 *</Label>
                  <Input
                    id="batch-price-2meals"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊二食價格"
                    value={batchEditData.price_2_meals}
                    onChange={(e) => setBatchEditData({ ...batchEditData, price_2_meals: e.target.value })}
                    className="h-12 text-base touch-manipulation"
                  />
                </div>
              )}

              {batchEditData.mealPlan === '3meals' && (
                <div className="space-y-2">
                  <Label htmlFor="batch-price-3meals">一泊三食價格 *</Label>
                  <Input
                    id="batch-price-3meals"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊三食價格"
                    value={batchEditData.price_3_meals}
                    onChange={(e) => setBatchEditData({ ...batchEditData, price_3_meals: e.target.value })}
                    className="h-12 text-base touch-manipulation"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="batch-availableRooms">可用房數 *</Label>
                <Input
                  id="batch-availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={batchEditData.availableRooms}
                  onChange={(e) => setBatchEditData({ ...batchEditData, availableRooms: e.target.value })}
                  className="h-12 text-base touch-manipulation"
                />
              </div>

              <div className="flex items-center space-x-2 py-2">
                <Switch
                  id="batch-isAvailable"
                  checked={batchEditData.isAvailable}
                  onCheckedChange={(checked) => setBatchEditData({ ...batchEditData, isAvailable: checked })}
                  className="touch-manipulation"
                />
                <Label htmlFor="batch-isAvailable" className="cursor-pointer text-base">
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

            <DrawerFooter className="pt-4">
              <Button
                onClick={handleBatchUpdate}
                disabled={saving || !batchEditData.availableRooms || 
                  (batchEditData.mealPlan === '2meals' && !batchEditData.price_2_meals) ||
                  (batchEditData.mealPlan === '3meals' && !batchEditData.price_3_meals)}
                className="h-12 text-base touch-manipulation"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setBatchEditDialogOpen(false)}
                disabled={saving}
                className="h-12 text-base touch-manipulation"
              >
                取消
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={batchEditDialogOpen} onOpenChange={setBatchEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <CardTitle>批量編輯</CardTitle>
                  <DialogDescription className="mt-1.5">
                    將對 {selectedDates.size} 個日期進行統一設定
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <div className="flex items-center gap-1.5">
                    <kbd className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md border border-border bg-muted/50 px-2 font-mono text-xs font-medium shadow-sm">
                      ESC
                    </kbd>
                    <span className="text-muted-foreground/80">關閉</span>
                  </div>
                  <div className="h-4 w-px bg-border"></div>
                  <div className="flex items-center gap-1.5">
                    <kbd className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md border border-border bg-muted/50 px-2 font-mono text-xs font-medium shadow-sm">
                      Enter
                    </kbd>
                    <span className="text-muted-foreground/80">儲存</span>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* 餐飲方案選擇 */}
              <div className="space-y-3">
                <Label>餐飲方案 *</Label>
                <RadioGroup
                  value={batchEditData.mealPlan}
                  onValueChange={(value: "2meals" | "3meals") => 
                    setBatchEditData({ ...batchEditData, mealPlan: value })
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2meals" id="batch-meal-2-desktop" />
                    <Label htmlFor="batch-meal-2-desktop" className="cursor-pointer font-normal">一泊二食</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3meals" id="batch-meal-3-desktop" />
                    <Label htmlFor="batch-meal-3-desktop" className="cursor-pointer font-normal">一泊三食</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 價格輸入 - 根據選擇的方案顯示對應欄位 */}
              {batchEditData.mealPlan === '2meals' && (
                <div className="space-y-2">
                  <Label htmlFor="batch-price-2meals-desktop">一泊二食價格 *</Label>
                  <Input
                    id="batch-price-2meals-desktop"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊二食價格"
                    value={batchEditData.price_2_meals}
                    onChange={(e) => setBatchEditData({ ...batchEditData, price_2_meals: e.target.value })}
                    className="touch-manipulation"
                  />
                </div>
              )}

              {batchEditData.mealPlan === '3meals' && (
                <div className="space-y-2">
                  <Label htmlFor="batch-price-3meals-desktop">一泊三食價格 *</Label>
                  <Input
                    id="batch-price-3meals-desktop"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊三食價格"
                    value={batchEditData.price_3_meals}
                    onChange={(e) => setBatchEditData({ ...batchEditData, price_3_meals: e.target.value })}
                    className="touch-manipulation"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="batch-availableRooms-desktop">可用房數 *</Label>
                <Input
                  id="batch-availableRooms-desktop"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={batchEditData.availableRooms}
                  onChange={(e) => setBatchEditData({ ...batchEditData, availableRooms: e.target.value })}
                  className="touch-manipulation"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="batch-isAvailable-desktop"
                  checked={batchEditData.isAvailable}
                  onCheckedChange={(checked) => setBatchEditData({ ...batchEditData, isAvailable: checked })}
                  className="touch-manipulation"
                />
                <Label htmlFor="batch-isAvailable-desktop" className="cursor-pointer">
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
                className="touch-manipulation"
              >
                取消
              </Button>
              <Button
                onClick={handleBatchUpdate}
                disabled={saving || !batchEditData.availableRooms || 
                  (batchEditData.mealPlan === '2meals' && !batchEditData.price_2_meals) ||
                  (batchEditData.mealPlan === '3meals' && !batchEditData.price_3_meals)}
                className="touch-manipulation"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 單日期編輯對話框 - 響應式版本 */}
      {isMobile ? (
        <Drawer open={singleEditDialogOpen} onOpenChange={setSingleEditDialogOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>編輯日期</DrawerTitle>
              <DrawerDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 space-y-4 overflow-y-auto">
              {/* 餐飲方案選擇 */}
              <div className="space-y-3">
                <Label>餐飲方案 *</Label>
                <RadioGroup
                  value={singleEditData.mealPlan}
                  onValueChange={(value: "2meals" | "3meals") => 
                    setSingleEditData({ ...singleEditData, mealPlan: value })
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2meals" id="meal-2" />
                    <Label htmlFor="meal-2" className="cursor-pointer font-normal">一泊二食</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3meals" id="meal-3" />
                    <Label htmlFor="meal-3" className="cursor-pointer font-normal">一泊三食</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 價格輸入 - 根據選擇的方案顯示對應欄位 */}
              {singleEditData.mealPlan === '2meals' && (
                <div className="space-y-2">
                  <Label htmlFor="single-price-2meals">一泊二食價格 *</Label>
                  <Input
                    id="single-price-2meals"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊二食價格"
                    value={singleEditData.price_2_meals}
                    onChange={(e) => setSingleEditData({ ...singleEditData, price_2_meals: e.target.value })}
                    className="h-12 text-base touch-manipulation"
                  />
                </div>
              )}

              {singleEditData.mealPlan === '3meals' && (
                <div className="space-y-2">
                  <Label htmlFor="single-price-3meals">一泊三食價格 *</Label>
                  <Input
                    id="single-price-3meals"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊三食價格"
                    value={singleEditData.price_3_meals}
                    onChange={(e) => setSingleEditData({ ...singleEditData, price_3_meals: e.target.value })}
                    className="h-12 text-base touch-manipulation"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="single-availableRooms">可用房數 *</Label>
                <Input
                  id="single-availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={singleEditData.availableRooms}
                  onChange={(e) => setSingleEditData({ ...singleEditData, availableRooms: e.target.value })}
                  className="h-12 text-base touch-manipulation"
                />
              </div>

              <div className="flex items-center space-x-2 py-2">
                <Switch
                  id="single-isAvailable"
                  checked={singleEditData.isAvailable}
                  onCheckedChange={(checked) => setSingleEditData({ ...singleEditData, isAvailable: checked })}
                  className="touch-manipulation"
                />
                <Label htmlFor="single-isAvailable" className="cursor-pointer text-base">
                  開放預訂
                </Label>
              </div>
            </div>

            <DrawerFooter className="pt-4">
              <Button
                onClick={handleSingleDateUpdate}
                disabled={saving || !singleEditData.availableRooms || 
                  (singleEditData.mealPlan === '2meals' && !singleEditData.price_2_meals) ||
                  (singleEditData.mealPlan === '3meals' && !singleEditData.price_3_meals)}
                className="h-12 text-base touch-manipulation"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSingleEditDialogOpen(false)}
                disabled={saving}
                className="h-12 text-base touch-manipulation"
              >
                取消
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={singleEditDialogOpen} onOpenChange={setSingleEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-start justify-between gap-6">
                <div>
                  <CardTitle>編輯日期</CardTitle>
                  <DialogDescription className="mt-1.5">
                    {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <div className="flex items-center gap-1.5">
                    <kbd className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md border border-border bg-muted/50 px-2 font-mono text-xs font-medium shadow-sm">
                      ESC
                    </kbd>
                    <span className="text-muted-foreground/80">關閉</span>
                  </div>
                  <div className="h-4 w-px bg-border"></div>
                  <div className="flex items-center gap-1.5">
                    <kbd className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md border border-border bg-muted/50 px-2 font-mono text-xs font-medium shadow-sm">
                      Enter
                    </kbd>
                    <span className="text-muted-foreground/80">儲存</span>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* 餐飲方案選擇 */}
              <div className="space-y-3">
                <Label>餐飲方案 *</Label>
                <RadioGroup
                  value={singleEditData.mealPlan}
                  onValueChange={(value: "2meals" | "3meals") => 
                    setSingleEditData({ ...singleEditData, mealPlan: value })
                  }
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="2meals" id="meal-2-desktop" />
                    <Label htmlFor="meal-2-desktop" className="cursor-pointer font-normal">一泊二食</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="3meals" id="meal-3-desktop" />
                    <Label htmlFor="meal-3-desktop" className="cursor-pointer font-normal">一泊三食</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* 價格輸入 - 根據選擇的方案顯示對應欄位 */}
              {singleEditData.mealPlan === '2meals' && (
                <div className="space-y-2">
                  <Label htmlFor="single-price-2meals-desktop">一泊二食價格 *</Label>
                  <Input
                    id="single-price-2meals-desktop"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊二食價格"
                    value={singleEditData.price_2_meals}
                    onChange={(e) => setSingleEditData({ ...singleEditData, price_2_meals: e.target.value })}
                    className="touch-manipulation"
                  />
                </div>
              )}

              {singleEditData.mealPlan === '3meals' && (
                <div className="space-y-2">
                  <Label htmlFor="single-price-3meals-desktop">一泊三食價格 *</Label>
                  <Input
                    id="single-price-3meals-desktop"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入一泊三食價格"
                    value={singleEditData.price_3_meals}
                    onChange={(e) => setSingleEditData({ ...singleEditData, price_3_meals: e.target.value })}
                    className="touch-manipulation"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="single-availableRooms-desktop">可用房數 *</Label>
                <Input
                  id="single-availableRooms-desktop"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入可用房數"
                  value={singleEditData.availableRooms}
                  onChange={(e) => setSingleEditData({ ...singleEditData, availableRooms: e.target.value })}
                  className="touch-manipulation"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="single-isAvailable-desktop"
                  checked={singleEditData.isAvailable}
                  onCheckedChange={(checked) => setSingleEditData({ ...singleEditData, isAvailable: checked })}
                  className="touch-manipulation"
                />
                <Label htmlFor="single-isAvailable-desktop" className="cursor-pointer">
                  開放預訂
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setSingleEditDialogOpen(false)}
                disabled={saving}
                className="touch-manipulation"
              >
                取消
              </Button>
              <Button
                onClick={handleSingleDateUpdate}
                disabled={saving || !singleEditData.availableRooms || 
                  (singleEditData.mealPlan === '2meals' && !singleEditData.price_2_meals) ||
                  (singleEditData.mealPlan === '3meals' && !singleEditData.price_3_meals)}
                className="touch-manipulation"
              >
                {saving ? '更新中...' : '確認更新'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
