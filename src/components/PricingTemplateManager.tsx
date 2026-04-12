import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Check, X, CheckSquare, Square, CalendarCheck, Clock, History, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useIsMobile } from "@/hooks/use-mobile";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";
import { eachDayOfInterval, format } from "date-fns";
import { z } from "zod";

interface PricingTemplate {
  id: string;
  template_name: string;
  description: string | null;
  price: number | null;
  // 保留向後兼容
  project_name?: string | null;
  project_description?: string | null;
  weekday_price?: number | null;
  weekend_price?: number | null;
  meal_plans: any[];
  is_default: boolean;
  display_order: number;
  room_type_id?: string | null;
}

interface TemplateApplication {
  id: string;
  applied_at: string;
  date_from: string;
  date_to: string;
  selected_days: number[];
  room_type_ids: string[];
  price_type: string;
  affected_dates_count: number;
  applied_by: string | null;
  available_rooms: number;
  holiday_affected_count: number;
  work_on_weekend_count: number;
}

interface RoomType {
  id: string;
  name: string;
  room_count: number | null;
}

interface PricingTemplateManagerProps {
  accommodationId: string;
}

export interface PricingTemplateManagerRef {
  openAddDialog: () => void;
}

const templateSchema = z.object({
  template_name: z.string().trim().min(1, "專案名稱不能為空").max(50, "專案名稱最多50字"),
  description: z.string().trim().max(200, "描述最多200字").optional(),
  price: z.number().int().min(0, "價格不能為負數").nullable(),
}).refine((data) => {
  return data.price != null;
}, {
  message: "請設定價格",
  path: ["price"],
});

