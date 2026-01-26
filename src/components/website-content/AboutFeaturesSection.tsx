import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, GripVertical, Mountain, Sparkles, UserCheck, Camera, Home, Heart, Star, Wifi, Coffee, Car, Users, PartyPopper, Utensils, Flame, Baby, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { Button } from "@/components/ui/button";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedTextarea } from "@/components/ui/validated-textarea";
import { DraftRestoreBanner } from "@/components/ui/draft-restore-banner";
import { useFormDraft } from "@/hooks/use-form-draft";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { aboutSectionSchema } from "@/utils/websiteValidation";

// 圖示對照表
const ICON_MAP: Record<string, LucideIcon> = {
  Mountain,
  Sparkles,
  UserCheck,
  Camera,
  Home,
  Heart,
  Star,
  Wifi,
  Coffee,
  Car,
  Users,
  PartyPopper,
  Utensils,
  Flame,
  Baby,
};

interface AboutFeaturesSectionProps {
  accommodationId: string;
  sectionTitle: string;
  sectionDescription: string;
  features: any[];
  onUpdate: () => void;
  onEditFeature: (feature: any) => void;
  onDeleteFeature: (featureId: string) => void;
  onAddFeature: () => void;
}

const SortableFeatureItem = ({ feature, onEdit, onDelete }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: feature.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getIconComponent = () => {
    if (feature.icon_type === 'lucide' && feature.icon_name) {
      const IconComponent = ICON_MAP[feature.icon_name];
      if (IconComponent) {
        return <IconComponent className="w-6 h-6 text-primary" />;
      }
    }
    // 預設顯示 Mountain 圖示
    return <Mountain className="w-6 h-6 text-primary" />;
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded transition-colors flex-shrink-0"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            {feature.icon_type === 'lucide' ? (
              getIconComponent()
            ) : feature.icon_url ? (
              <img src={feature.icon_url} alt="圖示" className="w-6 h-6 object-contain" />
            ) : (
              <Mountain className="w-6 h-6 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{feature.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{feature.description}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(feature)}
              className="h-10 w-10 sm:h-8 sm:w-8 touch-manipulation"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost-destructive"
              onClick={() => onDelete(feature.id)}
              className="h-10 w-10 sm:h-8 sm:w-8 touch-manipulation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AboutFeaturesSection = ({
  accommodationId,
  sectionTitle,
  sectionDescription,
  features,
  onUpdate,
  onEditFeature,
  onDeleteFeature,
  onAddFeature,
}: AboutFeaturesSectionProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [localFeatures, setLocalFeatures] = useState(features);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 使用草稿功能
  const {
    formData,
    setFormData,
    hasDraft,
    restoreDraft,
    discardDraft,
    clearDraft,
  } = useFormDraft({
    key: `about-features-draft-${accommodationId}`,
    initialData: {
      sectionTitle,
      sectionDescription,
    },
  });

  // 同步 props 到 state（僅在 props 改變且無草稿時）
  useEffect(() => {
    if (!hasDraft) {
      setFormData({
        sectionTitle,
        sectionDescription,
      });
    }
  }, [sectionTitle, sectionDescription, hasDraft]);

  useEffect(() => {
    setLocalFeatures(features);
  }, [features]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localFeatures.findIndex((f) => f.id === active.id);
      const newIndex = localFeatures.findIndex((f) => f.id === over.id);

      const newOrder = arrayMove(localFeatures, oldIndex, newIndex);
      setLocalFeatures(newOrder);

      try {
        const updates = newOrder.map((feature, index) => ({
          id: feature.id,
          display_order: index,
        }));

        for (const update of updates) {
          await supabase
            .from("about_features")
            .update({ display_order: update.display_order })
            .eq("id", update.id);
        }

        toast.success("順序已更新");
        onUpdate();
      } catch (error) {
        console.error("Error updating order:", error);
        toast.error("更新順序失敗");
        setLocalFeatures(features);
      }
    }
  };

  const validateField = (field: string, value: string) => {
    try {
      aboutSectionSchema.shape[field as keyof typeof aboutSectionSchema.shape].parse(value);
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    } catch (error: any) {
      if (error.errors?.[0]) {
        setErrors(prev => ({ ...prev, [field]: error.errors[0].message }));
      }
    }
  };

  const handleSave = async () => {
    if (!accommodationId) return;

    // 完整表單驗證
    const validationResult = aboutSectionSchema.safeParse(formData);

    if (!validationResult.success) {
      const newErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(newErrors);
      toast.error('請修正表單錯誤後再試');
      return;
    }
    
    setIsSaving(true);
    try {
      // 先檢查是否已存在記錄
      const { data: existingData } = await supabase
        .from("about_section")
        .select("id")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();

      if (existingData) {
        // 更新現有記錄
        const { error } = await supabase
          .from("about_section")
          .update({
            section_title: formData.sectionTitle,
            section_description: formData.sectionDescription,
          })
          .eq("accommodation_id", accommodationId);

        if (error) throw error;
      } else {
        // 插入新記錄
        const { error } = await supabase
          .from("about_section")
          .insert({
            accommodation_id: accommodationId,
            section_title: formData.sectionTitle,
            section_description: formData.sectionDescription,
          });

        if (error) throw error;
      }

      // 清除草稿
      clearDraft();

      toast.success('特色說明已儲存');
      setErrors({});
      onUpdate();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error saving about features:", error);
      }
      toast.error('儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      {hasDraft && (
        <div className="p-6 pb-0">
          <DraftRestoreBanner onRestore={restoreDraft} onDiscard={discardDraft} />
        </div>
      )}
      <CardHeader>
        <CardTitle>特色說明</CardTitle>
        <CardDescription>
          設定特色區塊（最多 4 個）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 特色說明主標題 */}
        <ValidatedInput
          id="section-title"
          label="特色說明主標題"
          value={formData.sectionTitle}
          onChange={(value) => setFormData({ sectionTitle: value })}
          onValidate={(value) => validateField('sectionTitle', value)}
          error={errors.sectionTitle}
          placeholder="例如：自然中的秘境 X 宿泊空間"
          showCharCount
          maxLength={50}
        />

        {/* 特色說明文字 */}
        <ValidatedTextarea
          id="section-description"
          label="特色說明文字"
          value={formData.sectionDescription || ''}
          onChange={(value) => {
            setFormData({ sectionDescription: value });
            validateField('sectionDescription', value);
          }}
          onValidate={(value) => validateField('sectionDescription', value)}
          error={errors.sectionDescription}
          placeholder="簡短描述您住宿的特色..."
          rows={4}
          showCharCount
          maxLength={300}
        />

        {/* 特色區塊列表 */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>特色區塊（最多 4 個）</Label>
              <Button
                size="sm"
                onClick={onAddFeature}
                disabled={localFeatures.length >= 4}
                className="h-10 sm:h-9 touch-manipulation"
              >
                <Plus className="h-4 w-4 mr-2" />
                新增特色
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              可拖曳調整順序
            </p>
          </div>

          {localFeatures.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localFeatures.map(f => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {localFeatures.map((feature) => (
                    <SortableFeatureItem
                      key={feature.id}
                      feature={feature}
                      onEdit={onEditFeature}
                      onDelete={onDeleteFeature}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                點擊「新增特色」來新增第一個特色區塊
              </CardContent>
            </Card>
          )}
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={isSaving} />
      </CardContent>
    </Card>
  );
};
