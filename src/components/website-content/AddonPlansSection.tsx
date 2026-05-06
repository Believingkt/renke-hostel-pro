import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ValidatedInput } from "@/components/ui/validated-input";
import { ValidatedNumberInput } from "@/components/ui/validated-number-input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

export interface AddonPlan {
  id?: string;
  addon_type: string;
  enabled: boolean;
  price_per_unit: number;
  min_quantity: number;
  max_quantity: number;
  weekday_min_quantity?: number;
  weekend_min_quantity?: number;
  unit_label: string;
  description?: string;
  detailed_description?: string;
}

interface AddonPlansSectionProps {
  addonPlans: AddonPlan[];
  onUpdate: (plans: AddonPlan[]) => void;
  onDelete: (addonType: string) => void;
  errors: Record<string, Record<string, string>>;
  onValidate: (addonType: string, fieldName: string, value: string) => void;
  onToggleEnabled?: (addonType: string, enabled: boolean) => Promise<void>;
  hideTopAddButton?: boolean;
  addDialogOpen?: boolean;
  onAddDialogOpenChange?: (open: boolean) => void;
}

const defaultNewPlan: Omit<AddonPlan, 'addon_type'> = {
  enabled: true,
  price_per_unit: 500,
  min_quantity: 0,
  max_quantity: 10,
  unit_label: "每次",
  description: "",
  detailed_description: ""
};

const getDisplayName = (addonType: string) => {
  switch (addonType) {
    case 'pet': return '寵物方案';
    case 'meal': return '餐食方案';
    default: return addonType;
  }
};

const getPriceLabel = (addonType: string) => {
  switch (addonType) {
    case 'pet': return '價格 (每隻/每晚)';
    case 'meal': return '價格 (每人/每日)';
    default: return '價格';
  }
};

const getMaxLabel = (addonType: string) => {
  switch (addonType) {
    case 'pet': return '數量上限 (隻)';
    case 'meal': return '數量上限 (人)';
    default: return '數量上限';
  }
};

const isMealPlan = (addonType: string) => addonType === 'meal';

interface SortablePlanCardProps {
  plan: AddonPlan;
  index: number;
  planErrors: Record<string, string>;
  onUpdate: (index: number, updates: Partial<AddonPlan>) => void;
  onValidate: (addonType: string, fieldName: string, value: string) => void;
  onToggleEnabled?: (addonType: string, enabled: boolean) => Promise<void>;
  onDeleteClick: (addonType: string) => void;
}

