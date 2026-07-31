import { AlertTriangle, Info } from "lucide-react";
import {
  cleanAddonName,
  shortUnit,
  addonPriceLine,
  hasPricePrefix,
  isVerboseUnit,
  addonNightsMultiplier,
  normalizeAddonPricingMode,
} from "@/lib/addonLabels";
import type { AddonPlan } from "./AddonPlansSection";

interface AddonPlanPreviewProps {
  plan: AddonPlan;
  /** 預覽用的假設晚數與數量 */
  nights?: number;
  quantity?: number;
}

/**
 * 加購方案「結帳頁效果」即時預覽（純顯示層，不影響任何資料）
 */
export const AddonPlanPreview = ({ plan, nights = 2, quantity = 1 }: AddonPlanPreviewProps) => {
  const rawTitle = plan.addon_type;
  const title = cleanAddonName(rawTitle);
  const unit = shortUnit(plan.unit_label);
  const pricingMode = normalizeAddonPricingMode(plan.pricing_mode);
  const multiplier = addonNightsMultiplier(pricingMode, nights);
  const priceLine = addonPriceLine(plan.price_per_unit || 0, plan.unit_label, plan.max_quantity, pricingMode);
  const subtotal = (plan.price_per_unit || 0) * quantity * multiplier;

  const warnings: string[] = [];
  if (hasPricePrefix(rawTitle)) warnings.push("方案名稱含價格文字，前台會自動移除；請把金額留在上方「價格」欄位。");
  if (isVerboseUnit(plan.unit_label)) warnings.push(`單位「${plan.unit_label}」過長或含標點，前台會自動顯示為「份」。`);
  if (title.length > 14) warnings.push("方案名稱偏長（建議 14 字以內），手機版可能換行。");
  if (!plan.price_per_unit || plan.price_per_unit <= 0) warnings.push("價格需大於 0，否則前台會顯示 NT$ 0。");
  if (!plan.max_quantity || plan.max_quantity < 1) warnings.push("數量上限需至少為 1，否則前台無法加購。");
  if (pricingMode === "per_stay" && /晚|夜/.test(plan.unit_label || "")) warnings.push("此方案為「單次計算」，單位詞不建議寫「晚」，避免與計價方式衝突。");

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        結帳頁預覽（假設 {quantity} {unit}{pricingMode === "per_night" ? ` × ${nights} 晚` : "，單次計費"}）
      </div>

      <div className="rounded-md border bg-background p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">🛏️ {title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{priceLine}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums">
              NT$ {subtotal.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {quantity} {unit} × NT$ {(plan.price_per_unit || 0).toLocaleString()}
              {pricingMode === "per_night" ? ` × ${nights} 晚` : "（單次）"}
            </p>
          </div>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
