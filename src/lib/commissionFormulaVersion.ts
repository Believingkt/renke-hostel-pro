/**
 * Commission formula 版本化（frontend canonical）。
 *
 * 產品決策：
 * - 判斷 SoT：orders.order_date（timestamptz），依 Asia/Taipei 日曆日判定
 *   （不得使用 created_at / check_in_date / snapshot date / payment date）
 * - < 2026-08-01            → LEGACY V1：final − custom addon（notes 現場加購不扣）
 * - 2026-08-01 ~ 2026-09-09 → V2：再扣 notes 內「額外現場加購金額」
 * - >= 2026-09-10           → V3：notes 現場加購一律扣除；custom addon 只扣
 *   「該館 owner_settlement_pricing_rules 設定為排除」的項目，未設定＝全部列入抽成
 * - order_date 缺失／不可解析 → fail-safe LEGACY（無法證明屬新政策時，不得回溯降低 base）
 *
 * Edge mirror：supabase/functions/_shared/commissionFormulaVersion.ts（contract 必須完全相同）。
 */

export type CommissionFormulaVersion = "LEGACY" | "V2" | "V3";

/** V2 cutoff（Asia/Taipei 日曆日，含當日） */
export const COMMISSION_V2_CUTOFF_TAIPEI_DATE = "2026-08-01";
/** V3 cutoff（Asia/Taipei 日曆日，含當日） */
export const COMMISSION_V3_CUTOFF_TAIPEI_DATE = "2026-09-10";

const TZ = "Asia/Taipei";

/** timestamptz → Asia/Taipei 日曆日 YYYY-MM-DD；無效輸入回傳 null */
export function taipeiCalendarDate(value?: string | Date | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** 依 order_date（台北日曆日）決定 commission formula 版本；缺失/無效 → LEGACY */
export function getCommissionFormulaVersion(order: {
  order_date?: string | Date | null;
}): CommissionFormulaVersion {
  const date = taipeiCalendarDate(order?.order_date ?? null);
  if (!date) return "LEGACY";
  if (date >= COMMISSION_V3_CUTOFF_TAIPEI_DATE) return "V3";
  return date >= COMMISSION_V2_CUTOFF_TAIPEI_DATE ? "V2" : "LEGACY";
}
