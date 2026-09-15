import { getCommissionFormulaVersion } from "./commissionFormulaVersion.ts";
import { excludedAddonTotal, type CommissionExclusionRule } from "./commissionExclusionRule.ts";

export { buildCommissionExclusionResolver, excludedAddonTotal } from "./commissionExclusionRule.ts";
export type { CommissionExclusionRule, CommissionExclusionResolver } from "./commissionExclusionRule.ts";


/**
 * 加購項目金額加總（與前端 src/lib/ownerSettlement.ts 的 extractAddonTotal 邏輯一致）
 * 逐筆加總 orders.custom_addon_details JSONB 陣列裡的 total 欄位。
 */
export function extractAddonTotal(customAddonDetails: unknown): number {
  if (!Array.isArray(customAddonDetails)) return 0;
  let sum = 0;
  for (const item of customAddonDetails) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    sum += Number(rec.total ?? 0) || 0;
  }
  return sum;
}

/**
 * 「額外現場加購金額」parser。
 * MIRROR of src/lib/orderAddonTotal.ts -> extraOnSiteAddonFromNotes()
 * 以及 DB public.calc_order_addon_total 的同一段 regexp。
 * 三者必須維持完全相同的 parsing contract（同一組 test vectors）。
 * 因 Deno / Vite build 邊界不同，這裡刻意保留鏡像實作，不跨層 import。
 */
export function extraOnSiteAddonFromNotes(notes?: string | null): number {
  if (!notes) return 0;
  const m = notes.match(/【額外現場加購金額[^】]*】\s*(\d+)\s*【額外現場加購金額END】/);
  return m ? Number(m[1]) || 0 : 0;
}

/**
 * 佣金/獎金計算基礎（canonical，版本化）：
 *   LEGACY（order_date 台北日 < 2026-08-01）：max(0, final_price − custom_addon 總額)
 *   V2    （2026-08-01 ~ 2026-09-09）        ：再扣 notes 內「額外現場加購金額」
 *   V3    （>= 2026-09-10）                  ：notes 現場加購一律扣；custom_addon 只扣
 *          該館設定為排除抽成的項目（rule 由呼叫端解析後傳入），未設定＝全列入抽成
 *   order_date 缺失／無效 → fail-safe LEGACY
 *
 * 註：order_meta.team_commission_price 的人工覆蓋判斷由呼叫端維持既有語意，
 *     覆蓋值一律直接採用，不得再扣加購（避免 double exclusion）。
 */
export function commissionBaseFromOrder(
  order: {
    final_price?: number | string | null;
    custom_addon_details?: unknown;
    notes?: string | null;
    order_date?: string | Date | null;
  },
  rule?: CommissionExclusionRule | null,
): number {
  const final = Number(order.final_price ?? 0) || 0;
  const version = getCommissionFormulaVersion(order);
  if (version === "V3") {
    const excluded = excludedAddonTotal(order.custom_addon_details, rule ?? null);
    return Math.max(0, final - excluded - extraOnSiteAddonFromNotes(order.notes));
  }
  const addon = extractAddonTotal(order.custom_addon_details);
  const onsite = version === "V2" ? extraOnSiteAddonFromNotes(order.notes) : 0;
  return Math.max(0, final - addon - onsite);

}
