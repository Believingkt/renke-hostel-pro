// 共用：TapPay Webhook 事件處理核心（供 tappay-payment-webhook 即時處理與 tappay-webhook-retry 重試共用）
type Json = Record<string, unknown>;

export function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 由 TapPay order_number 還原 PMS 訂單編號（我們送出時會加前綴） */
export function stripPrefix(orderNumber: string | null): string | null {
  if (!orderNumber) return null;
  return orderNumber.replace(/^(ROOM|CXL|DEP|ATM)-/, "");
}

export function classify(payload: Json): "refund" | "charge" {
  const recordStatus = num(payload.record_status);
  if (num(payload.refunded_amount) && (num(payload.refunded_amount) as number) > 0) return "refund";
  if (recordStatus === 2) return "refund";
  if (typeof payload.transaction_type === "string" && payload.transaction_type.includes("refund")) return "refund";
  return "charge";
}

/** 重試間隔（分鐘）：第 1 次 5 分、第 2 次 20 分、第 3 次 60 分 */
export const RETRY_DELAYS_MIN = [5, 20, 60];
export const MAX_RETRIES = RETRY_DELAYS_MIN.length;

export function nextRetryAt(retryCount: number): string | null {
  const delay = RETRY_DELAYS_MIN[retryCount];
  if (delay == null) return null;
  return new Date(Date.now() + delay * 60_000).toISOString();
}

const ORDER_FIELDS =
  "id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, room_charge_status, notes, refunded_amount, cancellation_fee_amount";

export interface ProcessResult {
  matched: boolean;
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  eventType: "refund" | "charge";
  reason?: string;
}

/**
 * 依 TapPay 通知內容同步 deposit_charges 與 orders。
 * 丟出例外代表「本次處理失敗」，呼叫端應排入重試。
 */
export async function processTapPayEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  payload: Json,
): Promise<ProcessResult> {
  const recTradeId = (payload.rec_trade_id as string) || null;
  const orderNumber = stripPrefix((payload.order_number as string) || null);
  const status = num(payload.status);
  const amount = num(payload.amount);
  const eventType = classify(payload);
  const ok = status === 0;

  let order: any = null;
  if (recTradeId) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .or(`room_charge_rec_trade_id.eq.${recTradeId},atm_rec_trade_id.eq.${recTradeId}`)
      .maybeSingle();
    if (error) throw new Error(`查詢訂單失敗：${error.message}`);
    order = data;
  }
  if (!order && orderNumber) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_FIELDS)
      .eq("order_number", orderNumber)
      .maybeSingle();
    if (error) throw new Error(`查詢訂單失敗：${error.message}`);
    order = data;
  }

  if (!order) {
    return { matched: false, ok, eventType, reason: "找不到對應訂單" };
  }

  // 同步 deposit_charges（金流稽核流水）
  let chargeRow: any = null;
  if (recTradeId) {
    const { data } = await supabase
      .from("deposit_charges")
      .select("id, action, amount, status")
      .eq("rec_trade_id", recTradeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    chargeRow = data;
  }

  const errMsg = ok ? null : ((payload.msg as string) || `TapPay status ${status}`);
  const chargePatch: Json = {
    status: ok ? "success" : "failed",
    webhook_status: ok ? "confirmed" : "failed",
    bank_transaction_id: (payload.bank_transaction_id as string) || null,
    raw_response: payload,
    needs_manual_review: !ok,
    error_message: errMsg,
  };

  if (chargeRow) {
    const { error } = await supabase.from("deposit_charges").update(chargePatch).eq("id", chargeRow.id);
    if (error) throw new Error(`更新稽核紀錄失敗：${error.message}`);
  } else {
    const { error } = await supabase.from("deposit_charges").insert({
      order_id: order.id,
      accommodation_id: order.accommodation_id,
      action: eventType === "refund" ? "refund" : "room_charge",
      amount: Math.abs(amount ?? 0),
      status: ok ? "success" : "failed",
      trigger_source: "tappay_webhook",
      rec_trade_id: recTradeId,
      bank_transaction_id: (payload.bank_transaction_id as string) || null,
      webhook_status: ok ? "confirmed" : "failed",
      needs_manual_review: !ok,
      raw_response: payload,
      error_message: errMsg,
    });
    if (error) throw new Error(`寫入稽核紀錄失敗：${error.message}`);
  }

  // 依事件結果同步訂單狀態
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const appendNote = (line: string) => `${order.notes ? order.notes + "\n" : ""}🔒 ${stamp} ${line}`;
  const orderPatch: Json = {};

  if (eventType === "refund") {
    if (ok) {
      const refunded = Math.abs(num(payload.refunded_amount) ?? amount ?? 0);
      orderPatch.refunded_amount = Math.max(Number(order.refunded_amount || 0), refunded);
      orderPatch.paid_amount = Math.max(0, Number(order.paid_amount || 0) - refunded);
      orderPatch.payment_status = "refunded";
      orderPatch.notes = appendNote(`TapPay 退款成功 NT$${refunded.toLocaleString()}（交易 ${recTradeId}）`);
    } else {
      orderPatch.notes = appendNote(`TapPay 退款失敗（${errMsg}），需人工處理（交易 ${recTradeId}）`);
    }
  } else {
    if (ok) {
      const charged = Math.abs(amount ?? 0);
      const newPaid = Math.max(Number(order.paid_amount || 0), charged);
      orderPatch.paid_amount = newPaid;
      orderPatch.payment_status = newPaid >= Number(order.final_price || 0) ? "paid" : "partial";
      if (order.room_charge_status && order.room_charge_status !== "cancelled") {
        orderPatch.room_charge_status = "charged";
        orderPatch.room_charge_at = new Date().toISOString();
        orderPatch.room_charge_rec_trade_id = recTradeId;
        orderPatch.room_charge_error = null;
      }
      orderPatch.notes = appendNote(`TapPay 扣款成功 NT$${charged.toLocaleString()}（交易 ${recTradeId}）`);
    } else {
      orderPatch.payment_status = Number(order.paid_amount || 0) > 0 ? order.payment_status : "unpaid";
      if (order.room_charge_status && order.room_charge_status !== "cancelled") {
        orderPatch.room_charge_status = "failed";
        orderPatch.room_charge_error = errMsg;
      }
      orderPatch.notes = appendNote(`TapPay 扣款失敗（${errMsg}），已回滾付款狀態，需人工處理`);
    }
  }

  if (Object.keys(orderPatch).length > 0) {
    const { error: updErr } = await supabase.from("orders").update(orderPatch).eq("id", order.id);
    if (updErr) throw new Error(updErr.message);
  }

  // App 推播：付款成功／退款完成（ATM 入帳、3DS 補回呼皆走這裡）
  if (ok) {
    if (eventType === "refund") {
      await pushOrderEvent(order.id, "order_cancelled", {
        amount: Number(orderPatch.refunded_amount ?? 0),
      });
    } else {
      await pushOrderEvent(order.id, "payment_success", {
        amount: Number(orderPatch.paid_amount ?? order.paid_amount ?? 0),
      });
    }
  }

  return { matched: true, ok, orderId: order.id, orderNumber: order.order_number, eventType };
}

