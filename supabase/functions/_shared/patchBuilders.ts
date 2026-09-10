// 純函式：只負責「這次要送哪些欄位給 update_order_with_context」。
//
// 規則（做法 B）：
// - 不得存取 supabase / Deno.env / 現在時間；所有值由呼叫端算好後傳入。
// - 內容逐字沿用原本呼叫端的物件字面值，不改任何判斷。
// - 測試會直接呼叫這些函式，把回傳物件的 key 與 RPC 白名單快照自動比對。

export type OrderPatch = Record<string, unknown>;

/* ---------- charge-deposit ---------- */

export function buildDepositChargeSuccessPatch(input: {
  newChargedAmount: number;
  chargedAtIso: string;
  newStatus: string;
}): OrderPatch {
  return {
    deposit_charged_amount: input.newChargedAmount,
    deposit_charged_at: input.chargedAtIso,
    deposit_status: input.newStatus,
  };
}

export function buildDepositChargeFailurePatch(): OrderPatch {
  return { deposit_status: "failed" };
}

/* ---------- tappay-notify ---------- */

export function buildTappayNotifySuccessPatch(input: {
  newPaymentStatus: string;
  newPaidAmount: number;
  isAtm: boolean;
  newNotes: string;
  currentOrderStatus: string | null;
  confirmedAtIso: string;
}): OrderPatch {
  const patch: OrderPatch = {
    payment_status: input.newPaymentStatus,
    paid_amount: input.newPaidAmount,
    payment_method: input.isAtm ? "atm" : "credit_card_3ds",
    balance_payment_method: input.newPaymentStatus === "paid"
      ? (input.isAtm ? "ATM 虛擬帳號轉帳" : "信用卡(3D驗證)")
      : null,
    notes: input.newNotes,
  };

  if (
    (input.newPaymentStatus === "paid" || input.newPaymentStatus === "deposit_paid" ||
      input.newPaymentStatus === "partial") &&
    (input.currentOrderStatus === "pending" || input.currentOrderStatus === "pending_payment")
  ) {
    patch.order_status = "confirmed";
    patch.confirmed_at = input.confirmedAtIso;
  }

  return patch;
}

export function buildTappayNotifyFailurePatch(input: { newNotes: string }): OrderPatch {
  return { notes: input.newNotes };
}

/* ---------- tappay-refund-notify ---------- */

export function buildTappayRefundSuccessPatch(input: {
  newPaymentStatus: string;
  newPaidAmount: number;
  newNotes: string;
}): OrderPatch {
  return {
    payment_status: input.newPaymentStatus,
    paid_amount: input.newPaidAmount,
    notes: input.newNotes,
  };
}

export function buildTappayRefundFailurePatch(input: { newNotes: string }): OrderPatch {
  return { notes: input.newNotes };
}

/* ---------- tappayWebhookProcessor（共用 webhook 處理器） ---------- */

export function buildWebhookRefundSuccessPatch(input: {
  refundedTotal: number;
  newPaid: number;
  notes: string;
}): OrderPatch {
  return {
    refunded_amount: input.refundedTotal,
    paid_amount: input.newPaid,
    payment_status: "refunded",
    notes: input.notes,
  };
}

export function buildWebhookRefundFailurePatch(input: { notes: string }): OrderPatch {
  return { notes: input.notes };
}

export function buildWebhookChargeSuccessPatch(input: {
  newPaid: number;
  newStatus: string;
  roomChargeActive: boolean;
  roomChargeAtIso: string;
  recTradeId: string;
  notes: string;
}): OrderPatch {
  const patch: OrderPatch = {
    paid_amount: input.newPaid,
    payment_status: input.newStatus,
  };
  if (input.roomChargeActive) {
    patch.room_charge_status = "charged";
    patch.room_charge_at = input.roomChargeAtIso;
    patch.room_charge_rec_trade_id = input.recTradeId;
    patch.room_charge_error = null;
  }
  patch.notes = input.notes;
  return patch;
}

export function buildWebhookChargeFailurePatch(input: {
  paymentStatus: string | null;
  roomChargeActive: boolean;
  errMsg: string;
  notes: string;
}): OrderPatch {
  const patch: OrderPatch = { payment_status: input.paymentStatus };
  if (input.roomChargeActive) {
    patch.room_charge_status = "failed";
    patch.room_charge_error = input.errMsg;
  }
  patch.notes = input.notes;
  return patch;
}

/* ---------- cancel-order-with-refund ---------- */

export function buildCancelRefundFailurePatch(input: { recTradeId: string }): OrderPatch {
  return { refund_status: "failed", refund_rec_trade_id: input.recTradeId };
}

export function buildCancelOrderPatch(input: {
  nowIso: string;
  notes: string;
  refundAction: string;
  refundSucceeded: boolean;
  paidAmount: number;
  refundAmount: number;
  recTradeId: string | null;
}): OrderPatch {
  const patch: OrderPatch = {
    order_status: "cancelled",
    cancelled_at: input.nowIso,
    notes: input.notes,
  };
  if (input.refundAction === "auto_refund" && input.refundSucceeded) {
    const newPaid = Math.max(0, input.paidAmount - input.refundAmount);
    patch.paid_amount = newPaid;
    patch.payment_status = newPaid === 0 ? "refunded" : "partial_refunded";
    patch.refunded_amount = input.refundAmount;
    patch.refund_rec_trade_id = input.recTradeId;
    patch.refunded_at = input.nowIso;
    patch.refund_status = newPaid === 0 ? "refunded" : "partial_refunded";
  }
  if (input.refundAction === "mark_manual_refund" && input.refundAmount > 0) {
    patch.refund_status = "pending_manual";
  }
  return patch;
}
