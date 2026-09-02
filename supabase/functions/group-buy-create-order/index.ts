// 團購頁下訂（銀行匯款／ATM）：驗證活動 / 方案 / 真實庫存 → 建立訂單 → 建立佣金列 → 寄出「訂房＋匯款資訊」信
// 公開端點（匿名可呼叫），所有價格與庫存一律由 server 端重算，不信任前端傳入金額。
//
// Phase G2 起，驗證／計價／建單一律使用 _shared/groupBuyBooking.ts 共用內核，
// 與信用卡（group-buy-complete-paid-order）共享同一套規則。本檔僅負責：
//   輸入解析 → 呼叫共用內核 → 匯款帳戶／通知信 → 回傳。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  bankToInfo,
  buildEmailOrder,
  formatTaipei,
  buildAdminGroupBuyUrl,
  paymentDeadline,
} from "../_shared/groupBuy.ts";
import { createGroupBuyOrderCore, validateAndPriceGroupBuyBooking } from "../_shared/groupBuyBooking.ts";
import {
  ATM_DEADLINE_TOO_LONG_MESSAGE,
  computeLocalDeadline,
  exceedsAtmDeadlineLimit,
} from "../_shared/groupBuyAtmDeadline.ts";
import { renderBookingWithBankInfo, renderVenueNewOrder, sendGroupBuyEmail } from "../_shared/groupBuyEmail.ts";
import { resolveOrderNotifyEmails } from "../_shared/notifyRecipients.ts";
import { resolveCampaignPayment } from "../_shared/paymentAdapter.ts";

