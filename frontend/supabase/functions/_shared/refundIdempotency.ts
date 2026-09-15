// Q3-A：TapPay 退款 callback 的金額冪等計算（純函式，無 Deno 相依，方便單元測試）
//
// 語意依據（與 tappay-sync-refund 同源）：
// TapPay 交易紀錄／通知中的 `refunded_amount` 是「該筆交易的累計已退款金額」，
// 不是本次退款金額。因此 refunded_amount 採 max(old, incoming) 才成立。
//
// 修改前：paid_amount = max(0, paid - incoming)          → 同一 callback 重送會重複扣減
// 修改後：paid_amount = max(0, paid - delta)，
//        delta = max(0, newRefundedTotal - oldRefundedTotal)  → 重送時 delta = 0，金額不變

export interface RefundAmountsInput {
  /** orders.paid_amount 現值 */
  currentPaid: number;
  /** orders.refunded_amount 現值（累計已確認退款額） */
  currentRefundedTotal: number;
  /** payload.refunded_amount（累計退款額），無值時傳 null */
  incomingRefundedTotal: number | null;
  /** payload.amount（回退用；語意不明確時只做保守的 max 比較） */
  fallbackAmount: number | null;
}

export interface RefundAmountsResult {
  newPaid: number;
  newRefundedTotal: number;
  /** 本次實際新增的退款額（重送時為 0） */
  delta: number;
}

export function computeRefundAmounts(input: RefundAmountsInput): RefundAmountsResult {
  const oldPaid = Math.max(0, Number(input.currentPaid) || 0);
  const oldRefunded = Math.max(0, Number(input.currentRefundedTotal) || 0);

  const incoming = input.incomingRefundedTotal != null && Number.isFinite(input.incomingRefundedTotal)
    ? Math.abs(Number(input.incomingRefundedTotal))
    : (input.fallbackAmount != null && Number.isFinite(input.fallbackAmount)
      ? Math.abs(Number(input.fallbackAmount))
      : 0);

  // 累計語意：只往上取，永遠不會因重送而重複累加
  const newRefundedTotal = Math.max(oldRefunded, incoming);
  const delta = Math.max(0, newRefundedTotal - oldRefunded);
  const newPaid = Math.max(0, oldPaid - delta);

  return { newPaid, newRefundedTotal, delta };
}
