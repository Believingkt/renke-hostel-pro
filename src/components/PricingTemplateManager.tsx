import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, Trash2, Check, X, GripVertical } from "lucide-react";
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
import { z } from "zod";

interface PricingTemplate {
  id: string;
  template_name: string;
  description: string | null;
  price: number | null;
  weekday_price: number | null;
  weekend_price: number | null;
  available_rooms: number;
  meal_plans: any[];
  is_default: boolean;
  display_order: number;
  room_type_id?: string | null;
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
  weekday_price: z.number().int().min(0, "價格不能為負數").nullable(),
  weekend_price: z.number().int().min(0, "價格不能為負數").nullable(),
  available_rooms: z.number().int().min(0, "庫存量不能為負數"),
}).refine((data) => {
  return data.weekday_price != null || data.weekend_price != null;
}, {
  message: "請至少設定平日或假日價格",
  path: ["weekday_price"],
});

export const PricingTemplateManager = forwardRef<PricingTemplateManagerRef, PricingTemplateManagerProps>(function PricingTemplateManager({ accommodationId }, ref) {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PricingTemplate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<PricingTemplate | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  
  const [formData, setFormData] = useState({
    template_name: "",
    description: "",
    weekday_price: null as number | null,
    weekend_price: null as number | null,
    available_rooms: 1,
    room_type_id: "" as string,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (accommodationId) {
      loadTemplates();
      loadRoomTypes();
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
      
      const templatesData = (data || []).map(t => ({
        ...t,
        meal_plans: Array.isArray(t.meal_plans) ? t.meal_plans : []
      }));
      
      setTemplates(templatesData);
    } catch (error) {
      console.error('載入專案失敗:', error);
      toast.error('載入專案失敗');
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

  useImperativeHandle(ref, () => ({
    openAddDialog: () => handleAddNew(),
  }));

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormData({
      template_name: "",
      description: "",
      weekday_price: null,
      weekend_price: null,
      available_rooms: 1,
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
      weekday_price: template.weekday_price ?? template.price ?? null,
      weekend_price: template.weekend_price ?? null,
      available_rooms: (template as any).available_rooms ?? 1,
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
        weekday_price: formData.weekday_price,
        weekend_price: formData.weekend_price,
        price: formData.weekday_price, // 向後兼容
        available_rooms: formData.available_rooms,
        accommodation_id: accommodationId,
        room_type_id: formData.room_type_id || null,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('pricing_templates')
          .update(dataToSave)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast.success('專案已更新');
      } else {
        const { error } = await supabase
          .from('pricing_templates')
          .insert(dataToSave);

        if (error) throw error;
        toast.success('專案已創建');
      }

      setShowForm(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('儲存專案失敗:', error);
      toast.error('儲存專案失敗');
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
      toast.success('專案已刪除');
      loadTemplates();
    } catch (error) {
      console.error('刪除專案失敗:', error);
      toast.error('刪除專案失敗');
    } finally {
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
    }
  };

  interface SortableTemplateCardProps {
    template: PricingTemplate;
    onEdit: (template: PricingTemplate) => void;
    onDelete: (template: PricingTemplate) => void;
  }

  const SortableTemplateCard = ({ 
    template, 
    onEdit, 
    onDelete, 
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

    const weekdayPrice = template.weekday_price ?? template.price;
    const weekendPrice = template.weekend_price;
    const availRooms = (template as any).available_rooms ?? 1;

    return (
      <Card 
        ref={setNodeRef} 
        style={style} 
        className="group hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/30 overflow-hidden"
      >
        {/* 房型標籤 */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing touch-none opacity-40 group-hover:opacity-70 transition-opacity shrink-0"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-muted/60 text-xs font-medium text-muted-foreground">
            {template.room_type_id
              ? (roomTypes.find(r => r.id === template.room_type_id)?.name || '未知房型')
              : '所有房型'}
          </div>
        </div>

        {/* 標題 */}
        <div className="px-4 pt-1 pb-3">
          <div className="flex items-start justify-between gap-3 ml-6">
            <h4 className="font-bold text-base leading-snug truncate" title={template.template_name}>
              {template.template_name}
            </h4>
          </div>
          {template.description && template.description !== template.template_name && (
            <p className="text-sm text-muted-foreground mt-1 ml-6 line-clamp-2 leading-relaxed">{template.description}</p>
          )}
        </div>

        {/* 價格與庫存資訊 */}
        <div className="px-4 pb-3 ml-6">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">平日價格</span>
              <div className="font-semibold text-primary tabular-nums">
                {weekdayPrice != null ? `NT$ ${weekdayPrice.toLocaleString()}` : '未設定'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">假日價格</span>
              <div className="font-semibold text-primary tabular-nums">
                {weekendPrice != null ? `NT$ ${weekendPrice.toLocaleString()}` : '未設定'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">庫存量</span>
              <div className="font-semibold tabular-nums">
                {availRooms} 間
              </div>
            </div>
          </div>
        </div>

        {/* 分隔線 */}
        <div className="border-t border-border/40" />
        
        <CardContent className="p-3">
          {/* 操作按鈕 */}
          <div className="flex items-center gap-2 justify-end">
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
      
      const updatedTemplates = newTemplates.map((template, index) => ({
        ...template,
        display_order: index
      }));
      
      setTemplates(updatedTemplates);

      try {
        const updates = updatedTemplates.map((template) => 
          supabase
            .from('pricing_templates')
            .update({ display_order: template.display_order })
            .eq('id', template.id)
        );

        await Promise.all(updates);
        toast.success("專案順序已更新");
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error updating template order:', error);
        }
        toast.error("無法更新專案順序");
        loadTemplates();
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
              placeholder="描述此專案的用途"
              rows={2}
              className="min-h-[48px] text-base sm:text-sm touch-manipulation"
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* 平日價格 */}
          {/* 平日與假日價格（擇一必填） */}
          <div className="space-y-2">
            <Label>價格設定 <span className="text-xs text-muted-foreground font-normal">（擇一必填）</span></Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weekday_price" className="text-sm font-normal text-muted-foreground">平日價格</Label>
                <Input
                  id="weekday_price"
                  type="number"
                  min="0"
                  value={formData.weekday_price ?? ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    weekday_price: e.target.value ? parseInt(e.target.value) : null
                  })}
                  placeholder="請輸入平日價格"
                  className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">週日至週五的價格</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="weekend_price" className="text-sm font-normal text-muted-foreground">假日價格</Label>
              <Input
                id="weekend_price"
                type="number"
                min="0"
                value={formData.weekend_price ?? ""}
                onChange={(e) => setFormData({
                  ...formData,
                  weekend_price: e.target.value ? parseInt(e.target.value) : null
                })}
                placeholder="請輸入假日價格"
                className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">週六及國定假日的價格</p>
              {errors.weekend_price && (
                <p className="text-sm text-destructive">{errors.weekend_price}</p>
              )}
            </div>
          </div>

          {/* 庫存量 */}
          <div className="space-y-2">
            <Label htmlFor="available_rooms">庫存量 *</Label>
            <Input
              id="available_rooms"
              type="number"
              min="0"
              value={formData.available_rooms}
              onChange={(e) => setFormData({
                ...formData,
                available_rooms: parseInt(e.target.value) || 0
              })}
              placeholder="請輸入庫存量"
              className="h-12 text-base sm:h-10 sm:text-sm touch-manipulation"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">設定每天的可用房數</p>
            {errors.available_rooms && (
              <p className="text-sm text-destructive">{errors.available_rooms}</p>
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
        <CardContent className="pt-6">
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
                <p className="text-base sm:text-lg font-medium">尚無專案</p>
                <p className="text-xs sm:text-sm">建立第一個專案，設定平日與假日價格</p>
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
              確定要刪除專案「{deletingTemplate?.template_name}」嗎？此操作無法復原。
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
    </>
  );
});
