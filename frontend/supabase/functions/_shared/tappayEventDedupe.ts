// Q3-B：TapPay 付款通知重送的「重複副作用」去重（純函式，無 Deno 相依，方便單元測試）
//
// 重點：
// 1. 不能只用 rec_trade_id 判斷重複 —— 同一交易可以合法存在多次退款。
// 2. 退款採「累計退款額」語意，因此把 refunded_amount（累計值）納入事件指紋，
//    第二次合法退款（累計 2,000 → 3,000）指紋不同，不會被誤擋。
// 3. 只有「先前確實成功處理完成（processed = true）」的相同指紋事件才略過副作用；
//    失敗事件（processed = false）仍會走正常 retry。

export type TapPayEventType = "refund" | "charge";

export interface DedupePayloadFields {
  eventType: TapPayEventType;
  /** payload.status（TapPay 結果碼） */
  status: number | null;
  /** payload.amount */
  amount: number | null;
  /** payload.refunded_amount（累計退款額），無值為 null */
  refundedTotal: number | null;
}

/** 事件指紋：同一 rec_trade_id 底下用來辨識「完全相同的一次通知」 */
export function eventSignature(f: DedupePayloadFields): string {
  const amt = f.amount == null ? "" : String(Math.abs(f.amount));
  const ref = f.refundedTotal == null ? "" : String(Math.abs(f.refundedTotal));
  return [f.eventType, f.status ?? "", amt, ref].join("|");
}

/** 從既有 tappay_webhook_events.raw 還原指紋（欄位語意與 webhook payload 相同） */
export function signatureFromRaw(
  raw: Record<string, unknown> | null | undefined,
  fallback: { eventType: TapPayEventType; status: number | null; amount: number | null },
): string {
  const r = raw ?? {};
  const n = (v: unknown): number | null => {
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  return eventSignature({
    eventType: fallback.eventType,
    status: r.status !== undefined ? n(r.status) : fallback.status,
    amount: r.amount !== undefined ? n(r.amount) : fallback.amount,
    refundedTotal: n(r.refunded_amount),
  });
}

/**
 * 退款事件是否為「不會推進累計退款額」的重送／亂序舊事件。
 * delta = 0 代表金額面已無變化（Q3-A 保證），此時不應再 append notes / push。
 * 注意：首次退款（currentRefundedTotal = 0 且 incoming > 0）delta > 0，不會被判為 no-op。
 */
export function isStaleRefund(currentRefundedTotal: number, delta: number): boolean {
  return delta <= 0 && Number(currentRefundedTotal || 0) > 0;
}

/**
 * 扣款事件是否對訂單完全沒有實質變化（金額、狀態、扣款紀錄皆相同）。
 */
export function isNoOpCharge(input: {
  currentPaid: number;
  newPaid: number;
  currentPaymentStatus: string | null;
  newPaymentStatus: string;
  currentRoomChargeStatus: string | null;
  currentRoomChargeRecTradeId: string | null;
  incomingRecTradeId: string | null;
}): boolean {
  if (Number(input.currentPaid || 0) !== Number(input.newPaid || 0)) return false;
  if ((input.currentPaymentStatus ?? "") !== input.newPaymentStatus) return false;
  if (input.currentRoomChargeStatus && input.currentRoomChargeStatus !== "cancelled") {
    if (input.currentRoomChargeStatus !== "charged") return false;
    if ((input.currentRoomChargeRecTradeId ?? "") !== (input.incomingRecTradeId ?? "")) return false;
  }
  return true;
}
