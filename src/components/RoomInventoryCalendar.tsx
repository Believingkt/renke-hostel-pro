import { useState, useEffect } from "react";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isWeekend as isWeekendDate, startOfWeek, endOfWeek } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, ChevronRight, DollarSign, Package, Edit, X, Check, Calendar, CalendarDays, CalendarRange, Briefcase, Copy, List, Grid3x3, Lock, AlertCircle, Unlock, Plus, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getOrderStatusConfig, getPaymentStatusConfig, getPaymentMethodLabel } from "@/utils/orderHelpers";
import { RoomInventoryCalendarSkeleton, RoomInventoryListSkeleton } from "@/components/skeletons/RoomInventoryCalendarSkeleton";
import { CreateOrderDialog } from "@/components/orders/CreateOrderDialog";

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
  isBlocked?: boolean;
  blockedByRoomName?: string;
  bookedCount?: number;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const [selectedBlockedDates, setSelectedBlockedDates] = useState<Set<string>>(new Set());
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [ordersToCancel, setOrdersToCancel] = useState<any[]>([]);
  const [bookingDetailsDialogOpen, setBookingDetailsDialogOpen] = useState(false);
  const [selectedDateOrders, setSelectedDateOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [customMealPlans, setCustomMealPlans] = useState<{ id: string; name: string }[]>([]);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);
  const [createOrderInitialData, setCreateOrderInitialData] = useState<{ check_in_date: string; check_out_date: string; room_type_id: string } | null>(null);

  // 獲取專案顯示名稱
  const getMealPlanDisplayName = (planId: string | null) => {
    if (!planId) return "";
    const customPlan = customMealPlans.find(p => p.id === planId);
    if (customPlan) {
      return customPlan.name;
    }
    // 預設名稱
    return planId === "2_meals" ? "一泊二食" : planId === "3_meals" ? "一泊三食" : planId;
  };

  // 手機版預設使用清單視圖
  useEffect(() => {
    if (isMobile) {
      setViewMode('list');
    }
  }, [isMobile]);

  useEffect(() => {
    loadInventory();
    loadPublicHolidays();
    setSelectedBlockedDates(new Set()); // 清除選擇
  }, [roomTypeId, currentMonth, accommodationId]);

  // 監聽從編輯視窗發出的重新載入信號
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'room-inventory-refresh') {
        setIsRefreshing(true);
        loadInventory().then(() => {
          toast.success("訂單已更新，資料已重新載入");
          // 動畫結束後重置狀態
          setTimeout(() => setIsRefreshing(false), 1000);
        });
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 載入自訂專案
  useEffect(() => {
    const loadCustomMealPlans = async () => {
      try {
        const { data, error } = await supabase
          .from("pricing_templates")
          .select("meal_plans")
          .eq("accommodation_id", accommodationId)
          .eq("is_default", true)
          .single();

        if (!error && data?.meal_plans) {
          const mealPlans = data.meal_plans as { id: string; name: string }[];
          setCustomMealPlans(mealPlans);
        }
      } catch (err) {
        console.error("載入自訂專案失敗:", err);
      }
    };
    
    if (accommodationId) {
      loadCustomMealPlans();
    }
  }, [accommodationId]);

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

      // 並行查詢庫存定價和訂單
      const [inventoryResult, ordersResult] = await Promise.all([
        supabase
          .from('room_inventory_pricing')
          .select('*')
          .eq('room_type_id', roomTypeId)
          .gte('date', format(monthStart, 'yyyy-MM-dd'))
          .lte('date', format(monthEnd, 'yyyy-MM-dd')),
        supabase
          .from('orders')
          .select('check_in_date, check_out_date, room_type_id')
          .eq('room_type_id', roomTypeId)
          .neq('order_status', 'cancelled')
          .gte('check_out_date', format(monthStart, 'yyyy-MM-dd'))
          .lte('check_in_date', format(monthEnd, 'yyyy-MM-dd'))
      ]);

      if (inventoryResult.error) throw inventoryResult.error;

      const data = inventoryResult.data;
      const ordersData = ordersResult.data;

      if (ordersResult.error) {
        console.error('查詢訂單失敗:', ordersResult.error);
      }

      // 計算每個日期的預訂數量
      const bookingCountMap: Record<string, number> = {};
      if (ordersData) {
        ordersData.forEach(order => {
          const checkIn = new Date(order.check_in_date);
          const checkOut = new Date(order.check_out_date);
          
          // 遍歷訂單的每一天
          let currentDate = new Date(checkIn);
          while (currentDate < checkOut) {
            const dateStr = format(currentDate, 'yyyy-MM-dd');
            bookingCountMap[dateStr] = (bookingCountMap[dateStr] || 0) + 1;
            currentDate = addDays(currentDate, 1);
          }
        });
      }

      // 獲取調整後的庫存（考慮互斥邏輯）- 使用批量 RPC 一次查詢所有日期
      const inventoryMap: Record<string, DayInventory> = {};
      
      if (data && data.length > 0) {
        // 收集所有日期
        const allDates = data.map(item => item.date);
        
        // 使用批量 RPC 一次查詢所有日期的調整後庫存
        const { data: adjustedDataBatch, error: adjustedError } = await supabase
          .rpc('get_adjusted_room_inventory_batch', {
            p_room_type_id: roomTypeId,
            p_dates: allDates,
            p_accommodation_id: accommodationId
          });

        // 建立調整後庫存的查找表
        const adjustedMap: Record<string, { available_rooms: number; is_blocked: boolean; blocked_by_room_name: string | null }> = {};
        if (!adjustedError && adjustedDataBatch) {
          adjustedDataBatch.forEach((item: { date_value: string; available_rooms: number; is_blocked: boolean; blocked_by_room_name: string | null }) => {
            adjustedMap[item.date_value] = {
              available_rooms: item.available_rooms,
              is_blocked: item.is_blocked,
              blocked_by_room_name: item.blocked_by_room_name
            };
          });
        }

        // 建立庫存映射
        for (const item of data) {
          const adjusted = adjustedMap[item.date];
          
          if (adjusted) {
            inventoryMap[item.date] = {
              date: item.date,
              price: item.price,
              price_2_meals: item.price_2_meals,
              price_3_meals: item.price_3_meals,
              availableRooms: adjusted.available_rooms,
              isAvailable: item.is_available && adjusted.available_rooms > 0,
              isBlocked: adjusted.is_blocked,
              blockedByRoomName: adjusted.blocked_by_room_name,
              bookedCount: bookingCountMap[item.date] || 0,
            };
          } else {
            // 如果批量查詢沒有返回該日期，使用原始數據
            inventoryMap[item.date] = {
              date: item.date,
              price: item.price,
              price_2_meals: item.price_2_meals,
              price_3_meals: item.price_3_meals,
              availableRooms: item.available_rooms,
              isAvailable: item.is_available,
              bookedCount: bookingCountMap[item.date] || 0,
            };
          }
        }
      }

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
      toast.error('請填寫庫存數');
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
          last_change_source: 'inline_edit',
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
    
    const saturdayDates = days
      .filter(day => day.getDay() === 6) // Only Saturday
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(saturdayDates));
    toast.success(`已選擇 ${saturdayDates.length} 個星期六`);
  };

  const selectWeekdays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    const weekdayDates = days
      .filter(day => {
        const dayOfWeek = day.getDay();
        return dayOfWeek >= 0 && dayOfWeek <= 5; // Sunday to Friday
      })
      .map(day => format(day, 'yyyy-MM-dd'));
    
    setSelectedDates(new Set(weekdayDates));
    toast.success(`已選擇 ${weekdayDates.length} 個平日（日～五）`);
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
        last_change_source: 'inline_edit',
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

  const handleBookingClick = async (dateStr: string) => {
    const dayData = inventory[dateStr];
    if (!dayData?.bookedCount || dayData.bookedCount === 0) return;
    
    try {
      setLoadingOrders(true);
      setBookingDetailsDialogOpen(true);
      
      // 查詢該日期的所有訂單 - 包含更多詳細信息
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          guest_name,
          guest_phone,
          guest_email,
          check_in_date,
          check_out_date,
          guest_count,
          order_status,
          payment_status,
          total_price,
          discount_amount,
          discount_code,
          final_price,
          paid_amount,
          deposit_amount,
          order_date,
          notes,
          payment_method,
          room_types (
            name
          )
        `)
        .eq('room_type_id', roomTypeId)
        .neq('order_status', 'cancelled')
        .lte('check_in_date', dateStr)
        .gt('check_out_date', dateStr)
        .order('check_in_date', { ascending: true });

      if (error) throw error;
      setSelectedDateOrders(data || []);
    } catch (error) {
      console.error('查詢訂單失敗:', error);
      toast.error('查詢訂單失敗');
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSingleClick = (dateStr: string) => {
    if (isSelectionMode) {
      // 在批量編輯模式下執行選擇邏輯
      toggleDateSelection(dateStr);
    } else {
      const dayData = inventory[dateStr];
      
      // 如果有預訂，直接顯示預訂詳情
      if (dayData?.bookedCount && dayData.bookedCount > 0) {
        handleBookingClick(dateStr);
        return;
      }
      
      // 在一般模式下開啟單日編輯對話框
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

  const toggleBlockedDate = (dateStr: string) => {
    const inventoryDay = inventory[dateStr];
    if (!inventoryDay || !inventoryDay.isBlocked) return;
    
    const newSelected = new Set(selectedBlockedDates);
    if (newSelected.has(dateStr)) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    setSelectedBlockedDates(newSelected);
  };

  const handleUnlockClick = async () => {
    if (selectedBlockedDates.size === 0) return;
    
    setLoading(true);
    try {
      // 查詢這些日期的封鎖訂單
      const selectedDatesArray = Array.from(selectedBlockedDates);
      const { data: orders, error } = await supabase
        .from("orders")
        .select("*, room_types(name, is_exclusive_package)")
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled");

      if (error) throw error;

      // 篩選出在選中日期範圍內的訂單
      const relevantOrders = orders?.filter(order => {
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        
        // 檢查訂單是否與任何選中的日期重疊
        return selectedDatesArray.some(dateStr => {
          const date = new Date(dateStr);
          return date >= checkIn && date < checkOut;
        });
      }) || [];

      // 只顯示包棟房型的訂單（使用資料庫欄位而非硬編碼名稱）
      const exclusiveOrders = relevantOrders.filter(order => {
        const roomType = order.room_types as any;
        return roomType?.is_exclusive_package === true;
      });

      setOrdersToCancel(exclusiveOrders);
      setUnlockDialogOpen(true);
    } catch (error: any) {
      console.error("Error fetching orders:", error);
      toast.error('載入訂單失敗');
    } finally {
      setLoading(false);
    }
  };

  const confirmUnlock = async () => {
    if (ordersToCancel.length === 0) return;

    setIsUnlocking(true);
    try {
      // 取消這些訂單
      const { error } = await supabase
        .from("orders")
        .update({ 
          order_status: "cancelled",
          cancelled_at: new Date().toISOString()
        })
        .in("id", ordersToCancel.map(o => o.id));

      if (error) throw error;

      // 獲取住宿資訊以便發送郵件
      const { data: accommodationInfo } = await supabase
        .from("accommodation_info")
        .select("name, phone, email")
        .eq("id", accommodationId)
        .single();

      // 發送取消通知郵件給每位客人
      const emailPromises = ordersToCancel.map(async (order) => {
        if (!order.guest_email) {
          console.log(`訂單 ${order.order_number} 沒有客人 email，跳過發送`);
          return { success: false, reason: "no_email" };
        }

        try {
          const { error: emailError } = await supabase.functions.invoke(
            "send-cancellation-email",
            {
              body: {
                orderNumber: order.order_number,
                guestName: order.guest_name,
                guestEmail: order.guest_email,
                roomTypeName: (order.room_types as any)?.name || "未知房型",
                checkInDate: order.check_in_date,
                checkOutDate: order.check_out_date,
                mealPlan: order.meal_plan,
                mealPlanDisplayName: getMealPlanDisplayName(order.meal_plan),
                accommodationName: accommodationInfo?.name || "住宿單位",
                accommodationPhone: accommodationInfo?.phone,
                accommodationEmail: accommodationInfo?.email,
              },
            }
          );

          if (emailError) {
            console.error(`發送郵件給 ${order.guest_email} 失敗:`, emailError);
            return { success: false, error: emailError };
          }

          return { success: true };
        } catch (err) {
          console.error(`發送郵件異常:`, err);
          return { success: false, error: err };
        }
      });

      // 等待所有郵件發送完成（不阻塞主流程）
      Promise.all(emailPromises).then((results) => {
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        
        if (successCount > 0) {
          console.log(`成功發送 ${successCount} 封取消通知郵件`);
        }
        if (failCount > 0) {
          console.log(`${failCount} 封郵件發送失敗`);
        }
      });

      toast.success(
        `已取消 ${ordersToCancel.length} 筆訂單，封鎖已解除。${
          ordersToCancel.filter(o => o.guest_email).length > 0
            ? "取消通知郵件正在發送中"
            : ""
        }`
      );

      setUnlockDialogOpen(false);
      setSelectedBlockedDates(new Set());
      setOrdersToCancel([]);
      loadInventory(); // 重新載入庫存
    } catch (error: any) {
      console.error("Error unlocking dates:", error);
      toast.error('解除封鎖失敗');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleCreateBooking = () => {
    if (!editingDate) return;
    setCreateOrderInitialData({
      check_in_date: editingDate,
      check_out_date: format(addDays(parseISO(editingDate), 1), 'yyyy-MM-dd'),
      room_type_id: roomTypeId,
    });
    setSingleEditDialogOpen(false);
    setCreateOrderDialogOpen(true);
  };

  const handleCreateOrderSuccess = () => {
    setCreateOrderDialogOpen(false);
    setCreateOrderInitialData(null);
    loadInventory();
  };

  const handleSingleDateUpdate = async () => {
    if (!editingDate || !singleEditData.availableRooms) {
      toast.error('請填寫庫存數');
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
        last_change_source: 'inline_edit',
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

  // 載入中顯示骨架屏
  if (loading) {
    return viewMode === 'list' ? <RoomInventoryListSkeleton /> : <RoomInventoryCalendarSkeleton />;
  }

  return (
    <Card className={cn(
      "relative transition-all duration-300",
      isRefreshing && "ring-2 ring-primary/50"
    )}>
      {/* 刷新成功動畫覆蓋層 */}
      {isRefreshing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in rounded-lg">
          <div className="flex flex-col items-center gap-3 animate-scale-in">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-6 w-6 text-primary animate-scale-in" />
            </div>
            <span className="text-sm font-medium text-primary">資料已更新</span>
          </div>
        </div>
      )}
      <CardHeader>
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* 頂部控制區 - 手機版兩行佈局 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* 第一行/左側：房型名稱和視圖切換 */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <CardTitle className="text-base sm:text-lg font-bold">{roomTypeName}</CardTitle>
            </div>
            
            {/* 第二行/右側：月份導航 */}
            <div className="flex items-center justify-center sm:justify-end">
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
            <div className="flex justify-end gap-2">
              {selectedBlockedDates.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleUnlockClick}
                  disabled={loading}
                  className="gap-1.5 h-9 sm:h-8 px-3 sm:px-4 touch-manipulation text-xs sm:text-sm"
                >
                  <Unlock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  解除封鎖 ({selectedBlockedDates.size})
                </Button>
              )}
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
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-primary">
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
                  <p className="text-xs text-success mt-1">請選擇要套用的目標日期</p>
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
                  <span className="hidden sm:inline">選擇星期六</span>
                  <span className="sm:hidden">六</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectWeekdays}
                  className="gap-1 sm:gap-2 h-9 sm:h-8 px-2 sm:px-3 touch-manipulation text-xs sm:text-sm"
                  disabled={isCopyMode}
                >
                  <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">選擇平日</span>
                  <span className="sm:hidden">平日</span>
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
          /* 列表視圖 - 在手機和平板顯示 */
          <div className="space-y-2 lg:hidden">
            {daysInMonth.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayInventory = inventory[dateStr];
              const hasData = dayInventory !== undefined;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);
              const isSelected = selectedDates.has(dateStr);
              const isSaturday = day.getDay() === 6; // Only Saturday is weekend
              const holidayInfo = publicHolidays.get(dateStr);
              
              const isWorkOnWeekend = holidayInfo?.type === 'work_on_weekend';
              const isCompensatoryDayOff = holidayInfo?.type === 'compensatory_day_off';
              const isRegularHoliday = holidayInfo?.type === 'holiday';
              const isHoliday = (isSaturday && !isWorkOnWeekend) || isCompensatoryDayOff || isRegularHoliday;

              if (!isCurrentMonth) return null;

              return (
                <div
                  key={dateStr}
                   onClick={() => {
                     if (hasData && dayInventory.isBlocked && !isSelectionMode) {
                       toggleBlockedDate(dateStr);
                     } else {
                       handleSingleClick(dateStr);
                     }
                   }}
                   className={cn(
                     "border rounded-lg p-3 transition-all touch-manipulation active:scale-[0.98]",
                     isTodayDate && "border-primary border-2 ring-2 ring-primary/20",
                     isSelectionMode && "cursor-pointer",
                     !isSelectionMode && "cursor-pointer hover:shadow-md",
                     isSelected && "bg-blue-100 border-blue-600 shadow-md",
                     // 被鎖定的樣式 - 使用灰色調
                     !isSelected && hasData && dayInventory.isBlocked && selectedBlockedDates.has(dateStr) && "ring-2 ring-gray-400",
                     !isSelected && hasData && dayInventory.isBlocked && "bg-gray-50/60 border-gray-300/60 hover:bg-gray-100/60",
                     !isSelected && hasData && !dayInventory.isBlocked && dayInventory.isAvailable && isHoliday && "bg-orange-50/80 hover:bg-orange-100",
                     !isSelected && hasData && !dayInventory.isBlocked && dayInventory.isAvailable && !isHoliday && "bg-blue-50/80 hover:bg-blue-100",
                     !isSelected && hasData && !dayInventory.isBlocked && !dayInventory.isAvailable && "bg-gray-100",
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
                          isCompensatoryDayOff && "bg-success text-white",
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
                       {/* 被鎖定狀態標記 */}
                       {dayInventory.isBlocked && dayInventory.blockedByRoomName && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Badge variant="secondary" className="w-full justify-center gap-1.5 py-1.5 bg-gray-100 text-gray-800 border-gray-300 cursor-pointer">
                                <Lock className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold">已鎖定</span>
                              </Badge>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2">
                              <p className="text-sm">已被 {dayInventory.blockedByRoomName} 預訂</p>
                            </PopoverContent>
                          </Popover>
                       )}
                        
                        {/* 已預訂標記 - 優先顯示 */}
                        {!dayInventory.isBlocked && dayInventory.bookedCount && dayInventory.bookedCount > 0 ? (
                          <Badge 
                            variant="secondary" 
                            className="w-full justify-center gap-1.5 py-1.5 bg-primary/10 text-primary border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookingClick(dateStr);
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold">已預訂</span>
                          </Badge>
                        ) : !dayInventory.isBlocked && !dayInventory.isAvailable ? (
                          /* 無法預定標記 - 當 is_available 為 false 時顯示 */
                          <Badge 
                            variant="secondary" 
                            className="w-full justify-center gap-1.5 py-1.5 bg-red-100 text-red-800 border-red-300"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold">無法預定</span>
                          </Badge>
                        ) : (
                          /* 可預訂標記 - 僅在無預訂時顯示 */
                          !dayInventory.isBlocked && dayInventory.availableRooms > 0 && dayInventory.isAvailable && (
                            <Badge 
                              variant="secondary" 
                              className="w-full justify-center gap-1.5 py-1.5 bg-blue-100 text-blue-800 border-blue-300"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span className="text-xs font-semibold">可預訂</span>
                            </Badge>
                          )
                        )}
                       
                       {/* 只在未鎖定且有可用房間時顯示價格 */}
                       {!dayInventory.isBlocked && dayInventory.availableRooms > 0 && dayInventory.price_2_meals && (
                         <div className={cn(
                           "flex items-center justify-between rounded px-3 py-2",
                           isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                         )}>
                           <span className="text-sm font-medium text-muted-foreground">一泊二食</span>
                           <span className="text-base font-bold">${formatPrice(dayInventory.price_2_meals)}</span>
                         </div>
                       )}
                       {!dayInventory.isBlocked && dayInventory.availableRooms > 0 && dayInventory.price_3_meals && (
                         <div className={cn(
                           "flex items-center justify-between rounded px-3 py-2",
                           isHoliday ? "bg-orange-100/60" : "bg-blue-100/60"
                         )}>
                           <span className="text-sm font-medium text-muted-foreground">一泊三食</span>
                       <span className="text-base font-bold">${formatPrice(dayInventory.price_3_meals)}</span>
                         </div>
                       )}
                     </div>
                   ) : (
                     <div className="text-sm text-muted-foreground text-center py-4">未設定</div>
                   )}
                </div>
              );
            })}
          </div>
        ) : (
          /* 月曆視圖 - 僅在大螢幕顯示 */
          <div className="hidden lg:grid grid-cols-7 gap-1 sm:gap-2">
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
              const isSaturday = day.getDay() === 6; // Only Saturday is weekend
              const holidayInfo = publicHolidays.get(dateStr);
              
              // 判斷是否為假日價格：
              // 1. 星期六 + 不是補班日
              // 2. 平日 + 是補休日或國定假日
              const isWorkOnWeekend = holidayInfo?.type === 'work_on_weekend';
              const isCompensatoryDayOff = holidayInfo?.type === 'compensatory_day_off';
              const isRegularHoliday = holidayInfo?.type === 'holiday';
              const isHoliday = (isSaturday && !isWorkOnWeekend) || isCompensatoryDayOff || isRegularHoliday;

              return (
                <div
                  key={dateStr}
                  onClick={() => {
                    if (hasData && dayInventory.isBlocked && !isSelectionMode) {
                      toggleBlockedDate(dateStr);
                    } else {
                      handleSingleClick(dateStr);
                    }
                  }}
                   className={cn(
                      "relative min-h-[80px] sm:min-h-[90px] md:min-h-[100px] border rounded-lg p-2 sm:p-2 flex flex-col items-center justify-start transition-all touch-manipulation active:scale-95",
                      isTodayDate && "border-primary border-2 ring-2 ring-primary/20",
                      !isCurrentMonth && "opacity-50",
                      isSelectionMode && "cursor-pointer",
                      !isSelectionMode && "cursor-pointer hover:shadow-md",
                      isCopyMode && hasData && "ring-2 ring-blue-400 animate-pulse",
                      isCopyMode && !hasData && "opacity-30 cursor-not-allowed",
                      isSelected && "bg-blue-100 border-blue-600 shadow-md",
                      // 被封鎖狀態：使用紅色調，被選中時加上 ring
                      !isSelected && hasData && dayInventory.isBlocked && selectedBlockedDates.has(dateStr) && "ring-2 ring-destructive",
                      !isSelected && hasData && dayInventory.isBlocked && "bg-red-50/50 hover:bg-red-100/50 border-red-300/50 opacity-75",
                      // 假日（週末或國定假日）有資料：使用暖色調
                      !isSelected && hasData && !dayInventory.isBlocked && dayInventory.isAvailable && isHoliday && "bg-orange-50/80 hover:bg-orange-100 border-orange-200/50",
                      // 平日有資料：使用藍色調
                      !isSelected && hasData && !dayInventory.isBlocked && dayInventory.isAvailable && !isHoliday && "bg-blue-50/80 hover:bg-blue-100 border-blue-200/50",
                      !isSelected && hasData && !dayInventory.isBlocked && !dayInventory.isAvailable && "bg-gray-100",
                      !isSelected && !hasData && "hover:bg-muted"
                    )}
                  >
                  <div className={cn(
                    "font-bold mb-1.5 text-sm sm:text-base w-full text-center pb-1 border-b leading-tight",
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
                        isCompensatoryDayOff && "bg-success text-white",
                        isWorkOnWeekend && "bg-blue-600 text-white"
                      )}>
                        {isRegularHoliday && '假'}
                        {isCompensatoryDayOff && '休'}
                        {isWorkOnWeekend && '班'}
                      </span>
                    )}
                  </div>
                  {hasData ? (
                    <div className="flex flex-col gap-1 min-h-[40px]">
                      {/* 被鎖定狀態圖標 */}
                      {dayInventory.isBlocked && dayInventory.blockedByRoomName && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <div className="flex items-center justify-center gap-1 bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 cursor-pointer">
                              <Lock className="h-2.5 w-2.5 text-gray-600 flex-shrink-0" />
                              <span className="text-[8px] sm:text-[9px] text-gray-700 font-bold leading-none">已鎖定</span>
                            </div>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2">
                            <p className="text-sm">已被 {dayInventory.blockedByRoomName} 預訂</p>
                          </PopoverContent>
                        </Popover>
                      )}
                      
                      {/* 已預訂標記 - 優先顯示 */}
                      {!dayInventory.isBlocked && dayInventory.bookedCount > 0 ? (
                        <div 
                          className="flex items-center justify-center gap-1 bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/20 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBookingClick(dateStr);
                          }}
                        >
                          <Check className="h-2.5 w-2.5 text-primary flex-shrink-0" />
                          <span className="text-[8px] sm:text-[9px] text-primary font-bold leading-none">已預訂</span>
                        </div>
                      ) : !dayInventory.isBlocked && !dayInventory.isAvailable ? (
                        /* 無法預定標籤 - 當 is_available 為 false 時顯示 */
                        <div className="flex items-center justify-center gap-1 bg-red-100 border border-red-300 rounded px-1.5 py-0.5">
                          <X className="h-2.5 w-2.5 text-red-600 flex-shrink-0" />
                          <span className="text-[8px] sm:text-[9px] text-red-700 font-bold leading-none">無法預定</span>
                        </div>
                      ) : (
                        /* 可預訂標籤 - 僅在無預訂時顯示 */
                        !dayInventory.isBlocked && dayInventory.availableRooms > 0 && dayInventory.isAvailable && (
                          <div className="flex items-center justify-center gap-1 bg-blue-100 border border-blue-300 rounded px-1.5 py-0.5">
                            <Check className="h-2.5 w-2.5 text-blue-600 flex-shrink-0" />
                            <span className="text-[8px] sm:text-[9px] text-blue-700 font-bold leading-none">可預訂</span>
                          </div>
                        )
                      )}
                      
                      {/* 只在未鎖定且有可用房間時顯示價格 */}
                      {!dayInventory.isBlocked && dayInventory.availableRooms > 0 && (
                        <div className="flex flex-col gap-0.5 w-full">
                          {dayInventory.price_2_meals && (
                            <div className={cn(
                              "flex items-center justify-center gap-1 text-xs sm:text-xs rounded px-1.5 py-0.5",
                              isHoliday ? "bg-orange-100/80" : "bg-blue-100/80"
                            )}>
                              <span className="text-[8px] text-muted-foreground">一泊二食</span>
                              <DollarSign className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="font-bold text-foreground text-[11px] truncate">{formatPrice(dayInventory.price_2_meals)}</span>
                            </div>
                          )}
                          {dayInventory.price_3_meals && (
                            <div className={cn(
                              "flex items-center justify-center gap-1 text-xs sm:text-xs rounded px-1.5 py-0.5",
                              isHoliday ? "bg-orange-100/80" : "bg-blue-100/80"
                            )}>
                              <span className="text-[8px] text-muted-foreground">一泊三食</span>
                              <DollarSign className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                              <span className="font-bold text-foreground text-[11px] truncate">{formatPrice(dayInventory.price_3_meals)}</span>
                            </div>
                      )}
                    </div>
                  )}
                </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center min-h-[40px] mt-1">
                      <div className="text-xs sm:text-xs text-muted-foreground font-medium leading-tight">未設定</div>
                    </div>
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
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-red-50/50 border border-red-300/50 rounded flex-shrink-0 relative">
                <Lock className="h-2.5 w-2.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600" />
              </div>
              <span className="font-medium">已鎖定</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-primary/10 border border-primary/30 rounded flex-shrink-0 relative">
                <Check className="h-2.5 w-2.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
              </div>
              <span className="font-medium">已預訂</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-red-100 border border-red-300 rounded flex-shrink-0 relative">
                <X className="h-2.5 w-2.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600" />
              </div>
              <span className="font-medium">無法預定</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-gray-100 border rounded flex-shrink-0"></div>
              <span className="font-medium">無庫存</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 sm:w-4 sm:h-4 bg-blue-100 border border-blue-300 rounded flex-shrink-0 relative">
                <Check className="h-2.5 w-2.5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-600" />
              </div>
              <span className="font-medium">可預訂</span>
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
            <div className="space-y-2">
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
                    <span className="px-1 py-0.5 bg-success text-white rounded text-[10px]">休</span>
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
              <div className="text-xs sm:text-sm text-gray-700 bg-gray-50 rounded-lg px-4 py-3 sm:py-2.5 border border-gray-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">包棟互斥規則：</span>
                    <p className="mt-1">標記為「包棟房型」的房型互斥。當其中一個包棟房型被預訂時，其他包棟房型及「綁定包棟」的房型當日庫存將自動鎖定（顯示為 <Lock className="inline h-3 w-3 mx-0.5" /> 已鎖定），無法再被預訂。</p>
                  </div>
                </div>
              </div>
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
              {/* 專案選擇 */}
              <div className="space-y-3">
                <Label>專案 *</Label>
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
                <Label htmlFor="batch-availableRooms">庫存數 *</Label>
                <Input
                  id="batch-availableRooms"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入庫存數"
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
              {/* 專案選擇 */}
              <div className="space-y-3">
                <Label>專案 *</Label>
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
                <Label htmlFor="batch-availableRooms-desktop">庫存數 *</Label>
                <Input
                  id="batch-availableRooms-desktop"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="輸入庫存數"
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
            <DrawerHeader className="pb-2">
              <DrawerTitle>預訂管理</DrawerTitle>
              <DrawerDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 space-y-4 overflow-y-auto">
              {/* 快速操作區 - 新增預訂 */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-foreground">快速新增預訂</h4>
                    <p className="text-sm text-muted-foreground">為此日期建立新訂單</p>
                  </div>
                  <Button
                    onClick={handleCreateBooking}
                    className="touch-manipulation bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    新增預訂
                  </Button>
                </div>
              </div>

              {/* 分隔線 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">編輯價格與庫存</span>
                </div>
              </div>

              {/* 修改專案價格區 */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                <h4 className="text-sm font-medium text-foreground">修改專案價格</h4>
                <div className="space-y-3">
                  <RadioGroup
                    value={singleEditData.mealPlan}
                    onValueChange={(value: "2meals" | "3meals") => 
                      setSingleEditData({ ...singleEditData, mealPlan: value })
                    }
                    className="flex gap-4"
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

                {/* 價格輸入 */}
                {singleEditData.mealPlan === '2meals' && (
                  <div className="space-y-2">
                    <Label htmlFor="single-price-2meals" className="text-sm font-medium">一泊二食價格</Label>
                    <Input
                      id="single-price-2meals"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="輸入價格"
                      value={singleEditData.price_2_meals}
                      onChange={(e) => setSingleEditData({ ...singleEditData, price_2_meals: e.target.value })}
                      className="h-12 text-base touch-manipulation"
                    />
                  </div>
                )}

                {singleEditData.mealPlan === '3meals' && (
                  <div className="space-y-2">
                    <Label htmlFor="single-price-3meals" className="text-sm font-medium">一泊三食價格</Label>
                    <Input
                      id="single-price-3meals"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="輸入價格"
                      value={singleEditData.price_3_meals}
                      onChange={(e) => setSingleEditData({ ...singleEditData, price_3_meals: e.target.value })}
                      className="h-12 text-base touch-manipulation"
                    />
                  </div>
                )}
              </div>

              {/* 修改庫存區 */}
              <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                <h4 className="text-sm font-medium text-foreground">修改庫存</h4>
                <div className="space-y-2">
                  <Label htmlFor="single-availableRooms" className="text-sm font-medium">庫存數</Label>
                  <Input
                    id="single-availableRooms"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入庫存數"
                    value={singleEditData.availableRooms}
                    onChange={(e) => setSingleEditData({ ...singleEditData, availableRooms: e.target.value })}
                    className="h-12 text-base touch-manipulation"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-background rounded-md border">
                  <div>
                    <Label htmlFor="single-isAvailable" className="cursor-pointer text-sm font-medium">
                      開放預訂
                    </Label>
                    <p className="text-xs text-muted-foreground">允許顧客預訂此日期</p>
                  </div>
                  <Switch
                    id="single-isAvailable"
                    checked={singleEditData.isAvailable}
                    onCheckedChange={(checked) => setSingleEditData({ ...singleEditData, isAvailable: checked })}
                    className="touch-manipulation"
                  />
                </div>
              </div>
            </div>

            <DrawerFooter className="pt-4 border-t">
              <Button
                onClick={handleSingleDateUpdate}
                disabled={saving || !singleEditData.availableRooms || 
                  (singleEditData.mealPlan === '2meals' && !singleEditData.price_2_meals) ||
                  (singleEditData.mealPlan === '3meals' && !singleEditData.price_3_meals)}
                className="h-12 text-base touch-manipulation"
              >
                {saving ? '更新中...' : '儲存設定'}
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>預訂管理</DialogTitle>
              <DialogDescription>
                {editingDate && format(parseISO(editingDate), 'yyyy年 M月 d日（EEEE）', { locale: zhTW })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* 快速操作區 - 新增預訂 */}
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-foreground text-sm">快速新增預訂</h4>
                    <p className="text-xs text-muted-foreground">為此日期建立新訂單</p>
                  </div>
                  <Button
                    onClick={handleCreateBooking}
                    size="sm"
                    className="touch-manipulation bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    新增預訂
                  </Button>
                </div>
              </div>

              {/* 分隔線 */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">編輯價格與庫存</span>
                </div>
              </div>

              {/* 修改專案價格區 */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                <h4 className="text-sm font-medium text-foreground">修改專案價格</h4>
                <div className="space-y-2">
                  <RadioGroup
                    value={singleEditData.mealPlan}
                    onValueChange={(value: "2meals" | "3meals") => 
                      setSingleEditData({ ...singleEditData, mealPlan: value })
                    }
                    className="flex gap-4"
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

                {/* 價格輸入 */}
                {singleEditData.mealPlan === '2meals' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="single-price-2meals-desktop" className="text-sm font-medium">一泊二食價格</Label>
                    <Input
                      id="single-price-2meals-desktop"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="輸入價格"
                      value={singleEditData.price_2_meals}
                      onChange={(e) => setSingleEditData({ ...singleEditData, price_2_meals: e.target.value })}
                      className="touch-manipulation"
                    />
                  </div>
                )}

                {singleEditData.mealPlan === '3meals' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="single-price-3meals-desktop" className="text-sm font-medium">一泊三食價格</Label>
                    <Input
                      id="single-price-3meals-desktop"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="輸入價格"
                      value={singleEditData.price_3_meals}
                      onChange={(e) => setSingleEditData({ ...singleEditData, price_3_meals: e.target.value })}
                      className="touch-manipulation"
                    />
                  </div>
                )}
              </div>

              {/* 修改庫存區 */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                <h4 className="text-sm font-medium text-foreground">修改庫存</h4>
                <div className="space-y-1.5">
                  <Label htmlFor="single-availableRooms-desktop" className="text-sm font-medium">庫存數</Label>
                  <Input
                    id="single-availableRooms-desktop"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder="輸入庫存數"
                    value={singleEditData.availableRooms}
                    onChange={(e) => setSingleEditData({ ...singleEditData, availableRooms: e.target.value })}
                    className="touch-manipulation"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-background rounded-md border">
                  <div>
                    <Label htmlFor="single-isAvailable-desktop" className="cursor-pointer text-sm font-medium">
                      開放預訂
                    </Label>
                    <p className="text-xs text-muted-foreground">允許顧客預訂此日期</p>
                  </div>
                  <Switch
                    id="single-isAvailable-desktop"
                    checked={singleEditData.isAvailable}
                    onCheckedChange={(checked) => setSingleEditData({ ...singleEditData, isAvailable: checked })}
                    className="touch-manipulation"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
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
                {saving ? '更新中...' : '儲存設定'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 解除封鎖確認對話框 */}
      <AlertDialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認解除封鎖</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>您即將取消以下 {ordersToCancel.length} 筆訂單，以解除這些日期的封鎖：</p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {ordersToCancel.map((order) => (
                    <div key={order.id} className="p-3 bg-muted rounded-md text-sm">
                      <div className="font-medium">{order.order_number}</div>
                      <div className="text-muted-foreground">
                        {(order.room_types as any)?.name} - {order.guest_name}
                      </div>
                      <div className="text-muted-foreground">
                        {format(new Date(order.check_in_date), "yyyy-MM-dd")} 至{" "}
                        {format(new Date(order.check_out_date), "yyyy-MM-dd")}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-destructive font-medium">
                  此操作無法復原,請確認後繼續。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnlocking}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlock}
              disabled={isUnlocking}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isUnlocking ? "處理中..." : "確認取消訂單"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 訂單詳情 - 響應式版本 */}
      {isMobile ? (
        <Drawer open={bookingDetailsDialogOpen} onOpenChange={setBookingDetailsDialogOpen}>
          <DrawerContent className="max-h-[92vh]">
            <DrawerHeader className="pb-2">
              <DrawerTitle>預訂詳情</DrawerTitle>
              <DrawerDescription>
                {selectedDateOrders.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    <span>共 {selectedDateOrders.length} 筆訂單</span>
                    <span className="text-primary font-medium">總金額：NT$ {selectedDateOrders.reduce((sum, order) => sum + order.final_price, 0).toLocaleString()}</span>
                  </div>
                )}
              </DrawerDescription>
            </DrawerHeader>

            <div className="px-4 pb-4 overflow-y-auto flex-1">
              {loadingOrders ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : selectedDateOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  沒有找到訂單
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDateOrders.map((order) => {
                    const orderStatusConfig = getOrderStatusConfig(order.order_status);
                    const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);
                    const remainingAmount = (order as any).final_price - ((order as any).paid_amount || 0);
                    
                    return (
                      <div key={order.id} className="border rounded-xl overflow-hidden bg-card shadow-sm">
                        {/* 標題區 - 獨立卡片頭部 */}
                        <div className="p-3 bg-muted/20 border-b">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-base">{order.order_number}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{(order.room_types as any)?.name}</span>
                                {(order as any).order_date && (
                                  <span className="ml-2 text-muted-foreground/70">• {format(new Date((order as any).order_date), "yyyy-MM-dd")}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Badge className={orderStatusConfig.className}>
                                {orderStatusConfig.label}
                              </Badge>
                              <Badge className={paymentStatusConfig.className}>
                                {paymentStatusConfig.label}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* 內容區域 */}
                        <div className="p-3 space-y-3">
                          {/* 客人信息卡片 */}
                          <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">客戶資訊</h4>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">客人姓名</span>
                                <span className="font-medium">{order.guest_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">聯絡電話</span>
                                <a href={`tel:${order.guest_phone}`} className="font-medium text-primary">
                                  {order.guest_phone}
                                </a>
                              </div>
                              {order.guest_email && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">電子郵件</span>
                                  <span className="font-medium text-xs truncate max-w-[160px]">{order.guest_email}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 入住信息卡片 */}
                          <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">入住資訊</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-0.5">入住日期</div>
                                <div className="font-semibold">{format(new Date(order.check_in_date), "MM/dd")}</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-0.5">退房日期</div>
                                <div className="font-semibold">{format(new Date(order.check_out_date), "MM/dd")}</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-0.5">入住人數</div>
                                <div className="font-semibold">{order.guest_count} 人</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-0.5">入住天數</div>
                                <div className="font-semibold">
                                  {Math.ceil((new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / (1000 * 60 * 60 * 24))} 晚
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 金額信息卡片 */}
                          <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">費用明細</h4>
                            <div className="space-y-1.5 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">訂單金額</span>
                                <span className="font-medium">NT$ {order.total_price.toLocaleString()}</span>
                              </div>
                              
                              {order.discount_amount > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">
                                    折扣
                                    {(order as any).discount_code && (
                                      <span className="ml-1 text-xs bg-primary/10 text-primary px-1 py-0.5 rounded">
                                        {(order as any).discount_code}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-primary">-NT$ {order.discount_amount.toLocaleString()}</span>
                                </div>
                              )}
                              
                              <div className="h-px bg-border my-1.5" />
                              
                              <div className="flex items-center justify-between py-1.5 px-2 bg-primary/5 rounded-md">
                                <span className="font-semibold text-sm">實付金額</span>
                                <span className="text-primary font-bold">NT$ {order.final_price.toLocaleString()}</span>
                              </div>

                              {((order as any).paid_amount > 0 || (order as any).deposit_amount > 0) && (
                                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t">
                                  {(order as any).deposit_amount > 0 && (
                                    <div className="text-center p-1.5 bg-background rounded-md">
                                      <div className="text-muted-foreground text-xs">訂金</div>
                                      <div className="font-medium text-xs">NT$ {((order as any).deposit_amount).toLocaleString()}</div>
                                    </div>
                                  )}
                                  {(order as any).paid_amount > 0 && (
                                    <div className="text-center p-1.5 bg-primary/10 rounded-md">
                                      <div className="text-muted-foreground text-xs">已付</div>
                                      <div className="font-medium text-xs text-primary">NT$ {((order as any).paid_amount).toLocaleString()}</div>
                                    </div>
                                  )}
                                  {remainingAmount > 0 && (
                                    <div className="text-center p-1.5 bg-orange-50 dark:bg-orange-950/20 rounded-md">
                                      <div className="text-muted-foreground text-xs">待付</div>
                                      <div className="font-medium text-xs text-orange-600">NT$ {remainingAmount.toLocaleString()}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {(order as any).payment_method && (
                                <div className="flex items-center justify-between text-sm pt-1.5 mt-1.5 border-t">
                                  <span className="text-muted-foreground">付款方式</span>
                                  <span className="font-medium px-1.5 py-0.5 bg-muted rounded text-xs">{getPaymentMethodLabel((order as any).payment_method)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 備註卡片 */}
                          {(order as any).notes && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-1.5">備註</h4>
                              <div className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">
                                {(order as any).notes}
                              </div>
                            </div>
                          )}

                          {/* 操作按鈕卡片 */}
                          <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">訂單操作</h4>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-10 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors touch-manipulation"
                                onClick={() => window.open(`/admin/orders/${order.id}?editing=true`, '_blank')}
                              >
                                <Edit className="h-4 w-4" />
                                編輯訂單
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-10 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors touch-manipulation"
                                onClick={() => window.open(`/admin/orders/${order.id}`, '_blank')}
                              >
                                <Eye className="h-4 w-4" />
                                查看詳情
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DrawerFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setBookingDetailsDialogOpen(false)}
                className="w-full h-12 text-base touch-manipulation"
              >
                關閉
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={bookingDetailsDialogOpen} onOpenChange={setBookingDetailsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>預訂詳情</DialogTitle>
              <DialogDescription>
                {selectedDateOrders.length > 0 && (
                  <div className="flex items-center gap-4 mt-2">
                    <span>共 {selectedDateOrders.length} 筆訂單</span>
                    <span className="text-muted-foreground">•</span>
                    <span>總金額：NT$ {selectedDateOrders.reduce((sum, order) => sum + order.final_price, 0).toLocaleString()}</span>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {loadingOrders ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : selectedDateOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  沒有找到訂單
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDateOrders.map((order) => {
                    const orderStatusConfig = getOrderStatusConfig(order.order_status);
                    const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);
                    const remainingAmount = (order as any).final_price - ((order as any).paid_amount || 0);
                    
                    return (
                      <div key={order.id} className="border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-all duration-200">
                        {/* 標題區 - 獨立卡片頭部 */}
                        <div className="p-4 bg-muted/20 border-b">
                          <div className="flex items-start justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-lg">{order.order_number}</span>
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <span className="font-medium text-foreground">{(order.room_types as any)?.name}</span>
                                {(order as any).order_date && (
                                  <>
                                    <span className="text-muted-foreground/50">•</span>
                                    <span>訂單日期：{format(new Date((order as any).order_date), "yyyy-MM-dd")}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Badge className={orderStatusConfig.className}>
                                {orderStatusConfig.label}
                              </Badge>
                              <Badge className={paymentStatusConfig.className}>
                                {paymentStatusConfig.label}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* 內容區域 */}
                        <div className="p-4 space-y-4">
                          {/* 客人信息卡片 */}
                          <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">客戶資訊</h4>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">客人姓名：</span>
                                <span className="font-medium">{order.guest_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">聯絡電話：</span>
                                <a href={`tel:${order.guest_phone}`} className="font-medium text-primary hover:underline">
                                  {order.guest_phone}
                                </a>
                              </div>
                              {order.guest_email && (
                                <div className="col-span-2 flex items-center gap-2">
                                  <span className="text-muted-foreground">電子郵件：</span>
                                  <span className="font-medium">{order.guest_email}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 入住信息卡片 */}
                          <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">入住資訊</h4>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-1">入住日期</div>
                                <div className="font-semibold">{format(new Date(order.check_in_date), "yyyy-MM-dd")}</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-1">退房日期</div>
                                <div className="font-semibold">{format(new Date(order.check_out_date), "yyyy-MM-dd")}</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-1">入住人數</div>
                                <div className="font-semibold">{order.guest_count} 人</div>
                              </div>
                              <div className="text-center p-2 bg-background rounded-md">
                                <div className="text-muted-foreground text-xs mb-1">入住天數</div>
                                <div className="font-semibold">
                                  {Math.ceil((new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / (1000 * 60 * 60 * 24))} 晚
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 金額信息卡片 */}
                          <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">費用明細</h4>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">訂單金額</span>
                                <span className="font-medium">NT$ {order.total_price.toLocaleString()}</span>
                              </div>
                              
                              {order.discount_amount > 0 && (
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    折扣金額
                                    {(order as any).discount_code && (
                                      <span className="ml-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                        {(order as any).discount_code}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-medium text-primary">-NT$ {order.discount_amount.toLocaleString()}</span>
                                </div>
                              )}
                              
                              <div className="h-px bg-border my-2" />
                              
                              <div className="flex items-center justify-between py-2 px-3 bg-primary/5 rounded-md">
                                <span className="font-semibold">實付金額</span>
                                <span className="text-primary text-lg font-bold">NT$ {order.final_price.toLocaleString()}</span>
                              </div>

                              {((order as any).paid_amount > 0 || (order as any).deposit_amount > 0) && (
                                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t">
                                  {(order as any).deposit_amount > 0 && (
                                    <div className="text-center p-2 bg-background rounded-md">
                                      <div className="text-muted-foreground text-xs mb-1">訂金金額</div>
                                      <div className="font-medium text-sm">NT$ {((order as any).deposit_amount).toLocaleString()}</div>
                                    </div>
                                  )}
                                  {(order as any).paid_amount > 0 && (
                                    <div className="text-center p-2 bg-primary/10 rounded-md">
                                      <div className="text-muted-foreground text-xs mb-1">已付金額</div>
                                      <div className="font-medium text-sm text-primary">NT$ {((order as any).paid_amount).toLocaleString()}</div>
                                    </div>
                                  )}
                                  {remainingAmount > 0 && (
                                    <div className="text-center p-2 bg-orange-50 dark:bg-orange-950/20 rounded-md">
                                      <div className="text-muted-foreground text-xs mb-1">待付金額</div>
                                      <div className="font-medium text-sm text-orange-600">NT$ {remainingAmount.toLocaleString()}</div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {(order as any).payment_method && (
                                <div className="flex items-center justify-between text-sm pt-2 mt-2 border-t">
                                  <span className="text-muted-foreground">付款方式</span>
                                  <span className="font-medium px-2 py-0.5 bg-muted rounded">{getPaymentMethodLabel((order as any).payment_method)}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 備註卡片 */}
                          {(order as any).notes && (
                            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                              <h4 className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-2">備註</h4>
                              <div className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap">
                                {(order as any).notes}
                              </div>
                            </div>
                          )}

                          {/* 操作按鈕卡片 */}
                          <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">訂單操作</h4>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1 h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                onClick={() => window.open(`/admin/orders/${order.id}?editing=true`, '_blank')}
                              >
                                <Edit className="h-4 w-4" />
                                編輯訂單
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-9 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                onClick={() => window.open(`/admin/orders/${order.id}`, '_blank')}
                              >
                                <Eye className="h-4 w-4" />
                                查看詳情
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBookingDetailsDialogOpen(false)}
              >
                關閉
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 新增預訂對話框 */}
      <CreateOrderDialog
        open={createOrderDialogOpen}
        onOpenChange={setCreateOrderDialogOpen}
        onSuccess={handleCreateOrderSuccess}
        initialData={createOrderInitialData || undefined}
      />
    </Card>
  );
}
