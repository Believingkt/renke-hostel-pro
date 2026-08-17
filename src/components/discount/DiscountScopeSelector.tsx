import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type DiscountScopeMode = "room_type" | "pricing_template";

export interface ScopeOption {
  id: string;
  name: string;
}

interface Props {
  mode: DiscountScopeMode;
  roomTypes: ScopeOption[];
  pricingTemplates: ScopeOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  idPrefix: string;
  scrollable?: boolean;
}

/**
 * 折扣碼「適用範圍」選擇器。
 * - room_type：舊制（森山／雲岫／哈庫納），不勾選＝全部房型適用
 * - pricing_template：新制（淞湘及其他新館），依房價方案判斷，未勾選＝不適用
 */
export function DiscountScopeSelector({
  mode,
  roomTypes,
  pricingTemplates,
  selected,
  onChange,
  idPrefix,
  scrollable = false,
}: Props) {
  const isTemplate = mode === "pricing_template";
  const options = isTemplate ? pricingTemplates : roomTypes;

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (!selected.includes(id)) onChange([...selected, id]);
    } else {
      onChange(selected.filter((x) => x !== id));
    }
  };

  return (
    <div className="grid gap-2">
      <Label>
        {isTemplate ? "適用房價方案（必選，未勾選則此折扣碼不適用）" : "適用房型（不選表示全部房型適用）"}
      </Label>
      <div
        className={
          scrollable
            ? "border rounded-md p-3 max-h-40 overflow-y-auto space-y-2"
            : "space-y-2"
        }
      >
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isTemplate ? "此館別尚未建立房價方案" : "此館別尚未建立房型"}
          </p>
        )}
        {options.map((opt) => (
          <div key={opt.id} className="flex items-center space-x-2">
            <Checkbox
              id={`${idPrefix}-${opt.id}`}
              checked={selected.includes(opt.id)}
              onCheckedChange={(checked) => toggle(opt.id, !!checked)}
              className="h-5 w-5 touch-manipulation"
            />
            <Label htmlFor={`${idPrefix}-${opt.id}`} className="text-sm font-normal cursor-pointer">
              {opt.name}
            </Label>
          </div>
        ))}
      </div>
      {isTemplate && (
        <p className="text-xs text-muted-foreground">
          此館別以「房價價格設定（房價方案）」判斷折扣碼適用範圍。
        </p>
      )}
    </div>
  );
}

export default DiscountScopeSelector;
