import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { Button } from "@/components/ui/button";
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
import { icons } from "lucide-react";

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
      const IconComponent = icons[feature.icon_name as keyof typeof icons];
      if (IconComponent) {
        return <IconComponent className="w-6 h-6 text-primary" />;
      }
    }
    return null;
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
              getIconComponent() || <span className="text-primary text-sm">{feature.icon_name}</span>
            ) : feature.icon_url ? (
              <img src={feature.icon_url} alt="圖示" className="w-6 h-6 object-contain" />
            ) : (
              <span className="text-muted-foreground text-xs">無</span>
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
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(feature.id)}
              className="text-destructive hover:text-destructive"
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
  const [title, setTitle] = useState(sectionTitle);
  const [description, setDescription] = useState(sectionDescription);
  const [localFeatures, setLocalFeatures] = useState(features);

  // 同步 props 到 state
  useEffect(() => {
    setTitle(sectionTitle);
  }, [sectionTitle]);

  useEffect(() => {
    setDescription(sectionDescription);
  }, [sectionDescription]);

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

  const handleSave = async () => {
    if (!accommodationId) return;
    
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
            section_title: title,
            section_description: description,
          })
          .eq("accommodation_id", accommodationId);

        if (error) throw error;
      } else {
        // 插入新記錄
        const { error } = await supabase
          .from("about_section")
          .insert({
            accommodation_id: accommodationId,
            section_title: title,
            section_description: description,
          });

        if (error) throw error;
      }

      toast.success('特色說明已儲存');
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
      <CardHeader>
        <CardTitle>特色說明</CardTitle>
        <CardDescription>
          設定特色區塊（最多 4 個）
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 特色說明主標題 */}
        <div className="space-y-2">
          <Label htmlFor="section-title">特色說明主標題</Label>
          <Input
            id="section-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：自然中的秘境 X 宿泊空間"
          />
        </div>

        {/* 特色說明文字 */}
        <div className="space-y-2">
          <Label htmlFor="section-description">特色說明文字</Label>
          <Textarea
            id="section-description"
            value={description || ''}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="簡短描述您住宿的特色..."
            rows={3}
          />
        </div>

        {/* 特色區塊列表 */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>特色區塊（最多 4 個）</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={onAddFeature}
                disabled={localFeatures.length >= 4}
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
                items={localFeatures.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
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
            <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
              尚無特色區塊，點擊上方按鈕新增
            </p>
          )}
        </div>

        <SaveButtonContainer onSave={handleSave} isSaving={isSaving} />
      </CardContent>
    </Card>
  );
};
