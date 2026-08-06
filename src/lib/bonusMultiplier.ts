/**
 * 獎金加倍活動共用邏輯。
 *
 * 重要口徑：
 * - bonus_multiplier_settings 的 start_month / end_month 一律是「發放月」(YYYY-MM)。
 * - 各統計頁面通常以「資料月」為主，發放月 = 資料月 + 1，需先轉換再比對。
 * - bonus_type = "all" 的活動與個別類型的倍率「相乘」。
 * - 加倍金額只作額外顯示，不覆蓋原始金額。
 */

export interface BonusMultiplierRow {
  bonus_type: string;
  multiplier: number | string | null;
  start_month: string;
  end_month: string;
  reason?: string | null;
}

/** 資料月 (YYYY-MM) → 發放月 (YYYY-MM)，發放月為資料月的下一個月 */
export function payoutMonthKeyFromDataMonth(dataMonthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(dataMonthKey ?? ""));
  if (!m) return String(dataMonthKey ?? "");
  const year = Number(m[1]);
  const month = Number(m[2]);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** 取指定獎金類型在該「發放月」的倍率（含 all 疊乘），查無回 1 */
export function pickMultiplier(
  rows: BonusMultiplierRow[] | null | undefined,
  bonusType: string,
  payoutMonthKey: string,
): number {
  if (!rows || rows.length === 0 || !payoutMonthKey) return 1;
  const active = rows.filter(
    (r) => r.start_month <= payoutMonthKey && r.end_month >= payoutMonthKey,
  );
  const valueOf = (bt: string) => {
    const hit = active.find((r) => r.bonus_type === bt);
    const v = Number(hit?.multiplier ?? 1);
    return Number.isFinite(v) && v > 0 ? v : 1;
  };
  return valueOf(bonusType) * valueOf("all");
}

/** 加倍後金額（四捨五入到元） */
export function boostedAmount(amount: number, multiplier: number): number {
  return Math.round(Number(amount ?? 0) * (Number(multiplier) || 1));
}
