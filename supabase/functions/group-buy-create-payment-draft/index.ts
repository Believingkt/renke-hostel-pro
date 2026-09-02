// 團購信用卡付款草稿（Phase G2）
//
// 信用卡流程「付款成功後才建立正式 orders」。本端點只負責：
//   1. 完整重跑團購驗證／計價（共用 _shared/groupBuyBooking.ts）
//   2. 落地 group_buy_payment_drafts（10 分鐘付款保留）
//   3. 回傳 draft_id / amount_to_charge / expires_at
//
// 絕不建立 orders、group_buy_commissions、正式 Email／通知或任何分潤資料。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { validateAndPriceGroupBuyBooking } from "../_shared/groupBuyBooking.ts";

const FN = "group-buy-create-payment-draft";
/** 付款保留時間（分鐘） */
export const HOLD_MINUTES = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ipMap = new Map<string, { n: number; reset: number }>();
function rateOk(ip: string) {
  const now = Date.now();
  const rec = ipMap.get(ip);
  if (!rec || now > rec.reset) {
    ipMap.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (rec.n >= 10) return false;
  rec.n++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateOk(ip)) return json({ error: "請求過於頻繁，請稍後再試" }, 429);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const validated = await validateAndPriceGroupBuyBooking(
      admin,
      {
        slug: String(body.slug ?? "").trim(),
        campaignPackageId: String(body.campaignPackageId ?? "").trim(),
        checkInDate: String(body.checkInDate ?? "").trim(),
        checkOutDate: String(body.checkOutDate ?? "").trim(),
        adultCount: Number(body.adultCount ?? 2),
        childCount: Number(body.childCount ?? 0),
        toddlerCount: Number(body.toddlerCount ?? 0),
        infantCount: Number(body.infantCount ?? 0),
        roomTypeId: typeof body.roomTypeId === "string" ? body.roomTypeId : null,
        guestName: String(body.guestName ?? ""),
        guestPhone: String(body.guestPhone ?? ""),
        guestEmail: String(body.guestEmail ?? ""),
        guestNote: String(body.guestNote ?? ""),
      },
      { expectProvider: "tappay" },
    );
    if (!validated.ok) return json({ error: validated.error }, validated.status);
    const plan = validated.plan;

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    // idempotency_key 同時作為 TapPay order_number（<= 50 字元）
    const idempotencyKey = `GB${crypto.randomUUID().replace(/-/g, "").slice(0, 22).toUpperCase()}`;

    // 原子取得房位保留（B2）：DB 內 advisory xact lock → 重驗庫存 → INSERT draft
    // 庫存不足時不會產生 draft，也不會產生 hold。
    const { data: holdRaw, error: hErr } = await admin.rpc("acquire_group_buy_payment_hold", {
      p_payload: {
        idempotency_key: idempotencyKey,
        campaign_id: plan.campaign.id,
        campaign_package_id: plan.pkg.id,
        accommodation_id: plan.campaign.accommodation_id,
        room_type_id: plan.roomTypeId,
        check_in_date: plan.input.checkInDate,
        check_out_date: plan.input.checkOutDate,
        room_quantity: plan.roomQuantity,
        dates: plan.dates,
        adult_count: plan.input.adultCount,
        child_count: plan.input.childCount,
        toddler_count: plan.input.toddlerCount,
        infant_count: plan.input.infantCount,
        guest_count: plan.input.guestCount,
        guest_name: plan.input.guestName,
        guest_phone: plan.input.guestPhone,
        guest_email: plan.input.guestEmail,
        guest_note: plan.input.guestNote,
        booking_payload: {
          slug: plan.campaign.slug,
          campaign_title: plan.campaign.title,
          package_name: plan.pkg.display_name,
          nights: plan.nights,
          guest_composition: plan.guestComposition,
          origin: typeof body.origin === "string" ? body.origin : null,
        },
        price_snapshot: plan.priceSnapshot,
        total_price: plan.total,
        deposit_amount: plan.deposit,
        // 團購信用卡＝全額付款；落地後即固定，付款時不再依 campaign 即時計算
        amount_to_charge: plan.total,
        payment_provider: "tappay",
        payment_type: "credit_card",
        expires_at: expiresAt.toISOString(),
      },
    });
    if (hErr) {
      console.error(`[${FN}] acquire hold failed`, hErr);
      return json({ error: "目前無法開始付款，請稍後再試或聯繫客服。" }, 500);
    }
    const hold = (holdRaw ?? {}) as any;
    if (!hold.ok) {
      return json(
        { error: hold.error ?? "目前房位已被其他旅客暫時保留，請重新選擇。", code: hold.code ?? "hold_unavailable" },
        409,
      );
    }
    const draft = hold.draft as any;


    return json({
      success: true,
      draftId: draft.id,
      idempotencyKey: draft.idempotency_key,
      amountToCharge: draft.amount_to_charge,
      expiresAt: draft.expires_at,
      holdMinutes: HOLD_MINUTES,
      chargeMode: "full",
      total: plan.total,
      deposit: 0,
      balance: 0,
      depositPercentage: plan.campaign.deposit_percentage,
      packageName: plan.pkg.display_name,
      campaignTitle: plan.campaign.title,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "目前無法開始付款，請稍後再試或聯繫客服。" }, 500);
  }
});
