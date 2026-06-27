/**
 * 分潤基準金額狀態判斷工具
 * 依照優先順序：
 *   1. 今天 > check_out_date + 7天 → locked
 *   2. team_commission_price !== last_confirmed_commission_price（含 null）→ mismatch
 *   3. 已有 confirmed_by 且 team_commission_price === last_confirmed_commission_price → confirmed
 *   4. 其他 → none
 */
export type CommissionStatus = "locked" | "mismatch" | "confirmed" | "none";

export function getCommissionStatus(args: {
  checkOutDate: string | null | undefined;
  teamCommissionPrice: number | null | undefined;
  finalPrice?: number | null | undefined;
  confirmedBy: string | null | undefined;
  lastConfirmedCommissionPrice?: number | null | undefined;
}): CommissionStatus {
  const {
    checkOutDate,
    teamCommissionPrice,
    confirmedBy,
    lastConfirmedCommissionPrice,
  } = args;

  if (checkOutDate) {
    const co = new Date(checkOutDate);
    if (!isNaN(co.getTime())) {
      const deadline = new Date(co);
      deadline.setDate(deadline.getDate() + 7);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      deadline.setHours(0, 0, 0, 0);
      if (today.getTime() > deadline.getTime()) return "locked";
    }
  }

  const tcp = teamCommissionPrice;
  const lcp = lastConfirmedCommissionPrice;

  // 沒有 tcp 視為無金額可比，回 none
  if (tcp === null || tcp === undefined) return "none";

  // lcp 為 null/undefined → 從未確認過 → mismatch
  if (lcp === null || lcp === undefined) return "mismatch";

  if (Number(tcp) !== Number(lcp)) return "mismatch";

  if (confirmedBy) return "confirmed";
  return "none";
}

export function getCommissionStatusShortLabel(s: CommissionStatus): string {
  switch (s) {
    case "locked": return "🔒已鎖定";
    case "mismatch": return "⚠️金額異動";
    case "confirmed": return "🔔已確認";
    default: return "-";
  }
}
