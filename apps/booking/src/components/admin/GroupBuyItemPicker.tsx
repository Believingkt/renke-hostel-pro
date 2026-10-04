import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Checkbox } from "@lakeze/shared/components/ui/checkbox";
import { Button } from "@lakeze/shared/components/ui/button";
import { Label } from "@lakeze/shared/components/ui/label";

export interface PickerOption {
  key: string;
  label: string;
  hint?: string;
}

interface Props {
  options: PickerOption[];
  /** null／undefined＝未設定（前台顯示全部）；[]＝明確都不顯示 */
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  emptyHint?: string;
  /** 未設定時的說明文字 */
  allHint?: string;
}

function SortableRow({
  option,
  index,
  onRemove,
}: {
  option: PickerOption;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.key,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-2"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing rounded p-1 hover:bg-muted"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
      <span className="min-w-0 flex-1 truncate text-sm">{option.label}</span>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** 團購頁「顯示哪些項目＋排序」共用選取器（FAQ／訂房須知） */
export function GroupBuyItemPicker({ options, value, onChange, emptyHint, allHint }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byKey = new Map(options.map((o) => [o.key, o]));
  // 過濾掉已被刪除／停用的 key（不寫回 DB，只影響顯示）
  const selected = (value ?? []).filter((k) => byKey.has(k));
  const selectedSet = new Set(selected);

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = selected.indexOf(String(active.id));
    const to = selected.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(selected, from, to));
  };

  const toggle = (key: string, checked: boolean) => {
    if (checked) onChange([...selected, key]);
    else onChange(selected.filter((k) => k !== key));
  };

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint || "目前沒有可選項目"}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={value === null ? "default" : "outline"}
          onClick={() => onChange(null)}
        >
          顯示全部（預設）
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value !== null ? "default" : "outline"}
          onClick={() => onChange(selected)}
        >
          自訂選取
        </Button>
        {value === null && (
          <span className="text-xs text-muted-foreground">
            {allHint || "未設定時，前台顯示全部項目"}
          </span>
        )}
      </div>

      {value !== null && (
        <>
          {selected.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">已選取（可拖曳排序）</Label>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={selected} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {selected.map((key, i) => (
                      <SortableRow
                        key={key}
                        index={i}
                        option={byKey.get(key)!}
                        onRemove={() => toggle(key, false)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">可選項目</Label>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-md border p-2">
              {options.map((o) => (
                <label
                  key={o.key}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1.5 hover:bg-muted/60"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={selectedSet.has(o.key)}
                    onCheckedChange={(c) => toggle(o.key, c === true)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selected.length === 0 && (
            <p className="text-xs text-muted-foreground">未選取任何項目時，前台不顯示此區塊。</p>
          )}
        </>
      )}
    </div>
  );
}

export default GroupBuyItemPicker;
