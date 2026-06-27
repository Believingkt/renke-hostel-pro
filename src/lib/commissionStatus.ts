/**
 * 分潤基準金額狀態判斷工具
 * 依照優先順序：
 *   1. 今天 > check_out_date + 7天 → locked
 *   2. final_price !== last_confirmed_final_price（含 null）→ mismatch（final_price 又變動了）
 *   3. confirmed_by 有值 → confirmed
 *   4. team_commission_price !== final_price → mismatch（首次異動尚未確認）
 *   5. 其他 → none
 */
export type CommissionStatus = "locked" | "mismatch" | "confirmed" | "none";

export function getCommissionStatus(args: {
  checkOutDate: string | null | undefined;
  teamCommissionPrice: number | null | undefined;
  finalPrice?: number | null | undefined;
  confirmedBy: string | null | undefined;
  lastConfirmedCommissionPrice?: number | null | undefined;
  lastConfirmedFinalPrice?: number | null | undefined;
}): CommissionStatus {
  const {
    checkOutDate,
    teamCommissionPrice,
    finalPrice,
    confirmedBy,
    lastConfirmedFinalPrice,
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

  // 2. 若曾確認過（confirmedBy 有值）且 final_price 又改變 → mismatch
  if (confirmedBy) {
    if (
      lastConfirmedFinalPrice === null ||
      lastConfirmedFinalPrice === undefined ||
      finalPrice === null ||
      finalPrice === undefined ||
      Number(finalPrice) !== Number(lastConfirmedFinalPrice)
    ) {
      return "mismatch";
    }
    return "confirmed";
  }

  // 4. 從未確認過：若 tcp !== final_price → mismatch
  if (
    teamCommissionPrice !== null &&
    teamCommissionPrice !== undefined &&
    finalPrice !== null &&
    finalPrice !== undefined &&
    Number(teamCommissionPrice) !== Number(finalPrice)
  ) {
    return "mismatch";
  }

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
