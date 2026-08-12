// 民宿端：取消團購訂單並記錄手動退款（銀行匯款無法自動退刷，一律人工處理）
// 寫入 orders 退款欄位、group_buy_payment_events 稽核事件與 audit_logs。
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";

const FN = "group-buy-cancel-refund";

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
    const refundAction = String(body.refundAction ?? "mark_refunded"); // mark_refunded | no_refund
    const refundAmountRaw = Number(body.refundAmount ?? 0);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (!orderId) return json({ error: "缺少 orderId" }, 400);
    if (!["mark_refunded", "no_refund"].includes(refundAction)) return json({ error: "退款方式不正確" }, 400);

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: "查無此團購訂單" }, 404);

    const allowed = isSuperAdmin(ctx) || (await isAccommodationAdmin(ctx, order.accommodation_id));
    if (!allowed) return forbiddenResponse("沒有權限取消此訂單");

    const paid = Math.max(0, Math.round(Number(order.paid_amount) || 0));
    const alreadyRefunded = Math.max(0, Math.round(Number(order.refunded_amount) || 0));
    const refundable = Math.max(0, paid - alreadyRefunded);
    const refundAmount = refundAction === "no_refund" ? 0 : Math.max(0, Math.round(refundAmountRaw || 0));
    if (refundAmount > refundable) {
      return json({ error: `退款金額超過可退金額 NT$${refundable.toLocaleString("en-US")}` }, 400);
    }

    const totalRefunded = alreadyRefunded + refundAmount;
    const refundStatus = refundAction === "no_refund"
      ? (alreadyRefunded > 0 ? (totalRefunded >= paid ? "refunded" : "partial_refunded") : "none")
      : totalRefunded >= paid && paid > 0
      ? "refunded"
      : totalRefunded > 0
      ? "partial_refunded"
      : "none";

    const noteLines = [
      order.notes ?? "",
      `【取消】${new Date().toISOString()} 由 ${ctx.userEmail ?? "admin"} 取消訂單`,
      refundAction === "no_refund"
        ? "退款處理：不退款"
        : `退款處理：手動退款 NT$${refundAmount.toLocaleString("en-US")}（銀行匯款退回）`,
      reason ? `原因：${reason}` : null,
    ].filter(Boolean).join("\n");

    const { error: uErr } = await admin
      .from("orders")
      .update({
        order_status: "cancelled",
        refunded_amount: totalRefunded,
        refunded_at: refundAmount > 0 ? new Date().toISOString() : order.refunded_at,
        refund_status: refundStatus,
        notes: noteLines,
      })
      .eq("id", order.id);
    if (uErr) throw uErr;

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("id, campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (commission?.id) {
      await admin.from("group_buy_commissions").update({ status: "cancelled" }).eq("id", commission.id);
    }

    await admin.from("group_buy_payment_events").insert([
      {
        campaign_id: commission?.campaign_id ?? null,
        order_id: order.id,
        event_type: "cancelled",
        actor_user_id: ctx.userId,
        actor_label: ctx.userEmail ?? "admin",
        note: reason ? `民宿端取消訂單：${reason}` : "民宿端取消訂單",
      },
      ...(refundAmount > 0
        ? [{
          campaign_id: commission?.campaign_id ?? null,
          order_id: order.id,
          event_type: "refunded",
          amount: refundAmount,
          actor_user_id: ctx.userId,
          actor_label: ctx.userEmail ?? "admin",
          note: reason ? `手動退款（銀行匯回）：${reason}` : "手動退款（銀行匯回）",
        }]
        : []),
    ]);

    await admin.from("audit_logs").insert({
      accommodation_id: order.accommodation_id,
      user_id: ctx.userId,
      user_email: ctx.userEmail ?? null,
      action_type: "cancel_order",
      action_category: "group_buy",
      entity_type: "order",
      entity_id: order.id,
      entity_name: order.order_number,
      details: {
        source: "group_buy",
        refund_action: refundAction,
        refund_amount: refundAmount,
        total_refunded: totalRefunded,
        paid_amount: paid,
        refund_status: refundStatus,
        reason: reason || null,
      },
    });

    return json({ success: true, refundAmount, refundStatus, totalRefunded });
  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
