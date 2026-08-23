// 團購 ATM 應收金額的唯一判定邏輯（純函式，無外部相依，可被單元測試直接引用）
//
// Source of Truth 規則：
// - ATM 正式應收金額只允許來自 orders.deposit_amount
// - deposit_amount <= 0 / null / 非法 → 直接拒絕開立（不得 fallback 重算）
// - 最終 gate 以 remainingDue = deposit_amount - paid_amount 判斷

export interface GroupBuyAtmOrderLike {
  order_status?: string | null;
  payment_status?: string | null;
  deposit_amount?: number | string | null;
  paid_amount?: number | string | null;
}

export type GroupBuyAtmDueResult =
  | { ok: true; deposit: number; paid: number; dueAmount: number }
  | { ok: false; status: number; error: string };

export const GB_ATM_ERR_NO_DEPOSIT = "此訂單缺少有效的訂金金額，請聯絡客服處理。";

export function resolveGroupBuyAtmDue(order: GroupBuyAtmOrderLike): GroupBuyAtmDueResult {
  if (order?.order_status === "cancelled") {
    return { ok: false, status: 400, error: "此訂單已取消，無法付款" };
  }
  if (order?.payment_status === "paid") {
    return { ok: false, status: 400, error: "此訂單已付清，無需重複付款" };
  }

  const rawDeposit = Number(order?.deposit_amount);
  if (!Number.isFinite(rawDeposit) || rawDeposit <= 0) {
    return { ok: false, status: 400, error: GB_ATM_ERR_NO_DEPOSIT };
  }
  const deposit = Math.round(rawDeposit);

  const rawPaid = Number(order?.paid_amount);
  const paid = Number.isFinite(rawPaid) && rawPaid > 0 ? Math.round(rawPaid) : 0;

  const dueAmount = deposit - paid;
  if (dueAmount <= 0) {
    return { ok: false, status: 400, error: "此訂單訂金已收訖，無需重複開立虛擬帳號" };
  }
  return { ok: true, deposit, paid, dueAmount };
}
