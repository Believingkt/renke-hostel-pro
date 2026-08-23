// 團購信用卡 3DS 回程：驗證付款 → 建立正式訂單（Phase G2）
//
// 公開端點，但不信任任何前端輸入的金額或訂單資料：
// 一律以 group_buy_payment_drafts + TapPay transaction/query 為準。
// 真正的建單邏輯集中在 _shared/groupBuyCreditCompletion.ts（與 tappay-notify 補救共用）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { completeGroupBuyCreditOrder } from "../_shared/groupBuyCreditCompletion.ts";
import { bankToInfo, formatTaipei, paymentDeadline } from "../_shared/groupBuy.ts";

const FN = "group-buy-complete-paid-order";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const draftId = String(body.draftId ?? "").trim() || null;
    const recTradeId = String(body.recTradeId ?? "").trim() || null;
    if (!draftId && !recTradeId) {
      return json({ success: false, error: "缺少付款資訊" }, 400);
    }

    const result = await completeGroupBuyCreditOrder(admin, {
      draftId,
      recTradeId,
      authCode: String(body.authCode ?? "").trim() || null,
      source: "frontend",
    });

    if (!result.ok) {
      return json({
        success: false,
        error: result.error,
        manualReview: Boolean(result.manualReview),
        refunded: Boolean(result.refunded),
      }, result.status ?? 400);
    }

    // 回傳訂單摘要供結果頁顯示
    const { data: order } = await admin
      .from("orders")
      .select("id, order_number, check_in_date, check_out_date, total_price, deposit_amount, paid_amount, guest_email, accommodation_id, created_at")
      .eq("id", result.orderId!)
      .maybeSingle();

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("campaign_id")
      .eq("order_id", result.orderId!)
      .maybeSingle();
    const { data: campaign } = commission?.campaign_id
      ? await admin
        .from("group_buy_campaigns")
        .select("id, title, deposit_percentage, payment_deadline_hours")
        .eq("id", commission.campaign_id)
        .maybeSingle()
      : { data: null as any };

    const { data: bankRow } = campaign?.id
      ? await admin
        .from("group_buy_bank_accounts")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      : { data: null as any };

    const deadline = order
      ? paymentDeadline(order.created_at ?? new Date().toISOString(), campaign?.payment_deadline_hours ?? 72)
      : null;

    return json({
      success: true,
      alreadyConverted: Boolean(result.alreadyConverted),
      orderNumber: result.orderNumber,
      order: order ?? null,
      campaignTitle: campaign?.title ?? null,
      balance: order ? Math.max(0, Number(order.total_price) - Number(order.paid_amount ?? 0)) : null,
      bank: bankToInfo(bankRow),
      paymentDeadlineText: deadline ? formatTaipei(deadline) : null,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ success: false, error: "無法確認付款結果，請稍後至訂單查詢頁確認或聯繫客服。" }, 500);
  }
});
