/**
 * 加盟分潤費率：版本選取共用邏輯。
 *
 * 規則（比照 supabase/functions/_shared/ownerPricingRule.ts 的精神）：
 * 依訂單日期（內部單 sold_at／外部單 signed_at）找出 effective_from <= 訂單日期
 * 的「最新一筆」版本；若訂單日期早於所有版本，退回最早的一筆版本（避免無費率可用）。
 *
 * 比例一律存小數（0.035 = 3.5%），禁止再除以 100。
 * 日期一律以 Asia/Taipei 的 date 字串（YYYY-MM-DD）直接字串比較。
 */

export interface FranchiseRateRow {
  id?: string;
  type?: string;
  project_name?: string | null;
  effective_from: string;
  base_rate?: number | null;
  tier1_rate?: number | null;
  tier2_rate?: number | null;
  leader_override_rate?: number | null;
  leader_supplement_rate?: number | null;
  company_rate?: number | null;
  sales_rate?: number | null;
  co_sales1_rate?: number | null;
  co_sales2_rate?: number | null;
  payout_day?: string | null;
}

/** 取 Asia/Taipei 今天的 YYYY-MM-DD */
export function todayTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return todayTaipei();
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : todayTaipei();
}

/**
 * 從版本清單中選出「訂單日期當時生效」的版本。
 * @param rows  同一 type（及同一 project_name）的所有版本
 * @param orderDate 訂單日期（sold_at / signed_at），缺值時以今天計
 */
export function pickRateVersion<T extends FranchiseRateRow>(
  rows: T[] | null | undefined,
  orderDate: string | null | undefined,
): T | null {
  const list = (rows ?? []).filter((r) => !!r?.effective_from);
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) =>
    String(b.effective_from).localeCompare(String(a.effective_from)),
  );
  const target = normalizeDate(orderDate);
  const hit = sorted.find((r) => String(r.effective_from).slice(0, 10) <= target);
  // 訂單日期早於所有版本 → 退回最早的一筆
  return hit ?? sorted[sorted.length - 1];
}

/** 依專案名稱分組（外部單費率用），每組已依 effective_from desc 排序 */
export function groupRatesByProject<T extends FranchiseRateRow>(
  rows: T[] | null | undefined,
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const r of rows ?? []) {
    const key = (r.project_name ?? "").trim();
    if (!key) continue;
    (map[key] ||= []).push(r);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));
  }
  return map;
}
