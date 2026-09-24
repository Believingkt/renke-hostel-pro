import { Input } from "@lakeze/shared/components/ui/input";
import { Label } from "@lakeze/shared/components/ui/label";
import { Button } from "@lakeze/shared/components/ui/button";
import { Switch } from "@lakeze/shared/components/ui/switch";
import { CopyPlus, AlertTriangle } from "lucide-react";
import { cn } from "@lakeze/shared/lib/utils";
import {
  GROUP_BUY_DAY_TYPE_HINT,
  GROUP_BUY_DAY_TYPE_LABEL,
  effectivePrices,
  isDateTypeEnabled,
  type GroupBuyDayType,
} from "@lakeze/shared/lib/groupBuyPricing";

export interface PackagePriceValue {
  group_buy_price: number;
  weekday_price: number | null;
  peak_price: number | null;
  holiday_price: number | null;
  original_price: number | null;
  /** 不適用的日期類型（空陣列＝平日／旺日／假日全部適用） */
  disabled_date_types?: GroupBuyDayType[] | null;
}

interface Props {
  value: PackagePriceValue;
  onChange: (patch: Partial<PackagePriceValue>) => void;
}

const num = (v: string) => (v === "" ? null : Number(v));

/** 團購方案價格設定：平日／旺日／假日三段價 + 原價 + 各自的「適用／不適用」開關 */
export function GroupBuyPackagePricingFields({ value, onChange }: Props) {
  const eff = effectivePrices(value);
  const disabled = (value.disabled_date_types ?? []) as GroupBuyDayType[];
  const allDisabled = (["weekday", "peak", "holiday"] as GroupBuyDayType[]).every(
    (t) => !isDateTypeEnabled(value, t),
  );

  const toggleType = (type: GroupBuyDayType, enabled: boolean) => {
    const next = enabled ? disabled.filter((t) => t !== type) : [...new Set([...disabled, type])];
    onChange({ disabled_date_types: next });
  };

  const applyToAll = () => {
    const base = value.weekday_price ?? value.group_buy_price;
    if (!base || base <= 0) return;
    onChange({ weekday_price: base, peak_price: base, holiday_price: base });
  };

  const field = (
    key: "weekday_price" | "peak_price" | "holiday_price",
    type: GroupBuyDayType,
  ) => {
    const enabled = isDateTypeEnabled(value, type);
    return (
      <div className={cn("rounded-lg border border-border/60 p-2.5", !enabled && "bg-muted/50")}>
        <Label className="flex flex-wrap items-baseline gap-x-1.5">
          {GROUP_BUY_DAY_TYPE_LABEL[type]}團購價
          <span className="text-xs font-normal text-muted-foreground">{GROUP_BUY_DAY_TYPE_HINT[type]}</span>
        </Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={(v) => toggleType(type, v)}
            aria-label={`${GROUP_BUY_DAY_TYPE_LABEL[type]}是否適用`}
          />
          <span className={cn("text-xs font-medium", enabled ? "text-foreground" : "text-muted-foreground")}>
            {enabled ? "適用" : "不適用"}
          </span>
        </div>
        <Input
          className={cn("mt-2", !enabled && "opacity-50")}
          type="number"
          min={1}
          disabled={!enabled}
          placeholder={`未設定沿用團購價 ${value.group_buy_price || 0}`}
          value={value[key] ?? ""}
          onChange={(e) => onChange({ [key]: num(e.target.value) } as Partial<PackagePriceValue>)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {enabled ? (
            <>
              實際套用：NT$ {eff[type].toLocaleString("en-US")}
              {value[key] == null ? "（沿用基準團購價）" : ""}
            </>
          ) : (
            "此日期類型不適用，前台不可預訂（原價格數字保留，重新開啟即恢復）"
          )}
        </p>
      </div>
    );
  };

  return (
    <div className="md:col-span-2 rounded-lg border border-border/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">價格設定（每晚）</p>
        <Button type="button" variant="outline" size="sm" onClick={applyToAll}>
          <CopyPlus className="mr-1 h-4 w-4" /> 套用至全部日期類型
        </Button>
      </div>

      {allDisabled && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>目前此方案沒有任何可預訂日期類型，前台將顯示暫不開放。</span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {field("weekday_price", "weekday")}
        {field("peak_price", "peak")}
        {field("holiday_price", "holiday")}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label>基準團購價（三段價未填時沿用，參與計價）</Label>
          <Input
            type="number"
            min={0}
            value={value.group_buy_price}
            onChange={(e) => onChange({ group_buy_price: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label>參考原價／晚（可留空，僅供顯示）</Label>
          <Input
            type="number"
            value={value.original_price ?? ""}
            onChange={(e) => onChange({ original_price: num(e.target.value) })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            指「一般訂房的每晚原價」，僅供前台原價刪除線與現省金額顯示，不參與實際訂單計價。
          </p>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        三段價留空時會自動沿用「基準團購價」，不會讓既有活動無法預訂；「不適用」則代表該日期類型完全不可預訂（與價格留空不同）。國定假日一律優先套用假日規則（假日資料來自各館別「國定假日」設定）。
      </p>
    </div>
  );
}

export default GroupBuyPackagePricingFields;
