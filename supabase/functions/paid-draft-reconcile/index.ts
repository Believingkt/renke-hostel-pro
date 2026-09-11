// 一般訂房「付款成功但建單失敗」補救掃描（比照 group-buy-draft-reconcile）
//
// 只掃 pending_paid_order_drafts 靜置超過 15 分鐘的 pending_3ds / manual_review /
// payment_succeeded 草稿，以 TapPay Record API 核對真實扣款狀態：
//   已扣款且查無訂單 → 呼叫既有 create-paid-order（post-charge 模式）補建
//   確認未扣款        → 草稿標 failed（逾 7 天標 expired）
//   無法確定／金額不符 → 草稿標 manual_review + error_logs + 後台通知
//
// 本函式只 UPDATE pending_paid_order_drafts 自身狀態欄位，orders 一律透過
// create-paid-order 建立。不修改 create-paid-order、tappay-notify 任何程式碼。
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { queryTapPayRecord } from "../_shared/tappay.ts";
import { reportBackendError } from "../_shared/errorReporter.ts";

const FN = "paid-draft-reconcile";
const STALE_MINUTES = 15;
const EXPIRE_DAYS = 7;
const BATCH_LIMIT = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dryRun === true;
    const draftId = String(body.draftId ?? "").trim();

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY") ?? "";
    if (!partnerKey) return json({ error: "付款系統設定錯誤" }, 500);

    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

    let q = admin
      .from("pending_paid_order_drafts")
      .select("*")
      .in("status", ["pending_3ds", "manual_review", "payment_succeeded"])
      .lt("updated_at", staleBefore)
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT);
    if (draftId) q = q.eq("id", draftId);

    const { data: drafts, error: dErr } = await q;
    if (dErr) throw dErr;
    if (!drafts || drafts.length === 0) {
      return json({ success: true, dryRun, checked: 0, results: [] });
    }

    const results: any[] = [];

    for (const d of drafts) {
      const ageMs = Date.now() - new Date(d.created_at).getTime();
      const tooOld = ageMs > EXPIRE_DAYS * 24 * 60 * 60_000;

      const markDraft = async (patch: Record<string, unknown>) => {
        if (dryRun) return;
        await admin
          .from("pending_paid_order_drafts")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", d.id);
      };

      // 1) 已有對應訂單 → 直接收斂草稿
      const { data: existingOrder } = await admin
        .from("orders")
        .select("id, order_number")
        .eq("idempotency_key", d.idempotency_key)
        .maybeSingle();
      if (existingOrder) {
        await markDraft({ status: "order_created", order_id: existingOrder.id });
        results.push({
          draftId: d.id,
          decision: "order_already_exists",
          orderNumber: existingOrder.order_number,
        });
        continue;
      }

      // 2) 缺 rec_trade_id → 無法確定
      if (!d.rec_trade_id) {
        await markDraft({
          status: tooOld ? "expired" : "manual_review",
          last_error: `[${FN}] 缺少 rec_trade_id，無法向 TapPay 核對`,
        });
        results.push({ draftId: d.id, decision: tooOld ? "expired_no_rec_trade_id" : "manual_review_no_rec_trade_id" });
        continue;
      }

      // 3) 向 TapPay 核對
      let record;
      try {
        record = await queryTapPayRecord({ partnerKey, recTradeId: String(d.rec_trade_id) });
      } catch (e) {
        await markDraft({ status: "manual_review", last_error: `[${FN}] TapPay 查詢失敗：${String(e)}`.slice(0, 1000) });
        results.push({ draftId: d.id, decision: "manual_review_query_failed", error: String(e) });
        continue;
      }

      if (!record.found) {
        await markDraft({
          status: tooOld ? "expired" : "failed",
          last_error: `[${FN}] TapPay 查無此交易，判定未扣款`,
        });
        results.push({ draftId: d.id, decision: tooOld ? "expired_not_charged" : "failed_not_charged" });
        continue;
      }

      const charged = record.recordStatus === 0 || record.recordStatus === 1;
      if (!charged) {
        await markDraft({
          status: tooOld ? "expired" : "failed",
          last_error: `[${FN}] TapPay record_status=${record.recordStatus}，判定未扣款成功`,
        });
        results.push({
          draftId: d.id,
          decision: tooOld ? "expired_not_charged" : "failed_not_charged",
          recordStatus: record.recordStatus,
        });
        continue;
      }

      const paid = Math.round(Number(record.amount) || 0);
      if (paid !== Math.round(Number(d.expected_amount) || 0)) {
        await markDraft({
          status: "manual_review",
          last_error: `[${FN}] 金額不符：TapPay ${paid} / 草稿 ${d.expected_amount}`,
        });
        results.push({ draftId: d.id, decision: "manual_review_amount_mismatch", paidAmount: paid, expected: d.expected_amount });
        continue;
      }

      // 4) 已扣款、金額相符、查無訂單 → 補建
      if (dryRun) {
        results.push({
          draftId: d.id,
          decision: "would_create_order",
          recTradeId: d.rec_trade_id,
          paidAmount: paid,
          recordStatus: record.recordStatus,
        });
        continue;
      }

      await markDraft({ status: "payment_succeeded" });

      let created: any = null;
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/create-paid-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({
            idempotencyKey: d.idempotency_key,
            alreadyChargedRecTradeId: d.rec_trade_id,
          }),
        });
        created = await resp.json().catch(() => null);
        if (!resp.ok || !created?.success) throw new Error(created?.message ?? `HTTP ${resp.status}`);
      } catch (e) {
        await markDraft({ status: "manual_review", last_error: `[${FN}] 補建訂單失敗：${String(e)}`.slice(0, 1000) });
        await reportBackendError({
          functionName: FN,
          category: "paid_draft_recreate_failed",
          step: "create-paid-order",
          errorMessage: `草稿 ${d.id} 已扣款但補建訂單失敗：${String(e)}`,
          idempotencyKey: d.idempotency_key,
          context: { draftId: d.id, recTradeId: d.rec_trade_id, paidAmount: paid },
        }).catch(() => {});
        await admin.from("notifications").insert({
          type: "system",
          title: "付款成功但補建訂單失敗",
          message: `草稿 ${d.id}（rec_trade_id ${d.rec_trade_id}，金額 ${paid}）已扣款但無法補建訂單，需人工處理。`,
        }).then(undefined, () => {});
        results.push({ draftId: d.id, decision: "manual_review_recreate_failed", error: String(e) });
        continue;
      }

      await markDraft({ status: "order_created", order_id: created?.order?.id ?? null });
      // 補建成功也主動告警（首次於正式環境觸發時可立即得知，不必回頭查表）
      await admin.from("notifications").insert({
        type: "system",
        title: "補救排程成功補建訂單",
        message: `補救排程已為草稿 ${d.id}（rec_trade_id ${d.rec_trade_id}，金額 ${paid}）補建訂單 ${created?.order?.order_number ?? "(未知編號)"}。`,
      }).then(undefined, () => {});
      results.push({
        draftId: d.id,
        decision: "order_created",
        orderNumber: created?.order?.order_number ?? null,
        alreadyExists: created?.alreadyExists === true,
      });
    }

    console.log(`[${FN}] done`, { dryRun, checked: results.length });
    return json({ success: true, dryRun, checked: results.length, results });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "草稿對帳失敗", detail: String(e) }, 500);
  }
});
