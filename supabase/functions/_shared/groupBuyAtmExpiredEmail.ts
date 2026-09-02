// 團購 ATM 新制：本地付款期限逾期 → 訂單自動取消後的旅客通知信。
// 必須在 cancellation commit 之後呼叫；寄信失敗不得影響（也不得回滾）取消結果。
// deno-lint-ignore-file no-explicit-any

import { buildEmailOrder } from "./groupBuy.ts";
import { renderAtmDeadlineExpired, sendGroupBuyEmail } from "./groupBuyEmail.ts";

export const ATM_DEADLINE_EXPIRED_TEMPLATE = "atm_deadline_expired";

/**
 * 寄送逾期通知信（每張訂單最多成功寄出一次）。
 * Idempotency SoT = group_buy_payment_events：已有 email_sent + 此 template_type 即不再寄。
 * 寄送失敗記為 email_failed（可觀察、下一輪 cron 會重試）。
 */
export async function sendAtmDeadlineExpiredEmail(
  admin: any,
  orderId: string,
  deadlineText: string,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: sentEvent } = await admin
    .from("group_buy_payment_events")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "email_sent")
    .ilike("note", `%template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}%`)
    .maybeSingle();
  if (sentEvent) return { sent: false, reason: "already_sent" };

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order?.guest_email) return { sent: false, reason: "no_recipient" };

  const { data: commission } = await admin
    .from("group_buy_commissions")
    .select("campaign_id")
    .eq("order_id", orderId)
    .maybeSingle();
  const { data: campaign } = commission?.campaign_id
    ? await admin.from("group_buy_campaigns").select("*").eq("id", commission.campaign_id).maybeSingle()
    : { data: null };
  const { data: acc } = await admin
    .from("accommodation_info")
    .select("name")
    .eq("id", order.accommodation_id)
    .maybeSingle();

  const emailOrder = buildEmailOrder({
    order,
    campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: 72 },
    accommodationName: (acc as any)?.name ?? null,
  });

  const mail = await sendGroupBuyEmail(
    order.guest_email,
    renderAtmDeadlineExpired(emailOrder, deadlineText),
  );

  await admin.from("group_buy_payment_events").insert({
    campaign_id: commission?.campaign_id ?? null,
    order_id: orderId,
    event_type: mail.ok ? "email_sent" : "email_failed",
    actor_label: "system",
    note: mail.ok
      ? `recipient_type:guest／template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}／recipient_count:1／付款逾期通知信已寄出`
      : `recipient_type:guest／template_type:${ATM_DEADLINE_EXPIRED_TEMPLATE}／付款逾期通知信寄送失敗：${
        mail.reason ?? "unknown"
      }`,
  });

  return { sent: mail.ok, reason: mail.ok ? undefined : (mail.reason ?? "send_failed") };
}