const FN = "group-buy-create-order";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 簡易 IP 節流：每分鐘 10 次
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
        paymentMethod: typeof body.paymentMethod === "string" ? body.paymentMethod : null,
      },
      { expectProvider: "manual" },
    );
    if (!validated.ok) return json({ error: validated.error }, validated.status);
    const plan = validated.plan;
    const { campaign, pkg } = plan;

    // 付款方式：活動層設定（本端點僅服務 manual；信用卡走 payment draft 流程）
    const campaignPayment = resolveCampaignPayment(campaign.payment_method);
    if (campaignPayment.provider !== "manual") {
      return json({ error: "此團購活動的線上付款方式尚未啟用，請聯繫客服" }, 400);
    }
    // 銀行匯款關閉時（僅 ATM 可用），不得出現任何匯款資訊
    const bankEnabled = campaign.enable_bank_transfer !== false;
    const requestedMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : null;
    const isAtm = requestedMethod === "atm" || !bankEnabled;

    // ATM 新制：本地付款期限必須能被 TapPay provider 期限覆蓋（>168h 一律不得建立 ATM 訂單）
    if (isAtm && exceedsAtmDeadlineLimit(campaign.payment_deadline_hours)) {
      return json({ error: ATM_DEADLINE_TOO_LONG_MESSAGE }, 400);
    }

    const created = await createGroupBuyOrderCore(admin, plan, {
      paymentProvider: campaignPayment.provider,
      paymentMethod: isAtm ? "atm" : campaignPayment.paymentMethod,
    });
    if (!created.ok) return json({ error: created.error }, created.status);
    const order = created.order;

    /**
     * ATM NEW CONTRACT：寫入本地商業付款期限（絕對時間，之後活動改設定也不重算）。
     * 只寫新訂單、只在欄位仍為 NULL 時寫入；不得碰 atm_expire_at（provider 期限）。
     */
    let localDeadline: Date | null = null;
    if (isAtm) {
      localDeadline = computeLocalDeadline(
        order.created_at ?? order.order_date ?? new Date().toISOString(),
        campaign.payment_deadline_hours,
      );
      const { error: dlErr } = await admin
        .from("orders")
        .update({ group_buy_payment_deadline_at: localDeadline.toISOString() })
        .eq("id", order.id)
        .is("group_buy_payment_deadline_at", null);
      if (dlErr) console.error(`[${FN}] write local deadline failed`, dlErr);
    }

    const total = plan.total;
    const deposit = plan.deposit;
    const balance = plan.balance;
    const guestEmail = plan.input.guestEmail;

    // 匯款帳戶 + 通知信
    const { data: bankRow } = isAtm ? { data: null } : await admin
      .from("group_buy_bank_accounts")
      .select("*")
      .eq("campaign_id", campaign.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { data: acc } = await admin
      .from("accommodation_info")
      .select("name")
      .eq("id", campaign.accommodation_id)
      .maybeSingle();

    const origin = new URL(req.url).searchParams.get("origin") ||
      (typeof body.origin === "string" ? body.origin : null);
    const emailOrder = buildEmailOrder({
      order,
      campaign,
      accommodationName: (acc as any)?.name ?? null,
      packageName: pkg.display_name,
      frontendOrigin: origin,
    });
    const mailResult = await sendGroupBuyEmail(
      guestEmail,
      renderBookingWithBankInfo(emailOrder, bankToInfo(bankRow)),
    );
    if (!mailResult.ok) console.warn(`[${FN}] email skipped: ${mailResult.reason}`);

    await admin.from("group_buy_payment_events").insert({
      campaign_id: campaign.id,
      order_id: order.id,
      event_type: mailResult.ok ? "email_sent" : "email_failed",
      actor_label: "system",
      note: mailResult.ok
        ? `recipient_type:guest／template_type:booking_pending／recipient_count:1／訂房通知＋匯款資訊信已寄至 ${guestEmail}`
        : `recipient_type:guest／template_type:booking_pending／訂房通知信寄送失敗：${mailResult.reason ?? "unknown"}`,
    });

    // 民宿／管理者內部通知（與旅客信完全獨立；收件人只由後端 DB 設定解析）
    try {
      const { emails: venueEmails, source: venueSource } = await resolveOrderNotifyEmails(admin, {
        accommodationId: campaign.accommodation_id,
        campaignId: campaign.id,
      });
      if (venueEmails.length === 0) {
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign.id,
          order_id: order.id,
          event_type: "note",
          actor_label: "system",
          note: "venue_email_skipped／recipient_type:venue／template_type:venue_new_order／no_recipients",
        });
      } else {
        const venueMail = await sendGroupBuyEmail(
          venueEmails,
          renderVenueNewOrder({
            ...emailOrder,
            guestPhone: order.guest_phone ?? null,
            guestEmail: order.guest_email ?? null,
            nights: plan.nights,
            adultCount: plan.input.adultCount,
            childCount: plan.input.childCount,
            toddlerCount: plan.input.toddlerCount,
            infantCount: plan.input.infantCount,
            childBreakdownText: plan.childDetailLines.length > 0 ? plan.childDetailLines.join("\n") : null,
            paymentStatusText: "待匯款",
            adminUrl: buildAdminGroupBuyUrl({
              accommodationId: order.accommodation_id ?? campaign.accommodation_id ?? null,
              campaignId: campaign.id,
              orderNumber: order.order_number,
            }),
          }),
        );
        if (!venueMail.ok) console.error(`[${FN}] venue email failed: ${venueMail.reason}`);
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign.id,
          order_id: order.id,
          event_type: venueMail.ok ? "email_sent" : "email_failed",
          actor_label: "system",
          note: `recipient_type:venue／template_type:venue_new_order／recipient_count:${venueEmails.length}／source:${venueSource}${
            venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
          }`,
        });
      }
    } catch (venueErr) {
      console.error(`[${FN}] venue notify threw`, venueErr);
    }

    // ATM 新制：一律回傳已寫入訂單的本地付款期限（與 ATM 區塊完全一致）
    const deadline = localDeadline ?? paymentDeadline(
      order.created_at ?? order.order_date ?? new Date().toISOString(),
      campaign.payment_deadline_hours,
    );

    return json({
      success: true,
      orderNumber: order.order_number,
      total,
      deposit,
      balance,
      depositPercentage: campaign.deposit_percentage,
      paymentDeadline: deadline.toISOString(),
      paymentDeadlineText: formatTaipei(deadline),
      bank: bankToInfo(bankRow),
      emailSent: mailResult.ok,
    });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    // 對客一律回傳友善文案，原始 exception 只留在 server log
    return json({ error: "目前無法完成預訂，請稍後再試或聯繫客服。" }, 500);
  }
});
