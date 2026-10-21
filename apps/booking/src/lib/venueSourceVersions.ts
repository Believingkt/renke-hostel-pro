import { firstPayoutPeriodForEffectiveFrom } from "@lakeze/shared/lib/rateEffectivePeriod";

export type Track = "shared" | "kol";
export type OverrideRow = {
  id: string;
  track: Track;
  included_order_sources: string[] | null;
  effective_from: string;
  created_at: string;
};
export type VersionStatus = "current" | "future" | "history";

export const monthStartOf = (d: string) => `${d.slice(0, 7)}-01`;

/** 可選生效日：本月 1 日起往後 count 個月的 1 日 */
export function selectableMonths(today: string, count = 12): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const t = y * 12 + (m - 1) + i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
  });
}

export function isAllowedEffectiveFrom(eff: string, today: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(eff) && eff >= monthStartOf(today);
}

/** 「2026 年 7 月的訂單起算，2026 年 8 月 10 日發放的獎金開始採用」 */
export function effectiveExplain(eff: string): string {
  const payout = firstPayoutPeriodForEffectiveFrom(eff);
  const [y, m] = eff.split("-").map(Number);
  if (!payout) return "";
  const [py, pm] = payout.split("-").map(Number);
  return `${y} 年 ${m} 月的訂單起算，${py} 年 ${pm} 月 10 日發放的獎金開始採用`;
}

const newer = (a: OverrideRow, b: OverrideRow) =>
  a.effective_from > b.effective_from || (a.effective_from === b.effective_from && a.created_at > b.created_at);

/** 本月計算採用的版本：effective_from ≤ 本月 1 日的最新一筆 */
export function currentVersion(rows: OverrideRow[], monthStart: string): OverrideRow | null {
  return rows.filter((r) => r.effective_from <= monthStart).reduce<OverrideRow | null>((b, r) => (!b || newer(r, b) ? r : b), null);
}

export function upcomingVersions(rows: OverrideRow[], monthStart: string): OverrideRow[] {
  return rows.filter((r) => r.effective_from > monthStart).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
}

export function versionStatus(row: OverrideRow, rows: OverrideRow[], monthStart: string): VersionStatus {
  if (row.effective_from > monthStart) return "future";
  return currentVersion(rows, monthStart)?.id === row.id ? "current" : "history";
}

export function sourceDiff(custom: string[], global: string[]) {
  return { added: custom.filter((s) => !global.includes(s)), removed: global.filter((s) => !custom.includes(s)) };
}
