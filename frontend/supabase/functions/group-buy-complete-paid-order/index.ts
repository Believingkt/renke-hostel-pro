// 團購信用卡 3DS 回程：驗證付款 → 建立正式訂單（Phase G2）
//
// 公開端點，但不信任任何前端輸入的金額或訂單資料：
// 一律以 group_buy_payment_drafts + TapPay transaction/query 為準。
// 真正的建單邏輯集中在 _shared/groupBuyCreditCompletion.ts（與 tappay-notify 補救共用）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { completeGroupBuyCreditOrder } from "../_shared/groupBuyCreditCompletion.ts";


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
      .select(
        "id, order_number, check_in_date, check_out_date, total_price, final_price, deposit_amount, paid_amount, guest_name, guest_email, guest_count, adult_count, child_count, toddler_count, infant_count, room_quantity, room_type_id, accommodation_id, order_status, payment_status, payment_provider, payment_method, order_source, created_at",
      )
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

    const { data: acc } = order?.accommodation_id
      ? await admin
        .from("accommodation_info")
        .select("name, address, phone")
        .eq("id", order.accommodation_id)
        .maybeSingle()
      : { data: null as any };
    const { data: intro } = order?.accommodation_id
      ? await admin
        .from("group_buy_venue_intros")
        .select("address, phone")
        .eq("accommodation_id", order.accommodation_id)
        .maybeSingle()
      : { data: null as any };
    const { data: roomType } = order?.room_type_id
      ? await admin.from("room_types").select("name").eq("id", order.room_type_id).maybeSingle()
      : { data: null as any };

    // 此路徑一律為信用卡全額付款：不查、也不得回傳任何共用匯款帳號或匯款期限


    const paidAmount = Math.max(0, Math.round(Number(order?.paid_amount) || 0));
    const total = Math.max(0, Math.round(Number(order?.total_price) || 0));
    const maskedEmail = (() => {
      const em = String(order?.guest_email ?? "");
      const [local, domain] = em.split("@");
      if (!domain || !local) return null;
      return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`;
    })();

    return json({
      success: true,
      alreadyConverted: Boolean(result.alreadyConverted),
      orderNumber: result.orderNumber,
      order: order ?? null,
      campaignTitle: campaign?.title ?? null,
      // 信用卡＝全額預收：無訂金／尾款／匯款資訊
      fullPayment: true,
      total,
      paidAmount,
      deposit: 0,
      balance: 0,
      checkInDate: order?.check_in_date ?? null,
      checkOutDate: order?.check_out_date ?? null,
      guestEmailMasked: maskedEmail,
      // 訂單明細（結果頁直接顯示，不需再帶電話後四碼查詢）
      guestName: order?.guest_name ?? null,
      packageName: null,
      campaign: campaign ? { title: campaign.title } : null,
      roomTypeName: (roomType as any)?.name ?? null,
      roomQuantity: order?.room_quantity ?? null,
      nights: order
        ? Math.max(
          1,
          Math.round(
            (new Date(`${order.check_out_date}T00:00:00Z`).getTime() -
              new Date(`${order.check_in_date}T00:00:00Z`).getTime()) / 86400000,
          ),
        )
        : null,
      guestCount: order?.guest_count ?? null,
      adultCount: order?.adult_count ?? null,
      childCount: order?.child_count ?? null,
      toddlerCount: order?.toddler_count ?? null,
      infantCount: order?.infant_count ?? null,
      paymentProvider: order?.payment_provider ?? null,
      paymentMethod: order?.payment_method ?? null,
      paymentMethodText: "信用卡（3D 驗證）",
      cancellationPolicy: "full_prepayment",
      venue: acc
        ? {
          name: (acc as any).name ?? null,
          address: (intro as any)?.address || (acc as any).address || null,
          phone: (intro as any)?.phone || (acc as any).phone || null,
        }
        : null,
      // 信用卡全額付款一律不得回傳匯款資訊
      bank: null,
      paymentDeadlineText: null,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ success: false, error: "無法確認付款結果，請稍後至訂單查詢頁確認或聯繫客服。" }, 500);
  }
});
