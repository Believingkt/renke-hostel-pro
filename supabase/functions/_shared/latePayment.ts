// 已取消訂單收到「逾期入帳」（主要為 ATM 虛擬帳號）的 fail-safe。
//
// 契約（Financial Truth Contract）：
// 1. 訂單絕不復活：order_status 維持 cancelled，不寫 confirmed_at。
// 2. 不得走正常付款成功 fulfillment：不改 payment_status、不寄客人成功信、不發一般付款成功通知。
// 3. 金流事實必須留存：paid_amount 記錄實際收到的錢（供退款 UI／對帳），
//    並在 deposit_charges 建立 needs_manual_review = true 的稽核列（金流稽核頁 reuse）。
// 4. 產生高辨識度管理端通知：「已取消訂單收到逾期款項」。
// 5. 不自動退款，一律人工處理。
//
// 本檔為純邏輯 + 單純 supabase 呼叫，無 Deno 相依，方便單元測試。

export const LATE_PAYMENT_ACTION = "late_payment_after_cancellation";
export const LATE_PAYMENT_NOTIFICATION_TYPE = "payment_exception_late_payment";
export const LATE_PAYMENT_NOTE_TAG = "[LATE PAYMENT]";

export interface LatePaymentOrderLike {
  order_status?: string | null;
  payment_status?: string | null;
  notes?: string | null;
}

/** 是否為「已取消訂單收到成功付款」→ 必須走 LATE PAYMENT PATH，不得走 NORMAL PAYMENT PATH */
export function isLatePaymentOnCancelledOrder(
  order: LatePaymentOrderLike | null | undefined,
  paymentSucceeded: boolean,
): boolean {
  if (!order || !paymentSucceeded) return false;
  return (order.order_status ?? "") === "cancelled";
}

/** 同一 rec_trade_id 是否已在 notes 留下 late payment 紀錄（webhook retry 去重的第一道） */
export function hasLatePaymentNote(notes: string | null | undefined, recTradeId: string | null): boolean {
  if (!notes || !recTradeId) return false;
  return notes.includes(`${LATE_PAYMENT_NOTE_TAG}`) && notes.includes(recTradeId);
}

export function buildLatePaymentNote(p: {
  stamp: string;
  amount: number;
  recTradeId: string | null;
  methodLabel: string;
}): string {
  return `${LATE_PAYMENT_NOTE_TAG} ${p.stamp} - 訂單已取消，仍收到${p.methodLabel}款項 NT$${Number(p.amount || 0).toLocaleString()}` +
    `${p.recTradeId ? `（交易 ${p.recTradeId}）` : ""}，訂單維持取消狀態，請人工確認退款。`;
}

export interface RecordLatePaymentParams {
  orderId: string;
  accommodationId: string | null;
  orderNumber: string;
  amount: number;
  recTradeId: string | null;
  bankTransactionId?: string | null;
  /** 'atm' | 'credit_card' 等，僅用於顯示 */
  paymentMethodLabel: string;
  cancelledAt?: string | null;
  receivedAt?: string | null;
  currentPaidAmount: number;
  currentNotes: string | null;
  // deno-lint-ignore no-explicit-any
  raw?: any;
}

export interface RecordLatePaymentResult {
  handled: true;
  duplicate: boolean;
  exceptionChargeId: string | null;
}

/**
 * 記錄 late payment：deposit_charges（金流稽核待處理）＋ orders.paid_amount/notes ＋ 管理端例外通知。
 * 同一 rec_trade_id 重送時完全冪等（不重複加錢、不重複建例外、不重複通知）。
 */
export async function recordLatePaymentException(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: RecordLatePaymentParams,
): Promise<RecordLatePaymentResult> {
  // --- 冪等 1：已存在同 rec_trade_id 的 late payment 稽核列 ---
  if (p.recTradeId) {
    const { data: existing } = await supabase
      .from("deposit_charges")
      .select("id")
      .eq("action", LATE_PAYMENT_ACTION)
      .eq("rec_trade_id", p.recTradeId)
      .maybeSingle();
    if (existing?.id) {
      console.log("[latePayment] duplicate late-payment event skipped", { recTradeId: p.recTradeId });
      return { handled: true, duplicate: true, exceptionChargeId: existing.id };
    }
  }
  // --- 冪等 2：notes 已留下同交易的 late payment 紀錄 ---
  if (hasLatePaymentNote(p.currentNotes, p.recTradeId)) {
    return { handled: true, duplicate: true, exceptionChargeId: null };
  }

  const receivedAt = p.receivedAt ?? new Date().toISOString();
  const amount = Math.abs(Number(p.amount || 0));

  // 1) 金流事實（永久保留：rec_trade_id / 金額 / 時間 / 原始 webhook）
  const { data: chargeRow, error: chargeErr } = await supabase
    .from("deposit_charges")
    .insert({
      order_id: p.orderId,
      accommodation_id: p.accommodationId,
      action: LATE_PAYMENT_ACTION,
      amount,
      status: "success",
      trigger_source: "tappay_webhook_late_payment",
      rec_trade_id: p.recTradeId,
      bank_transaction_id: p.bankTransactionId ?? null,
      webhook_status: "confirmed",
      needs_manual_review: true,
      raw_response: p.raw ?? null,
      error_message: "已取消訂單收到逾期款項，需人工確認退款",
    })
    .select("id")
    .maybeSingle();
  if (chargeErr) console.error("[latePayment] deposit_charges insert failed", chargeErr);

  // 2) 訂單：只更新 paid_amount（金流真實收款，供退款／對帳）＋ 稽核 notes。
  //    絕不變更 order_status / payment_status / 庫存相關欄位。
  const stamp = new Date(receivedAt).toISOString().slice(0, 16).replace("T", " ");
  const note = buildLatePaymentNote({
    stamp,
    amount,
    recTradeId: p.recTradeId,
    methodLabel: p.paymentMethodLabel,
  });
  const newNotes = p.currentNotes ? `${p.currentNotes}\n🔒 ${note}` : `🔒 ${note}`;
  const { error: updErr } = await supabase
    .from("orders")
    .update({
      paid_amount: Number(p.currentPaidAmount || 0) + amount,
      notes: newNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.orderId)
    .eq("order_status", "cancelled");
  if (updErr) console.error("[latePayment] orders update failed", updErr);

  // 3) 管理端高辨識通知（不得使用一般「付款成功」語意）
  try {
    await supabase.from("notifications").insert({
      accommodation_id: p.accommodationId,
      order_id: p.orderId,
      type: LATE_PAYMENT_NOTIFICATION_TYPE,
      title: "⚠️ 已取消訂單收到逾期款項",
      description:
        `訂單 ${p.orderNumber} 已於 ${p.cancelledAt ? new Date(p.cancelledAt).toISOString().slice(0, 16).replace("T", " ") : "先前"} 取消，` +
        `但於 ${stamp} 收到${p.paymentMethodLabel}款項 NT$${amount.toLocaleString()}` +
        `${p.recTradeId ? `（TapPay 交易 ${p.recTradeId}）` : ""}。` +
        `訂單仍維持取消，請至「金流稽核」確認退款處理。`,
      is_read: false,
    });
  } catch (e) {
    console.error("[latePayment] notification insert failed", e);
  }

  return { handled: true, duplicate: false, exceptionChargeId: chargeRow?.id ?? null };
}
