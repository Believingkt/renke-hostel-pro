import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getTapPayEndpoints } from "../_shared/tappay.ts";

/**
 * 管理員手動同步 TapPay 退款狀態
 * 入口：POST { orderId: string }
 * 流程：
 *  1. 驗證呼叫者為該訂單民宿之 hotel_admin / super_admin
 *  2. 從 orders.notes 抓取 rec_trade_id（最後一個出現的）
 *  3. 呼叫 TapPay Record API 取得最新 refunded_amount / record_status
 *  4. 與 notes 中既有的 [TAPPAY_SYNC_REFUNDED:N] 比對，計算增量
 *  5. 更新 paid_amount / payment_status / notes / notifications
 *  6. 回傳結果摘要
 */

const SYNC_MARKER_RE = /\[TAPPAY_SYNC_REFUNDED:(\d+)\]/g;

function extractLatestSyncedRefund(notes: string | null): number {
  if (!notes) return 0;
  let last = 0;
  for (const m of notes.matchAll(SYNC_MARKER_RE)) {
    last = parseInt(m[1], 10) || 0;
  }
  return last;
}

function extractRecTradeId(notes: string | null): string | null {
  if (!notes) return null;
  // 常見格式: rec_trade_id: XXXXXX / rec_trade_id=XXXXX / (rec_trade_id: XXXX,
  const re = /rec_trade_id[:\s=]+([A-Za-z0-9_-]{8,64})/gi;
  const ids: string[] = [];
  for (const m of notes.matchAll(re)) ids.push(m[1]);
  return ids.length ? ids[ids.length - 1] : null;
}

function paymentStatusFromAmounts(finalPrice: number, paidAmount: number): string {
  if (paidAmount <= 0) return "refunded";
  if (paidAmount < finalPrice) return "partial_refunded";
  return "paid";
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "未授權" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const orderId: string = body?.orderId;
    if (!orderId || typeof orderId !== "string") {
      return new Response(JSON.stringify({ error: "缺少 orderId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, final_price, paid_amount, payment_status, notes, accommodation_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "找不到訂單" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 權限：該民宿 hotel_admin / super_admin
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("accommodation_id", order.accommodation_id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    const isAdmin = roles.includes("hotel_admin") || roles.includes("super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "權限不足，僅管理員可同步" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recTradeId = extractRecTradeId(order.notes);
    if (!recTradeId) {
      return new Response(
        JSON.stringify({ error: "此訂單 notes 中找不到 rec_trade_id，無法同步" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    if (!partnerKey) {
      return new Response(JSON.stringify({ error: "TapPay 未設定" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { env } = getTapPayEndpoints();
    const queryUrl = env === "sandbox"
      ? "https://sandbox.tappaysdk.com/tpc/transaction/query"
      : "https://prod.tappaysdk.com/tpc/transaction/query";

    const tpResp = await fetch(queryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({
        partner_key: partnerKey,
        records_per_page: 1,
        filters: { rec_trade_id: recTradeId },
      }),
    });
    const tpJson = await tpResp.json();
    console.log("[tappay-sync-refund] TapPay Record:", { status: tpJson.status, msg: tpJson.msg });

    if (tpJson.status !== 0 && tpJson.status !== 2) {
      return new Response(
        JSON.stringify({ error: `TapPay 查詢失敗: ${tpJson.msg ?? tpJson.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const record = tpJson.trade_records?.[0];
    if (!record) {
      return new Response(JSON.stringify({ error: "TapPay 查無此交易紀錄" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txAmount: number = Number(record.amount ?? 0);
    const refundedAmountTotal: number = Number(record.refunded_amount ?? 0);
    const recordStatus: number = Number(record.record_status ?? -1);

    const prevSynced = extractLatestSyncedRefund(order.notes);
    const delta = Math.max(0, refundedAmountTotal - prevSynced);

    if (delta <= 0 && refundedAmountTotal === prevSynced) {
      return new Response(
        JSON.stringify({
          success: true,
          changed: false,
          message: "已是最新狀態，無需更新",
          rec_trade_id: recTradeId,
          tx_amount: txAmount,
          refunded_amount_total: refundedAmountTotal,
          record_status: recordStatus,
          payment_status: order.payment_status,
          paid_amount: order.paid_amount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const currentPaid = Number(order.paid_amount ?? 0);
    const newPaid = Math.max(0, currentPaid - delta);
    const newStatus = paymentStatusFromAmounts(Number(order.final_price ?? 0), newPaid);

    const stamp = new Date().toISOString();
    const noteLine =
      `[TapPay 同步] ${stamp} - 退款累計 NT$${refundedAmountTotal.toLocaleString()}` +
      `（本次新增 NT$${delta.toLocaleString()}，rec_trade_id: ${recTradeId}，record_status: ${recordStatus}） [TAPPAY_SYNC_REFUNDED:${refundedAmountTotal}]`;
    const newNotes = order.notes ? `${order.notes}\n${noteLine}` : noteLine;

    const { error: updErr } = await supabase
      .from("orders")
      .update({
        paid_amount: newPaid,
        payment_status: newStatus,
        notes: newNotes,
        updated_at: stamp,
      })
      .eq("id", order.id);
    if (updErr) {
      console.error("[tappay-sync-refund] update error:", updErr);
      return new Response(JSON.stringify({ error: "更新訂單失敗" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("notifications").insert({
      accommodation_id: order.accommodation_id,
      type: "payment",
      title: "TapPay 退款狀態已同步",
      description:
        `訂單 ${order.order_number} 同步退款 NT$${delta.toLocaleString()}` +
        `（累計 NT$${refundedAmountTotal.toLocaleString()}）。付款狀態：${newStatus}，已付金額 NT$${newPaid.toLocaleString()}。`,
      order_id: order.id,
      is_read: false,
    });

    return new Response(
      JSON.stringify({
        success: true,
        changed: true,
        rec_trade_id: recTradeId,
        tx_amount: txAmount,
        refunded_amount_total: refundedAmountTotal,
        delta,
        record_status: recordStatus,
        previous_paid_amount: currentPaid,
        new_paid_amount: newPaid,
        new_payment_status: newStatus,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[tappay-sync-refund] error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "系統錯誤" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
