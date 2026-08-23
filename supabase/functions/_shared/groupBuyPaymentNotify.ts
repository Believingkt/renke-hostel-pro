// 團購線上付款入帳後的通知（供 tappay-notify 的 group_buy 分支使用）
//
// 重要：本檔案只服務 order_source = 'group_buy' 的訂單。
// 一般訂房的通知鏈（send-final-payment-received / sendBookingEmail）完全不經過這裡。
// deno-lint-ignore-file no-explicit-any

import { buildEmailOrder } from "./groupBuy.ts";
import { renderDepositReceived, sendGroupBuyEmail } from "./groupBuyEmail.ts";

export async function notifyGroupBuyPaymentReceived(
  admin: any,
  params: {
    orderId: string;
    paidThisTime: number;
    paymentStatus: string;
    providerLabel: string;
  },
): Promise<{ ok: boolean; reason?: string }> {
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", params.orderId)
    .maybeSingle();
  if (!order) return { ok: false, reason: "order_not_found" };

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

  // 方案名稱：建單時寫入 notes（「方案：XXX × N 間 × M 晚」）
  const packageName = String(order.notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? null;

  const emailOrder = buildEmailOrder({
    order,
    campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: 72 },
    accommodationName: (acc as any)?.name ?? null,
    packageName,
  });

  const mail = await sendGroupBuyEmail(
    order.guest_email,
    renderDepositReceived(emailOrder, {
      providerLabel: params.providerLabel,
      paidThisTime: params.paidThisTime,
    }),
  );

  // audit：付款事件 + 寄信結果（付款狀態的 source of truth 仍為 orders）
  await admin.from("group_buy_payment_events").insert({
    campaign_id: campaign?.id ?? null,
    order_id: order.id,
    event_type: "atm_paid",
    amount: params.paidThisTime,
    actor_label: "system",
    note: `provider:tappay／payment_type:atm／payment_status:${params.paymentStatus}／ATM 入帳確認`,
  });
  await admin.from("group_buy_payment_events").insert({
    campaign_id: campaign?.id ?? null,
    order_id: order.id,
    event_type: mail.ok ? "email_sent" : "email_failed",
    actor_label: "system",
    note: mail.ok
      ? `recipient_type:guest／template_type:deposit_received／recipient_count:1／provider:tappay`
      : `recipient_type:guest／template_type:deposit_received／provider:tappay／reason:${mail.reason ?? "unknown"}`,
  });

  return mail;
}
