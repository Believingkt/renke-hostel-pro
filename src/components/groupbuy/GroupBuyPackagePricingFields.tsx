import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CopyPlus } from "lucide-react";
import { GROUP_BUY_DAY_TYPE_HINT, effectivePrices } from "@/lib/groupBuyPricing";

export interface PackagePriceValue {
  group_buy_price: number;
  weekday_price: number | null;
  peak_price: number | null;
  holiday_price: number | null;
  original_price: number | null;
}

interface Props {
  value: PackagePriceValue;
  onChange: (patch: Partial<PackagePriceValue>) => void;
}

const num = (v: string) => (v === "" ? null : Number(v));

/** 團購方案價格設定：平日／旺日／假日三段價 + 原價，未填時 fallback 原團購價 */
export function GroupBuyPackagePricingFields({ value, onChange }: Props) {
  const eff = effectivePrices(value);

  const applyToAll = () => {
    const base = value.weekday_price ?? value.group_buy_price;
    if (!base || base <= 0) return;
    onChange({ weekday_price: base, peak_price: base, holiday_price: base });
  };

  const field = (
    key: "weekday_price" | "peak_price" | "holiday_price",
    label: string,
    type: "weekday" | "peak" | "holiday",
  ) => (
    <div>
      <Label className="flex flex-wrap items-baseline gap-x-1.5">
        {label}
        <span className="text-xs font-normal text-muted-foreground">{GROUP_BUY_DAY_TYPE_HINT[type]}</span>
      </Label>
      <Input
        type="number"
        min={1}
        placeholder={`未設定沿用團購價 ${value.group_buy_price || 0}`}
        value={value[key] ?? ""}
        onChange={(e) => onChange({ [key]: num(e.target.value) } as Partial<PackagePriceValue>)}
      />
      <p className="mt-1 text-xs text-muted-foreground">
        實際套用：NT$ {eff[type].toLocaleString("en-US")}
        {value[key] == null ? "（沿用原團購價）" : ""}
      </p>
    </div>
  );

  return (
    <div className="md:col-span-2 rounded-lg border border-border/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">價格設定（每晚）</p>
        <Button type="button" variant="outline" size="sm" onClick={applyToAll}>
          <CopyPlus className="mr-1 h-4 w-4" /> 套用至全部日期類型
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {field("weekday_price", "平日團購價", "weekday")}
        {field("peak_price", "旺日團購價", "peak")}
        {field("holiday_price", "假日團購價", "holiday")}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Label>原團購價（相容欄位／三段價未填時的預設值）</Label>
          <Input
            type="number"
            min={0}
            value={value.group_buy_price}
            onChange={(e) => onChange({ group_buy_price: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label>原價（劃線顯示，可留空）</Label>
          <Input
            type="number"
            value={value.original_price ?? ""}
            onChange={(e) => onChange({ original_price: num(e.target.value) })}
          />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        三段價留空時會自動沿用「原團購價」，不會讓既有活動無法預訂；國定假日一律優先套用假日價（假日資料來自各館別「國定假日」設定）。
      </p>
    </div>
  );
}

export default GroupBuyPackagePricingFields;
