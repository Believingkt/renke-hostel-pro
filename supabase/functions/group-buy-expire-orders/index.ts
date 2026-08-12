// 團購訂單逾期自動取消（cron 每小時呼叫；無需身分驗證，僅處理逾期未匯款訂單）
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildEmailOrder, paymentDeadline } from "../_shared/groupBuy.ts";
import { renderExpiredCancelled, sendGroupBuyEmail } from "../_shared/groupBuyEmail.ts";

const FN = "group-buy-expire-orders";

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
    const dryRun = body?.dry_run === true;

    const { data: orders, error } = await admin
      .from("orders")
      .select("*")
      .eq("order_source", "group_buy")
      .eq("payment_status", "unpaid")
      .in("order_status", ["pending", "confirmed"])
      .order("order_date", { ascending: true })
      .limit(300);
    if (error) throw error;

    const campaignCache = new Map<string, any>();
    const expired: string[] = [];
    const kept: string[] = [];

    for (const order of orders ?? []) {
      const { data: commission } = await admin
        .from("group_buy_commissions")
        .select("campaign_id")
        .eq("order_id", order.id)
        .maybeSingle();
      const campaignId = commission?.campaign_id ?? null;

      let campaign = campaignId ? campaignCache.get(campaignId) : null;
      if (campaignId && !campaign) {
        const { data } = await admin.from("group_buy_campaigns").select("*").eq("id", campaignId).maybeSingle();
        campaign = data;
        if (data) campaignCache.set(campaignId, data);
      }

      const hours = campaign?.payment_deadline_hours ?? 72;
      const deadline = paymentDeadline(order.order_date ?? new Date().toISOString(), hours);
      if (deadline.getTime() > Date.now()) {
        kept.push(order.order_number);
        continue;
      }

      expired.push(order.order_number);
      if (dryRun) continue;

      await admin
        .from("orders")
        .update({
          order_status: "cancelled",
          notes: `${order.notes ?? ""}\n【系統】逾期未匯款自動取消（期限 ${hours} 小時）`.trim(),
        })
        .eq("id", order.id);

      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaignId,
        order_id: order.id,
        event_type: "expired",
        actor_label: "system",
        note: `逾期未匯款自動取消（期限 ${hours} 小時）`,
      });

      await admin
        .from("group_buy_commissions")
        .update({ status: "void", note: "訂單逾期取消" })
        .eq("order_id", order.id);

      const { data: acc } = await admin
        .from("accommodation_info")
        .select("name")
        .eq("id", order.accommodation_id)
        .maybeSingle();

      const mail = await sendGroupBuyEmail(
        order.guest_email,
        renderExpiredCancelled(
          buildEmailOrder({
            order,
            campaign: campaign ?? { title: "團購活動", deposit_percentage: 30, payment_deadline_hours: hours },
            accommodationName: (acc as any)?.name ?? null,
          }),
        ),
      );
      if (!mail.ok) console.warn(`[${FN}] email skipped for ${order.order_number}: ${mail.reason}`);
    }

    console.log(`[${FN}] done`, { expired: expired.length, kept: kept.length, dryRun });
    return json({ ok: true, dryRun, expiredCount: expired.length, expired, keptCount: kept.length });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
