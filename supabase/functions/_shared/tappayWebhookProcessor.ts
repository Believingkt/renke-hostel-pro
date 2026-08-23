// 共用：TapPay Webhook 事件處理核心（供 tappay-payment-webhook 即時處理與 tappay-webhook-retry 重試共用）
import { pushOrderEvent } from "./push.ts";
import { computeRefundAmounts } from "./refundIdempotency.ts";
import {
  eventSignature,
  isNoOpCharge,
  isStaleRefund,
  signatureFromRaw,
} from "./tappayEventDedupe.ts";



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
  "id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, room_charge_status, room_charge_rec_trade_id, notes, refunded_amount, cancellation_fee_amount";

export interface ProcessResult {
  matched: boolean;
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  eventType: "refund" | "charge";
  reason?: string;
  /** Q3-B：判定為「先前已成功處理過的相同事件」，本次不再產生副作用 */
  duplicate?: boolean;
}

/** Q3-B：查詢是否已有「相同指紋且成功處理完成」的事件 */
async function findProcessedDuplicate(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  recTradeId: string | null,
  signature: string,
  eventType: "refund" | "charge",
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  if (!recTradeId) return null;
  const { data, error } = await supabase
    .from("tappay_webhook_events")
    .select("id, raw, status, amount, matched_order_id, order_number")
    .eq("rec_trade_id", recTradeId)
    .eq("event_type", eventType)
    .eq("processed", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return null;
  // deno-lint-ignore no-explicit-any
  return (data as any[]).find((row) =>
    signatureFromRaw(row.raw as Record<string, unknown> | null, {
      eventType,
      status: num(row.status),
      amount: num(row.amount),
    }) === signature
  ) ?? null;
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

  // Q3-B：同一事件（相同 rec_trade_id + 事件種類 + 狀態 + 金額 + 累計退款額）
  // 若先前已成功處理完成，直接視為重送，不再執行任何副作用。
  const signature = eventSignature({
    eventType,
    status,
    amount,
    refundedTotal: num(payload.refunded_amount),
  });
  const dup = await findProcessedDuplicate(supabase, recTradeId, signature, eventType);
  if (dup) {
    console.log("[tappay] duplicate event skipped", { recTradeId, signature });
    return {
      matched: true,
      ok,
      eventType,
      duplicate: true,
      orderId: dup.matched_order_id ?? undefined,
      orderNumber: orderNumber ?? dup.order_number ?? undefined,
    };
  }


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
  // Q3-B：無實質變化的重送／亂序舊事件 → 不改 orders（連帶不觸發 OwlTing / Hotelnabe）、不寫 notes、不推播
  let noOp = false;

  if (eventType === "refund") {
    if (ok) {
      const refunded = Math.abs(num(payload.refunded_amount) ?? amount ?? 0);
      // Q3-A：payload.refunded_amount 為「累計退款額」，以差額扣減 paid_amount，
      // 同一退款 callback 重送時 delta = 0，不會重複扣減。
      const { newPaid, newRefundedTotal, delta } = computeRefundAmounts({
        currentPaid: Number(order.paid_amount || 0),
        currentRefundedTotal: Number(order.refunded_amount || 0),
        incomingRefundedTotal: num(payload.refunded_amount),
        fallbackAmount: amount,
      });
      if (isStaleRefund(Number(order.refunded_amount || 0), delta)) {
        noOp = true;
      } else {
        orderPatch.refunded_amount = newRefundedTotal;
        orderPatch.paid_amount = newPaid;
        orderPatch.payment_status = "refunded";
        orderPatch.notes = appendNote(`TapPay 退款成功 NT$${refunded.toLocaleString()}（交易 ${recTradeId}）`);
      }
    } else {
      orderPatch.notes = appendNote(`TapPay 退款失敗（${errMsg}），需人工處理（交易 ${recTradeId}）`);
    }

  } else {
    if (ok) {
      const charged = Math.abs(amount ?? 0);
      const newPaid = Math.max(Number(order.paid_amount || 0), charged);
      const newStatus = newPaid >= Number(order.final_price || 0) ? "paid" : "deposit_paid";
      if (
        isNoOpCharge({
          currentPaid: Number(order.paid_amount || 0),
          newPaid,
          currentPaymentStatus: order.payment_status ?? null,
          newPaymentStatus: newStatus,
          currentRoomChargeStatus: order.room_charge_status ?? null,
          currentRoomChargeRecTradeId: order.room_charge_rec_trade_id ?? null,
          incomingRecTradeId: recTradeId,
        })
      ) {
        noOp = true;
      } else {
        orderPatch.paid_amount = newPaid;
        orderPatch.payment_status = newStatus;
        if (order.room_charge_status && order.room_charge_status !== "cancelled") {
          orderPatch.room_charge_status = "charged";
          orderPatch.room_charge_at = new Date().toISOString();
          orderPatch.room_charge_rec_trade_id = recTradeId;
          orderPatch.room_charge_error = null;
        }
        orderPatch.notes = appendNote(`TapPay 扣款成功 NT$${charged.toLocaleString()}（交易 ${recTradeId}）`);
      }
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
  if (ok && !noOp) {
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

  return {
    matched: true,
    ok,
    orderId: order.id,
    orderNumber: order.order_number,
    eventType,
    duplicate: noOp || undefined,
  };

}

