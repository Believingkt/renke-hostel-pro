/**
 * Commission formula 版本化（frontend canonical）。
 *
 * 產品決策（2026-08）：
 * - cutoff：2026-08-01 00:00 Asia/Taipei
 * - 判斷 SoT：orders.order_date（timestamptz），依 Asia/Taipei 日曆日判定
 *   （不得使用 created_at / check_in_date / snapshot date / payment date）
 * - < cutoff → LEGACY V1：不排除 notes 內「額外現場加購金額」
 * - >= cutoff → V2：排除 onsite extra
 * - order_date 缺失／不可解析 → fail-safe LEGACY（無法證明屬新政策時，不得回溯降低 base）
 *
 * Edge mirror：supabase/functions/_shared/commissionFormulaVersion.ts（contract 必須完全相同）。
 */

export type CommissionFormulaVersion = "LEGACY" | "V2";

/** 正式 cutoff（Asia/Taipei 日曆日，含當日） */
export const COMMISSION_V2_CUTOFF_TAIPEI_DATE = "2026-08-01";

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
  return date >= COMMISSION_V2_CUTOFF_TAIPEI_DATE ? "V2" : "LEGACY";
}
