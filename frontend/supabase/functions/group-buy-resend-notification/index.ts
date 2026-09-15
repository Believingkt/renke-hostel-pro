// 團購通知信補寄：針對指定訂單重新寄出旅客通知信與民宿內部通知信。
//
// 只補寄，不改動任何訂單資料（付款狀態、金額、庫存一律不動）。
// 權限：super_admin 或該館 admin；service-role 呼叫亦可（後台批次補寄）。
// deno-lint-ignore-file no-explicit-any

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import {
  buildAdminGroupBuyUrl,
  buildEmailOrder,
  formatTaipei,
  resolveGroupBuyPaymentDisplay,
} from "../_shared/groupBuy.ts";
import {
  renderBookingWithBankInfo,
  renderDepositReceived,
  renderOrderCancelled,
  renderVenueNewOrder,
  sendGroupBuyEmail,
} from "../_shared/groupBuyEmail.ts";
import { loadManualRefundFee } from "../_shared/refundFee.ts";
import { resolveOrderNotifyEmails } from "../_shared/notifyRecipients.ts";
import { quoteCancellation, taipeiToday } from "../_shared/cancellationPolicy.ts";

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

    // 測試副本：指定時，所有信件改寄到此信箱（不寄給旅客／民宿），且不寫入稽核事件
    const previewToRaw = String((body as any).previewTo ?? "").trim().toLowerCase();
    const previewTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(previewToRaw) ? previewToRaw : null;
    const withPreviewSubject = (m: { subject: string; html: string }) =>
      previewTo ? { subject: `[副本] ${m.subject}`, html: m.html } : m;

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

      const requestedTemplate = String((body as any).guestTemplate ?? "auto");

      // 取消通知補寄：僅限已取消的訂單，避免對進行中訂單誤寄
      if (requestedTemplate === "order_cancelled" && order.order_status !== "cancelled") {
        results.push({ orderNumber: order.order_number, skipped: "not_cancelled" });
        continue;
      }

      // 已補寄過的取消信時間（僅供前端提示，不阻擋再次補寄）
      if (requestedTemplate === "order_cancelled") {
        const { data: prevSent } = await admin
          .from("group_buy_payment_events")
          .select("created_at")
          .eq("order_id", order.id)
          .eq("event_type", "email_sent")
          .ilike("note", "%guest_order_cancelled%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        entry.lastCancelledEmailAt = prevSent?.created_at ?? null;
      }

      // 旅客信：可由後台指定模板；未指定（auto）時沿用原本依付款狀態判斷的行為
      if (targets.has("guest")) {
        const requested = requestedTemplate;
        const useFull = requested === "full_payment" || (requested === "auto" && isPaid && fullPayment);
        const usePaid = requested === "deposit_received" || useFull ||
          (requested === "auto" && isPaid);

        let mail;
        let templateType;
        if (requested === "order_cancelled") {
          // 純補寄：只組信件內容，不寫 orders、不動退款／佣金、不呼叫金流
          templateType = "guest_order_cancelled";
          const refundedTotal = Math.max(0, Math.round(Number(order.refunded_amount ?? 0)));
          const refundFeeTotal = Math.max(0, Math.round(Number(order.refund_fee_amount ?? 0)));
          const handlingFee = emailOrder.isCardOrder
            ? 0
            : await loadManualRefundFee(admin, order.accommodation_id);
          const { data: accContact } = order.accommodation_id
            ? await admin
              .from("accommodation_info")
              .select("phone, line_id, website_url, email")
              .eq("id", order.accommodation_id)
              .maybeSingle()
            : { data: null as any };
          /**
           * 政策應退金額：沿用 server 唯一權威的 quoteCancellation()，不另建算法。
           * 只讀不寫；缺入住日／取消時間時一律不提供政策欄位（信件維持原有文案）。
           */
          let policyRefundAmount: number | null = null;
          let policyRefundPercent: number | null = null;
          let policyRequiresManualReview = false;
          const cancelledAtIso: string | null = order.cancelled_at ?? null;
          if (order.check_in_date && cancelledAtIso) {
            try {
              const cancellationDate = formatTaipei(new Date(cancelledAtIso)).slice(0, 10)
                .replace(/\//g, "-");
              const quote = quoteCancellation({
                order: order as any,
                checkInDate: String(order.check_in_date),
                cancellationDate: /^\d{4}-\d{2}-\d{2}$/.test(cancellationDate)
                  ? cancellationDate
                  : taipeiToday(),
                alreadyRefunded: refundedTotal,
              });
              policyRefundAmount = Math.max(0, Math.round(Number(quote.refundAmount) || 0));
              policyRefundPercent = Math.max(0, Math.round(Number(quote.refundPercent) || 0));
              policyRequiresManualReview = quote.requiresManualReview === true;
            } catch (_e) {
              policyRefundAmount = null;
              policyRefundPercent = null;
              policyRequiresManualReview = false;
            }
          }
          mail = renderOrderCancelled(emailOrder, {
            cancelledAtText: formatTaipei(
              new Date(order.cancelled_at ?? order.updated_at ?? new Date().toISOString()),
            ),
            paidAmount: paid,
            refundedTotal,
            refundFeeTotal,
            handlingFee,
            refundStatus: String(order.refund_status ?? "none"),
            reason: null,
            policyRefundAmount,
            policyRefundPercent,
            policyRequiresManualReview,
            venueContact: accContact
              ? {
                phone: (accContact as any).phone ?? null,
                lineId: (accContact as any).line_id ?? null,
                websiteUrl: (accContact as any).website_url ?? null,
                email: (accContact as any).email ?? null,
              }
              : null,
          });
        } else if (usePaid) {
          templateType = useFull ? "full_payment_received" : "deposit_received";
          mail = renderDepositReceived(emailOrder, {
            providerLabel: emailOrder.paymentMethodText,
            paidThisTime: paid > 0 ? paid : null,
            fullPayment: useFull,
          });
        } else {
          templateType = "booking_pending";
          // 付款資訊一律以訂單本身判定：ATM 訂單顯示自己的虛擬帳號，不得塞共用匯款帳號
          const display = await resolveGroupBuyPaymentDisplay(admin, order, campaign?.id ?? null);
          mail = renderBookingWithBankInfo(emailOrder, display.bank, display.atm);
        }

        const sent = await sendGroupBuyEmail(previewTo ?? order.guest_email, withPreviewSubject(mail));
        entry.guest = sent;
        if (!previewTo) await admin.from("group_buy_payment_events").insert({
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
        if (venueEmails.length === 0 && !previewTo) {
          entry.venue = { ok: false, reason: "no_recipients" };
        } else {
          const venueMail = await sendGroupBuyEmail(
            previewTo ?? venueEmails,
            withPreviewSubject(renderVenueNewOrder({
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
            }, { fullPayment })),
          );
          entry.venue = venueMail;
          if (!previewTo) await admin.from("group_buy_payment_events").insert({
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
