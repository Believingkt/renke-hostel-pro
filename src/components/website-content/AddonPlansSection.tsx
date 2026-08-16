import { useState } from "react";
import { Plus, Trash2, GripVertical, Pencil, Wand2, EyeOff } from "lucide-react";
import {
  ADDON_ICON_OPTIONS,
  DEFAULT_ADDON_ICON_LABEL,
  addonIconSource,
  resolveAddonIcon,
} from "@/lib/addonIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ADDON_COPY_TEMPLATES, type AddonCopyTemplate } from "@/constants/addonCopyTemplates";

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
import { AddonPlanPreview } from "./AddonPlanPreview";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


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
  pricing_mode?: 'per_night' | 'per_stay';
  description?: string;
  detailed_description?: string;
  icon_key?: string | null;
  show_icon?: boolean;
  auto_include?: boolean;
  is_locked?: boolean;
  show_on_frontend?: boolean;
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
  unit_label: "份",
  pricing_mode: "per_night",
  description: "",
  detailed_description: "",
  icon_key: null,
  show_icon: true,
  auto_include: false,
  is_locked: false,
  show_on_frontend: true,
};


const getDisplayName = (addonType: string) => addonType;

const getPriceLabel = (_addonType: string) => '價格';

const getMaxLabel = (_addonType: string) => '數量上限';

interface SortablePlanCardProps {
  plan: AddonPlan;
  index: number;
  planErrors: Record<string, string>;
  onUpdate: (index: number, updates: Partial<AddonPlan>) => void;
  onValidate: (addonType: string, fieldName: string, value: string) => void;
  onToggleEnabled?: (addonType: string, enabled: boolean) => Promise<void>;
  onDeleteClick: (addonType: string) => void;
  onRenameClick: (addonType: string) => void;
  onApplyTemplate: (index: number, tpl: AddonCopyTemplate) => void;

}

