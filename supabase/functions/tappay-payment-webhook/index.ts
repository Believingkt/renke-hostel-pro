// tappay-payment-webhook
// 接收 TapPay Notify（授權／請款／退款結果），即時同步到 orders 與 deposit_charges。
// 失敗時：回滾訂單付款狀態，並把該筆金流紀錄標記為 needs_manual_review 供客服追查。
//
// 安全性：以 query string ?key=<TAPPAY_WEBHOOK_SECRET> 驗證來源（於 TapPay 後台 notify_url 設定）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

type Json = Record<string, unknown>;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 由 TapPay order_number 還原 PMS 訂單編號（我們送出時會加前綴） */
function stripPrefix(orderNumber: string | null): string | null {
  if (!orderNumber) return null;
  return orderNumber.replace(/^(ROOM|CXL|DEP|ATM)-/, "");
}

function classify(payload: Json): "refund" | "charge" {
  const recordStatus = num(payload.record_status);
  if (num(payload.refunded_amount) && (num(payload.refunded_amount) as number) > 0) return "refund";
  // TapPay record_status: 0=已授權未請款, 1=已請款, 2=已退款/取消
  if (recordStatus === 2) return "refund";
  if (typeof payload.transaction_type === "string" && payload.transaction_type.includes("refund")) return "refund";
  return "charge";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  const secret = Deno.env.get("TAPPAY_WEBHOOK_SECRET");
  if (secret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get("key") || req.headers.get("x-webhook-key");
    if (provided !== secret) {
      console.warn("[tappay-webhook] rejected: bad key");
      return json({ success: false, message: "Unauthorized" }, 401);
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let payload: Json = {};
  try {
    payload = (await req.json()) as Json;
  } catch {
    return json({ success: false, message: "Invalid JSON" }, 400);
  }

  const recTradeId = (payload.rec_trade_id as string) || null;
  const rawOrderNumber = (payload.order_number as string) || null;
  const orderNumber = stripPrefix(rawOrderNumber);
  const status = num(payload.status);
  const amount = num(payload.amount);
  const eventType = classify(payload);
  const ok = status === 0;

  console.log("[tappay-webhook] received", { recTradeId, rawOrderNumber, status, eventType, amount });

  // 1) 一律先落地原始事件
  const { data: eventRow } = await supabase
    .from("tappay_webhook_events")
    .insert({
      rec_trade_id: recTradeId,
      order_number: orderNumber,
      bank_transaction_id: (payload.bank_transaction_id as string) || null,
      event_type: eventType,
      status,
      amount,
      currency: (payload.currency as string) || "TWD",
      raw: payload,
    })
    .select("id")
    .single();

  const finish = async (patch: Json) => {
    if (eventRow?.id) await supabase.from("tappay_webhook_events").update(patch).eq("id", eventRow.id);
  };

  try {
    // 2) 找出對應訂單
    let order: any = null;
    if (recTradeId) {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, room_charge_status, notes, refunded_amount, cancellation_fee_amount")
        .or(`room_charge_rec_trade_id.eq.${recTradeId},atm_rec_trade_id.eq.${recTradeId}`)
        .maybeSingle();
      order = data;
    }
    if (!order && orderNumber) {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, accommodation_id, final_price, paid_amount, payment_status, order_status, room_charge_status, notes, refunded_amount, cancellation_fee_amount")
        .eq("order_number", orderNumber)
        .maybeSingle();
      order = data;
    }

    if (!order) {
      await finish({ processed: true, process_error: "找不到對應訂單" });
      console.warn("[tappay-webhook] no matching order", { recTradeId, orderNumber });
      return json({ success: true, matched: false });
    }

    // 3) 同步 deposit_charges（金流稽核流水）
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

    const chargePatch: Json = {
      status: ok ? "success" : "failed",
      webhook_status: ok ? "confirmed" : "failed",
      bank_transaction_id: (payload.bank_transaction_id as string) || null,
      raw_response: payload,
      needs_manual_review: !ok,
      error_message: ok ? null : ((payload.msg as string) || `TapPay status ${status}`),
    };

    if (chargeRow) {
      await supabase.from("deposit_charges").update(chargePatch).eq("id", chargeRow.id);
    } else {
      await supabase.from("deposit_charges").insert({
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
        error_message: ok ? null : ((payload.msg as string) || `TapPay status ${status}`),
      });
    }

    // 4) 依事件結果同步訂單狀態
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
        orderPatch.notes = appendNote(
          `TapPay 退款失敗（${(payload.msg as string) || status}），需人工處理（交易 ${recTradeId}）`,
        );
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
        // 回滾：授權/請款失敗，訂單不可保留在已付款狀態
        orderPatch.payment_status = Number(order.paid_amount || 0) > 0 ? order.payment_status : "unpaid";
        if (order.room_charge_status && order.room_charge_status !== "cancelled") {
          orderPatch.room_charge_status = "failed";
          orderPatch.room_charge_error = (payload.msg as string) || `TapPay status ${status}`;
        }
        orderPatch.notes = appendNote(
          `TapPay 扣款失敗（${(payload.msg as string) || status}），已回滾付款狀態，需人工處理`,
        );
      }
    }

    if (Object.keys(orderPatch).length > 0) {
      const { error: updErr } = await supabase.from("orders").update(orderPatch).eq("id", order.id);
      if (updErr) throw new Error(updErr.message);
    }

    await finish({ processed: true, matched_order_id: order.id, process_error: null });
    return json({ success: true, matched: true, orderNumber: order.order_number, eventType, ok });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[tappay-webhook] processing failed", message);
    await finish({ processed: false, process_error: message });
    return json({ success: false, message }, 500);
  }
});