const SortablePlanCard = ({
  plan,
  index,
  planErrors,
  onUpdate,
  onValidate,
  onToggleEnabled,
  onDeleteClick,
}: SortablePlanCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.addon_type });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={isDragging ? 'shadow-lg ring-2 ring-primary/20' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded transition-colors touch-manipulation -ml-1.5"
                aria-label="拖曳排序"
              >
                <GripVertical className="h-5 w-5 text-muted-foreground" />
              </button>
              <span>{getDisplayName(plan.addon_type)}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${plan.addon_type}-enabled`} className="text-sm font-normal">
                  啟用
                </Label>
                <Switch
                  id={`${plan.addon_type}-enabled`}
                  checked={plan.enabled}
                  onCheckedChange={(checked) => {
                    onUpdate(index, { enabled: checked });
                    onToggleEnabled?.(plan.addon_type, checked);
                  }}
                  className="touch-manipulation"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDeleteClick(plan.addon_type)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <ValidatedNumberInput
              label={getPriceLabel(plan.addon_type)}
              prefix="NT$"
              value={plan.price_per_unit}
              error={planErrors.price_per_unit}
              min="0"
              disabled={!plan.enabled}
              onChange={(value) => onUpdate(index, { price_per_unit: value })}
              onValidate={(value) => onValidate(plan.addon_type, 'price_per_unit', value)}
            />
            <ValidatedNumberInput
              label={getMaxLabel(plan.addon_type)}
              value={plan.max_quantity}
              error={planErrors.max_quantity}
              min="1"
              disabled={!plan.enabled}
              onChange={(value) => onUpdate(index, { max_quantity: value })}
              onValidate={(value) => onValidate(plan.addon_type, 'max_quantity', value)}
            />
          </div>

          {isMealPlan(plan.addon_type) && (
            <div className="grid grid-cols-2 gap-6">
              <ValidatedNumberInput
                label="平日基本人數"
                value={plan.weekday_min_quantity || 0}
                error={planErrors.weekday_min_quantity}
                min="0"
                disabled={!plan.enabled}
                onChange={(value) => onUpdate(index, { weekday_min_quantity: value })}
                onValidate={(value) => onValidate(plan.addon_type, 'weekday_min_quantity', value)}
              />
              <ValidatedNumberInput
                label="假日基本人數"
                value={plan.weekend_min_quantity || 0}
                error={planErrors.weekend_min_quantity}
                min="0"
                disabled={!plan.enabled}
                onChange={(value) => onUpdate(index, { weekend_min_quantity: value })}
                onValidate={(value) => onValidate(plan.addon_type, 'weekend_min_quantity', value)}
              />
            </div>
          )}

          <ValidatedInput
            label="簡短說明"
            placeholder="例如：每隻寵物、每人每日"
            value={plan.unit_label}
            error={planErrors.unit_label}
            maxLength={100}
            showCharCount
            disabled={!plan.enabled}
            onChange={(value) => onUpdate(index, { unit_label: value })}
            onValidate={(value) => onValidate(plan.addon_type, 'unit_label', value)}
          />

          <div className="space-y-2">
            <Label>詳細說明（顯示在前台「詳細內容」按鈕中）</Label>
            <RichTextEditor
              value={plan.detailed_description || ""}
              onChange={(value) => onUpdate(index, { detailed_description: value })}
              placeholder="請輸入方案的詳細說明，包含注意事項、規則等..."
              error={planErrors.detailed_description}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const AddonPlansSection = ({
  addonPlans,
  onUpdate,
  onDelete,
  errors,
  onValidate,
  onToggleEnabled,
  hideTopAddButton = false,
  addDialogOpen,
  onAddDialogOpenChange,
}: AddonPlansSectionProps) => {
  const isMobile = useIsMobile();
  const [internalAddDialogOpen, setInternalAddDialogOpen] = useState(false);
  const isAddDialogOpen = addDialogOpen ?? internalAddDialogOpen;
  const setIsAddDialogOpen = (open: boolean) => {
    if (onAddDialogOpenChange) onAddDialogOpenChange(open);
    else setInternalAddDialogOpen(open);
  };
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanNameError, setNewPlanNameError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = addonPlans.findIndex(p => p.addon_type === active.id);
    const newIndex = addonPlans.findIndex(p => p.addon_type === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onUpdate(arrayMove(addonPlans, oldIndex, newIndex));
  };

  const handleAddPlan = () => {
    if (!newPlanName.trim()) {
      setNewPlanNameError("方案名稱不能為空");
      return;
    }
    const normalizedType = newPlanName.trim().toLowerCase();
    const isDuplicate = addonPlans.some(
      plan => plan.addon_type.toLowerCase() === normalizedType
    );
    if (isDuplicate) {
      setNewPlanNameError("已存在相同名稱的方案");
      return;
    }
    const newPlan: AddonPlan = { ...defaultNewPlan, addon_type: newPlanName.trim() };
    onUpdate([...addonPlans, newPlan]);
    setIsAddDialogOpen(false);
    setNewPlanName("");
    setNewPlanNameError("");
  };

  const handleUpdatePlan = (index: number, updates: Partial<AddonPlan>) => {
    const updatedPlans = [...addonPlans];
    updatedPlans[index] = { ...updatedPlans[index], ...updates };
    onUpdate(updatedPlans);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDelete(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const AddDialog = isMobile ? (
    <Drawer open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>新增加購方案</DrawerTitle>
          <DrawerDescription>請輸入新加購方案的名稱</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 py-2">
          <ValidatedInput
            label="方案名稱"
            placeholder="例如：接送服務、烤肉方案"
            value={newPlanName}
            error={newPlanNameError}
            onChange={(value) => { setNewPlanName(value); setNewPlanNameError(""); }}
          />
        </div>
        <DrawerFooter>
          <Button onClick={handleAddPlan}>新增</Button>
          <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  ) : (
    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增加購方案</DialogTitle>
          <DialogDescription>請輸入新加購方案的名稱</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ValidatedInput
            label="方案名稱"
            placeholder="例如：接送服務、烤肉方案"
            value={newPlanName}
            error={newPlanNameError}
            onChange={(value) => { setNewPlanName(value); setNewPlanNameError(""); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>取消</Button>
          <Button onClick={handleAddPlan}>新增</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      {!hideTopAddButton && (
        <div className="flex justify-end">
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            新增加購方案
          </Button>
        </div>
      )}

      {addonPlans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground mb-4">尚無加購方案</p>
            <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              新增第一個方案
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={addonPlans.map(p => p.addon_type)} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {addonPlans.map((plan, index) => (
                <SortablePlanCard
                  key={plan.addon_type}
                  plan={plan}
                  index={index}
                  planErrors={errors[plan.addon_type] || {}}
                  onUpdate={handleUpdatePlan}
                  onValidate={onValidate}
                  onToggleEnabled={onToggleEnabled}
                  onDeleteClick={setDeleteTarget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {AddDialog}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除此方案？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後將無法復原，已使用此方案的訂單不會受到影響。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              確定刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
