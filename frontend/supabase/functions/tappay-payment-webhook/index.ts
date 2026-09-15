// tappay-payment-webhook
// 接收 TapPay Notify（授權／請款／退款結果），即時同步到 orders 與 deposit_charges。
// 處理失敗時：落地事件並排入自動重試（tappay-webhook-retry 每 10 分鐘掃描）。
//
// 安全性：以 query string ?key=<TAPPAY_WEBHOOK_SECRET> 驗證來源（於 TapPay 後台 notify_url 設定）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  classify,
  nextRetryAt,
  num,
  processTapPayEvent,
  stripPrefix,
} from "../_shared/tappayWebhookProcessor.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";

type Json = Record<string, unknown>;

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
  const orderNumber = stripPrefix((payload.order_number as string) || null);
  const status = num(payload.status);
  const amount = num(payload.amount);
  const eventType = classify(payload);

  console.log("[tappay-webhook] received", { recTradeId, orderNumber, status, eventType, amount });

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
    const result = await processTapPayEvent(supabase, payload);

    if (!result.matched) {
      // 訂單可能尚未寫入完成 → 排入重試
      await finish({
        processed: false,
        process_error: result.reason ?? "找不到對應訂單",
        next_retry_at: nextRetryAt(0),
      });
      console.warn("[tappay-webhook] no matching order, scheduled retry", { recTradeId, orderNumber });
      return json({ success: true, matched: false, willRetry: true });
    }

    await finish({ processed: true, matched_order_id: result.orderId, process_error: null, next_retry_at: null });
    return json({ success: true, matched: true, orderNumber: result.orderNumber, eventType, ok: result.ok });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[tappay-webhook] processing failed", message);
    await finish({ processed: false, process_error: message, next_retry_at: nextRetryAt(0) });
    await reportBackendError({
      functionName: "tappay-payment-webhook",
      category: "tappay_webhook_process",
      errorMessage: message,
      context: { recTradeId, orderNumber, eventType },
    });
    // 回 200 讓 TapPay 不重送，改由我們自己的重試機制掌控
    return json({ success: false, message, willRetry: true });
  }
});