const SortablePlanCard = ({
  plan,
  index,
  planErrors,
  onUpdate,
  onValidate,
  onToggleEnabled,
  onDeleteClick,
  onRenameClick,
  onApplyTemplate,

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

  const canRename = true;

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
              {canRename && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => onRenameClick(plan.addon_type)}
                  aria-label="編輯方案名稱"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor={`${plan.addon_type}-frontend`} className="text-sm font-normal">
                  前台顯示
                </Label>
                <Switch
                  id={`${plan.addon_type}-frontend`}
                  checked={plan.show_on_frontend !== false}
                  disabled={!plan.enabled}
                  onCheckedChange={(checked) => onUpdate(index, { show_on_frontend: checked })}
                  className="touch-manipulation"
                />
              </div>
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
        <CardContent className="space-y-4">
          {/* 核心設定：一列搞定計價與數量 */}
          <div className="grid grid-cols-2 md:grid-cols-12 gap-3">
            <div className="col-span-2 md:col-span-2">
              <ValidatedInput
                label="單位詞"
                placeholder="人 / 隻 / 份"
                value={plan.unit_label}
                error={planErrors.unit_label}
                maxLength={100}
                disabled={!plan.enabled}
                onChange={(value) => onUpdate(index, { unit_label: value })}
                onValidate={(value) => onValidate(plan.addon_type, 'unit_label', value)}
              />
            </div>
            <div className="col-span-2 md:col-span-4 space-y-1.5">
              <Label className="text-sm">計價方式</Label>
              <Select
                value={plan.pricing_mode || "per_night"}
                disabled={!plan.enabled}
                onValueChange={(value) => onUpdate(index, { pricing_mode: value as 'per_night' | 'per_stay' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-50">
                  <SelectItem value="per_night">每晚計算（× 晚數）</SelectItem>
                  <SelectItem value="per_stay">單次計算（不乘晚數）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 md:col-span-2">
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
            </div>
            <div className="col-span-1 md:col-span-2">
              <ValidatedNumberInput
                label="數量下限"
                value={plan.min_quantity ?? 0}
                error={planErrors.min_quantity}
                min="0"
                disabled={!plan.enabled}
                onChange={(value) => onUpdate(index, { min_quantity: value })}
                onValidate={(value) => onValidate(plan.addon_type, 'min_quantity', value)}
              />
            </div>
            <div className="col-span-1 md:col-span-2">
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
          </div>




          {/* 進階設定收合，避免卡片過長 */}
          <Accordion type="multiple" className="w-full border-t pt-1">
            <AccordionItem value="behavior" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                訂單行為
                <span className="ml-auto mr-2 text-xs font-normal text-muted-foreground">
                  {plan.auto_include ? (plan.is_locked ? "自動帶入・不可取消" : "自動帶入") : "手動選購"}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="text-sm">自動帶入新訂單</Label>
                    <p className="text-xs text-muted-foreground">
                      前台下訂與後台建立新訂單時自動帶入（數量取下限，未設定則 1）。
                    </p>
                  </div>
                  <Switch
                    checked={plan.auto_include === true}
                    disabled={!plan.enabled}
                    onCheckedChange={(checked) =>
                      onUpdate(index, { auto_include: checked, ...(checked ? {} : { is_locked: false }) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label className="text-sm">客人不可取消</Label>
                    <p className="text-xs text-muted-foreground">
                      前台無法把數量減到低於下限（例如清潔費為必收項目）。
                    </p>
                  </div>
                  <Switch
                    checked={plan.is_locked === true}
                    disabled={!plan.enabled || plan.auto_include !== true}
                    onCheckedChange={(checked) => onUpdate(index, { is_locked: checked })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  「自動帶入」只對新訂單生效；後台編輯既有訂單不會自動追加。數量下限設定後，第一次加購會直接帶入此數量，低於下限則自動歸零取消。
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="icon" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">前台圖示</AccordionTrigger>
              <AccordionContent className="pt-1">
                {(() => {
                  const showIcon = plan.show_icon !== false;
                  const iconKey = plan.icon_key ?? null;
                  const source = addonIconSource(iconKey, plan.addon_type);
                  const PreviewIcon = resolveAddonIcon(iconKey, plan.addon_type);
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Select
                          value={iconKey ?? "auto"}
                          disabled={!plan.enabled || !showIcon}
                          onValueChange={(value) => onUpdate(index, { icon_key: value === "auto" ? null : value })}
                        >
                          <SelectTrigger className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper" className="z-50">
                            <div className="max-h-64 overflow-y-auto overscroll-contain">
                              <SelectItem value="auto">自動（依方案名稱判斷）</SelectItem>
                              {ADDON_ICON_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  <span className="inline-flex items-center gap-2">
                                    <opt.icon className="h-4 w-4" />
                                    {opt.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </div>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2 shrink-0">
                          <Label htmlFor={`${plan.addon_type}-show-icon`} className="text-sm font-normal">
                            顯示圖示
                          </Label>
                          <Switch
                            id={`${plan.addon_type}-show-icon`}
                            checked={showIcon}
                            disabled={!plan.enabled}
                            onCheckedChange={(checked) => onUpdate(index, { show_icon: checked })}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2">
                        {showIcon ? (
                          <PreviewIcon className="h-4 w-4 text-primary shrink-0" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm font-semibold truncate">{plan.addon_type}</span>
                        <span className="ml-auto text-xs text-muted-foreground shrink-0">
                          {!showIcon
                            ? "前台不顯示圖示"
                            : source === "manual"
                              ? "使用手動指定圖示"
                              : source === "auto"
                                ? "已依名稱自動配對圖示"
                                : `找不到對應圖示，使用預設圖：${DEFAULT_ADDON_ICON_LABEL}`}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="detail" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">詳細說明</AccordionTrigger>
              <AccordionContent className="space-y-2 pt-1">
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={!plan.enabled}>
                        <Wand2 className="h-3.5 w-3.5" />
                        一鍵套用文案範本
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 bg-popover z-50">
                      <DropdownMenuLabel>選擇範本</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {ADDON_COPY_TEMPLATES.map((tpl) => (
                        <DropdownMenuItem
                          key={tpl.id}
                          className="flex-col items-start gap-0.5"
                          onSelect={() => onApplyTemplate(index, tpl)}
                        >
                          <span className="text-sm">{tpl.label}</span>
                          <span className="text-xs text-muted-foreground">{tpl.hint}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <RichTextEditor
                  value={plan.detailed_description || ""}
                  onChange={(value) => onUpdate(index, { detailed_description: value })}
                  placeholder="請輸入方案的詳細說明，包含注意事項、規則等..."
                  error={planErrors.detailed_description}
                />

                <p className="text-xs text-muted-foreground">
                  規則、注意事項、包含內容都放這裡，不要寫進方案名稱或單位欄位。套用範本會一併覆寫「單位詞」。
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="preview" className="border-b-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">結帳頁預覽</AccordionTrigger>
              <AccordionContent className="pt-1">
                <AddonPlanPreview plan={plan} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");

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

  // 舊版專屬欄位（orders.pet_plan_price / meal_plan_total）已停用，
  // 新方案一律走 custom_addon_details，因此保留字不可再被使用。
  const RESERVED_ADDON_TYPES = ["pet", "meal", "bbq"];
  const reservedError = "「pet / meal / bbq」為系統保留名稱，請改用其他名稱（例如：寵物入住、烤肉方案）";

  const handleAddPlan = () => {
    if (!newPlanName.trim()) {
      setNewPlanNameError("方案名稱不能為空");
      return;
    }
    const normalizedType = newPlanName.trim().toLowerCase();
    if (RESERVED_ADDON_TYPES.includes(normalizedType)) {
      setNewPlanNameError(reservedError);
      return;
    }
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


  const handleApplyTemplate = (index: number, tpl: AddonCopyTemplate) => {
    const updatedPlans = [...addonPlans];
    updatedPlans[index] = { ...updatedPlans[index], ...tpl.values };
    onUpdate(updatedPlans);
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

  const handleRenameClick = (addonType: string) => {
    setRenameTarget(addonType);
    setRenameValue(addonType);
    setRenameError("");
  };

  const handleConfirmRename = () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("方案名稱不能為空");
      return;
    }
    if (trimmed === renameTarget) {
      setRenameTarget(null);
      return;
    }
    const normalized = trimmed.toLowerCase();
    const isDuplicate = addonPlans.some(
      p => p.addon_type !== renameTarget && p.addon_type.toLowerCase() === normalized
    );
    if (isDuplicate) {
      setRenameError("已存在相同名稱的方案");
      return;
    }
    const updated = addonPlans.map(p =>
      p.addon_type === renameTarget ? { ...p, addon_type: trimmed } : p
    );
    onUpdate(updated);
    setRenameTarget(null);
  };

  const AddDialog = isMobile ? (
    <Drawer open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>新增增值服務</DrawerTitle>
          <DrawerDescription>請輸入新增值服務的名稱</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 py-2">
          <ValidatedInput
            label="方案名稱"
            placeholder="例如：接送服務、烤肉方案"
            value={newPlanName}
            error={newPlanNameError}
            onChange={(value) => { setNewPlanName(value); setNewPlanNameError(""); }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            只填方案名稱（例：不加床加備品）。名稱不要放「NT$ 800 /」等價格前綴，價格請填在下方價格欄位。
          </p>
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
          <DialogTitle>新增增值服務</DialogTitle>
          <DialogDescription>請輸入新增值服務的名稱</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ValidatedInput
            label="方案名稱"
            placeholder="例如：接送服務、烤肉方案"
            value={newPlanName}
            error={newPlanNameError}
            onChange={(value) => { setNewPlanName(value); setNewPlanNameError(""); }}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            只填方案名稱（例：不加床加備品）。名稱不要放「NT$ 800 /」等價格前綴，價格請填在下方價格欄位。
          </p>
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
            新增增值服務
          </Button>
        </div>
      )}

      {addonPlans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-muted-foreground mb-4">尚無增值服務</p>
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
                  onRenameClick={handleRenameClick}
                  onApplyTemplate={handleApplyTemplate}

                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {AddDialog}

      <Dialog open={!!renameTarget} onOpenChange={(open) => { if (!open) setRenameTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯方案名稱</DialogTitle>
            <DialogDescription>修改增值服務的顯示名稱</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ValidatedInput
              label="方案名稱"
              placeholder="例如：接送服務、烤肉方案"
              value={renameValue}
              error={renameError}
              onChange={(value) => { setRenameValue(value); setRenameError(""); }}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              名稱不要含價格（NT$…）與說明文字，詳細規則請填在方案的「詳細說明」欄位。
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button onClick={handleConfirmRename}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
