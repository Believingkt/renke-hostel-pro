/**
 * 星探「團隊邀約目標」達標判定的共用邏輯（單一真相來源）。
 *
 * 規則（2026-08 起生效，發放月 = 資料月 + 1）：
 *  - 團隊目標只有一份：scout_team_targets（正職 / 兼職共用同一門檻）
 *  - 實際邀約數 = 兼職全量 + 正職僅 SR / SSR / UR，兩者「累加」
 *  - 外部星探（非 is_scout_team_member）不列入
 *  - 所有有設定 target_count 的館別皆達標，才算團隊達標（AND）
 */

export const SCOUT_TEAM_RARE_SET = new Set(["SR", "SSR", "UR"]);

/** 該筆邀約是否計入團隊目標（正職僅 SR 以上、兼職全計） */
export function countsTowardTeamTarget(
  isFulltime: boolean,
  rarity: string | null | undefined,
): boolean {
  if (!isFulltime) return true;
  return SCOUT_TEAM_RARE_SET.has(String(rarity ?? "").toUpperCase());
}

/**
 * 判斷某位星探在指定月份是否為「正職」。
 * @param startYearMonth team_member_profiles.fulltime_start_yearmonth，格式 YYYY-MM
 * @param monthKey 判定月份，格式 YYYY-MM
 */
export function isFulltimeForMonth(
  startYearMonth: string | null | undefined,
  monthKey: string,
): boolean {
  if (!startYearMonth) return false;
  return String(startYearMonth) <= monthKey;
}

export interface ScoutTeamTarget {
  key: string;
  venue_name: string;
  target_count: number;
}

export interface TeamAchievementVenueResult extends ScoutTeamTarget {
  parttime_count: number;
  fulltime_count: number;
  total: number;
  achieved: boolean;
}

/**
 * 依「兼職全量 + 正職 SR↑」累加後，逐館比對目標。
 * @param counts key → { parttime, fulltime }
 */
export function evaluateTeamAchievement(
  targets: ScoutTeamTarget[],
  counts: Map<string, { parttime: number; fulltime: number }>,
): { achieved: boolean; venues: TeamAchievementVenueResult[] } {
  const venues: TeamAchievementVenueResult[] = targets
    .filter((t) => t.target_count > 0)
    .map((t) => {
      const c = counts.get(t.key) ?? { parttime: 0, fulltime: 0 };
      const total = c.parttime + c.fulltime;
      return {
        ...t,
        parttime_count: c.parttime,
        fulltime_count: c.fulltime,
        total,
        achieved: total >= t.target_count,
      };
    });
  const achieved = venues.length > 0 && venues.every((v) => v.achieved);
  return { achieved, venues };
}
