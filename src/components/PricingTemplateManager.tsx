import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Check, X, CheckSquare, Square, CalendarCheck, Clock, History, Eye } from "lucide-react";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";
import { eachDayOfInterval, format } from "date-fns";
import { z } from "zod";

interface PricingTemplate {
  id: string;
  template_name: string;
  description: string | null;
  weekday_price: number;
  weekend_price: number;
  weekday_2_meals_price: number | null;
  weekday_3_meals_price: number | null;
  weekend_2_meals_price: number | null;
  weekend_3_meals_price: number | null;
  is_default: boolean;
}

interface TemplateApplication {
  id: string;
  applied_at: string;
  date_from: string;
  date_to: string;
  selected_days: number[];
  room_type_ids: string[];
  price_type: '2meals' | '3meals';
  affected_dates_count: number;
  applied_by: string | null;
}

interface RoomType {
  id: string;
  name: string;
  room_count: number | null;
}

interface PreviewItem {
  roomTypeName: string;
  date: string;
  dateLabel: string;
  dayOfWeek: string;
  isWeekend: boolean;
  price: number;
  priceType: string;
  isNewRecord: boolean;
}

interface PricingTemplateManagerProps {
  accommodationId: string;
}

const templateSchema = z.object({
  template_name: z.string().trim().min(1, "模板名稱不能為空").max(50, "模板名稱最多50字"),
  description: z.string().trim().max(200, "描述最多200字").optional(),
  weekday_2_meals_price: z.number().int().min(0).optional().nullable(),
  weekday_3_meals_price: z.number().int().min(0).optional().nullable(),
  weekend_2_meals_price: z.number().int().min(0).optional().nullable(),
  weekend_3_meals_price: z.number().int().min(0).optional().nullable(),
}).refine((data) => {
  // 至少要填寫一個完整的區塊（平日或假日的兩種價格都填）
  const hasCompleteWeekday = 
    data.weekday_2_meals_price != null && 
    data.weekday_3_meals_price != null;
  
  const hasCompleteWeekend = 
    data.weekend_2_meals_price != null && 
    data.weekend_3_meals_price != null;
  
  return hasCompleteWeekday || hasCompleteWeekend;
}, {
  message: "至少要填寫一個完整的價格區塊（平日或假日的兩種價格都需填寫）",
  path: ["weekday_2_meals_price"],
});

