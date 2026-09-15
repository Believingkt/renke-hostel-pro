/** 由 TapPay record 的實收 / 已退金額推導團購 payment draft 的退款狀態（純函式，可測）。 */
export function deriveRefundStatus(paidAmount: number, refundedAmount: number): string {
  if (paidAmount <= 0) return "none";
  if (refundedAmount <= 0) return "none";
  if (refundedAmount >= paidAmount) return "refunded";
  return "partial_refunded";
}
