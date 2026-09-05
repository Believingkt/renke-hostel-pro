// 團購通知信補寄：針對指定訂單重新寄出旅客通知信與民宿內部通知信。
//
// 只補寄，不改動任何訂單資料（付款狀態、金額、庫存一律不動）。
// 權限：super_admin 或該館 admin；service-role 呼叫亦可（後台批次補寄）。
// deno-lint-ignore-file no-explicit-any

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { bankToInfo, buildAdminGroupBuyUrl, buildEmailOrder } from "../_shared/groupBuy.ts";
import {
  renderBookingWithBankInfo,
  renderDepositReceived,
  renderVenueNewOrder,
  sendGroupBuyEmail,
} from "../_shared/groupBuyEmail.ts";
import { resolveOrderNotifyEmails } from "../_shared/notifyRecipients.ts";

const FN = "group-buy-resend-notification";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nightsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d = (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
  return d > 0 ? Math.round(d) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 內部維運金鑰（僅供後端補寄工具使用）；一般後台呼叫仍走使用者 JWT 權限檢查
  const internalKey = Deno.env.get("GROUP_BUY_RESEND_INTERNAL_KEY");
  const isInternal = !!internalKey && req.headers.get("x-internal-key") === internalKey;

  const caller = isInternal
    ? await resolveCaller(new Request(req.url, { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}` } }))
    : await resolveCaller(req);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  const { ctx } = caller;
  const admin = ctx.admin;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const ids = Array.isArray(body.orderIds) ? body.orderIds.map((v: unknown) => String(v ?? "").trim()) : [];
    const numbers = Array.isArray(body.orderNumbers)
      ? body.orderNumbers.map((v: unknown) => String(v ?? "").trim())
      : [];
    const targets = new Set(
      (Array.isArray(body.targets) ? body.targets : ["guest", "venue"]).map((v: unknown) => String(v)),
    );
    if (ids.length === 0 && numbers.length === 0) return json({ error: "缺少 orderIds 或 orderNumbers" }, 400);

    let query = admin.from("orders").select("*").eq("order_source", "group_buy");
    query = ids.length > 0 ? query.in("id", ids) : query.in("order_number", numbers);
    const { data: orders, error: oErr } = await query;
    if (oErr) throw oErr;
    if (!orders || orders.length === 0) return json({ error: "查無指定的團購訂單" }, 404);

    const results: any[] = [];

    for (const order of orders) {
      const allowed = ctx.isServiceRole || isSuperAdmin(ctx) ||
        (await isAccommodationAdmin(ctx, order.accommodation_id));
      if (!allowed) {
        results.push({ orderNumber: order.order_number, skipped: "forbidden" });
        continue;
      }

      const { data: commission } = await admin
        .from("group_buy_commissions")
        .select("campaign_id")
        .eq("order_id", order.id)
        .maybeSingle();
      const { data: campaign } = commission?.campaign_id
        ? await admin.from("group_buy_campaigns").select("*").eq("id", commission.campaign_id).maybeSingle()
        : { data: null as any };

      const { data: acc } = order.accommodation_id
        ? await admin.from("accommodation_info").select("name").eq("id", order.accommodation_id).maybeSingle()
        : { data: null as any };

      const packageName = String(order.notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? null;
      const emailOrder = buildEmailOrder({
        order,
        campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: 72 },
        accommodationName: (acc as any)?.name ?? null,
        packageName,
      });

      const paid = Math.max(0, Math.round(Number(order.paid_amount ?? 0)));
      const finalPrice = Math.max(0, Math.round(Number(order.final_price ?? order.total_price ?? 0)));
      const isPaid = order.payment_status === "paid" || order.payment_status === "deposit_paid" || paid > 0;
      const fullPayment = isPaid && paid >= finalPrice && finalPrice > 0;

      const entry: any = { orderNumber: order.order_number, guest: null, venue: null };

      // 旅客信：已收款 → 訂房確認信；未收款 → 訂房通知＋匯款資訊
      if (targets.has("guest")) {
        let mail;
        let templateType;
        if (isPaid) {
          templateType = "deposit_received";
          mail = renderDepositReceived(emailOrder, {
            providerLabel: emailOrder.paymentMethodText,
            paidThisTime: paid > 0 ? paid : null,
            fullPayment,
          });
        } else {
          templateType = "booking_pending";
          const { data: bankRow } = await admin
            .from("group_buy_bank_accounts")
            .select("*")
            .eq("campaign_id", campaign?.id ?? "00000000-0000-0000-0000-000000000000")
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
          mail = renderBookingWithBankInfo(emailOrder, bankToInfo(bankRow));
        }
        const sent = await sendGroupBuyEmail(order.guest_email, mail);
        entry.guest = sent;
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaign?.id ?? null,
          order_id: order.id,
          event_type: sent.ok ? "email_sent" : "email_failed",
          actor_user_id: ctx.userId,
          actor_label: ctx.userEmail ?? (ctx.isServiceRole ? "system" : "admin"),
          note: `resend:true／recipient_type:guest／template_type:${templateType}／recipient_count:1${
            sent.ok ? "" : `／reason:${sent.reason ?? "unknown"}`
          }`,
        });
      }

      // 民宿／管理者內部通知
      if (targets.has("venue")) {
        const { emails: venueEmails, source } = await resolveOrderNotifyEmails(admin, {
          accommodationId: order.accommodation_id,
          campaignId: campaign?.id ?? null,
        });
        if (venueEmails.length === 0) {
          entry.venue = { ok: false, reason: "no_recipients" };
        } else {
          const venueMail = await sendGroupBuyEmail(
            venueEmails,
            renderVenueNewOrder({
              ...emailOrder,
              guestPhone: order.guest_phone ?? null,
              guestEmail: order.guest_email ?? null,
              nights: nightsBetween(order.check_in_date, order.check_out_date),
              adultCount: order.adult_count ?? order.guest_count ?? null,
              childCount: order.child_count ?? 0,
              toddlerCount: order.toddler_count ?? 0,
              infantCount: order.infant_count ?? 0,
              paymentStatusText: fullPayment ? "已全額付款" : isPaid ? "已收訂金" : "待匯款",
              adminUrl: buildAdminGroupBuyUrl({
                accommodationId: order.accommodation_id ?? null,
                campaignId: campaign?.id ?? null,
                orderNumber: order.order_number,
              }),
            }, { fullPayment }),
          );
          entry.venue = venueMail;
          await admin.from("group_buy_payment_events").insert({
            campaign_id: campaign?.id ?? null,
            order_id: order.id,
            event_type: venueMail.ok ? "email_sent" : "email_failed",
            actor_user_id: ctx.userId,
            actor_label: ctx.userEmail ?? (ctx.isServiceRole ? "system" : "admin"),
            note: `resend:true／recipient_type:venue／template_type:venue_new_order／recipient_count:${venueEmails.length}／source:${source}${
              venueMail.ok ? "" : `／reason:${venueMail.reason ?? "unknown"}`
            }`,
          });
        }
      }

      results.push(entry);
    }

    return json({ success: true, results });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: "補寄失敗，請稍後再試" }, 500);
  }
});