export function PricingTemplateManager({ accommodationId }: PricingTemplateManagerProps) {
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
  const [selectedPriceType, setSelectedPriceType] = useState<'2meals' | '3meals'>('2meals');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]); // 0=日, 1=一, ..., 6=六
  const [templateApplications, setTemplateApplications] = useState<Record<string, TemplateApplication[]>>({});
  const [showApplicationsDialog, setShowApplicationsDialog] = useState(false);
  const [viewingApplicationsTemplate, setViewingApplicationsTemplate] = useState<PricingTemplate | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  
  const [formData, setFormData] = useState({
    template_name: "",
    description: "",
    weekday_2_meals_price: null as number | null,
    weekday_3_meals_price: null as number | null,
    weekend_2_meals_price: null as number | null,
    weekend_3_meals_price: null as number | null,
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('載入價格模板失敗:', error);
      toast.error('載入價格模板失敗');
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
        .select(`
          *,
          profiles:applied_by (name)
        `)
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
      weekday_2_meals_price: null,
      weekday_3_meals_price: null,
      weekend_2_meals_price: null,
      weekend_3_meals_price: null,
    });
    setErrors({});
    setShowForm(true);
  };

  const handleEdit = (template: PricingTemplate) => {
    setEditingTemplate(template);
    setFormData({
      template_name: template.template_name,
      description: template.description || "",
      weekday_2_meals_price: template.weekday_2_meals_price,
      weekday_3_meals_price: template.weekday_3_meals_price,
      weekend_2_meals_price: template.weekend_2_meals_price,
      weekend_3_meals_price: template.weekend_3_meals_price,
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
      if (editingTemplate) {
        const { error } = await supabase
          .from('pricing_templates')
          .update({
            ...formData,
            weekday_price: null,
            weekend_price: null,
            accommodation_id: accommodationId,
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('價格模板已更新');
      } else {
        const { error } = await supabase
          .from('pricing_templates')
          .insert({
            ...formData,
            weekday_price: null,
            weekend_price: null,
            accommodation_id: accommodationId,
          });

        if (error) throw error;
        toast.success('價格模板已創建');
      }

      setShowForm(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('儲存價格模板失敗:', error);
      toast.error('儲存價格模板失敗');
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
      toast.success('價格模板已刪除');
      loadTemplates();
    } catch (error) {
      console.error('刪除價格模板失敗:', error);
      toast.error('刪除價格模板失敗');
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
    // 預設選擇有值的價格類型
    if (template.weekday_2_meals_price || template.weekend_2_meals_price) {
      setSelectedPriceType('2meals');
    } else {
      setSelectedPriceType('3meals');
    }
    setApplyDialogOpen(true);
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const toggleAllDays = () => {
    if (selectedDays.length === 7) {
      setSelectedDays([]);
    } else {
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
    }
  };

  const selectWeekdays = () => {
    setSelectedDays([1, 2, 3, 4, 5]); // 一到五
  };

  const selectWeekend = () => {
    setSelectedDays([0, 6]); // 日和六
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
    return day === 0 || day === 6; // Sunday or Saturday
  };

  const getDayOfWeekLabel = (date: Date): string => {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return days[date.getDay()];
  };

  const generatePreview = async () => {
    if (!applyingTemplate || !dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0) {
      toast.error('請選擇日期範圍和房型');
      return;
    }

    if (selectedDays.length === 0) {
      toast.error('請至少選擇一個星期');
      return;
    }

    if (!selectedPriceType) {
      toast.error('請選擇價格類型');
      return;
    }

    try {
      setLoadingPreview(true);
      const allDates = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      const dates = allDates.filter(date => selectedDays.includes(date.getDay()));
      
      if (dates.length === 0) {
        toast.error('所選日期範圍內沒有符合的星期');
        return;
      }

      const preview: PreviewItem[] = [];
      const priceTypeName = selectedPriceType === '2meals' ? '一泊二食' : '一泊三食';

      for (const roomTypeId of selectedRoomTypes) {
        const roomType = roomTypes.find(rt => rt.id === roomTypeId);
        if (!roomType) continue;

        for (const date of dates) {
          const weekend = isWeekend(date);
          const dateStr = format(date, 'yyyy-MM-dd');
          
          let price = 0;
          if (selectedPriceType === '2meals') {
            price = weekend 
              ? (applyingTemplate.weekend_2_meals_price || 0)
              : (applyingTemplate.weekday_2_meals_price || 0);
          } else {
            price = weekend 
              ? (applyingTemplate.weekend_3_meals_price || 0)
              : (applyingTemplate.weekday_3_meals_price || 0);
          }

          if (price === 0) continue;

          // 檢查是否已存在記錄
          const { data: existing } = await supabase
            .from('room_inventory_pricing')
            .select('id')
            .eq('room_type_id', roomTypeId)
            .eq('date', dateStr)
            .maybeSingle();

          preview.push({
            roomTypeName: roomType.name,
            date: dateStr,
            dateLabel: format(date, 'MM/dd'),
            dayOfWeek: getDayOfWeekLabel(date),
            isWeekend: weekend,
            price,
            priceType: priceTypeName,
            isNewRecord: !existing,
          });
        }
      }

      preview.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.roomTypeName.localeCompare(b.roomTypeName);
      });

      setPreviewData(preview);
      setShowPreviewDialog(true);
    } catch (error) {
      console.error('生成預覽失敗:', error);
      toast.error('生成預覽失敗');
    } finally {
      setLoadingPreview(false);
    }
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

    if (!selectedPriceType) {
      toast.error('請選擇價格類型');
      return;
    }

    try {
      setApplying(true);
      const allDates = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      
      // 只保留選中星期的日期
      const dates = allDates.filter(date => selectedDays.includes(date.getDay()));
      
      if (dates.length === 0) {
        toast.error('所選日期範圍內沒有符合的星期');
        return;
      }
      
      // 分別處理更新和插入
      const updateRecords = [];
      const insertRecords = [];
      
      for (const roomTypeId of selectedRoomTypes) {
        for (const date of dates) {
          const weekend = isWeekend(date);
          const dateStr = format(date, 'yyyy-MM-dd');
          
          // 根據選擇的價格類型和平日/假日決定價格
          let price_2_meals = null;
          let price_3_meals = null;
          
          if (selectedPriceType === '2meals') {
            price_2_meals = weekend 
              ? applyingTemplate.weekend_2_meals_price 
              : applyingTemplate.weekday_2_meals_price;
            
            if (!price_2_meals) {
              console.warn(`模板缺少${weekend ? '假日' : '平日'}一泊二食價格`);
              continue;
            }
          } else if (selectedPriceType === '3meals') {
            price_3_meals = weekend 
              ? applyingTemplate.weekend_3_meals_price 
              : applyingTemplate.weekday_3_meals_price;
            
            if (!price_3_meals) {
              console.warn(`模板缺少${weekend ? '假日' : '平日'}一泊三食價格`);
              continue;
            }
          }
          
          // 查詢該日期是否已有記錄
          const { data: existing } = await supabase
            .from('room_inventory_pricing')
            .select('*')
            .eq('room_type_id', roomTypeId)
            .eq('date', dateStr)
            .maybeSingle();
          
          if (existing) {
            // 更新現有記錄
            const basePrice = weekend 
              ? (applyingTemplate.weekend_price || price_2_meals || price_3_meals || existing.price)
              : (applyingTemplate.weekday_price || price_2_meals || price_3_meals || existing.price);
            
            const updateData: any = {
              room_type_id: roomTypeId,
              date: dateStr,
              price: basePrice, // 確保 price 欄位始終有值
            };
            
            if (selectedPriceType === '2meals') {
              updateData.price_2_meals = price_2_meals;
            } else {
              updateData.price_3_meals = price_3_meals;
            }
            
            updateRecords.push(updateData);
          } else {
            // 創建新記錄 - 使用模板的基礎價格或餐飲方案價格
            const basePrice = weekend 
              ? (applyingTemplate.weekend_price || price_2_meals || price_3_meals || 0)
              : (applyingTemplate.weekday_price || price_2_meals || price_3_meals || 0);
              
            insertRecords.push({
              room_type_id: roomTypeId,
              date: dateStr,
              price: basePrice,
              price_2_meals: price_2_meals,
              price_3_meals: price_3_meals,
              available_rooms: availableRooms,
              is_available: true,
            });
          }
        }
      }

      // 執行批量操作
      if (updateRecords.length > 0) {
        const { error: updateError } = await supabase
          .from('room_inventory_pricing')
          .upsert(updateRecords, { 
            onConflict: 'room_type_id,date',
            ignoreDuplicates: false 
          });
        
        if (updateError) {
          console.error('更新記錄失敗:', updateError);
          throw updateError;
        }
      }
      
      if (insertRecords.length > 0) {
        const { error: insertError } = await supabase
          .from('room_inventory_pricing')
          .insert(insertRecords);
        
        if (insertError) {
          console.error('插入記錄失敗:', insertError);
          throw insertError;
        }
      }
      
      const totalRecords = updateRecords.length + insertRecords.length;
      if (totalRecords === 0) {
        toast.error('沒有可套用的記錄，請檢查模板價格設定');
        return;
      }
      
      // 記錄套用歷史
      const { data: { user } } = await supabase.auth.getUser();
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
          price_type: selectedPriceType,
          available_rooms: availableRooms,
          affected_dates_count: totalRecords,
        });

      if (applicationError) {
        console.error('記錄套用歷史失敗:', applicationError);
      }
      
      const priceTypeName = selectedPriceType === '2meals' ? '一泊二食' : '一泊三食';
      toast.success(`已成功套用${priceTypeName}價格到 ${selectedRoomTypes.length} 個房型的 ${totalRecords} 天`);
      setApplyDialogOpen(false);
      setApplyingTemplate(null);
      loadTemplateApplications();
    } catch (error) {
      console.error('套用價格模板失敗:', error);
      toast.error(`套用價格模板失敗：${error.message || '未知錯誤'}`);
    } finally {
      setApplying(false);
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
          <CardTitle>{editingTemplate ? '編輯' : '新增'}價格模板</CardTitle>
          <CardDescription>
            建立可重複使用的價格方案，快速套用到不同房型
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template_name">模板名稱 *</Label>
            <Input
              id="template_name"
              value={formData.template_name}
              onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
              placeholder="例如：平日方案、假日方案"
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
              placeholder="描述此價格模板的用途"
              rows={2}
              className="min-h-[48px] text-base sm:text-sm touch-manipulation"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">價格設定</h4>
              <p className="text-sm text-muted-foreground">至少填寫一個完整區塊</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 平日價格區塊 */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h5 className="font-medium mb-3 text-center">平日價格</h5>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="weekday_2_meals_price">一泊二食</Label>
                    <Input
                      id="weekday_2_meals_price"
                      type="number"
                      min="0"
                      value={formData.weekday_2_meals_price ?? ""}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        weekday_2_meals_price: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="選填"
                      className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                      inputMode="numeric"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="weekday_3_meals_price">一泊三食</Label>
                    <Input
                      id="weekday_3_meals_price"
                      type="number"
                      min="0"
                      value={formData.weekday_3_meals_price ?? ""}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        weekday_3_meals_price: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="選填"
                      className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              {/* 假日價格區塊 */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h5 className="font-medium mb-3 text-center">假日價格</h5>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="weekend_2_meals_price">一泊二食</Label>
                    <Input
                      id="weekend_2_meals_price"
                      type="number"
                      min="0"
                      value={formData.weekend_2_meals_price ?? ""}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        weekend_2_meals_price: e.target.value ? parseInt(e.target.value) : null
                      })}
                      placeholder="選填"
                      className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                      inputMode="numeric"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="weekend_3_meals_price">一泊三食</Label>
                    <Input
                      id="weekend_3_meals_price"
                      type="number"
                      min="0"
                      value={formData.weekend_3_meals_price ?? ""}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        weekend_3_meals_price: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="選填"
                      className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {errors.weekday_2_meals_price && (
              <p className="text-sm text-destructive">{errors.weekday_2_meals_price}</p>
            )}
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
            <div className="space-y-1">
              <CardTitle>價格模板</CardTitle>
              <CardDescription>
                建立並管理可重複使用的價格方案
              </CardDescription>
            </div>
            <Button onClick={handleAddNew} className="flex items-center justify-center gap-2 w-full sm:w-auto h-11 sm:h-10 touch-manipulation">
              <Plus className="h-4 w-4" />
              新增模板
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
                <p className="text-base sm:text-lg font-medium">尚無價格模板</p>
                <p className="text-xs sm:text-sm">建立第一個價格模板，快速套用到房型</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:gap-4 md:grid-cols-2 animate-fade-in">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="space-y-4">
                      {/* 標題和描述 */}
                      <div>
                        <h4 className="font-semibold text-lg mb-1">{template.template_name}</h4>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </div>

                      {/* 價格類型顯示 */}
                      <div className="space-y-3">
                        {/* 一泊二食 */}
                        {(template.weekday_2_meals_price || template.weekend_2_meals_price) && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <div className="font-medium text-sm mb-2 flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
                              一泊二食
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {template.weekday_2_meals_price && (
                                <div>
                                  <span className="text-muted-foreground">平日</span>
                                  <div className="font-bold text-foreground">
                                    NT$ {template.weekday_2_meals_price.toLocaleString()}
                                  </div>
                                </div>
                              )}
                              {template.weekend_2_meals_price && (
                                <div>
                                  <span className="text-muted-foreground">假日</span>
                                  <div className="font-bold text-foreground">
                                    NT$ {template.weekend_2_meals_price.toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* 一泊三食 */}
                        {(template.weekday_3_meals_price || template.weekend_3_meals_price) && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <div className="font-medium text-sm mb-2 flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-secondary"></span>
                              一泊三食
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              {template.weekday_3_meals_price && (
                                <div>
                                  <span className="text-muted-foreground">平日</span>
                                  <div className="font-bold text-foreground">
                                    NT$ {template.weekday_3_meals_price.toLocaleString()}
                                  </div>
                                </div>
                              )}
                              {template.weekend_3_meals_price && (
                                <div>
                                  <span className="text-muted-foreground">假日</span>
                                  <div className="font-bold text-foreground">
                                    NT$ {template.weekend_3_meals_price.toLocaleString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                      {/* 如果都沒有價格 */}
                      {!template.weekday_2_meals_price && !template.weekend_2_meals_price &&
                       !template.weekday_3_meals_price && !template.weekend_3_meals_price && (
                        <div className="text-sm text-muted-foreground text-center py-2">
                          尚未設定價格
                        </div>
                      )}
                    </div>

                    {/* 套用記錄 */}
                    {templateApplications[template.id] && templateApplications[template.id].length > 0 && (
                      <div className="pt-3 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>最近套用</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setViewingApplicationsTemplate(template);
                              setShowApplicationsDialog(true);
                            }}
                            className="h-7 text-xs"
                          >
                            <History className="h-3.5 w-3.5 mr-1" />
                            查看全部 ({templateApplications[template.id].length})
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(templateApplications[template.id][0].applied_at), 'yyyy/MM/dd HH:mm')} •{' '}
                          {templateApplications[template.id][0].affected_dates_count} 天 •{' '}
                          {templateApplications[template.id][0].room_type_ids.length} 個房型
                        </div>
                      </div>
                    )}

                      {/* 操作按鈕 */}
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleApply(template)}
                          className="flex-1 gap-2 h-10 sm:h-9 touch-manipulation"
                          disabled={!template.weekday_2_meals_price && !template.weekend_2_meals_price &&
                                   !template.weekday_3_meals_price && !template.weekend_3_meals_price}
                        >
                          <CalendarCheck className="h-4 w-4" />
                          套用
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(template)}
                          className="h-10 sm:h-9 touch-manipulation"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="sm"
                          onClick={() => handleDelete(template)}
                          className="h-10 sm:h-9 touch-manipulation"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除價格模板「{deletingTemplate?.template_name}」嗎？此操作無法復原。
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
              <DrawerTitle>套用價格模板</DrawerTitle>
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
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${selectedDays.length === 7
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">全選</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekdays}
                    className={`
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([1, 2, 3, 4, 5])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">平日</span>
                    <span className="text-xs opacity-75">(一~五)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekend}
                    className={`
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([0, 6])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">週末</span>
                    <span className="text-xs opacity-75">(六、日)</span>
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

            {/* 價格類型選擇 */}
            <div className="space-y-2">
              <Label>選擇價格類型 *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPriceType('2meals')}
                  disabled={!applyingTemplate?.weekday_2_meals_price && !applyingTemplate?.weekend_2_meals_price}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left group touch-manipulation
                    ${selectedPriceType === '2meals' 
                      ? 'border-primary bg-primary text-primary-foreground' 
                      : 'border-border hover:border-primary hover:bg-primary hover:text-primary-foreground'
                    }
                    ${(!applyingTemplate?.weekday_2_meals_price && !applyingTemplate?.weekend_2_meals_price)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                    }
                  `}
                >
                  <div className="font-medium mb-1 group-hover:text-primary-foreground">一泊二食</div>
                  {applyingTemplate && (
                    <div className="text-sm space-y-1">
                      {applyingTemplate.weekday_2_meals_price && (
                        <div className={selectedPriceType === '2meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                          平日：<span className={`font-medium ${selectedPriceType === '2meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                            NT$ {applyingTemplate.weekday_2_meals_price.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {applyingTemplate.weekend_2_meals_price && (
                        <div className={selectedPriceType === '2meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                          假日：<span className={`font-medium ${selectedPriceType === '2meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                            NT$ {applyingTemplate.weekend_2_meals_price.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {!applyingTemplate.weekday_2_meals_price && !applyingTemplate.weekend_2_meals_price && (
                        <div className="text-xs text-muted-foreground">未設定</div>
                      )}
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPriceType('3meals')}
                  disabled={!applyingTemplate?.weekday_3_meals_price && !applyingTemplate?.weekend_3_meals_price}
                  className={`
                    p-4 rounded-lg border-2 transition-all text-left group touch-manipulation
                    ${selectedPriceType === '3meals' 
                      ? 'border-primary bg-primary text-primary-foreground' 
                      : 'border-border hover:border-primary hover:bg-primary hover:text-primary-foreground'
                    }
                    ${(!applyingTemplate?.weekday_3_meals_price && !applyingTemplate?.weekend_3_meals_price)
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                    }
                  `}
                >
                  <div className="font-medium mb-1 group-hover:text-primary-foreground">一泊三食</div>
                  {applyingTemplate && (
                    <div className="text-sm space-y-1">
                      {applyingTemplate.weekday_3_meals_price && (
                        <div className={selectedPriceType === '3meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                          平日：<span className={`font-medium ${selectedPriceType === '3meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                            NT$ {applyingTemplate.weekday_3_meals_price.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {applyingTemplate.weekend_3_meals_price && (
                        <div className={selectedPriceType === '3meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                          假日：<span className={`font-medium ${selectedPriceType === '3meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                            NT$ {applyingTemplate.weekend_3_meals_price.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {!applyingTemplate.weekday_3_meals_price && !applyingTemplate.weekend_3_meals_price && (
                        <div className="text-xs text-muted-foreground">未設定</div>
                      )}
                    </div>
                  )}
                </button>
              </div>
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
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors touch-manipulation ${
                        selectedRoomTypes.includes(roomType.id)
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-accent'
                      }`}
                      onClick={() => toggleRoomType(roomType.id)}
                    >
                      {selectedRoomTypes.includes(roomType.id) ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{roomType.name}</p>
                        <p className={`text-xs ${
                          selectedRoomTypes.includes(roomType.id)
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground'
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

            {/* 可用房數設定 */}
            <div className="space-y-2">
              <Label htmlFor="available_rooms">可用房數 *</Label>
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
                設定每天的可用房數（庫存）
              </p>
            </div>
          </div>

          <DrawerFooter className="flex-col gap-2 pt-2">
            <Button 
              onClick={generatePreview}
              disabled={!dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0 || loadingPreview}
              className="w-full h-12 gap-2"
            >
              {loadingPreview ? (
                <>載入預覽中...</>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  預覽套用效果
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setApplyDialogOpen(false)}
              disabled={loadingPreview}
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
              <DialogTitle>套用價格模板</DialogTitle>
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
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${selectedDays.length === 7
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">全選</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekdays}
                    className={`
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([1, 2, 3, 4, 5])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">平日</span>
                    <span className="text-xs opacity-75">(一~五)</span>
                  </button>
                  <button
                    type="button"
                    onClick={selectWeekend}
                    className={`
                      flex items-center gap-2 px-3 py-2 h-10 sm:h-9 rounded-md border transition-all text-sm touch-manipulation
                      ${JSON.stringify(selectedDays) === JSON.stringify([0, 6])
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-primary hover:bg-accent'
                      }
                    `}
                  >
                    <span className="font-medium">週末</span>
                    <span className="text-xs opacity-75">(六、日)</span>
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

              {/* 價格類型選擇 */}
              <div className="space-y-2">
                <Label>選擇價格類型 *</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPriceType('2meals')}
                    disabled={!applyingTemplate?.weekday_2_meals_price && !applyingTemplate?.weekend_2_meals_price}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-left group touch-manipulation
                      ${selectedPriceType === '2meals' 
                        ? 'border-primary bg-primary text-primary-foreground' 
                        : 'border-border hover:border-primary hover:bg-primary hover:text-primary-foreground'
                      }
                      ${(!applyingTemplate?.weekday_2_meals_price && !applyingTemplate?.weekend_2_meals_price)
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                      }
                    `}
                  >
                    <div className="font-medium mb-1 group-hover:text-primary-foreground">一泊二食</div>
                    {applyingTemplate && (
                      <div className="text-sm space-y-1">
                        {applyingTemplate.weekday_2_meals_price && (
                          <div className={selectedPriceType === '2meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                            平日：<span className={`font-medium ${selectedPriceType === '2meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                              NT$ {applyingTemplate.weekday_2_meals_price.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {applyingTemplate.weekend_2_meals_price && (
                          <div className={selectedPriceType === '2meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                            假日：<span className={`font-medium ${selectedPriceType === '2meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                              NT$ {applyingTemplate.weekend_2_meals_price.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {!applyingTemplate.weekday_2_meals_price && !applyingTemplate.weekend_2_meals_price && (
                          <div className="text-xs text-muted-foreground">未設定</div>
                        )}
                      </div>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPriceType('3meals')}
                    disabled={!applyingTemplate?.weekday_3_meals_price && !applyingTemplate?.weekend_3_meals_price}
                    className={`
                      p-4 rounded-lg border-2 transition-all text-left group touch-manipulation
                      ${selectedPriceType === '3meals' 
                        ? 'border-primary bg-primary text-primary-foreground' 
                        : 'border-border hover:border-primary hover:bg-primary hover:text-primary-foreground'
                      }
                      ${(!applyingTemplate?.weekday_3_meals_price && !applyingTemplate?.weekend_3_meals_price)
                        ? 'opacity-50 cursor-not-allowed'
                        : 'cursor-pointer'
                      }
                    `}
                  >
                    <div className="font-medium mb-1 group-hover:text-primary-foreground">一泊三食</div>
                    {applyingTemplate && (
                      <div className="text-sm space-y-1">
                        {applyingTemplate.weekday_3_meals_price && (
                          <div className={selectedPriceType === '3meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                            平日：<span className={`font-medium ${selectedPriceType === '3meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                              NT$ {applyingTemplate.weekday_3_meals_price.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {applyingTemplate.weekend_3_meals_price && (
                          <div className={selectedPriceType === '3meals' ? 'text-primary-foreground/80' : 'text-muted-foreground group-hover:text-primary-foreground/80'}>
                            假日：<span className={`font-medium ${selectedPriceType === '3meals' ? 'text-primary-foreground' : 'text-foreground group-hover:text-primary-foreground'}`}>
                              NT$ {applyingTemplate.weekend_3_meals_price.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {!applyingTemplate.weekday_3_meals_price && !applyingTemplate.weekend_3_meals_price && (
                          <div className="text-xs text-muted-foreground">未設定</div>
                        )}
                      </div>
                    )}
                  </button>
                </div>
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
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors touch-manipulation ${
                          selectedRoomTypes.includes(roomType.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                        }`}
                        onClick={() => toggleRoomType(roomType.id)}
                      >
                        {selectedRoomTypes.includes(roomType.id) ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{roomType.name}</p>
                          <p className={`text-xs ${
                            selectedRoomTypes.includes(roomType.id)
                              ? 'text-primary-foreground/80'
                              : 'text-muted-foreground'
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

              {/* 可用房數設定 */}
              <div className="space-y-2">
                <Label htmlFor="available_rooms_desktop">可用房數 *</Label>
                <Input
                  id="available_rooms_desktop"
                  type="number"
                  min="0"
                  value={availableRooms}
                  onChange={(e) => setAvailableRooms(parseInt(e.target.value) || 0)}
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  設定每天的可用房數（庫存）
                </p>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => setApplyDialogOpen(false)}
                disabled={loadingPreview}
                className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation"
              >
                取消
              </Button>
              <Button 
                onClick={generatePreview}
                disabled={!dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0 || loadingPreview}
                className="w-full sm:w-auto h-11 sm:h-10 touch-manipulation gap-2"
              >
                {loadingPreview ? (
                  <>載入預覽中...</>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    預覽套用效果
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 套用記錄對話框 */}
      {isMobile ? (
        <Drawer open={showApplicationsDialog} onOpenChange={setShowApplicationsDialog}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>套用記錄</DrawerTitle>
              <DrawerDescription>
                {viewingApplicationsTemplate?.template_name}
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="px-4 space-y-3 overflow-y-auto">
              {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.map((app) => {
                const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
                const selectedDayLabels = app.selected_days.map(d => dayLabels[d]).join('、');
                
                return (
                  <Card key={app.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(app.applied_at), 'yyyy/MM/dd HH:mm')}
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
        <Dialog open={showApplicationsDialog} onOpenChange={setShowApplicationsDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>套用記錄</DialogTitle>
              <DialogDescription>
                {viewingApplicationsTemplate?.template_name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-3">
              {viewingApplicationsTemplate && templateApplications[viewingApplicationsTemplate.id]?.map((app) => {
                const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
                const selectedDayLabels = app.selected_days.map(d => dayLabels[d]).join('、');
                
                return (
                  <Card key={app.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {format(new Date(app.applied_at), 'yyyy/MM/dd HH:mm')}
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

      {/* 預覽對話框 */}
      {isMobile ? (
        <Drawer open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>套用預覽</DrawerTitle>
              <DrawerDescription>
                確認即將套用的價格明細
              </DrawerDescription>
            </DrawerHeader>
            
            <div className="px-4 space-y-4 overflow-y-auto pb-4">
              {/* 統計摘要 */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">總影響天數</div>
                  <div className="text-2xl font-bold text-primary">{previewData.length}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">新增/更新</div>
                  <div className="text-sm font-medium">
                    <span className="text-green-600">{previewData.filter(p => p.isNewRecord).length}</span>
                    {' / '}
                    <span className="text-blue-600">{previewData.filter(p => !p.isNewRecord).length}</span>
                  </div>
                </Card>
              </div>

              {/* 價格明細列表 */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">價格明細</h4>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {previewData.map((item, index) => (
                    <Card key={index} className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{item.roomTypeName}</div>
                          <div className={`px-2 py-0.5 rounded text-xs ${
                            item.isNewRecord ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.isNewRecord ? '新增' : '更新'}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{item.dateLabel}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              item.isWeekend ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              ({item.dayOfWeek})
                            </span>
                          </div>
                          <div className="font-bold text-primary">
                            NT$ {item.price.toLocaleString()}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.priceType}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
            
            <DrawerFooter className="flex-col gap-2">
              <Button 
                onClick={() => {
                  setShowPreviewDialog(false);
                  confirmApply();
                }}
                disabled={applying}
                className="w-full h-12"
              >
                {applying ? '套用中...' : '確認套用'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowPreviewDialog(false)}
                disabled={applying}
                className="w-full h-12"
              >
                返回修改
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>套用預覽</DialogTitle>
              <DialogDescription>
                確認即將套用的價格明細
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto">
              {/* 統計摘要 */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-2">總影響天數</div>
                  <div className="text-3xl font-bold text-primary">{previewData.length}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-2">新增記錄</div>
                  <div className="text-3xl font-bold text-green-600">
                    {previewData.filter(p => p.isNewRecord).length}
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-2">更新記錄</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {previewData.filter(p => !p.isNewRecord).length}
                  </div>
                </Card>
              </div>

              {/* 價格明細列表 */}
              <div className="space-y-3">
                <h4 className="font-medium">價格明細</h4>
                <div className="border rounded-lg max-h-[50vh] overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-sm font-medium">房型</th>
                        <th className="text-left p-3 text-sm font-medium">日期</th>
                        <th className="text-left p-3 text-sm font-medium">星期</th>
                        <th className="text-left p-3 text-sm font-medium">價格類型</th>
                        <th className="text-right p-3 text-sm font-medium">價格</th>
                        <th className="text-center p-3 text-sm font-medium">狀態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((item, index) => (
                        <tr key={index} className="border-t hover:bg-muted/30">
                          <td className="p-3 font-medium">{item.roomTypeName}</td>
                          <td className="p-3">{item.dateLabel}</td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              item.isWeekend ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {item.dayOfWeek}
                            </span>
                          </td>
                          <td className="p-3 text-sm">{item.priceType}</td>
                          <td className="p-3 text-right font-bold text-primary">
                            NT$ {item.price.toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              item.isNewRecord ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {item.isNewRecord ? '新增' : '更新'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowPreviewDialog(false)}
                disabled={applying}
                className="w-full sm:w-auto"
              >
                返回修改
              </Button>
              <Button 
                onClick={() => {
                  setShowPreviewDialog(false);
                  confirmApply();
                }}
                disabled={applying}
                className="w-full sm:w-auto"
              >
                {applying ? '套用中...' : '確認套用'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
