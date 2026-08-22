// 民宿端：團購訂單「取消」與「人工退款登記」。
// 目前團購 payment_provider = manual（銀行匯款），無法自動退刷，一律由管理員於銀行端完成後登記。
// 寫入 orders 退款欄位、group_buy_payment_events 稽核事件與 audit_logs。
//
// mode:
//   "cancel"（預設）取消訂單，並決定退款狀態（none / pending / partial_refunded / refunded）
//   "refund"        針對已取消且尚有可退金額的訂單，登記一次人工退款
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import {
  getPaymentAdapter,
  getPaymentProvider,
  refundStatusAfterRefund,
  remainingRefundable,
} from "../_shared/paymentAdapter.ts";
import { buildEmailOrder, formatTaipei } from "../_shared/groupBuy.ts";
import {
  renderOrderCancelled,
  renderRefundProcessed,
  sendGroupBuyEmail,
} from "../_shared/groupBuyEmail.ts";


const FN = "group-buy-cancel-refund";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const twd = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await resolveCaller(req);
  if (!caller.ok) return json({ error: caller.error }, caller.status);
  const { ctx } = caller;
  const admin = ctx.admin;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const orderId = String(body.orderId ?? "").trim();
    const mode = String(body.mode ?? "cancel");
    // cancel 模式：mark_refunded（同時登記退款）/ pending_refund（待退款）/ no_refund（確認不需退款）
    const refundAction = String(body.refundAction ?? "mark_refunded");
    const refundAmountRaw = Number(body.refundAmount ?? 0);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (!orderId) return json({ error: "缺少 orderId" }, 400);
    if (!["cancel", "refund"].includes(mode)) return json({ error: "mode 不正確" }, 400);
    if (mode === "cancel" && !["mark_refunded", "pending_refund", "no_refund"].includes(refundAction)) {
      return json({ error: "退款方式不正確" }, 400);
    }

    // 一律重新讀 orders 計算，不信任前端傳入的 paidAmount / remainingRefundable / refundStatus
    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("order_source", "group_buy")
      .maybeSingle();
    if (oErr) throw oErr;
    if (!order) return json({ error: "查無此團購訂單" }, 404);

    const allowed = isSuperAdmin(ctx) || (await isAccommodationAdmin(ctx, order.accommodation_id));
    if (!allowed) return forbiddenResponse("沒有權限處理此訂單");

    const provider = getPaymentProvider(order);
    const adapter = getPaymentAdapter(order);
    const paid = Math.max(0, Math.round(Number(order.paid_amount) || 0));
    const alreadyRefunded = Math.max(0, Math.round(Number(order.refunded_amount) || 0));
    const refundable = remainingRefundable(order);

    const { data: commission } = await admin
      .from("group_buy_commissions")
      .select("id, campaign_id")
      .eq("order_id", order.id)
      .maybeSingle();
    const campaignId = commission?.campaign_id ?? null;
    const nowIso = new Date().toISOString();
    const actor = ctx.userEmail ?? "admin";
    const origin = typeof body.origin === "string" && body.origin ? body.origin : null;

    /**
     * 組出通知信所需的訂單資訊（活動／住宿／方案名稱）。
     * 取不到資料時仍會以既有訂單欄位寄出，不影響取消／退款主流程。
     */
    const buildMailOrder = async () => {
      const [{ data: campaignRow }, { data: acc }] = await Promise.all([
        campaignId
          ? admin.from("group_buy_campaigns").select("*").eq("id", campaignId).maybeSingle()
          : Promise.resolve({ data: null } as any),
        admin.from("accommodation_info").select("name").eq("id", order.accommodation_id).maybeSingle(),
      ]);
      const packageName = String(order.notes ?? "").match(/方案：(.+?)\s*×/)?.[1]?.trim() ?? null;
      return buildEmailOrder({
        order,
        campaign: campaignRow,
        accommodationName: (acc as any)?.name ?? null,
        packageName,
        frontendOrigin: origin,
      });
    };

    /** 寄信 + 稽核事件；寄信失敗一律不影響已完成的取消／退款登記 */
    const notify = async (mail: { subject: string; html: string } | null) => {
      if (!mail) return;
      let ok = false;
      let reason: string | undefined;
      try {
        const res = await sendGroupBuyEmail(order.guest_email, mail);
        ok = res.ok;
        reason = res.reason;
      } catch (e) {
        reason = e instanceof Error ? e.message : "exception";
      }
      try {
        await admin.from("group_buy_payment_events").insert({
          campaign_id: campaignId,
          order_id: order.id,
          event_type: ok ? "email_sent" : "email_failed",
          actor_label: "system",
          note: ok ? `已寄出「${mail.subject}」` : `寄送失敗「${mail.subject}」：${reason ?? "unknown"}`,
        });
      } catch (e) {
        console.error(`[${FN}] email event insert failed`, e);
      }
    };



    // ---------------------------------------------------------------- refund
    if (mode === "refund") {
      const refundAmount = Math.round(refundAmountRaw || 0);
      if (!(refundAmount > 0)) return json({ error: "退款金額必須大於 0" }, 400);
      if (refundAmount > refundable) {
        return json({ error: `退款金額超過可退金額 ${twd(refundable)}` }, 400);
      }
      const settle = await adapter.refundPayment({ order: { ...order, id: order.id }, amount: refundAmount, note: reason });
      if (!settle.ok) return json({ error: settle.error ?? "退款處理失敗" }, 400);

      const totalRefunded = alreadyRefunded + refundAmount;
      const refundStatus = refundStatusAfterRefund(paid, totalRefunded);

      const notes = [
        order.notes ?? "",
        `【退款】${nowIso} 由 ${actor} 登記人工退款 ${twd(refundAmount)}（累計 ${twd(totalRefunded)} / 已收 ${twd(paid)}）`,
        reason ? `退款備註：${reason}` : null,
      ].filter(Boolean).join("\n");

      const { error: uErr } = await admin
        .from("orders")
        .update({
          refunded_amount: totalRefunded,
          refunded_at: nowIso,
          refund_status: refundStatus,
          notes,
        })
        .eq("id", order.id);
      if (uErr) throw uErr;

      await admin.from("group_buy_payment_events").insert({
        campaign_id: campaignId,
        order_id: order.id,
        event_type: "refunded",
        amount: refundAmount,
        actor_user_id: ctx.userId,
        actor_label: actor,
        note: [
          `人工退款（${provider === "manual" ? "銀行匯回" : provider}）`,
          `本次 ${twd(refundAmount)}`,
          `累計 ${twd(totalRefunded)}`,
          `已收 ${twd(paid)}`,
          `狀態 ${refundStatus}`,
          reason ? `備註：${reason}` : null,
        ].filter(Boolean).join("／"),
      });

      await admin.from("audit_logs").insert({
        accommodation_id: order.accommodation_id,
        user_id: ctx.userId,
        user_email: ctx.userEmail ?? null,
        action_type: "refund_order",
        action_category: "group_buy",
        entity_type: "order",
        entity_id: order.id,
        entity_name: order.order_number,
        details: {
          source: "group_buy",
          payment_provider: provider,
          refund_amount: refundAmount,
          total_refunded_amount: totalRefunded,
          paid_amount: paid,
          refund_status: refundStatus,
          operator: actor,
          timestamp: nowIso,
          note: reason || null,
        },
      });

      // 退款資料已成功更新後才寄信；寄信失敗不影響退款登記
      await notify(
        renderRefundProcessed(await buildMailOrder(), {
          refundAmount,
          refundedTotal: totalRefunded,
          paidAmount: paid,
          refundStatus,
          refundedAtText: formatTaipei(new Date(nowIso)),
          note: reason || null,
        }),
      );

      return json({
        success: true,
        mode: "refund",
        refundAmount,
        refundStatus,
        totalRefunded,
        remainingRefundable: Math.max(0, paid - totalRefunded),
      });

    }

    // ---------------------------------------------------------------- cancel
    const refundAmount = refundAction === "mark_refunded" ? Math.max(0, Math.round(refundAmountRaw || 0)) : 0;
    if (refundAmount > refundable) {
      return json({ error: `退款金額超過可退金額 ${twd(refundable)}` }, 400);
    }
    if (refundAmount > 0) {
      const settle = await adapter.refundPayment({ order: { ...order, id: order.id }, amount: refundAmount, note: reason });
      if (!settle.ok) return json({ error: settle.error ?? "退款處理失敗" }, 400);
    }

    const totalRefunded = alreadyRefunded + refundAmount;
    const refundStatus = refundAction === "no_refund"
      // 管理員明確決定不需退款（違約金／不可退方案）
      ? (totalRefunded > 0 ? refundStatusAfterRefund(paid, totalRefunded) : "none")
      // 有已收款但尚未退回 → pending（待退款），之後用「處理退款」完成
      : refundStatusAfterRefund(paid, totalRefunded);

    const noteLines = [
      order.notes ?? "",
      `【取消】${nowIso} 由 ${actor} 取消訂單`,
      refundAction === "no_refund"
        ? "退款處理：確認不需退款"
        : refundAmount > 0
        ? `退款處理：已登記人工退款 ${twd(refundAmount)}（銀行匯回）`
        : paid > 0
        ? "退款處理：待退款（尚未退回旅客）"
        : "退款處理：未收款，不需退款",
      reason ? `原因：${reason}` : null,
    ].filter(Boolean).join("\n");

    const { error: uErr } = await admin
      .from("orders")
      .update({
        order_status: "cancelled",
        refunded_amount: totalRefunded,
        refunded_at: refundAmount > 0 ? nowIso : order.refunded_at,
        refund_status: refundStatus,
        notes: noteLines,
      })
      .eq("id", order.id);
    if (uErr) throw uErr;

    if (commission?.id) {
      await admin.from("group_buy_commissions").update({ status: "void" }).eq("id", commission.id);
    }

    await admin.from("group_buy_payment_events").insert([
      {
        campaign_id: campaignId,
        order_id: order.id,
        event_type: "cancelled",
        actor_user_id: ctx.userId,
        actor_label: actor,
        note: [
          reason ? `民宿端取消訂單：${reason}` : "民宿端取消訂單",
          `退款狀態 ${refundStatus}`,
        ].join("／"),
      },
      ...(refundAmount > 0
        ? [{
          campaign_id: campaignId,
          order_id: order.id,
          event_type: "refunded",
          amount: refundAmount,
          actor_user_id: ctx.userId,
          actor_label: actor,
          note: [
            `人工退款（${provider === "manual" ? "銀行匯回" : provider}）`,
            `本次 ${twd(refundAmount)}`,
            `累計 ${twd(totalRefunded)}`,
            `已收 ${twd(paid)}`,
            reason ? `備註：${reason}` : null,
          ].filter(Boolean).join("／"),
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
        payment_provider: provider,
        refund_action: refundAction,
        refund_amount: refundAmount,
        total_refunded_amount: totalRefunded,
        paid_amount: paid,
        refund_status: refundStatus,
        operator: actor,
        timestamp: nowIso,
        reason: reason || null,
      },
    });

    // 取消成功後寄「訂單已取消」信（若同一次操作已完成退款，退款結果併入此信，不再另寄退款信）
    await notify(
      renderOrderCancelled(await buildMailOrder(), {
        cancelledAtText: formatTaipei(new Date(nowIso)),
        paidAmount: paid,
        refundedTotal: totalRefunded,
        refundStatus,
        reason: reason || null,
      }),
    );

    return json({
      success: true,
      mode: "cancel",
      refundAmount,
      refundStatus,
      totalRefunded,
      remainingRefundable: Math.max(0, paid - totalRefunded),
    });

  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
