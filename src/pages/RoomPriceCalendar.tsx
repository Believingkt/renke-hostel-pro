import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend as isWeekendDate, parseISO } from "date-fns";
import { zhTW } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, DollarSign, Home } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { RoomPriceEditDialog } from "@/components/RoomPriceEditDialog";
import { getRoomOverride, isTierSellable, isTemplateActiveForDates } from "@/utils/pricingTemplateHelpers";

import { TableSkeleton } from "@/components/skeletons/TableSkeleton";

interface RoomType {
  id: string;
  name: string;
  is_exclusive_package: boolean;
  base_price: number;
  room_count: number | null;
}

interface PricingTemplate {
  id: string;
  template_name: string;
  project_name: string | null;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
  weekday_enabled: boolean | null;
  peak_enabled: boolean | null;
  weekend_enabled: boolean | null;
  room_type_id: string | null;
  room_type_ids?: string[] | null;
  available_rooms: number | null;
  room_overrides?: any;
}

interface InventoryData {
  room_type_id: string;
  date: string;
  price: number;
  available_rooms: number;
  is_available: boolean;
  notes: string | null;
  booked_count: number;
}

// 專案 × 日期的價格覆寫
type TemplatePriceOverrides = Map<string, number>; // key: `${roomTypeId}_${date}_${templateId}`

interface PublicHoliday {
  holiday_date: string;
  holiday_type: string;
  holiday_name: string;
}

// 價格千分位格式化
const formatPrice = (price: number | null | undefined): string => {
  if (!price && price !== 0) return '-';
  return price.toLocaleString('zh-TW');
};

// 星期幾的中文名稱
const weekDayNames = ['日', '一', '二', '三', '四', '五', '六'];

