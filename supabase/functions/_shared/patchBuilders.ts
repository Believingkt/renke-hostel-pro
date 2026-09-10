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
