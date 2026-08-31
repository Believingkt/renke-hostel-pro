/**
 * Commission formula 版本化（Edge mirror）。
 * MIRROR of src/lib/commissionFormulaVersion.ts —— contract 必須完全相同
 * （同一組 fixtures 有 parity 測試）。因 Deno / Vite build 邊界不同，刻意保留鏡像實作。
 *
 * LEGACY（< 2026-08-01 台北日）：final − custom addon
 * V2    （2026-08-01 ~ 09-09）：再扣 notes 現場加購
 * V3    （>= 2026-09-10）      ：notes 現場加購一律扣；custom addon 只扣館別設定為排除的項目
 * order_date 缺失／不可解析 → fail-safe LEGACY。
 */

export type CommissionFormulaVersion = "LEGACY" | "V2" | "V3";

export const COMMISSION_V2_CUTOFF_TAIPEI_DATE = "2026-08-01";
export const COMMISSION_V3_CUTOFF_TAIPEI_DATE = "2026-09-10";

const TZ = "Asia/Taipei";

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

export function getCommissionFormulaVersion(order: {
  order_date?: string | Date | null;
}): CommissionFormulaVersion {
  const date = taipeiCalendarDate(order?.order_date ?? null);
  if (!date) return "LEGACY";
  if (date >= COMMISSION_V3_CUTOFF_TAIPEI_DATE) return "V3";
  return date >= COMMISSION_V2_CUTOFF_TAIPEI_DATE ? "V2" : "LEGACY";
}
