// tappay-webhook-retry
// 排程（每 10 分鐘）：重試處理失敗的 TapPay webhook 事件。
// 指數退避 5 / 20 / 60 分鐘，重試 3 次仍失敗 → gave_up = true、
// 對應 deposit_charges 標記 needs_manual_review，並寄出告警信。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { MAX_RETRIES, nextRetryAt, processTapPayEvent } from "../_shared/tappayWebhookProcessor.ts";
import { buildPaymentAlertHtml, sendPaymentAlertEmail } from "../_shared/paymentAlert.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const nowIso = new Date().toISOString();
  const { data: events, error } = await supabase
    .from("tappay_webhook_events")
    .select("id, rec_trade_id, order_number, event_type, amount, raw, retry_count, alerted_at")
    .eq("processed", false)
    .eq("gave_up", false)
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[webhook-retry] query failed:", error.message);
    return json({ success: false, message: error.message }, 500);
  }

  const gaveUp: {
    orderNumber: string | null;
    recTradeId: string | null;
    eventType: string;
    amount: number | null;
    retryCount: number;
    error: string | null;
  }[] = [];
  let recovered = 0;
  let rescheduled = 0;

  for (const ev of events ?? []) {
    const retryCount = Number(ev.retry_count || 0) + 1;
    let failure: string | null = null;

    try {
      const result = await processTapPayEvent(supabase, (ev.raw ?? {}) as Record<string, unknown>);
      if (!result.matched) {
        failure = result.reason ?? "找不到對應訂單";
      } else {
        await supabase
          .from("tappay_webhook_events")
          .update({
            processed: true,
            matched_order_id: result.orderId,
            process_error: null,
            retry_count: retryCount,
            last_retry_at: nowIso,
            next_retry_at: null,
          })
          .eq("id", ev.id);
        recovered++;
        console.log("[webhook-retry] recovered", ev.id, result.orderNumber);
        continue;
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }

    const exhausted = retryCount >= MAX_RETRIES;
    await supabase
      .from("tappay_webhook_events")
      .update({
        retry_count: retryCount,
        last_retry_at: nowIso,
        process_error: failure,
        next_retry_at: exhausted ? null : nextRetryAt(retryCount),
        gave_up: exhausted,
        alerted_at: exhausted ? nowIso : null,
      })
      .eq("id", ev.id);

    if (!exhausted) {
      rescheduled++;
      continue;
    }

    // 重試耗盡 → 標記對應稽核紀錄需人工處理
    if (ev.rec_trade_id) {
      await supabase
        .from("deposit_charges")
        .update({
          needs_manual_review: true,
          webhook_status: "failed",
          retry_count: retryCount,
          last_retry_at: nowIso,
          error_message: `Webhook 重試 ${retryCount} 次仍失敗：${failure}`,
        })
        .eq("rec_trade_id", ev.rec_trade_id);
    }

    gaveUp.push({
      orderNumber: ev.order_number,
      recTradeId: ev.rec_trade_id,
      eventType: ev.event_type === "refund" ? "退款" : "扣款",
      amount: ev.amount,
      retryCount,
      error: failure,
    });

    await reportBackendError({
      functionName: "tappay-webhook-retry",
      category: "tappay_webhook_gave_up",
      errorMessage: failure ?? "unknown",
      context: { eventId: ev.id, recTradeId: ev.rec_trade_id, orderNumber: ev.order_number },
    });
  }

  let alertSent = false;
  if (gaveUp.length > 0) {
    alertSent = await sendPaymentAlertEmail(
      supabase,
      `🚨 [Lakeze 金流] ${gaveUp.length} 筆 TapPay 事件重試失敗，需人工處理`,
      buildPaymentAlertHtml(gaveUp),
    );
  }

  const summary = { scanned: events?.length ?? 0, recovered, rescheduled, gaveUp: gaveUp.length, alertSent };
  console.log("[webhook-retry]", summary);
  return json({ success: true, ...summary });
});
