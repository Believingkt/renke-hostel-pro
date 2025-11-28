import { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWeekend as isWeekendDate, startOfWeek, endOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, DollarSign, Package, Edit, X, Check, Calendar, CalendarDays, CalendarRange, Briefcase, Copy, List, Grid3x3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface RoomInventoryCalendarProps {
  roomTypeId: string;
  roomTypeName: string;
  accommodationId: string;
}

interface PublicHoliday {
  date: string;
  type: 'holiday' | 'compensatory_day_off' | 'work_on_weekend';
  name: string;
}

interface DayInventory {
  date: string;
  price: number | null;
  price_2_meals: number | null;
  price_3_meals: number | null;
  availableRooms: number | null;
  isAvailable: boolean;
}

// 價格千分位格式化函數
const formatPrice = (price: number | null | undefined): string => {
  if (!price) return '0';
  return price.toLocaleString('zh-TW');
};

export function RoomInventoryCalendar({ roomTypeId, roomTypeName, accommodationId }: RoomInventoryCalendarProps) {
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [inventory, setInventory] = useState<Record<string, DayInventory>>({});
  const [publicHolidays, setPublicHolidays] = useState<Map<string, PublicHoliday>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
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
    loadPublicHolidays();
  }, [roomTypeId, currentMonth, accommodationId]);

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

  const loadPublicHolidays = async () => {
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      const { data, error } = await supabase
        .from('public_holidays')
        .select('holiday_date, holiday_type, holiday_name')
        .eq('accommodation_id', accommodationId)
        .gte('holiday_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('holiday_date', format(monthEnd, 'yyyy-MM-dd'));

      if (error) throw error;

      const holidayMap = new Map(
        data?.map(h => [
          h.holiday_date,
          {
            date: h.holiday_date,
            type: h.holiday_type as 'holiday' | 'compensatory_day_off' | 'work_on_weekend',
            name: h.holiday_name,
          }
        ]) || []
      );
      setPublicHolidays(holidayMap);
    } catch (error) {
      console.error('載入國定假日失敗:', error);
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
        <div className="flex flex-col gap-4">
          {/* 頂部控制區 - 優化佈局 */}
          <div className="flex items-center justify-between gap-3">
            {/* 左側：房型名稱 */}
            <CardTitle className="text-base sm:text-lg font-bold">{roomTypeName}</CardTitle>
            
            {/* 右側：視圖切換和月份導航 */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* 視圖切換按鈕組 - 優化設計 */}
              <div className="flex sm:hidden border rounded-lg overflow-hidden">
                <Button
                  variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    "h-9 w-9 rounded-none border-0 touch-manipulation transition-all",
                    viewMode === 'calendar' && "shadow-sm"
                  )}
                >
                  <Grid3x3 className="h-4 w-4" />
                </Button>
                <div className="w-px bg-border" />
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "h-9 w-9 rounded-none border-0 touch-manipulation transition-all",
                    viewMode === 'list' && "shadow-sm"
                  )}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              
              {/* 月份導航 - 手機版優化 */}
              <div className="flex items-center gap-0.5 sm:gap-2 border rounded-lg p-0.5 sm:p-1 bg-muted/30">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevMonth}
                  className="h-9 w-9 sm:h-8 sm:w-8 hover:bg-background hover:text-foreground active:scale-95 transition-transform touch-manipulation"
                >
                  <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
                </Button>
                <div className="flex items-center justify-center min-w-[110px] sm:min-w-[110px] px-3 sm:px-2">
                  <span className="font-bold text-sm sm:text-base tracking-tight">
                    {format(currentMonth, 'yyyy年M月', { locale: zhTW })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextMonth}
                  className="h-9 w-9 sm:h-8 sm:w-8 hover:bg-background hover:text-foreground active:scale-95 transition-transform touch-manipulation"
                >
                  <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 批量編輯工具列 - 優化佈局 */}
          {!isSelectionMode ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartBatchEdit}
                className="gap-1.5 sm:gap-2 h-9 sm:h-8 px-3 sm:px-4 touch-manipulation text-xs sm:text-sm"
              >
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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

              {/* 快速選擇按鈕組 - 優化手機版設計 */}
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {!copiedData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartCopyMode}
                    className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                    disabled={isCopyMode}
                  >
                    <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">複製設定</span>
                    <span className="sm:hidden">複製</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekends}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={isCopyMode}
                >
                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">選擇週末</span>
                  <span className="sm:hidden">週末</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekdays}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={isCopyMode}
                >
                  <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">選擇工作日</span>
                  <span className="sm:hidden">工作日</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectCurrentWeek}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={isCopyMode}
                >
                  <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">選擇本週</span>
                  <span className="sm:hidden">本週</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWholeMonth}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={isCopyMode}
                >
                  <CalendarRange className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">選擇整月</span>
                  <span className="sm:hidden">整月</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={selectedDates.size === 0 || isCopyMode}
                >
                  <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">清除選擇</span>
                  <span className="sm:hidden">清除</span>
                </Button>
              </div>

              {/* 操作按鈕 - 優化設計 */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-muted/40 p-2.5 sm:p-3 rounded-lg gap-2 sm:gap-0 border">
                <span className="text-xs sm:text-sm font-medium text-center sm:text-left">
                  已選擇 <span className="text-primary font-bold">{selectedDates.size}</span> 個日期
                </span>
                <div className="flex gap-2">
                  {copiedData && !isCopyMode ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleApplyCopiedData}
                      disabled={selectedDates.size === 0 || saving}
                      className="gap-1.5 sm:gap-2 flex-1 sm:flex-none h-9 sm:h-8 touch-manipulation text-xs sm:text-sm"
                    >
                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      {saving ? '套用中...' : '套用複製設定'}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleOpenBatchEdit}
                      disabled={selectedDates.size === 0 || isCopyMode}
                      className="gap-1.5 sm:gap-2 flex-1 sm:flex-none h-9 sm:h-8 touch-manipulation text-xs sm:text-sm"
                    >
                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      編輯選中日期
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSelection}
                    className="gap-1.5 sm:gap-2 flex-1 sm:flex-none h-9 sm:h-8 touch-manipulation text-xs sm:text-sm"
                  >
                    <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
        ) : viewMode === 'list' ? (
          /* 列表視圖 - 僅在小螢幕顯示 */
          <div className="space-y-2 sm:hidden">
            {daysInMonth.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayInventory = inventory[dateStr];
              const hasData = dayInventory !== undefined;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);
              const isSelected = selectedDates.has(dateStr);
              const isWeekend = isWeekendDate(day);
              const holidayInfo = publicHolidays.get(dateStr);
              
              const isWorkOnWeekend = holidayInfo?.type === 'work_on_weekend';
              const isCompensatoryDayOff = holidayInfo?.type === 'compensatory_day_off';
              const isRegularHoliday = holidayInfo?.type === 'holiday';
              const isHoliday = (isWeekend && !isWorkOnWeekend) || isCompensatoryDayOff || isRegularHoliday;

              if (!isCurrentMonth) return null;

              return (
                <div
                  key={dateStr}
                  onClick={() => handleSingleClick(dateStr)}
                  className={cn(
                    "border rounded-lg p-3 transition-all touch-manipulation active:scale-[0.98]",
                    isTodayDate && "border-primary border-2 ring-2 ring-primary/20",
                    isSelectionMode && "cursor-pointer",
                    !isSelectionMode && "cursor-pointer hover:shadow-md",
                    isSelected && "bg-blue-100 border-blue-600 shadow-md",
                    !isSelected && hasData && dayInventory.isAvailable && isHoliday && "bg-orange-50/80 hover:bg-orange-100",
                    !isSelected && hasData && dayInventory.isAvailable && !isHoliday && "bg-blue-50/80 hover:bg-blue-100",
                    !isSelected && hasData && !dayInventory.isAvailable && "bg-gray-100",
                    !isSelected && !hasData && "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-bold text-lg",
                        isTodayDate && "text-primary",
                        isSelected && "text-blue-700",
                        !isTodayDate && !isSelected && isHoliday && hasData && "text-orange-700",
                        !isTodayDate && !isSelected && !isHoliday && hasData && "text-blue-700"
                      )}>
                        {format(day, 'd日 (E)', { locale: zhTW })}
                      </span>
                      {holidayInfo && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-medium",
                          isRegularHoliday && "bg-orange-600 text-white",
                          isCompensatoryDayOff && "bg-green-600 text-white",
                          isWorkOnWeekend && "bg-blue-600 text-white"
                        )}>
                          {isRegularHoliday && '假'}
                          {isCompensatoryDayOff && '休'}
                          {isWorkOnWeekend && '班'}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  
                  {hasData ? (
                    <div className="space-y-2">
                      {dayInventory.price_2_meals && (
                        <div className={cn(
                          "flex items-center justify-between rounded px-3 py-2",
                          isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                        )}>
                          <span className="text-sm font-medium text-muted-foreground">一泊二食</span>
                          <span className="text-base font-bold">${formatPrice(dayInventory.price_2_meals)}</span>
                        </div>
                      )}
                      {dayInventory.price_3_meals && (
                        <div className={cn(
                          "flex items-center justify-between rounded px-3 py-2",
                          isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                        )}>
                          <span className="text-sm font-medium text-muted-foreground">一泊三食</span>
                          <span className="text-base font-bold">${formatPrice(dayInventory.price_3_meals)}</span>
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center justify-between rounded px-3 py-2",
                        isHoliday ? "bg-orange-200/50" : "bg-primary/10"
                      )}>
                        <span className="text-sm font-medium">可用房數</span>
                        <span className={cn(
                          "text-base font-bold",
                          isHoliday ? "text-orange-700" : "text-primary"
                        )}>
                          {dayInventory.availableRooms} 間
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-4">未設定</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* 月曆視圖 */
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* 星期標題 */}
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <div
                key={day}
                className="text-center text-sm sm:text-sm font-semibold text-foreground py-2.5 sm:py-2 bg-muted/50 rounded-t-lg"
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
              const isWeekend = isWeekendDate(day);
              const holidayInfo = publicHolidays.get(dateStr);
              
              // 判斷是否為假日價格：
              // 1. 週末 + 不是補班日
              // 2. 平日 + 是補休日或國定假日
              const isWorkOnWeekend = holidayInfo?.type === 'work_on_weekend';
              const isCompensatoryDayOff = holidayInfo?.type === 'compensatory_day_off';
              const isRegularHoliday = holidayInfo?.type === 'holiday';
              const isHoliday = (isWeekend && !isWorkOnWeekend) || isCompensatoryDayOff || isRegularHoliday;

              return (
                <div
                  key={dateStr}
                  onClick={() => handleSingleClick(dateStr)}
                  className={cn(
                    "relative min-h-[80px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-1.5 sm:p-2 flex flex-col items-center justify-start transition-all touch-manipulation active:scale-95",
                    isTodayDate && "border-primary border-2 ring-2 ring-primary/20",
                    !isCurrentMonth && "opacity-50",
                    isSelectionMode && "cursor-pointer",
                    !isSelectionMode && "cursor-pointer hover:shadow-md",
                    isCopyMode && hasData && "ring-2 ring-blue-400 animate-pulse",
                    isCopyMode && !hasData && "opacity-30 cursor-not-allowed",
                    isSelected && "bg-blue-100 border-blue-600 shadow-md",
                    // 假日（週末或國定假日）有資料：使用暖色調
                    !isSelected && hasData && dayInventory.isAvailable && isHoliday && "bg-orange-50/80 hover:bg-orange-100 border-orange-200/50",
                    // 平日有資料：使用藍色調
                    !isSelected && hasData && dayInventory.isAvailable && !isHoliday && "bg-blue-50/80 hover:bg-blue-100 border-blue-200/50",
                    !isSelected && hasData && !dayInventory.isAvailable && "bg-gray-100",
                    !isSelected && !hasData && "hover:bg-muted"
                  )}
                >
                  <div className={cn(
                    "font-bold mb-1 text-sm sm:text-base w-full text-center pb-1 border-b leading-tight",
                    isTodayDate && "text-primary border-primary/30",
                    isSelected && "text-blue-700 border-blue-300",
                    !isTodayDate && !isSelected && isHoliday && hasData && "text-orange-700 border-orange-200/50",
                    !isTodayDate && !isSelected && !isHoliday && hasData && "text-blue-700 border-blue-200/50",
                    !isTodayDate && !isSelected && !hasData && "border-border/30"
                  )}>
                    {format(day, 'd')}
                    {holidayInfo && (
                      <span className={cn(
                        "ml-1 text-[9px] sm:text-[10px] px-1 py-0.5 rounded font-medium leading-none",
                        isRegularHoliday && "bg-orange-600 text-white",
                        isCompensatoryDayOff && "bg-green-600 text-white",
                        isWorkOnWeekend && "bg-blue-600 text-white"
                      )}>
                        {isRegularHoliday && '假'}
                        {isCompensatoryDayOff && '休'}
                        {isWorkOnWeekend && '班'}
                      </span>
                    )}
                  </div>
                  {hasData ? (
                    <div className="w-full space-y-1 px-0.5">
                      {dayInventory.price_2_meals && (
                        <div className={cn(
                          "flex items-center justify-between gap-1 text-xs sm:text-xs rounded px-1.5 py-0.5",
                          isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                        )}>
                          <span className="text-muted-foreground font-semibold text-[9px] sm:text-xs whitespace-nowrap leading-tight tracking-tight">
                            <span className="md:hidden">二</span>
                            <span className="hidden md:inline">一泊二食</span>
                          </span>
                          <span className="font-bold text-foreground text-[10px] sm:text-xs truncate leading-tight tracking-wide">${formatPrice(dayInventory.price_2_meals)}</span>
                        </div>
                      )}
                      {dayInventory.price_3_meals && (
                        <div className={cn(
                          "flex items-center justify-between gap-1 text-xs sm:text-xs rounded px-1.5 py-0.5",
                          isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                        )}>
                          <span className="text-muted-foreground font-semibold text-[9px] sm:text-xs whitespace-nowrap leading-tight tracking-tight">
                            <span className="md:hidden">三</span>
                            <span className="hidden md:inline">一泊三食</span>
                          </span>
                          <span className="font-bold text-foreground text-[10px] sm:text-xs truncate leading-tight tracking-wide">${formatPrice(dayInventory.price_3_meals)}</span>
                        </div>
                      )}
                      {!dayInventory.price_2_meals && !dayInventory.price_3_meals && dayInventory.price && (
                        <div className={cn(
                          "flex items-center justify-center gap-1 text-xs sm:text-xs rounded px-1.5 py-1",
                          isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                        )}>
                          <DollarSign className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-bold text-foreground text-[12px] truncate">{formatPrice(dayInventory.price)}</span>
                        </div>
                      )}
                      <div className={cn(
                        "flex items-center justify-center gap-1.5 text-xs sm:text-xs rounded px-1.5 py-0.5 mt-1",
                        isHoliday ? "bg-orange-200/50" : "bg-primary/10"
                      )}>
                        <Package className={cn(
                          "h-3.5 w-3.5 flex-shrink-0 hidden md:inline-block",
                          isHoliday ? "text-orange-700" : "text-primary"
                        )} />
                        <span className={cn(
                          "font-bold text-[10px] sm:text-xs whitespace-nowrap leading-tight tracking-wide",
                          isHoliday ? "text-orange-700" : "text-primary"
                        )}>
                          <span className="md:hidden">{dayInventory.availableRooms}</span>
                          <span className="hidden md:inline">{dayInventory.availableRooms} 間</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs sm:text-xs text-muted-foreground font-medium mt-2 leading-tight">未設定</div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 sm:top-1.5 sm:right-1.5 bg-blue-600 rounded-full p-0.5">
                      <Check className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 圖例 - 僅在月曆視圖顯示 */}
        {viewMode === 'calendar' && (
        <div className="space-y-3 mt-4 pt-4 border-t">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-blue-50/80 border border-blue-200/50 rounded flex-shrink-0"></div>
              <span className="font-medium">平日有庫存</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-orange-50/80 border border-orange-200/50 rounded flex-shrink-0"></div>
              <span className="font-medium">假日有庫存</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-gray-100 border rounded flex-shrink-0"></div>
              <span className="font-medium">無庫存</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 border rounded flex-shrink-0"></div>
              <span className="font-medium">未設定</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 border-2 border-primary rounded flex-shrink-0 ring-2 ring-primary/20"></div>
              <span className="font-medium">今天</span>
            </div>
            {isSelectionMode && (
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <div className="w-5 h-5 sm:w-4 sm:h-4 bg-blue-100 border border-blue-600 rounded flex-shrink-0"></div>
                <span className="font-medium">已選擇</span>
              </div>
            )}
          </div>
          {!isSelectionMode && (
            <div className="text-xs sm:text-sm text-muted-foreground bg-gradient-to-r from-muted/80 to-muted/40 rounded-lg px-4 py-3 sm:py-2.5 border border-muted">
              💡 <span className="font-medium">提示：</span>
              <span className="hidden sm:inline">
                平日使用藍色調，假日（週末及國定假日）使用橙色調。
                <span className="mx-1">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1 py-0.5 bg-orange-600 text-white rounded text-[10px]">假</span>
                  國定假日
                </span>
                <span className="mx-1">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1 py-0.5 bg-green-600 text-white rounded text-[10px]">休</span>
                  補休
                </span>
                <span className="mx-1">•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1 py-0.5 bg-blue-600 text-white rounded text-[10px]">班</span>
                  補班
                </span>
              </span>
              <span className="sm:hidden">平日藍色、假日橙色。假=國定假日、休=補休、班=補班</span>
            </div>
          )}
        </div>
        )}
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
              <DialogTitle>批量編輯</DialogTitle>
              <DialogDescription>
                將對 {selectedDates.size} 個日期進行統一設定
              </DialogDescription>
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
              <DialogTitle>編輯日期</DialogTitle>
              <DialogDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DialogDescription>
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
