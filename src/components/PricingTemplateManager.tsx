import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Check, X, CheckSquare, Square, CalendarCheck } from "lucide-react";
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

interface RoomType {
  id: string;
  name: string;
  room_count: number | null;
}

interface PricingTemplateManagerProps {
  accommodationId: string;
}

const templateSchema = z.object({
  template_name: z.string().trim().min(1, "模板名稱不能為空").max(50, "模板名稱最多50字"),
  description: z.string().trim().max(200, "描述最多200字").optional(),
  weekday_price: z.number().int().min(0).optional().nullable(),
  weekend_price: z.number().int().min(0).optional().nullable(),
  weekday_2_meals_price: z.number().int().min(0).optional().nullable(),
  weekday_3_meals_price: z.number().int().min(0).optional().nullable(),
  weekend_2_meals_price: z.number().int().min(0).optional().nullable(),
  weekend_3_meals_price: z.number().int().min(0).optional().nullable(),
}).refine((data) => {
  // 至少要填寫一組完整的價格（平日+假日）
  const hasBasicPrice = data.weekday_price != null && data.weekend_price != null;
  const has2MealsPrice = data.weekday_2_meals_price != null && data.weekend_2_meals_price != null;
  const has3MealsPrice = data.weekday_3_meals_price != null && data.weekend_3_meals_price != null;
  return hasBasicPrice || has2MealsPrice || has3MealsPrice;
}, {
  message: "至少要填寫一組完整的價格（無附餐食、一泊二食或一泊三食的平日和假日價格）",
  path: ["weekday_price"],
});

export function PricingTemplateManager({ accommodationId }: PricingTemplateManagerProps) {
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
  
  const [formData, setFormData] = useState({
    template_name: "",
    description: "",
    weekday_price: null as number | null,
    weekend_price: null as number | null,
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

  const handleAddNew = () => {
    setEditingTemplate(null);
    setFormData({
      template_name: "",
      description: "",
      weekday_price: null,
      weekend_price: null,
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
      weekday_price: template.weekday_price,
      weekend_price: template.weekend_price,
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
    setApplyDialogOpen(true);
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

  const confirmApply = async () => {
    if (!applyingTemplate || !dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0) {
      toast.error('請選擇日期範圍和房型');
      return;
    }

    try {
      setApplying(true);
      const dates = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      
      // 為每個選擇的房型和日期創建記錄
      const records = [];
      for (const roomTypeId of selectedRoomTypes) {
        for (const date of dates) {
          const weekend = isWeekend(date);
          records.push({
            room_type_id: roomTypeId,
            date: format(date, 'yyyy-MM-dd'),
            price: weekend ? applyingTemplate.weekend_price : applyingTemplate.weekday_price,
            available_rooms: availableRooms,
            is_available: true,
          });
        }
      }

      // 批量插入（使用 upsert 避免重複）
      const { error } = await supabase
        .from('room_inventory_pricing')
        .upsert(records, { 
          onConflict: 'room_type_id,date',
          ignoreDuplicates: false 
        });

      if (error) throw error;
      
      toast.success(`已成功套用價格模板到 ${selectedRoomTypes.length} 個房型的 ${dates.length} 天`);
      setApplyDialogOpen(false);
      setApplyingTemplate(null);
    } catch (error) {
      console.error('套用價格模板失敗:', error);
      toast.error('套用價格模板失敗');
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
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          <div className="border rounded-lg p-4 bg-muted/50">
            <h4 className="font-medium mb-2">價格設定</h4>
            <p className="text-sm text-muted-foreground mb-4">至少填寫一組完整價格（無附餐食/一泊二食/一泊三食的平日+假日）</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground"></th>
                    <th className="text-center py-3 px-2 font-medium">平日</th>
                    <th className="text-center py-3 px-2 font-medium">假日</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-2 font-medium">無附餐食</td>
                    <td className="py-3 px-2">
                      <Input
                        id="weekday_price"
                        type="number"
                        min="0"
                        value={formData.weekday_price ?? ""}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          weekday_price: e.target.value ? parseInt(e.target.value) : null 
                        })}
                        placeholder="選填"
                        className="text-center"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <Input
                        id="weekend_price"
                        type="number"
                        min="0"
                        value={formData.weekend_price ?? ""}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          weekend_price: e.target.value ? parseInt(e.target.value) : null 
                        })}
                        placeholder="選填"
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-3 px-2 font-medium">一泊二食</td>
                    <td className="py-3 px-2">
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
                        className="text-center"
                      />
                    </td>
                    <td className="py-3 px-2">
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
                        className="text-center"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-medium">一泊三食</td>
                    <td className="py-3 px-2">
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
                        className="text-center"
                      />
                    </td>
                    <td className="py-3 px-2">
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
                        className="text-center"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {errors.weekday_price && (
              <p className="text-sm text-destructive mt-2">{errors.weekday_price}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSubmit} className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              {editingTemplate ? '更新' : '新增'}
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="flex items-center gap-2"
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>價格模板</CardTitle>
              <CardDescription>
                建立並管理可重複使用的價格方案
              </CardDescription>
            </div>
            <Button onClick={handleAddNew} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新增模板
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
              <div className="text-center space-y-2">
                <p className="text-lg font-medium">尚無價格模板</p>
                <p className="text-sm">建立第一個價格模板，快速套用到房型</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <Card key={template.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg mb-1">{template.template_name}</h4>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-3">{template.description}</p>
                        )}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">平日：</span>
                            <span className="font-bold text-primary ml-1">
                              NT$ {template.weekday_price.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">假日：</span>
                            <span className="font-bold text-primary ml-1">
                              NT$ {template.weekend_price.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleApply(template)}
                          className="gap-2"
                        >
                          <CalendarCheck className="h-4 w-4" />
                          套用
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          onClick={() => handleDelete(template)}
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

      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>套用價格模板</DialogTitle>
            <DialogDescription>
              將「{applyingTemplate?.template_name}」套用到選定的房型和日期範圍
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* 日期範圍選擇 */}
            <div className="space-y-2">
              <Label>選擇日期範圍 *</Label>
              <DateRangePicker 
                dateRange={dateRange} 
                onDateRangeChange={setDateRange}
                className="w-full"
              />
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
                      className="flex items-center gap-3 p-3 hover:bg-accent rounded-lg cursor-pointer transition-colors"
                      onClick={() => toggleRoomType(roomType.id)}
                    >
                      {selectedRoomTypes.includes(roomType.id) ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{roomType.name}</p>
                        <p className="text-xs text-muted-foreground">
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
              />
              <p className="text-xs text-muted-foreground">
                設定每天的可用房數（庫存）
              </p>
            </div>

            {/* 價格預覽 */}
            {applyingTemplate && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium text-sm">套用的價格</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">平日：</span>
                    <span className="font-bold text-primary ml-1">
                      NT$ {applyingTemplate.weekday_price.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">假日：</span>
                    <span className="font-bold text-primary ml-1">
                      NT$ {applyingTemplate.weekend_price.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setApplyDialogOpen(false)}
              disabled={applying}
            >
              取消
            </Button>
            <Button 
              onClick={confirmApply}
              disabled={!dateRange?.from || !dateRange?.to || selectedRoomTypes.length === 0 || applying}
            >
              {applying ? '套用中...' : '確認套用'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
