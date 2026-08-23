// 團購 Payment Draft 退款對帳（Phase G2-C／B5）
//
// 情境：信用卡付款成功但「無庫存 → 自動退款」時，因為根本沒有正式 order，
// 既有的 tappay-sync-refund（以 orders 為基準）無法涵蓋。本端點以 draft.rec_trade_id
// 直查 TapPay Record API，把 payment / refund 狀態回寫到 draft 上。
//
// 只讀 TapPay + 只寫 group_buy_payment_drafts / group_buy_payment_events，
// 不觸碰 orders、不觸碰一般訂房任何資料。
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { queryTapPayRecord } from "../_shared/tappay.ts";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller, unauthorizedResponse } from "../_shared/authz.ts";

const FN = "group-buy-draft-reconcile";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 由 TapPay record 推導 draft 的退款狀態 */
export function deriveRefundStatus(paidAmount: number, refundedAmount: number): string {
  if (paidAmount <= 0) return "none";
  if (refundedAmount <= 0) return "none";
  if (refundedAmount >= paidAmount) return "refunded";
  return "partial_refunded";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const caller = await resolveCaller(req);
    if (!caller.ok) return unauthorizedResponse(corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const draftId = String(body.draftId ?? "").trim();
    const accommodationId = String(body.accommodationId ?? "").trim() || null;

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY") ?? "";
    if (!partnerKey) return json({ error: "付款系統設定錯誤" }, 500);

    // 目標 draft：單筆，或該民宿所有「已收款但未轉單／需人工處理」的 draft
    let q = admin
      .from("group_buy_payment_drafts")
      .select("*")
      .not("rec_trade_id", "is", null);
    if (draftId) {
      q = q.eq("id", draftId);
    } else if (accommodationId) {
      q = q.eq("accommodation_id", accommodationId).in("status", ["paid", "manual_review", "failed"]).limit(50);
    } else {
      return json({ error: "缺少 draftId 或 accommodationId" }, 400);
    }
    const { data: drafts, error: dErr } = await q;
    if (dErr) throw dErr;
    if (!drafts || drafts.length === 0) return json({ success: true, checked: 0, results: [] });

    // 權限：super_admin 或該民宿 hotel_admin
    const accIds = [...new Set(drafts.map((d: any) => d.accommodation_id))];
    if (!isSuperAdmin(caller.ctx)) {
      for (const accId of accIds) {
        if (!(await isAccommodationAdmin(caller.ctx, accId))) {
          return forbiddenResponse(corsHeaders, "無權查看此民宿的付款資料");
        }
      }
    }

    const results: any[] = [];
    for (const d of drafts) {
      const record = await queryTapPayRecord({ partnerKey, recTradeId: d.rec_trade_id });
      if (!record.found) {
        results.push({ draftId: d.id, recTradeId: d.rec_trade_id, found: false });
        continue;
      }
      const paid = Math.round(Number(record.amount) || 0);
      const refunded = Math.round(Number(record.refundedAmount) || 0);
      const refundStatus = deriveRefundStatus(paid, refunded);
      const changed = refunded !== Math.round(Number(d.refunded_amount) || 0) ||
        refundStatus !== (d.refund_status ?? null);

      await admin
        .from("group_buy_payment_drafts")
        .update({
          refunded_amount: refunded,
          refund_status: refundStatus,
          refund_rec_trade_id: d.rec_trade_id,
          refund_checked_at: new Date().toISOString(),
          last_error: changed
            ? `${d.last_error ?? ""}／[TAPPAY_SYNC] record_status=${record.recordStatus}／paid=${paid}／refunded=${refunded}`
              .slice(0, 1000)
            : d.last_error,
        })
        .eq("id", d.id);

      if (changed) {
        await admin.from("group_buy_payment_events").insert({
          campaign_id: d.campaign_id,
          order_id: d.converted_order_id ?? null,
          event_type: refundStatus === "refunded" ? "refunded" : "note",
          amount: refunded,
          actor_label: "admin(reconcile)",
          note:
            `Draft 退款對帳（draft:${d.id}／rec_trade_id:${d.rec_trade_id}／record_status:${record.recordStatus}／實收 ${paid}／已退 ${refunded}／狀態 ${refundStatus}）`,
        });
      }

      results.push({
        draftId: d.id,
        recTradeId: d.rec_trade_id,
        found: true,
        recordStatus: record.recordStatus,
        paidAmount: paid,
        refundedAmount: refunded,
        refundStatus,
        changed,
      });
    }

    return json({ success: true, checked: results.length, results });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "退款對帳失敗，請稍後再試" }, 500);
  }
});