export default function RoomPriceCalendar() {
  const { currentAccommodationId } = useAccommodation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [inventory, setInventory] = useState<Map<string, InventoryData>>(new Map());
  const [templatePriceOverrides, setTemplatePriceOverrides] = useState<TemplatePriceOverrides>(new Map());
  const [holidays, setHolidays] = useState<Map<string, PublicHoliday>>(new Map());
  const [loading, setLoading] = useState(true);
  
  // 篩選器狀態
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('all');

  // 當房型變更時重設專案篩選
  const handleRoomTypeChange = (value: string) => {
    setSelectedRoomTypeId(value);
    setSelectedTemplateId('all');
  };

  // 該房型可選的專案
  const availableTemplatesForRoom = useMemo(() => {
    if (selectedRoomTypeId === 'all') return [];
    return templates.filter(t => {
      if (Array.isArray(t.room_type_ids) && t.room_type_ids.length > 0) return t.room_type_ids.includes(selectedRoomTypeId);
      if (t.room_type_id) return t.room_type_id === selectedRoomTypeId;
      // 通用模板：名稱不含任何房型名稱
      const normalizedName = (t.project_name || t.template_name).replace(/\s+/g, '');
      return !roomTypes.some(r => normalizedName.includes(r.name.replace(/\s+/g, '')));
    });
  }, [selectedRoomTypeId, templates, roomTypes]);
  
  // 編輯對話框狀態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  
  const [selectedCell, setSelectedCell] = useState<{
    roomTypeId: string;
    roomTypeName: string;
    templateId?: string;
    templateName?: string;
    date: string;
    currentPrice?: number;
    currentAvailableRooms?: number;
  } | null>(null);

  // 計算當月的所有日期
  const monthDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  useEffect(() => {
    if (currentAccommodationId) {
      loadData();
    }
  }, [currentAccommodationId, currentMonth]);

  const loadData = async () => {
    try {
      setLoading(true);
      const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

      // 並行載入所有數據
      const [roomTypesResult, templatesResult, inventoryResult, holidaysResult, ordersResult] = await Promise.all([
        supabase
          .from('room_types')
          .select('id, name, is_exclusive_package, base_price, room_count')
          .eq('accommodation_id', currentAccommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('pricing_templates')
          .select('id, template_name, project_name, price, weekday_price, peak_price, weekend_price, weekday_enabled, peak_enabled, weekend_enabled, room_type_id, room_type_ids, available_rooms, room_overrides')
          .eq('accommodation_id', currentAccommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('room_inventory_pricing')
          .select('room_type_id, date, price, available_rooms, is_available, notes, pricing_template_id')
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase
          .from('public_holidays')
          .select('holiday_date, holiday_type, holiday_name')
          .eq('accommodation_id', currentAccommodationId)
          .gte('holiday_date', monthStart)
          .lte('holiday_date', monthEnd),
        supabase
          .from('orders')
          .select('id, check_in_date, check_out_date, room_type_id')
          .eq('accommodation_id', currentAccommodationId)
          .neq('order_status', 'cancelled')
          .gte('check_out_date', monthStart)
          .lte('check_in_date', monthEnd),
      ]);

      if (roomTypesResult.error) throw roomTypesResult.error;
      if (templatesResult.error) throw templatesResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (holidaysResult.error) throw holidaysResult.error;
      if (holidaysResult.error) throw holidaysResult.error;

      if (ordersResult.error) console.error('查詢訂單失敗:', ordersResult.error);

      // 取得多房型訂單的房型明細（order_rooms）
      const orderIds = (ordersResult.data || []).map(o => o.id);
      let orderRoomsData: Array<{ order_id: string; room_type_id: string; quantity: number }> = [];
      if (orderIds.length > 0) {
        const { data: orData, error: orErr } = await supabase
          .from('order_rooms')
          .select('order_id, room_type_id, quantity')
          .in('order_id', orderIds);
        if (orErr) console.error('查詢 order_rooms 失敗:', orErr);
        orderRoomsData = orData || [];
      }
      const orderRoomsByOrderId = new Map<string, Array<{ room_type_id: string; quantity: number }>>();
      orderRoomsData.forEach(or => {
        if (!orderRoomsByOrderId.has(or.order_id)) orderRoomsByOrderId.set(or.order_id, []);
        orderRoomsByOrderId.get(or.order_id)!.push({ room_type_id: or.room_type_id, quantity: or.quantity });
      });

      // 計算每個房型每個日期的預訂數量（多房型訂單以 order_rooms 為準，避免重複/漏算）
      const bookingCountMap = new Map<string, number>();
      if (ordersResult.data) {
        ordersResult.data.forEach(order => {
          const rooms = orderRoomsByOrderId.get(order.id);
          // 若有多房型明細，使用明細展開；否則 fallback 到 orders.room_type_id（單一房型訂單）
          const roomEntries: Array<{ room_type_id: string; quantity: number }> =
            rooms && rooms.length > 0
              ? rooms
              : order.room_type_id
                ? [{ room_type_id: order.room_type_id, quantity: 1 }]
                : [];
          if (roomEntries.length === 0) return;

          const checkIn = new Date(order.check_in_date);
          const checkOut = new Date(order.check_out_date);
          let cur = new Date(checkIn);
          while (cur < checkOut) {
            const dateStr = format(cur, 'yyyy-MM-dd');
            roomEntries.forEach(re => {
              const key = `${re.room_type_id}_${dateStr}`;
              bookingCountMap.set(key, (bookingCountMap.get(key) || 0) + (re.quantity || 1));
            });
            cur = addDays(cur, 1);
          }
        });
      }

      const loadedRoomTypes = (roomTypesResult.data || []) as RoomType[];
      const loadedTemplates = (templatesResult.data || []) as PricingTemplate[];
      const allInventoryRows = (inventoryResult.data || []) as Array<{
        room_type_id: string;
        date: string;
        price: number;
        available_rooms: number;
        is_available: boolean;
        notes: string | null;
        pricing_template_id: string | null;
      }>;

      // 拆分為「庫存/基礎價列」（pricing_template_id IS NULL）與「專案覆寫價列」
      let loadedInventory: InventoryData[] = allInventoryRows
        .filter(r => r.pricing_template_id == null)
        .map(r => ({
          room_type_id: r.room_type_id,
          date: r.date,
          price: r.price,
          available_rooms: r.available_rooms,
          is_available: r.is_available,
          notes: r.notes,
          booked_count: 0,
        }));

      const overrideMap: TemplatePriceOverrides = new Map();
      allInventoryRows
        .filter(r => r.pricing_template_id != null)
        .forEach(r => {
          overrideMap.set(`${r.room_type_id}_${r.date}_${r.pricing_template_id}`, r.price);
        });

      // 同步：若「整月庫存都一致」且與房型房間數量不同，則以房型房間數量為準
      // 目的：避免套用模板/初始化時把庫存寫死為 1，導致與房型管理不一致
      const roomCountById = new Map<string, number>();
      loadedRoomTypes.forEach(rt => {
        if (rt.room_count != null) roomCountById.set(rt.id, rt.room_count);
      });

      const uniqueAvailByRoom = new Map<string, Set<number>>();
      loadedInventory.forEach(row => {
        if (!uniqueAvailByRoom.has(row.room_type_id)) uniqueAvailByRoom.set(row.room_type_id, new Set());
        uniqueAvailByRoom.get(row.room_type_id)!.add(row.available_rooms);
      });

       const syncTargets: Array<{ roomTypeId: string; fromValue: number; toValue: number }> = [];
      uniqueAvailByRoom.forEach((set, roomTypeId) => {
        const toValue = roomCountById.get(roomTypeId);
        if (toValue == null) return;
        if (set.size !== 1) return;
        const fromValue = Array.from(set)[0];
        if (fromValue === toValue) return;
         // 僅在「整月庫存都固定同一個數」且是典型的預設錯置情境才自動同步：
         // - 由 1 -> 大於 1（初始化/套用模板造成的預設值錯誤）
         // - 由 大於 1 -> 1（房型房間數量調整為 1，但庫存仍維持舊值）
         const shouldSync =
           (fromValue === 1 && toValue > 1) ||
           (fromValue > 1 && toValue === 1);

         if (shouldSync) {
          syncTargets.push({ roomTypeId, fromValue, toValue });
        }
      });

      if (syncTargets.length > 0) {
        // 以月份區間更新，並只更新那些仍維持在舊值(通常是 1)的列
         await Promise.all(
           syncTargets.map(async (t) => {
             const { error: syncError } = await supabase
               .from('room_inventory_pricing')
               .update({ available_rooms: t.toValue })
               .eq('room_type_id', t.roomTypeId)
               .gte('date', monthStart)
               .lte('date', monthEnd)
               .is('pricing_template_id', null)
               .eq('available_rooms', t.fromValue);

             if (syncError) throw syncError;
           })
         );

        const syncMap = new Map(syncTargets.map(t => [t.roomTypeId, t] as const));
        loadedInventory = loadedInventory.map(row => {
          const t = syncMap.get(row.room_type_id);
          if (!t) return row;
          if (row.available_rooms !== t.fromValue) return row;
          return { ...row, available_rooms: t.toValue };
        });
      }

      setRoomTypes(loadedRoomTypes);
      setTemplates(loadedTemplates);
      
      // 建立庫存查找表（含預訂數量）
      const invMap = new Map<string, InventoryData>();
      loadedInventory.forEach(item => {
        const key = `${item.room_type_id}_${item.date}`;
        invMap.set(key, { ...item, booked_count: bookingCountMap.get(key) || 0 });
      });
      setInventory(invMap);
      setTemplatePriceOverrides(overrideMap);

      // 建立假日查找表
      const holMap = new Map<string, PublicHoliday>();
      (holidaysResult.data || []).forEach(h => {
        holMap.set(h.holiday_date, h);
      });
      setHolidays(holMap);

    } catch (error) {
      console.error('載入資料失敗:', error);
      toast.error('載入資料失敗');
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

  // 判斷日期類型（三段式）：
  //  - weekday  平日：週一至週四
  //  - peak     旺日：週五、週日
  //  - weekend  假日：週六
  //  - holiday  國定假日（視同假日）
  const getDayType = (date: Date, dateStr: string): 'weekend' | 'holiday' | 'peak' | 'weekday' => {
    const holiday = holidays.get(dateStr);
    if (holiday) {
      if (holiday.holiday_type === 'work_on_weekend') return 'weekday';
      return 'holiday';
    }
    const day = date.getDay(); // 0=Sun, 6=Sat
    if (day === 6) return 'weekend';
    if (day === 5 || day === 0) return 'peak';
    return 'weekday';
  };

  // 獲取價格單元格的數據
  const getCellData = (roomTypeId: string, dateStr: string) => {
    const key = `${roomTypeId}_${dateStr}`;
    return inventory.get(key);
  };

  // 點擊價格單元格
  const handleCellClick = (
    roomType: RoomType,
    template: PricingTemplate | null,
    dateStr: string,
    currentPrice?: number,
    currentAvailableRooms?: number
  ) => {
    setSelectedCell({
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      templateId: template?.id,
      templateName: template?.project_name || template?.template_name,
      date: dateStr,
      currentPrice,
      currentAvailableRooms,
    });
    setEditDialogOpen(true);
  };

  // 編輯完成後重新載入
  const handleEditComplete = () => {
    loadData();
    setEditDialogOpen(false);
    setSelectedCell(null);
  };

  // 篩選後的房型
  const filteredRoomTypes = useMemo(() => {
    if (selectedRoomTypeId === 'all') return roomTypes;
    return roomTypes.filter(r => r.id === selectedRoomTypeId);
  }, [roomTypes, selectedRoomTypeId]);

  // 篩選後的專案
  const filteredTemplates = useMemo(() => {
    if (selectedTemplateId === 'all') return templates;
    return templates.filter(t => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId]);

  // 用於判斷「通用模板」：模板名稱不包含任何房型名稱
  // 注意：要用全部房型做判斷（不是 filteredRoomTypes），避免因篩選導致誤判
  const allRoomNamesNormalized = useMemo(
    () => roomTypes.map(r => r.name.replace(/\s+/g, '')),
    [roomTypes]
  );

  // 按房型分組
  const groupedRoomTypes = useMemo(() => {
    const exclusive = filteredRoomTypes.filter(r => r.is_exclusive_package);
    const regular = filteredRoomTypes.filter(r => !r.is_exclusive_package);
    return { exclusive, regular };
  }, [filteredRoomTypes]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                  <Home className="h-4 w-4" />
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink className="text-muted-foreground">物件管理</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>房價庫存設定</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader title="房價庫存設定" icon={DollarSign} />
        <TableSkeleton rows={8} columns={15} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink className="text-muted-foreground">物件管理</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>房價庫存設定</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="房價庫存設定" icon={DollarSign} />

      <Card>
        <CardContent className="p-4">
          {/* 篩選器區域 */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* 房型篩選 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">選擇房型</span>
              <Select value={selectedRoomTypeId} onValueChange={handleRoomTypeChange}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="全部房型" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">全部房型</SelectItem>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 專案篩選 - 僅在選擇特定房型後顯示 */}
            {selectedRoomTypeId !== 'all' && availableTemplatesForRoom.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">選擇專案</span>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="w-[180px] bg-background">
                    <SelectValue placeholder="全部專案" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border z-50">
                    <SelectItem value="all">全部專案</SelectItem>
                    {availableTemplatesForRoom.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.project_name || t.template_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 月份選擇器 */}
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="icon" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-lg font-medium min-w-[120px] text-center">
                {format(currentMonth, 'yyyy-MM', { locale: zhTW })}
              </span>
              <Button variant="outline" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 橫向日曆表格 */}
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="sticky left-0 z-20 bg-background border-r px-3 py-2 text-left font-medium min-w-[160px]">
                      房型 / 專案
                    </th>
                    {monthDays.map(day => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const dayType = getDayType(day, dateStr);
                      const isWeekend = dayType === 'weekend' || dayType === 'holiday';
                      const isPeak = dayType === 'peak';
                      
                      return (
                        <th
                          key={dateStr}
                          className={cn(
                            "px-2 py-1 text-center font-medium min-w-[70px] border-r",
                            isWeekend && "bg-orange-50 text-orange-600",
                            dayType === 'holiday' && "bg-red-50 text-red-600",
                            isPeak && "bg-amber-50 text-amber-700"
                          )}
                        >
                          <div className="text-xs">{weekDayNames[day.getDay()]}</div>
                          <div className="text-base">{format(day, 'd')}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* 包棟區塊 */}
                  {groupedRoomTypes.exclusive.length > 0 && (
                    <>
                      <tr className="bg-muted/30">
                        <td 
                          colSpan={monthDays.length + 1} 
                          className="sticky left-0 z-10 px-3 py-2 font-semibold text-muted-foreground"
                        >
                          包棟
                        </td>
                      </tr>
                      {groupedRoomTypes.exclusive.map(roomType => {
                        // 包棟/包區房型：優先以 room_type_id 綁定為準；
                        // 沒綁定時才以名稱包含房型名稱、或通用模板做後備匹配。
                        const normalizedRoomName = roomType.name.replace(/\s+/g, '');

                        const roomTemplates = filteredTemplates.filter(t => {
                          if (Array.isArray(t.room_type_ids) && t.room_type_ids.length > 0) return t.room_type_ids.includes(roomType.id);
                          if (t.room_type_id) return t.room_type_id === roomType.id;
                          const templateName = (t.project_name || t.template_name).replace(/\s+/g, '');
                          const matchesCurrentRoom = templateName.includes(normalizedRoomName);
                          const isGenericTemplate = !allRoomNamesNormalized.some(name => templateName.includes(name));
                          return matchesCurrentRoom || isGenericTemplate;
                        });
                        return (
                          <RoomTypeRows
                            key={roomType.id}
                            roomType={roomType}
                            templates={roomTemplates}
                            inventory={inventory}
                            templatePriceOverrides={templatePriceOverrides}
                            monthDays={monthDays}
                            holidays={holidays}
                            getCellData={getCellData}
                            getDayType={getDayType}
                            onCellClick={handleCellClick}
                          />
                        );
                      })}
                    </>
                  )}

                  {/* 一般房型區塊 */}
                  {groupedRoomTypes.regular.map(roomType => {
                    // 一般房型：優先以 room_type_id 綁定為準。
                    // 沒綁定時才以名稱包含房型名稱、或通用模板做後備匹配。
                    const normalizedRoomName = roomType.name.replace(/\s+/g, '');

                    const roomTemplates = filteredTemplates.filter(t => {
                      if (Array.isArray(t.room_type_ids) && t.room_type_ids.length > 0) return t.room_type_ids.includes(roomType.id);
                      if (t.room_type_id) return t.room_type_id === roomType.id;
                      const templateName = (t.project_name || t.template_name).replace(/\s+/g, '');
                      const matchesCurrentRoom = templateName.includes(normalizedRoomName);
                      const isGenericTemplate = !allRoomNamesNormalized.some(name => templateName.includes(name));
                      return matchesCurrentRoom || isGenericTemplate;
                    });
                    return (
                      <RoomTypeRows
                        key={roomType.id}
                        roomType={roomType}
                        templates={roomTemplates}
                        inventory={inventory}
                        templatePriceOverrides={templatePriceOverrides}
                        monthDays={monthDays}
                        holidays={holidays}
                        getCellData={getCellData}
                        getDayType={getDayType}
                        onCellClick={handleCellClick}
                        showCategoryHeader={true}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 編輯對話框 */}
      {selectedCell && (
        <RoomPriceEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          roomTypeId={selectedCell.roomTypeId}
          roomTypeName={selectedCell.roomTypeName}
          templateId={selectedCell.templateId}
          templateName={selectedCell.templateName}
          initialDate={selectedCell.date}
          currentPrice={selectedCell.currentPrice}
          currentAvailableRooms={selectedCell.currentAvailableRooms}
          accommodationId={currentAccommodationId || ''}
          onComplete={handleEditComplete}
        />
      )}
    </div>
  );
}

// 房型行組件
interface RoomTypeRowsProps {
  roomType: RoomType;
  templates: PricingTemplate[];
  inventory: Map<string, InventoryData>;
  templatePriceOverrides: TemplatePriceOverrides;
  monthDays: Date[];
  holidays: Map<string, PublicHoliday>;
  getCellData: (roomTypeId: string, dateStr: string) => InventoryData | undefined;
  getDayType: (date: Date, dateStr: string) => 'weekend' | 'holiday' | 'peak' | 'weekday';
  onCellClick: (roomType: RoomType, template: PricingTemplate | null, dateStr: string, currentPrice?: number, currentAvailableRooms?: number) => void;
  showCategoryHeader?: boolean;
}

function RoomTypeRows({
  roomType,
  templates,
  inventory,
  templatePriceOverrides,
  monthDays,
  holidays,
  getCellData,
  getDayType,
  onCellClick,
  showCategoryHeader = false,
}: RoomTypeRowsProps) {
  // 過濾模板：按 room_type_id 匹配房型，或為通用模板（無 room_type_id）
  const visibleTemplates = useMemo(() => {
    return templates.filter(t => {
      // 模板綁定了特定房型：嚴格以 room_type_id 為準
      if (Array.isArray(t.room_type_ids) && t.room_type_ids.length > 0) return t.room_type_ids.includes(roomType.id);
      if (t.room_type_id) return t.room_type_id === roomType.id;
      // 通用模板（未綁定房型）：透過名稱匹配
      const templateName = (t.project_name || t.template_name).replace(/\s+/g, '');
      const normalizedRoomName = roomType.name.replace(/\s+/g, '');
      return templateName.includes(normalizedRoomName);
    });
  }, [templates, roomType.id, roomType.name]);

  return (
    <>
      {/* 房型名稱行 + 庫存數量 */}
      {showCategoryHeader && (
        <tr className="bg-muted/30">
          <td 
            colSpan={monthDays.length + 1} 
            className="sticky left-0 z-10 px-3 py-2 font-semibold text-muted-foreground"
          >
            {roomType.name}
          </td>
        </tr>
      )}
      
      {/* 庫存行 */}
      <tr className="border-b hover:bg-muted/20">
        <td className="sticky left-0 z-10 bg-background border-r px-3 py-2 font-medium">
          {!showCategoryHeader && <span className="font-semibold">{roomType.name}</span>}
          {showCategoryHeader && <span className="text-muted-foreground text-xs">庫存</span>}
        </td>
        {monthDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayType = getDayType(day, dateStr);
          const isWeekend = dayType === 'weekend' || dayType === 'holiday';
          const isPeak = dayType === 'peak';
          const cellData = getCellData(roomType.id, dateStr);

          // 當日被「關閉販售」時，前台視為不可預定，因此表格庫存顯示為 0
          const isUnavailable = cellData?.is_available === false;
          const bookedCount = cellData?.booked_count || 0;
          const rawRooms = cellData ? cellData.available_rooms : 0;
          const remainingRooms = isUnavailable ? 0 : Math.max(0, rawRooms - bookedCount);
          const isZeroRooms = remainingRooms === 0;

          return (
            <td
              key={dateStr}
              className={cn(
                "px-2 py-1 text-center border-r cursor-pointer transition-colors",
                isWeekend && "bg-orange-50/50 hover:bg-orange-100/50",
                dayType === 'holiday' && "bg-red-50/50 hover:bg-red-100/50",
                isPeak && "bg-amber-50/40 hover:bg-amber-100/50",
                !isWeekend && !isPeak && "hover:bg-muted/50",
              )}
              onClick={() => onCellClick(roomType, null, dateStr, cellData?.price || undefined, cellData?.available_rooms)}
            >
              <span
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium leading-none",
                  // 無法預定：以 destructive 標示
                  isUnavailable && "bg-destructive/10 text-destructive",
                  // 售完（庫存 0）
                  !isUnavailable && isZeroRooms && "bg-destructive/10 text-destructive",
                  // 有庫存
                  !isUnavailable && !isZeroRooms && "bg-primary/10 text-primary",
                  // 未設定：維持中性顯示
                  !cellData && "bg-muted text-muted-foreground",
                )}
                aria-label={isUnavailable ? '無法預定' : undefined}
                title={isUnavailable ? '無法預定' : undefined}
              >
                {remainingRooms ?? '-'}
              </span>
            </td>
          );
        })}
      </tr>

      {/* 專案價格行 */}
      {visibleTemplates.map((template) => (
        <tr key={`${roomType.id}_${template.id}`} className="border-b hover:bg-muted/20">
          <td className="sticky left-0 z-10 bg-background border-r px-3 py-2 text-sm text-muted-foreground">
            {template.project_name || template.template_name}
          </td>
          {monthDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayType = getDayType(day, dateStr);
            const isWeekend = dayType === 'weekend' || dayType === 'holiday';
            const isPeak = dayType === 'peak';
            const cellData = getCellData(roomType.id, dateStr);

            // 優先使用該專案在該日期的覆寫價，否則回退到「房型 override → 專案頂層」對應日型價
            const isUnavailable = cellData?.is_available === false;
            const overrideKey = `${roomType.id}_${dateStr}_${template.id}`;
            const overridePrice = templatePriceOverrides.get(overrideKey);

            const roomOv = getRoomOverride(template as any, roomType.id);
            const tier: 'weekday' | 'peak' | 'weekend' = isWeekend ? 'weekend' : isPeak ? 'peak' : 'weekday';
            const tierSellable = isTierSellable(template as any, roomType.id, tier);

            const ovWeekday = roomOv?.weekday_price ?? null;
            const ovPeak = roomOv?.peak_price ?? null;
            const ovWeekend = roomOv?.weekend_price ?? null;

            const weekdayPrice = ovWeekday ?? template.weekday_price;
            const peakPrice = ovPeak ?? template.peak_price;
            const weekendPrice = ovWeekend ?? template.weekend_price;

            const fallbackPrice = isWeekend
              ? (weekendPrice ?? peakPrice ?? weekdayPrice)
              : isPeak
              ? (peakPrice ?? weekdayPrice ?? weekendPrice)
              : (weekdayPrice ?? peakPrice ?? weekendPrice);
            const price = overridePrice ?? fallbackPrice;
            const isOverridden = overridePrice != null;
            const hideCell = !tierSellable;

            // 該專案在此日是否有效（valid_from/valid_until/extra/excluded）
            const isActive = isTemplateActiveForDates(template as any, [dateStr]);
            const overrideInv = roomOv?.available_rooms ?? null;
            const showInv = isActive && !hideCell && overrideInv != null;

            return (
              <td
                key={dateStr}
                className={cn(
                  "px-1 py-1 text-center border-r cursor-pointer transition-colors",
                  isWeekend && "bg-orange-50/50 hover:bg-orange-100/50",
                  dayType === 'holiday' && "bg-red-50/50 hover:bg-red-100/50",
                  isPeak && "bg-amber-50/40 hover:bg-amber-100/50",
                  !isWeekend && !isPeak && "hover:bg-muted/50",
                  isUnavailable && "opacity-60",
                )}
                onClick={() => onCellClick(roomType, template, dateStr, price || undefined, overrideInv ?? cellData?.available_rooms)}
                title={hideCell ? '此日型已關閉販售' : (!isActive ? '此日不在專案期限內' : (isUnavailable ? '無法預定（已關閉販售）' : (isOverridden ? '此日已單獨設定價格' : undefined)))}
              >
                <div className="flex flex-col items-center gap-0.5 leading-tight">
                  <span className={cn("text-sm", isOverridden && "font-semibold text-primary", (hideCell || !isActive) && "text-muted-foreground/50")}>
                    {hideCell ? '—' : (!isActive ? '—' : (isUnavailable ? '' : formatPrice(price)))}
                  </span>
                  {showInv && (
                    <span className="text-[10px] text-muted-foreground">庫{overrideInv}</span>
                  )}
                </div>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