export const PricingTemplateManager = forwardRef<PricingTemplateManagerRef, PricingTemplateManagerProps>(function PricingTemplateManager({ accommodationId }, ref) {
  const isMobile = useIsMobile();
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PricingTemplate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<PricingTemplate | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<PricingTemplate | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [availableRooms, setAvailableRooms] = useState<number>(1);
  const [applying, setApplying] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // 0=日, 1=一, ..., 6=六
  const [includePublicHolidays, setIncludePublicHolidays] = useState(true); // 是否包含國定假日和補休日
  const [templateApplications, setTemplateApplications] = useState<Record<string, TemplateApplication[]>>({});
  const [showApplicationsDialog, setShowApplicationsDialog] = useState(false);
  const [viewingApplicationsTemplate, setViewingApplicationsTemplate] = useState<PricingTemplate | null>(null);
  const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0, currentRoom: '' });
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false);
  const [deletingApplications, setDeletingApplications] = useState(false);
  
  const [formData, setFormData] = useState({
    template_name: "",
    description: "",
    price: null as number | null,
    room_type_id: "" as string,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (accommodationId) {
      loadTemplates();
      loadRoomTypes();
      loadTemplateApplications();
    }
  }, [accommodationId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('pricing_templates')
        .select('*')
        .eq('accommodation_id', accommodationId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // 轉換資料
      const templatesData = (data || []).map(t => ({
        ...t,
        meal_plans: Array.isArray(t.meal_plans) ? t.meal_plans : []
      }));
      
      setTemplates(templatesData);
    } catch (error) {
      console.error('載入專案模板失敗:', error);
      toast.error('載入專案模板失敗');
    } finally {
      setLoading(false);
    }
  };

  const loadRoomTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('room_types')
        .select('id, name, room_count')
        .eq('accommodation_id', accommodationId)
        .order('display_order');

      if (error) throw error;
      setRoomTypes(data || []);
    } catch (error) {
      console.error('載入房型失敗:', error);
      toast.error('載入房型失敗');
    }
  };

  const loadTemplateApplications = async () => {
    try {
      const { data, error } = await supabase
        .from('pricing_template_applications')
        .select('*')
        .eq('accommodation_id', accommodationId)
        .order('applied_at', { ascending: false });

      if (error) throw error;
      
      // 按模板 ID 分組
      const grouped: Record<string, TemplateApplication[]> = {};
      (data || []).forEach((app: any) => {
        if (!grouped[app.template_id]) {
          grouped[app.template_id] = [];
        }
        grouped[app.template_id].push({
          id: app.id,
          applied_at: app.applied_at,
          date_from: app.date_from,
          date_to: app.date_to,
          selected_days: app.selected_days || [],
          room_type_ids: app.room_type_ids || [],
          price_type: app.price_type,
          affected_dates_count: app.affected_dates_count,
          applied_by: app.applied_by,
          available_rooms: app.available_rooms,
          holiday_affected_count: app.holiday_affected_count || 0,
          work_on_weekend_count: app.work_on_weekend_count || 0,
        });
      });
      
      setTemplateApplications(grouped);
    } catch (error) {
      console.error('載入套用記錄失敗:', error);
    }
  };

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormData({
      template_name: "",
      description: "",
      price: null,
      room_type_id: "",
    });
    setErrors({});
    setShowForm(true);
  };

  const handleEdit = (template: PricingTemplate) => {
    setEditingTemplate(template);
    setFormData({
      template_name: template.template_name,
      description: template.description || "",
      price: (template as any).price ?? template.weekday_price ?? template.weekend_price ?? null,
      room_type_id: template.room_type_id || "",
    });
    setErrors({});
    setShowForm(true);
  };

  const validateForm = (): boolean => {
    try {
      templateSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      toast.error('請修正表單錯誤後再試');
      return;
    }

    try {
      const dataToSave = {
        template_name: formData.template_name,
        description: formData.description || null,
        price: formData.price,
        accommodation_id: accommodationId,
        room_type_id: formData.room_type_id || null,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('pricing_templates')
          .update(dataToSave)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('專案模板已更新');
      } else {
        const { error } = await supabase
          .from('pricing_templates')
          .insert(dataToSave);

        if (error) throw error;
        toast.success('專案模板已創建');
      }

      setShowForm(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('儲存專案模板失敗:', error);
      toast.error('儲存專案模板失敗');
    }
  };

  const handleDelete = (template: PricingTemplate) => {
    setDeletingTemplate(template);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingTemplate) return;

    try {
      const { error } = await supabase
        .from('pricing_templates')
        .delete()
        .eq('id', deletingTemplate.id);

      if (error) throw error;
      toast.success('專案模板已刪除');
      loadTemplates();
    } catch (error) {
      console.error('刪除專案模板失敗:', error);
      toast.error('刪除專案模板失敗');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
    }
  };

  const handleApply = (template: PricingTemplate) => {
    setApplyingTemplate(template);
    setSelectedRoomTypes([]);
    setDateRange(undefined);
    setAvailableRooms(1);
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]); // 預設全選
    setIncludePublicHolidays(true); // 預設包含國定假日
    setApplyDialogOpen(true);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
    setIncludePublicHolidays(false); // 手動選擇時取消國定假日標記
  };

  const toggleAllDays = () => {
    if (selectedDays.length === 7) {
      setSelectedDays([]);
    } else {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
    setIncludePublicHolidays(false);
  };

  const selectWeekdays = () => {
    setSelectedDays([0, 1, 2, 3, 4, 5]); // 日到五
    setIncludePublicHolidays(false);
  };

  const selectHolidays = () => {
    setSelectedDays([6]); // 六
    setIncludePublicHolidays(true); // 包含國定假日和補休日
  };

  const toggleRoomType = (roomTypeId: string) => {
    setSelectedRoomTypes(prev => 
      prev.includes(roomTypeId) 
        ? prev.filter(id => id !== roomTypeId)
        : [...prev, roomTypeId]
    );
  };

  const isWeekend = (date: Date): boolean => {
    const day = date.getDay();
    return day === 6; // Saturday only
  };

  const getDayOfWeekLabel = (date: Date): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return days[date.getDay()];
  };


  const confirmApply = async () => {
    if (!applyingTemplate || !dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0) {
      toast.error('請選擇日期範圍和房型');
      return;
    }

    if (selectedDays.length === 0) {
      toast.error('請至少選擇一個星期');
      return;
    }

    // 使用模板的單一價格
    const templatePrice = (applyingTemplate as any).price ?? applyingTemplate.weekday_price ?? applyingTemplate.weekend_price;
    
    if (!templatePrice) {
      toast.error('此模板尚未設定價格');
      return;
    }

    try {
      setApplying(true);
      const allDates = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      
      // 查詢日期範圍內的國定假日記錄（如果需要）
      let publicHolidayDates = new Set<string>();
      if (includePublicHolidays) {
        setApplyProgress(prev => ({ ...prev, currentRoom: '查詢國定假日資料...' }));
        const allDateStrings = allDates.map(date => format(date, 'yyyy-MM-dd'));
        const { data: publicHolidays, error: holidayQueryError } = await supabase
          .from('public_holidays')
          .select('holiday_date, holiday_type')
          .eq('accommodation_id', accommodationId)
          .in('holiday_date', allDateStrings)
          .in('holiday_type', ['holiday', 'compensatory_day_off']);
          
        if (holidayQueryError) {
          console.error('查詢國定假日失敗:', holidayQueryError);
        } else {
          (publicHolidays || []).forEach(holiday => {
            publicHolidayDates.add(holiday.holiday_date);
          });
        }
      }
      
      // 只保留選中星期的日期，或國定假日/補休日的日期
      const dates = allDates.filter(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return selectedDays.includes(date.getDay()) || publicHolidayDates.has(dateStr);
      });
      
      if (dates.length === 0) {
        toast.error('所選日期範圍內沒有符合的星期');
        return;
      }
      
      // 初始化進度
      const totalRecords = selectedRoomTypes.length * dates.length;
      setApplyProgress({ current: 0, total: totalRecords, currentRoom: '' });
      
      // 查詢日期範圍內的國定假日記錄
      setApplyProgress(prev => ({ ...prev, currentRoom: '查詢國定假日資料...' }));
      const dateStrings = dates.map(date => format(date, 'yyyy-MM-dd'));
      const { data: publicHolidays, error: holidayError } = await supabase
        .from('public_holidays')
        .select('holiday_date, holiday_type')
        .eq('accommodation_id', accommodationId)
        .in('holiday_date', dateStrings);
        
      if (holidayError) {
        console.error('查詢國定假日失敗:', holidayError);
        throw holidayError;
      }
      
      // 建立國定假日類型的 Map
      const holidayTypeMap = new Map<string, string>();
      (publicHolidays || []).forEach(holiday => {
        holidayTypeMap.set(holiday.holiday_date, holiday.holiday_type);
      });
      
      // 批量查詢現有記錄
      setApplyProgress(prev => ({ ...prev, currentRoom: '查詢現有價格記錄...' }));
      const { data: existingRecords, error: queryError } = await supabase
        .from('room_inventory_pricing')
        .select('*')
        .in('room_type_id', selectedRoomTypes)
        .in('date', dateStrings);
        
      if (queryError) {
        console.error('查詢現有記錄失敗:', queryError);
        throw queryError;
      }
      
      // 創建現有記錄的索引
      const existingMap = new Map<string, any>();
      (existingRecords || []).forEach(record => {
        const key = `${record.room_type_id}_${record.date}`;
        existingMap.set(key, record);
      });
      
      // 準備 upsert 記錄
      const upsertRecords = [];
      let processedCount = 0;
      let holidayAffectedCount = 0;
      let workOnWeekendCount = 0;
      
      for (let i = 0; i < selectedRoomTypes.length; i++) {
        const roomTypeId = selectedRoomTypes[i];
          const selectedRoomType = roomTypes.find(r => r.id === roomTypeId);
          const roomTypeName = selectedRoomType?.name || '未知房型';
          const roomTypeDefaultRooms = selectedRoomType?.room_count ?? null;
        setApplyProgress(prev => ({ 
          ...prev, 
          currentRoom: `處理 ${roomTypeName} (${i + 1}/${selectedRoomTypes.length})` 
        }));
        
        for (const date of dates) {
          processedCount++;
          setApplyProgress(prev => ({ ...prev, current: processedCount }));
          const dateStr = format(date, 'yyyy-MM-dd');
          const key = `${roomTypeId}_${dateStr}`;
          const existing = existingMap.get(key);
          
          // 判斷是否為假日（考慮國定假日類型）
          const isWeekendDay = isWeekend(date);
          const holidayType = holidayTypeMap.get(dateStr);
          
          let isHolidayPricing = isWeekendDay;
          
          // 根據國定假日類型調整價格判斷並統計
          if (holidayType === 'work_on_weekend') {
            isHolidayPricing = false;
            if (i === 0) workOnWeekendCount++;
          } else if (holidayType === 'holiday' || holidayType === 'compensatory_day_off') {
            isHolidayPricing = true;
            if (!isWeekendDay && i === 0) holidayAffectedCount++;
          }
          
          // 直接使用模板的單一價格
          if (!templatePrice) {
            console.warn('缺少價格');
            continue;
          }
          
          // 準備 upsert 數據
          const upsertData: any = {
            room_type_id: roomTypeId,
            date: dateStr,
            price: templatePrice,
            // 預設庫存優先採用房型設定的房間數量，避免被固定寫成 1
            available_rooms: existing?.available_rooms ?? roomTypeDefaultRooms ?? availableRooms,
            is_available: true,
            price_2_meals: templatePrice,
            price_3_meals: existing?.price_3_meals || null,
            // 記錄套用的模板名稱，用於房價庫存日曆過濾顯示
            notes: applyingTemplate.template_name,
          };
          
          upsertRecords.push(upsertData);
        }
      }

      if (upsertRecords.length === 0) {
        toast.error('沒有可套用的記錄，請檢查模板價格設定');
        return;
      }
      
      // 執行批量 upsert
      setApplyProgress(prev => ({ ...prev, currentRoom: '正在儲存價格資料...' }));
      const { error: upsertError } = await supabase
        .from('room_inventory_pricing')
        .upsert(upsertRecords, { 
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false 
        });
      
      if (upsertError) {
        console.error('批量更新失敗:', upsertError);
        throw upsertError;
      }
      
      setApplyProgress(prev => ({ ...prev, currentRoom: '記錄套用歷史...' }));
      
      // 記錄套用歷史
      const { data: { user } } = await supabase.auth.getUser();
      const projectName = applyingTemplate.template_name;
      const { error: applicationError } = await supabase
        .from('pricing_template_applications')
        .insert({
          template_id: applyingTemplate.id,
          accommodation_id: accommodationId,
          applied_by: user?.id,
          date_from: format(dateRange.from, 'yyyy-MM-dd'),
          date_to: format(dateRange.to, 'yyyy-MM-dd'),
          selected_days: selectedDays,
          room_type_ids: selectedRoomTypes,
          price_type: projectName,
          available_rooms: availableRooms,
          affected_dates_count: upsertRecords.length,
          holiday_affected_count: holidayAffectedCount,
          work_on_weekend_count: workOnWeekendCount,
        });

      if (applicationError) {
        console.error('記錄套用歷史失敗:', applicationError);
      }
      
      toast.success(`已成功套用「${projectName}」價格到 ${selectedRoomTypes.length} 個房型的 ${upsertRecords.length} 天`);
      setApplyDialogOpen(false);
      setApplyingTemplate(null);
      loadTemplateApplications();
    } catch (error: any) {
      console.error('套用專案模板失敗:', error);
      toast.error(`套用專案模板失敗：${error.message || '未知錯誤'}`);
    } finally {
      setApplying(false);
      setApplyProgress({ current: 0, total: 0, currentRoom: '' });
    }
  };

  const toggleApplicationSelection = (appId: string) => {
    setSelectedApplicationIds(prev => 
      prev.includes(appId) 
        ? prev.filter(id => id !== appId)
        : [...prev, appId]
    );
  };

  const toggleAllApplications = () => {
    if (!viewingApplicationsTemplate) return;
    
    const currentApps = templateApplications[viewingApplicationsTemplate.id] || [];
    const allIds = currentApps.map(app => app.id);
    
    if (selectedApplicationIds.length === allIds.length) {
      setSelectedApplicationIds([]);
    } else {
      setSelectedApplicationIds(allIds);
    }
  };

  const handleBatchDelete = () => {
    if (selectedApplicationIds.length === 0) {
      toast.error("請先選擇要刪除的記錄");
      return;
    }
    setBatchDeleteDialogOpen(true);
  };

  const confirmBatchDelete = async () => {
    setDeletingApplications(true);
    
    try {
      const { error } = await supabase
        .from('pricing_template_applications')
        .delete()
        .in('id', selectedApplicationIds);

      if (error) throw error;

      toast.success(`成功刪除 ${selectedApplicationIds.length} 筆記錄`);
      
      // 重新載入套用記錄
      await loadTemplateApplications();
      
      setSelectedApplicationIds([]);
      setBatchDeleteDialogOpen(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error deleting applications:', error);
      }
      toast.error("刪除記錄失敗，請重試");
    } finally {
      setDeletingApplications(false);
    }
  };

  interface SortableTemplateCardProps {
    template: PricingTemplate;
    onEdit: (template: PricingTemplate) => void;
    onDelete: (template: PricingTemplate) => void;
    onApply: (template: PricingTemplate) => void;
    templateApplications: Record<string, TemplateApplication[]>;
    onViewApplications: (template: PricingTemplate) => void;
  }

  const SortableTemplateCard = ({ 
    template, 
    onEdit, 
    onDelete, 
    onApply,
    templateApplications,
    onViewApplications 
  }: SortableTemplateCardProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: template.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const templatePrice = (template as any).price ?? template.weekday_price ?? template.weekend_price;
    const applications = templateApplications[template.id] || [];
    const hasApplications = applications.length > 0;

    return (
      <Card 
        ref={setNodeRef} 
        style={style} 
        className="group hover:shadow-lg transition-all duration-200 border-border/60 hover:border-primary/30 overflow-hidden"
      >
        {/* 頂部標題橫幅 */}
        <div className="bg-muted/50 px-4 py-2.5 flex items-center gap-2 border-b border-border/40">
          {/* 拖曳手把 */}
          <button
            className="cursor-grab active:cursor-grabbing touch-none opacity-40 group-hover:opacity-70 transition-opacity"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-base leading-tight truncate" title={template.template_name}>
              {template.template_name}
            </h4>
            {template.description && template.description !== template.template_name && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{template.description}</p>
            )}
          </div>
        </div>
        
        {/* 價格區塊 */}
        {templatePrice ? (
          <div className="bg-background px-4 py-3 flex items-center justify-between border-b border-border/40">
            <span className="text-sm font-medium text-muted-foreground">價格</span>
            <span className="font-bold text-lg tracking-tight text-primary">
              NT$ {templatePrice.toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="bg-background px-4 py-3 flex items-center justify-between border-b border-border/40">
            <span className="text-sm font-medium text-muted-foreground">價格</span>
            <span className="text-muted-foreground font-medium">未設定</span>
          </div>
        )}
        
        <CardContent className="p-4">
          {/* 套用記錄 */}
          {hasApplications && (
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 py-2 px-2.5 bg-muted/30 rounded-md">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>
                  {format(new Date(applications[0].applied_at), 'MM/dd HH:mm')} • {applications[0].affected_dates_count}天
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewApplications(template)}
                className="h-6 px-2 text-xs text-primary hover:text-primary"
              >
                <History className="h-3 w-3 mr-1" />
                {applications.length} 筆記錄
              </Button>
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onApply(template)}
              className="flex-1 gap-1.5 h-9 touch-manipulation font-medium"
              disabled={!templatePrice}
            >
              <CalendarCheck className="h-4 w-4" />
              套用
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onEdit(template)}
              className="h-9 w-9 touch-manipulation shrink-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(template)}
              className="h-9 w-9 touch-manipulation shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = templates.findIndex((item) => item.id === active.id);
      const newIndex = templates.findIndex((item) => item.id === over.id);

      const newTemplates = arrayMove(templates, oldIndex, newIndex);
      
      // 更新本地狀態
      const updatedTemplates = newTemplates.map((template, index) => ({
        ...template,
        display_order: index
      }));
      
      setTemplates(updatedTemplates);

      // 更新數據庫
      try {
        const updates = updatedTemplates.map((template) => 
          supabase
            .from('pricing_templates')
            .update({ display_order: template.display_order })
            .eq('id', template.id)
        );

        await Promise.all(updates);
        toast.success("模板順序已更新");
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating template order:', error);
        }
        toast.error("無法更新模板順序");
        loadTemplates(); // 重新載入以重置順序
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (showForm) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{editingTemplate ? '編輯' : '新增'}專案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template_name">專案名稱 *</Label>
            <Input
              id="template_name"
              value={formData.template_name}
              onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
              placeholder="例如：暑假旺季、春節連假"
              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
            />
            {errors.template_name && (
              <p className="text-sm text-destructive">{errors.template_name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="描述此專案模板的用途"
              rows={2}
              className="min-h-[48px] text-base sm:text-sm touch-manipulation"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* 價格設定 */}
          <div className="space-y-2">
            <Label htmlFor="price">價格 *</Label>
            <Input
              id="price"
              type="number"
              min="0"
              value={formData.price ?? ""}
              onChange={(e) => setFormData({
                ...formData,
                price: e.target.value ? parseInt(e.target.value) : null
              })}
              placeholder="請輸入價格"
              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
              inputMode="numeric"
            />
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price}</p>
            )}
          </div>

          {/* 對應房型 */}
          <div className="space-y-2">
            <Label htmlFor="room_type_id">對應房型 *</Label>
            <Select value={formData.room_type_id || "none"} onValueChange={(v) => setFormData({ ...formData, room_type_id: v === "none" ? "" : v })}>
              <SelectTrigger className="h-12 sm:h-10">
                <SelectValue placeholder="選擇對應房型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不指定房型</SelectItem>
                {roomTypes.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">指定房型後，新增訂單時僅顯示該房型對應的專案</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button onClick={handleSubmit} className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation">
              <Check className="h-4 w-4" />
              {editingTemplate ? '更新' : '新增'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
            >
              <X className="h-4 w-4" />
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <Button onClick={handleAddNew} className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation">
              <Plus className="h-4 w-4" />
              新增專案
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4 animate-fade-in">
              <Skeleton className="h-16 sm:h-20 w-full rounded-lg" />
              <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 sm:h-28 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px] text-muted-foreground animate-fade-in">
              <div className="text-center space-y-2">
                <p className="text-base sm:text-lg font-medium">尚無專案模板</p>
                <p className="text-xs sm:text-sm">建立第一個專案模板，快速套用到房型</p>
              </div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={templates.map(t => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2 animate-fade-in">
                  {templates.map((template) => (
                    <SortableTemplateCard
                      key={template.id}
                      template={template}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onApply={handleApply}
                      templateApplications={templateApplications}
                      onViewApplications={(template) => {
                        setViewingApplicationsTemplate(template);
                        setShowApplicationsDialog(true);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除專案模板「{deletingTemplate?.template_name}」嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMobile ? (
        <Drawer open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
          <DrawerContent className="max-h-[95vh]">
            <DrawerHeader>
              <DrawerTitle>套用專案模板</DrawerTitle>
              <DrawerDescription>
                將「{applyingTemplate?.template_name}」套用到選定的房型和日期範圍
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-6 px-4 overflow-y-auto">
            {/* 日期範圍選擇 */}
            <div className="space-y-2">
              <Label>選擇日期範圍 *</Label>
              <DateRangePicker 
                dateRange={dateRange} 
                onDateRangeChange={setDateRange}
                className="w-full"
                allowFutureDates
              />
            </div>

            {/* 套用星期選擇 */}
            <div className="space-y-2">
              <Label>套用星期</Label>
              <div className="border rounded-lg p-4 space-y-4">
                {/* 快捷選項 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground mr-2">快捷選項：</span>
                  <button
                    type="button"
                    onClick={toggleAllDays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${selectedDays.length === 7
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">全選</span>
                    <span className="text-[10px] leading-tight opacity-70">(一～日)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekdays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([0, 1, 2, 3, 4, 5])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">平日</span>
                    <span className="text-[10px] leading-tight opacity-70">(日～五)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectHolidays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([6]) && includePublicHolidays
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">假日</span>
                    <span className="text-[10px] leading-tight opacity-70">(六、國定假日)</span>
                  </button>
                </div>

                {/* 個別星期選擇 */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t">

                  {[
                    { day: 0, label: '日' },
                    { day: 1, label: '一' },
                    { day: 2, label: '二' },
                    { day: 3, label: '三' },
                    { day: 4, label: '四' },
                    { day: 5, label: '五' },
                    { day: 6, label: '六' },
                  ].map(({ day, label }) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`
                        flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all touch-manipulation
                        ${selectedDays.includes(day)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary hover:bg-accent'
                        }
                      `}
                    >
                      {selectedDays.includes(day) ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
                {selectedDays.length > 0 && selectedDays.length < 7 && (
                  <p className="text-xs text-muted-foreground mt-3">
                    已選擇 {selectedDays.length} 個星期
                  </p>
                )}
              </div>
            </div>

            {/* 價格資訊顯示 */}
            <div className="space-y-2">
              <Label>套用價格</Label>
              {applyingTemplate && ((applyingTemplate as any).price ?? applyingTemplate.weekday_price ?? applyingTemplate.weekend_price) ? (
                <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                  <div className="font-medium mb-1">{applyingTemplate.template_name}</div>
                  <div className="text-lg font-semibold text-foreground">
                    NT$ {((applyingTemplate as any).price ?? applyingTemplate.weekday_price ?? applyingTemplate.weekend_price)?.toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-lg text-center text-muted-foreground">
                  此模板尚未設定價格
                </div>
              )}
            </div>

            {/* 房型選擇 */}
            <div className="space-y-2">
              <Label>選擇房型 *</Label>
              <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
                {roomTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    尚無房型，請先新增房型
                  </p>
                ) : (
                  roomTypes.map((roomType) => (
                    <div
                      key={roomType.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors touch-manipulation group ${
                        selectedRoomTypes.includes(roomType.id)
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent hover:text-accent-foreground'
                      }`}
                      onClick={() => toggleRoomType(roomType.id)}
                    >
                      {selectedRoomTypes.includes(roomType.id) ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{roomType.name}</p>
                        <p className={`text-xs ${
                          selectedRoomTypes.includes(roomType.id)
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground group-hover:text-white'
                        }`}>
                          共 {roomType.room_count || 0} 間
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedRoomTypes.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  已選擇 {selectedRoomTypes.length} 個房型
                </p>
              )}
            </div>

            {/* 庫存設定 */}
            <div className="space-y-2">
              <Label htmlFor="available_rooms">庫存 *</Label>
              <Input
                id="available_rooms"
                type="number"
                min="0"
                value={availableRooms}
                onChange={(e) => setAvailableRooms(parseInt(e.target.value) || 0)}
                className="h-12 text-base sm:h-10 sm:text-sm"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">
                設定每天的可用房數
              </p>
            </div>
          </div>

          <DrawerFooter className="flex-col gap-2 pt-2">
            {applying && applyProgress.total > 0 && (
              <div className="w-full space-y-2 mb-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{applyProgress.currentRoom}</span>
                  <span className="font-medium">{applyProgress.current}/{applyProgress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <Button 
              onClick={confirmApply}
              disabled={!dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0 || applying}
              className="w-full h-12 gap-2"
            >
              {applying ? '套用中...' : '確認套用'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setApplyDialogOpen(false)}
              disabled={applying}
              className="w-full h-12"
            >
              取消
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      ) : (
        <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>套用專案模板</DialogTitle>
              <DialogDescription>
                將「{applyingTemplate?.template_name}」套用到選定的房型和日期範圍
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* 同樣的內容 - 日期範圍選擇 */}
              <div className="space-y-2">
                <Label>選擇日期範圍 *</Label>
                <DateRangePicker 
                  dateRange={dateRange} 
                  onDateRangeChange={setDateRange}
                  className="w-full"
                  allowFutureDates
                />
              </div>

              {/* 套用星期選擇 */}
              <div className="space-y-2">
                <Label>套用星期</Label>
                <div className="border rounded-lg p-4 space-y-4">
                  {/* 快捷選項 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground mr-2">快捷選項：</span>
                  <button
                    type="button"
                    onClick={toggleAllDays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${selectedDays.length === 7
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">全選</span>
                    <span className="text-[10px] leading-tight opacity-70">(一～日)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekdays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([0, 1, 2, 3, 4, 5])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">平日</span>
                    <span className="text-[10px] leading-tight opacity-70">(日～五)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectHolidays}
                    className={`
                      flex flex-col items-center justify-center gap-0.5 px-3 py-2 h-auto min-h-[44px] sm:min-h-[36px] rounded-md border transition-all touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([6]) && includePublicHolidays
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:bg-accent hover:text-accent-foreground'
                      }
                    `}
                  >
                    <span className="font-medium text-sm">假日</span>
                    <span className="text-[10px] leading-tight opacity-70">(六、國定假日)</span>
                  </button>
                  </div>

                  {/* 個別星期選擇 */}
                  <div className="flex flex-wrap items-center gap-3 pt-3 border-t">
                    {[
                      { day: 0, label: '日' },
                      { day: 1, label: '一' },
                      { day: 2, label: '二' },
                      { day: 3, label: '三' },
                      { day: 4, label: '四' },
                      { day: 5, label: '五' },
                      { day: 6, label: '六' },
                    ].map(({ day, label }) => (
                      <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`
                        flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all touch-manipulation
                        ${selectedDays.includes(day)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:border-primary hover:bg-accent'
                        }
                      `}
                    >
                        {selectedDays.includes(day) ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                        <span className="font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                  {selectedDays.length > 0 && selectedDays.length < 7 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      已選擇 {selectedDays.length} 個星期
                    </p>
                  )}
                </div>
              </div>

              {/* 價格資訊顯示 */}
              <div className="space-y-2">
                <Label>套用價格</Label>
                {applyingTemplate && ((applyingTemplate as any).price ?? applyingTemplate.weekday_price ?? applyingTemplate.weekend_price) ? (
                  <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                    <div className="font-medium mb-1">{applyingTemplate.template_name}</div>
                    <div className="text-lg font-semibold text-foreground">
                      NT$ {((applyingTemplate as any).price ?? applyingTemplate.weekday_price ?? applyingTemplate.weekend_price)?.toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border rounded-lg text-center text-muted-foreground">
                    此模板尚未設定價格
                  </div>
                )}
              </div>

              {/* 房型選擇 */}
              <div className="space-y-2">
                <Label>選擇房型 *</Label>
                <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto">
                  {roomTypes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      尚無房型，請先新增房型
                    </p>
                  ) : (
                    roomTypes.map((roomType) => (
                      <div
                        key={roomType.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors touch-manipulation group ${
                          selectedRoomTypes.includes(roomType.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent hover:text-accent-foreground'
                        }`}
                        onClick={() => toggleRoomType(roomType.id)}
                      >
                        {selectedRoomTypes.includes(roomType.id) ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{roomType.name}</p>
                          <p className={`text-xs ${
                            selectedRoomTypes.includes(roomType.id)
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground group-hover:text-white'
                          }`}>
                            共 {roomType.room_count || 0} 間
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {selectedRoomTypes.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    已選擇 {selectedRoomTypes.length} 個房型
                  </p>
                )}
              </div>

              {/* 庫存設定 */}
              <div className="space-y-2">
                <Label htmlFor="available_rooms_desktop">庫存 *</Label>
                <Input
                  id="available_rooms_desktop"
                  type="number"
                  min="0"
                  value={availableRooms}
                  onChange={(e) => setAvailableRooms(parseInt(e.target.value) || 0)}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  設定每天的可用房數
                </p>
              </div>
            </div>

            {applying && applyProgress.total > 0 && (
              <div className="w-full space-y-2 px-6 pb-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{applyProgress.currentRoom}</span>
                  <span className="font-medium">{applyProgress.current}/{applyProgress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-300"
                    style={{ width: `${(applyProgress.current / applyProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => setApplyDialogOpen(false)}
                disabled={applying}
                className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
              >
                取消
              </Button>
              <Button 
                onClick={confirmApply}
                disabled={!dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0 || applying}
                className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation gap-2"
              >
                {applying ? '套用中...' : '確認套用'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 套用記錄對話框 */}
      {isMobile ? (
        <Drawer open={showApplicationsDialog} onOpenChange={(open) => {
          setShowApplicationsDialog(open);
          if (!open) setSelectedApplicationIds([]);
        }}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>套用記錄</DrawerTitle>
              <DrawerDescription>
                {viewingApplicationsTemplate?.template_name}
              </DrawerDescription>
            </DrawerHeader>
            
            {/* 批次操作工具列 */}
            {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.length > 0 && (
              <div className="px-4 pb-3 border-b space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllApplications}
                    className="h-9 gap-2"
                  >
                    {selectedApplicationIds.length === templateApplications[viewingApplicationsTemplate.id].length ? (
                      <>
                        <CheckSquare className="h-4 w-4" />
                        取消全選
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4" />
                        全選
                      </>
                    )}
                  </Button>
                  
                  {selectedApplicationIds.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDelete}
                      className="h-9 gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      刪除 ({selectedApplicationIds.length})
                    </Button>
                  )}
                </div>
                
                {selectedApplicationIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    已選擇 {selectedApplicationIds.length} 筆記錄
                  </p>
                )}
              </div>
            )}
            
            <div className="px-4 space-y-3 overflow-y-auto">
              {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.map((app) => {
                const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
                const selectedDayLabels = app.selected_days.map(d => dayLabels[d]).join('、');
                
                return (
                  <Card 
                    key={app.id} 
                    className={`p-4 cursor-pointer transition-all ${
                      selectedApplicationIds.includes(app.id) ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => toggleApplicationSelection(app.id)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div onClick={(e) => e.stopPropagation()}>
                            {selectedApplicationIds.includes(app.id) ? (
                              <CheckSquare className="h-5 w-5 text-primary" />
                            ) : (
                              <Square className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(app.applied_at), 'yyyy/MM/dd HH:mm')}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          app.price_type === '2meals' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
                        }`}>
                          {app.price_type === '2meals' ? '一泊二食' : '一泊三食'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">日期範圍</span>
                          <div className="font-medium">
                            {format(new Date(app.date_from), 'yyyy/MM/dd')} - {format(new Date(app.date_to), 'yyyy/MM/dd')}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">受影響天數</span>
                          <div className="font-medium">{app.affected_dates_count} 天</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">套用星期</span>
                          <div className="font-medium">{selectedDayLabels}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">房型數量</span>
                          <div className="font-medium">{app.room_type_ids.length} 個</div>
                        </div>
                        {(app.holiday_affected_count > 0 || app.work_on_weekend_count > 0) && (
                          <>
                            {app.holiday_affected_count > 0 && (
                              <div>
                                <span className="text-muted-foreground">國定假日</span>
                                <div className="font-medium text-orange-600">{app.holiday_affected_count} 天</div>
                              </div>
                            )}
                            {app.work_on_weekend_count > 0 && (
                              <div>
                                <span className="text-muted-foreground">補班日</span>
                                <div className="font-medium text-blue-600">{app.work_on_weekend_count} 天</div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      
                      <div className="pt-2 border-t">
                        <div className="text-xs text-muted-foreground">
                          套用房型：{app.room_type_ids.map(id => 
                            roomTypes.find(rt => rt.id === id)?.name || '未知房型'
                          ).join('、')}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            
            <DrawerFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowApplicationsDialog(false)}
                className="w-full h-11"
              >
                關閉
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showApplicationsDialog} onOpenChange={(open) => {
          setShowApplicationsDialog(open);
          if (!open) setSelectedApplicationIds([]);
        }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>套用記錄</DialogTitle>
              <DialogDescription>
                {viewingApplicationsTemplate?.template_name}
              </DialogDescription>
            </DialogHeader>
            
            {/* 批次操作工具列 */}
            {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.length > 0 && (
              <div className="pb-3 border-b space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllApplications}
                    className="h-9 gap-2"
                  >
                    {selectedApplicationIds.length === templateApplications[viewingApplicationsTemplate.id].length ? (
                      <>
                        <CheckSquare className="h-4 w-4" />
                        取消全選
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4" />
                        全選
                      </>
                    )}
                  </Button>
                  
                  {selectedApplicationIds.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBatchDelete}
                      className="h-9 gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      刪除 ({selectedApplicationIds.length})
                    </Button>
                  )}
                </div>
                
                {selectedApplicationIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    已選擇 {selectedApplicationIds.length} 筆記錄
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-3">
              {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.map((app) => {
                const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
                const selectedDayLabels = app.selected_days.map(d => dayLabels[d]).join('、');
                
                return (
                  <Card 
                    key={app.id} 
                    className={`p-4 cursor-pointer transition-all ${
                      selectedApplicationIds.includes(app.id) ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => toggleApplicationSelection(app.id)}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div onClick={(e) => e.stopPropagation()}>
                            {selectedApplicationIds.includes(app.id) ? (
                              <CheckSquare className="h-5 w-5 text-primary" />
                            ) : (
                              <Square className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(app.applied_at), 'yyyy/MM/dd HH:mm')}
                          </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${
                          app.price_type === '2meals' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
                        }`}>
                          {app.price_type === '2meals' ? '一泊二食' : '一泊三食'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">日期範圍</span>
                          <div className="font-medium">
                            {format(new Date(app.date_from), 'yyyy/MM/dd')} - {format(new Date(app.date_to), 'yyyy/MM/dd')}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">受影響天數</span>
                          <div className="font-medium">{app.affected_dates_count} 天</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">套用星期</span>
                          <div className="font-medium">{selectedDayLabels}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">房型數量</span>
                          <div className="font-medium">{app.room_type_ids.length} 個</div>
                        </div>
                        {(app.holiday_affected_count > 0 || app.work_on_weekend_count > 0) && (
                          <>
                            {app.holiday_affected_count > 0 && (
                              <div>
                                <span className="text-muted-foreground">國定假日</span>
                                <div className="font-medium text-orange-600">{app.holiday_affected_count} 天</div>
                              </div>
                            )}
                            {app.work_on_weekend_count > 0 && (
                              <div>
                                <span className="text-muted-foreground">補班日</span>
                                <div className="font-medium text-blue-600">{app.work_on_weekend_count} 天</div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      
                      <div className="pt-2 border-t">
                        <div className="text-xs text-muted-foreground">
                          套用房型：{app.room_type_ids.map(id => 
                            roomTypes.find(rt => rt.id === id)?.name || '未知房型'
                          ).join('、')}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowApplicationsDialog(false)}
              >
                關閉
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 批次刪除確認對話框 */}
      <AlertDialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認批次刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除選中的 {selectedApplicationIds.length} 筆套用記錄嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingApplications}>取消</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmBatchDelete}
              disabled={deletingApplications}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingApplications ? "刪除中..." : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
