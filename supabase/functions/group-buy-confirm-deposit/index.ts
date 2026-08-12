// 民宿端確認收到訂金：更新訂單付款狀態、記錄事件、寄出「已收到訂金」確認信
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildEmailOrder } from "../_shared/groupBuy.ts";
import { renderDepositReceived, sendGroupBuyEmail } from "../_shared/groupBuyEmail.ts";

const FN = "group-buy-confirm-deposit";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await resolveCaller(req);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  const { ctx } = caller;
  const admin = ctx.admin;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderId = String(body.orderId ?? "").trim();
    const receivedAmountRaw = body.receivedAmount;
    const note = String(body.note ?? "").trim().slice(0, 300);
    if (!orderId) return json({ error: "缺少 orderId" }, 400);

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: "查無此團購訂單" }, 404);

    const allowed = isSuperAdmin(ctx) || (await isAccommodationAdmin(ctx, order.accommodation_id));
    if (!allowed) return forbiddenResponse("沒有權限確認此訂單的收款");

    if (order.order_status === "cancelled") return json({ error: "此訂單已取消，無法確認收款" }, 400);

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const { data: campaign } = commission?.campaign_id
      ? await admin.from("group_buy_campaigns").select("*").eq("id", commission.campaign_id).maybeSingle()
      : { data: null as any };

    const expectedDeposit = Number(order.deposit_amount) || 0;
    const received = Math.max(0, Math.round(Number(receivedAmountRaw ?? expectedDeposit) || 0));
    const finalPrice = Number(order.final_price ?? order.total_price ?? 0);
    const paymentStatus = received >= finalPrice ? "paid" : "deposit_paid";

    const { error: uErr } = await admin
      .from("orders")
      .update({
        payment_status: paymentStatus,
        paid_amount: received,
        order_status: order.order_status === "pending" ? "confirmed" : order.order_status,
        deposit_payment_method: "bank_transfer",
      })
      .eq("id", order.id);
    if (uErr) throw uErr;

    await admin.from("group_buy_payment_events").insert({
      campaign_id: campaign?.id ?? null,
      order_id: order.id,
      event_type: "admin_confirmed",
      amount: received,
      actor_user_id: ctx.userId,
      actor_label: ctx.userEmail ?? "admin",
      note: note || "民宿端確認收到訂金",
    });

    const { data: acc } = await admin
      .from("accommodation_info")
      .select("name")
      .eq("id", order.accommodation_id)
      .maybeSingle();

    const emailOrder = buildEmailOrder({
      order: { ...order, deposit_amount: received },
      campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: 72 },
      accommodationName: (acc as any)?.name ?? null,
      packageName: null,
      frontendOrigin: typeof body.origin === "string" ? body.origin : null,
    });
    const mail = await sendGroupBuyEmail(order.guest_email, renderDepositReceived(emailOrder));
    if (!mail.ok) console.warn(`[${FN}] email skipped: ${mail.reason}`);

    return json({ success: true, paymentStatus, receivedAmount: received, emailSent: mail.ok });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
