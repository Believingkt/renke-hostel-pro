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
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";

interface RoomType {
  id: string;
  name: string;
  is_exclusive_package: boolean;
  base_price: number;
}

interface PricingTemplate {
  id: string;
  template_name: string;
  project_name: string | null;
  weekday_price: number | null;
  weekend_price: number | null;
}

interface InventoryData {
  room_type_id: string;
  date: string;
  price: number;
  available_rooms: number;
  is_available: boolean;
}

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
  const [holidays, setHolidays] = useState<Map<string, PublicHoliday>>(new Map());
  const [loading, setLoading] = useState(true);
  
  // 篩選器狀態
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>('all');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('all');
  
  // 編輯對話框狀態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    roomTypeId: string;
    roomTypeName: string;
    templateId?: string;
    templateName?: string;
    date: string;
    currentPrice?: number;
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
      const [roomTypesResult, templatesResult, inventoryResult, holidaysResult] = await Promise.all([
        supabase
          .from('room_types')
          .select('id, name, is_exclusive_package, base_price')
          .eq('accommodation_id', currentAccommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('pricing_templates')
          .select('id, template_name, project_name, weekday_price, weekend_price')
          .eq('accommodation_id', currentAccommodationId)
          .order('display_order', { ascending: true }),
        supabase
          .from('room_inventory_pricing')
          .select('room_type_id, date, price, available_rooms, is_available')
          .gte('date', monthStart)
          .lte('date', monthEnd),
        supabase
          .from('public_holidays')
          .select('holiday_date, holiday_type, holiday_name')
          .eq('accommodation_id', currentAccommodationId)
          .gte('holiday_date', monthStart)
          .lte('holiday_date', monthEnd),
      ]);

      if (roomTypesResult.error) throw roomTypesResult.error;
      if (templatesResult.error) throw templatesResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      if (holidaysResult.error) throw holidaysResult.error;

      setRoomTypes(roomTypesResult.data || []);
      setTemplates(templatesResult.data || []);

      // 建立庫存查找表
      const invMap = new Map<string, InventoryData>();
      (inventoryResult.data || []).forEach(item => {
        const key = `${item.room_type_id}_${item.date}`;
        invMap.set(key, item);
      });
      setInventory(invMap);

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

  // 判斷日期類型
  const getDayType = (date: Date, dateStr: string): 'weekend' | 'holiday' | 'weekday' => {
    const holiday = holidays.get(dateStr);
    if (holiday) {
      if (holiday.holiday_type === 'work_on_weekend') return 'weekday';
      return 'holiday';
    }
    if (isWeekendDate(date)) return 'weekend';
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
    currentPrice?: number
  ) => {
    setSelectedCell({
      roomTypeId: roomType.id,
      roomTypeName: roomType.name,
      templateId: template?.id,
      templateName: template?.project_name || template?.template_name,
      date: dateStr,
      currentPrice,
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
              <BreadcrumbPage>房價庫存</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <PageHeader title="房價庫存" icon={DollarSign} />
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
            <BreadcrumbPage>房價庫存</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title="房價庫存" icon={DollarSign} />

      <Card>
        <CardContent className="p-4">
          {/* 篩選器區域 */}
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {/* 房型篩選 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">選擇房型</span>
              <Select value={selectedRoomTypeId} onValueChange={setSelectedRoomTypeId}>
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

            {/* 專案篩選 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">選擇專案</span>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger className="w-[180px] bg-background">
                  <SelectValue placeholder="全部專案" />
                </SelectTrigger>
                <SelectContent className="bg-background border z-50">
                  <SelectItem value="all">全部專案</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.project_name || t.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                      
                      return (
                        <th
                          key={dateStr}
                          className={cn(
                            "px-2 py-1 text-center font-medium min-w-[70px] border-r",
                            isWeekend && "bg-orange-50 text-orange-600",
                            dayType === 'holiday' && "bg-red-50 text-red-600"
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
                        // 只顯示名稱包含該房型名稱的專案模板（移除空格後比對）
                        const normalizedRoomName = roomType.name.replace(/\s+/g, '');
                        const roomTemplates = filteredTemplates.filter(t => {
                          const templateName = (t.project_name || t.template_name).replace(/\s+/g, '');
                          return templateName.includes(normalizedRoomName);
                        });
                        return (
                          <RoomTypeRows
                            key={roomType.id}
                            roomType={roomType}
                            templates={roomTemplates}
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
                    // 只顯示名稱包含該房型名稱的專案模板（移除空格後比對）
                    const normalizedRoomName = roomType.name.replace(/\s+/g, '');
                    const roomTemplates = filteredTemplates.filter(t => {
                      const templateName = (t.project_name || t.template_name).replace(/\s+/g, '');
                      return templateName.includes(normalizedRoomName);
                    });
                    return (
                      <RoomTypeRows
                        key={roomType.id}
                        roomType={roomType}
                        templates={roomTemplates}
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
          templateName={selectedCell.templateName}
          initialDate={selectedCell.date}
          currentPrice={selectedCell.currentPrice}
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
  monthDays: Date[];
  holidays: Map<string, PublicHoliday>;
  getCellData: (roomTypeId: string, dateStr: string) => InventoryData | undefined;
  getDayType: (date: Date, dateStr: string) => 'weekend' | 'holiday' | 'weekday';
  onCellClick: (roomType: RoomType, template: PricingTemplate | null, dateStr: string, currentPrice?: number) => void;
  showCategoryHeader?: boolean;
}

function RoomTypeRows({
  roomType,
  templates,
  monthDays,
  holidays,
  getCellData,
  getDayType,
  onCellClick,
  showCategoryHeader = false,
}: RoomTypeRowsProps) {
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
        {monthDays.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayType = getDayType(day, dateStr);
          const isWeekend = dayType === 'weekend' || dayType === 'holiday';
          const cellData = getCellData(roomType.id, dateStr);
          
          return (
            <td
              key={dateStr}
              className={cn(
                "px-2 py-1 text-center border-r",
                isWeekend && "bg-orange-50/50",
                dayType === 'holiday' && "bg-red-50/50"
              )}
            >
              <span className={cn(
                "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                cellData?.available_rooms === 0 && "bg-red-100 text-red-600",
                cellData?.available_rooms && cellData.available_rooms > 0 && "bg-green-100 text-green-600"
              )}>
                {cellData?.available_rooms ?? '-'}
              </span>
            </td>
          );
        })}
      </tr>

      {/* 專案價格行 */}
      {templates.map(template => (
        <tr key={`${roomType.id}_${template.id}`} className="border-b hover:bg-muted/20">
          <td className="sticky left-0 z-10 bg-background border-r px-3 py-2 text-sm text-muted-foreground">
            {template.project_name || template.template_name}
          </td>
          {monthDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayType = getDayType(day, dateStr);
            const isWeekend = dayType === 'weekend' || dayType === 'holiday';
            const cellData = getCellData(roomType.id, dateStr);
            
            // 根據日期類型選擇價格
            const price = cellData?.price || (isWeekend ? template.weekend_price : template.weekday_price);
            
            return (
              <td
                key={dateStr}
                className={cn(
                  "px-1 py-1 text-center border-r cursor-pointer transition-colors",
                  isWeekend && "bg-orange-50/50 hover:bg-orange-100/50",
                  dayType === 'holiday' && "bg-red-50/50 hover:bg-red-100/50",
                  !isWeekend && "hover:bg-muted/50"
                )}
                onClick={() => onCellClick(roomType, template, dateStr, price || undefined)}
              >
                <span className="text-sm">
                  {formatPrice(price)}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
