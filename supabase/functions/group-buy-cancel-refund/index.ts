// 民宿端：團購訂單「取消」與「人工退款登記」。
//
// 付款方式分流（Source of Truth = orders 該筆的真實付款欄位，不看 campaign 設定）：
//   payment_provider = manual  → 銀行匯款／ATM：人工退款流程（pending_refund / mark_refunded / no_refund）
//   payment_provider = tappay 且 isCardPaidOrder() → 信用卡：一律原卡退刷（refundAction = card_refund）
//     信用卡取消採「refund-first」：TapPay 退刷成功後才會把訂單改為 cancelled / void 分潤 / 寄信。
//     TapPay 失敗或 timeout → 訂單維持未取消，不 void 分潤，不自動重試。
//
// 寫入 orders 退款欄位、group_buy_payment_events 稽核事件與 audit_logs。
//
// mode:
//   "cancel"（預設）取消訂單，並決定退款狀態（none / pending / partial_refunded / refunded）
//   "refund"        針對已取消且尚有可退金額的訂單執行退款
//                   （manual = 登記人工退匯；tappay = 實際原卡退刷，亦為誤入 pending_manual 的補救路徑）
//   "quote"         唯讀試算（信用卡另附 TapPay Query 對帳資訊）
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { forbiddenResponse, isAccommodationAdmin, isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import {
  getPaymentAdapter,
  getPaymentProvider,
  refundStatusAfterRefund,
} from "../_shared/paymentAdapter.ts";
import { isCardPaidOrder, resolveSyncRecTradeId } from "../_shared/orderRefund.ts";
import { loadManualRefundFee, remainingRefundableWithFee, splitRefundFee } from "../_shared/refundFee.ts";
import { queryTapPayRecord } from "../_shared/tappay.ts";
import { buildEmailOrder, formatTaipei } from "../_shared/groupBuy.ts";
import { quoteCancellation, taipeiToday } from "../_shared/cancellationPolicy.ts";
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
    // cancel 模式：
    //   manual（銀行／ATM）：mark_refunded / pending_refund / no_refund
    //   tappay 信用卡      ：card_refund（原卡退刷）/ no_refund（依法規不退款）
    const refundAction = String(body.refundAction ?? "mark_refunded");
    const refundAmountRaw = Number(body.refundAmount ?? 0);
    const reason = String(body.reason ?? "").trim().slice(0, 300);
    if (!orderId) return json({ error: "缺少 orderId" }, 400);
    if (!["cancel", "refund", "quote"].includes(mode)) return json({ error: "mode 不正確" }, 400);


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
    /**
     * 付款方式分流唯一依據：orders 該筆的 payment_provider + 付款方式欄位。
     * 嚴禁使用 campaign.payment_method / commission snapshot / 前端傳入值回推。
     */
    const isCardOrder = provider === "tappay" && isCardPaidOrder(order as any);
    const paid = Math.max(0, Math.round(Number(order.paid_amount) || 0));
    const alreadyRefunded = Math.max(0, Math.round(Number(order.refunded_amount) || 0));
    const alreadyRefundFee = Math.max(0, Math.round(Number((order as any).refund_fee_amount) || 0));
    /**
     * 可退餘額＝已收 −（累計實退旅客 ＋ 累計已扣手續費）。
     * 手續費也算沖銷，避免同一筆錢被重複退。
     */
    const refundable = remainingRefundableWithFee(order as any);
    /**
     * 人工退款手續費：一律讀該館 booking_settings.manual_refund_fee_amount（可為 0，禁止寫死金額）。
     * 信用卡原卡退刷不收手續費。
     */
    const configuredRefundFee = isCardOrder ? 0 : await loadManualRefundFee(admin, order.accommodation_id);

    if (mode === "cancel") {
      const allowedActions = isCardOrder
        ? ["card_refund", "no_refund"]
        : ["mark_refunded", "pending_refund", "no_refund"];
      if (!allowedActions.includes(refundAction)) {
        return json({
          error: isCardOrder
            ? "此訂單為信用卡（TapPay）付款，退款必須走「原信用卡退刷」，不可登記人工銀行退匯。"
            : "退款方式不正確",
        }, 400);
      }
    }

    // 法規建議退款金額：一律由 server 依訂單真實資料計算，前端傳入的金額僅作為人工覆寫並留稽核
    const policyQuote = quoteCancellation({
      order: order as any,
      checkInDate: String(order.check_in_date),
      cancellationDate: taipeiToday(),
      alreadyRefunded: alreadyRefunded,
    });
    const suggestedRefund = Math.min(refundable, Math.max(0, Math.round(policyQuote.refundAmount)));

    if (mode === "quote") {
      /**
       * 信用卡訂單：附上 TapPay Query 對帳資訊（唯讀，絕不呼叫 Refund API）。
       * is_captured 保留原值，供後台判讀本次屬於「取消授權」或「已請款後退款」。
       */
      let tappay: Record<string, unknown> | null = null;
      if (isCardOrder) {
        try {
          const resolution = await resolveSyncRecTradeId(admin, order as any);
          if (!resolution.recTradeId) {
            tappay = { found: false, reason: resolution.reason ?? "no_rec_trade_id" };
          } else {
            const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
            if (!partnerKey) {
              tappay = { found: false, reason: "no_partner_key", recTradeId: resolution.recTradeId };
            } else {
              const record = await queryTapPayRecord({ partnerKey, recTradeId: resolution.recTradeId });
              const rec = Array.isArray(record.raw?.trade_records) ? record.raw.trade_records[0] : null;
              const tpAmount = Math.max(0, Math.round(Number(record.amount) || 0));
              const tpRefunded = Math.max(0, Math.round(Number(record.refundedAmount) || 0));
              tappay = {
                found: record.found,
                recTradeId: resolution.recTradeId,
                recTradeIdSource: resolution.source,
                recordStatus: record.recordStatus,
                amount: tpAmount,
                refundedAmount: tpRefunded,
                remaining: Math.max(0, tpAmount - tpRefunded),
                isCaptured: rec?.is_captured ?? null,
                /** 金流已退但本地未同步 → 必須先對帳，不得再退一次 */
                needsReconciliation: tpRefunded > alreadyRefunded,
              };
            }
          }
        } catch (e) {
          tappay = { found: false, reason: "query_failed", message: e instanceof Error ? e.message : "unknown" };
        }
      }
      return json({
        success: true,
        mode: "quote",
        paidAmount: paid,
        alreadyRefunded,
        alreadyRefundFee,
        settledRefund: alreadyRefunded + alreadyRefundFee,
        remainingRefundable: refundable,
        /** 手續費設定與本次建議金額的拆分（gross = 自 paid 沖銷；payout = 實際退給旅客） */
        manualRefundFee: configuredRefundFee,
        refundFeeApplies: !isCardOrder && configuredRefundFee > 0,
        suggestedRefundSplit: splitRefundFee({
          gross: suggestedRefund,
          configuredFee: configuredRefundFee,
          isCardRefund: isCardOrder,
        }),
        quote: policyQuote,
        policy: policyQuote.policy,
        suggestedRefund,
        requiresManualReview: policyQuote.requiresManualReview,
        paymentProvider: provider,
        isCardOrder,
        refundChannel: isCardOrder ? "tappay_card" : "manual_bank",
        tappay,
      });
    }


    /**
     * 人工覆寫退款金額（與系統建議不同）時，理由必填。
     * 與一般訂房 cancel-order-with-refund 規則一致，audit 需可追溯調整原因。
     */
    const requireReasonIfOverride = (actual: number) => {
      if (actual === suggestedRefund) return null;
      if (reason.length >= 2) return null;
      return json({
        error: `實際退款金額與系統建議（${twd(suggestedRefund)}）不同，請填寫調整原因。`,
        requiresReason: true,
        suggestedRefund,
      }, 400);
    };


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
      const reasonError = requireReasonIfOverride(refundAmount);
      if (reasonError) return reasonError;

      /**
       * refundAmount = 本次自 paid_amount 沖銷的「退款總額」(gross)。
       * 人工銀行退款會由其中扣除館別設定的手續費，實際匯回旅客為 payout。
       */
      const { fee: refundFee, payout: refundPayout } = splitRefundFee({
        gross: refundAmount,
        configuredFee: configuredRefundFee,
        isCardRefund: isCardOrder,
      });

      const settle = await adapter.refundPayment({
        order: { ...order, id: order.id },
        amount: refundPayout,
        note: reason,
        supabase: admin,
        triggerSource: "group_buy_cancel_refund",
      });
      if (!settle.ok) {
        return json({
          error: settle.message ?? settle.error ?? "退款處理失敗",
          errorCode: settle.error,
          needsReconciliation: settle.needsReconciliation ?? false,
        }, 400);
      }

      const totalRefunded = alreadyRefunded + refundPayout;
      const totalRefundFee = alreadyRefundFee + refundFee;
      const totalSettled = totalRefunded + totalRefundFee;
      const refundStatus = refundStatusAfterRefund(paid, totalSettled);
      /**
       * 帳務模型：paid_amount 維持原實收，refunded_amount 為累計已退。
       * payment_status 只做狀態同步（全額 refunded／部分 partial_refunded），不歸零 paid_amount。
       */
      const paymentStatus = totalSettled <= 0
        ? null
        : totalSettled >= paid
        ? "refunded"
        : "partial_refunded";

      const notes = [
        order.notes ?? "",
        isCardOrder
          ? `【退款】${nowIso} 由 ${actor} 執行原信用卡退刷 ${twd(refundAmount)}（累計 ${twd(totalRefunded)} / 已收 ${twd(paid)}${settle.recTradeId ? `／rec_trade_id: ${settle.recTradeId}` : ""}）`
          : `【退款】${nowIso} 由 ${actor} 登記人工退款 ${twd(refundAmount)}${
            refundFee > 0 ? `（扣手續費 ${twd(refundFee)}，實退旅客 ${twd(refundPayout)}）` : ""
          }（累計實退 ${twd(totalRefunded)} / 累計手續費 ${twd(totalRefundFee)} / 已收 ${twd(paid)}）`,
        reason ? `退款備註：${reason}` : null,
      ].filter(Boolean).join("\n");

      const { error: uErr } = await admin
        .from("orders")
        .update({
          refunded_amount: totalRefunded,
          refund_fee_amount: totalRefundFee,
          refunded_at: nowIso,
          refund_status: refundStatus,
          ...(paymentStatus ? { payment_status: paymentStatus } : {}),
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
          isCardOrder
            ? `原信用卡退刷（TapPay${settle.recTradeId ? ` ${settle.recTradeId}` : ""}）`
            : `人工退款（${provider === "manual" ? "銀行匯回" : provider}）`,

          `本次沖銷 ${twd(refundAmount)}`,
          refundFee > 0 ? `手續費 ${twd(refundFee)}` : null,
          `實退旅客 ${twd(refundPayout)}`,
          `累計實退 ${twd(totalRefunded)}`,
          totalRefundFee > 0 ? `累計手續費 ${twd(totalRefundFee)}` : null,
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
          refund_fee_amount: refundFee,
          refund_payout_amount: refundPayout,
          total_refunded_amount: totalRefunded,
          total_refund_fee_amount: totalRefundFee,
          manual_refund_fee_setting: configuredRefundFee,
          paid_amount: paid,
          refund_status: refundStatus,
          policy: policyQuote.policy,
          policy_reason: policyQuote.policyReason,
          policy_days_before: policyQuote.daysBefore,
          policy_refund_percent: policyQuote.refundPercent,
          suggested_refund_amount: suggestedRefund,
          manual_override: refundAmount !== suggestedRefund,
          override_reason: refundAmount !== suggestedRefund ? (reason || null) : null,
          rec_trade_id: settle.recTradeId ?? null,
          refund_channel: isCardOrder ? "tappay_card" : "manual_bank",
          payment_status: paymentStatus ?? order.payment_status,

          operator: actor,
          timestamp: nowIso,
          note: reason || null,
        },
      });

      // 退款資料已成功更新後才寄信；寄信失敗不影響退款登記
      await notify(
        renderRefundProcessed(await buildMailOrder(), {
          refundAmount: refundPayout,
          refundFee,
          refundFeeTotal: totalRefundFee,
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
        refundFee,
        refundPayout,
        totalRefundFee,
        refundStatus,
        paymentStatus: paymentStatus ?? order.payment_status,
        refundChannel: isCardOrder ? "tappay_card" : "manual_bank",
        recTradeId: settle.recTradeId ?? null,
        totalRefunded,
        remainingRefundable: Math.max(0, paid - totalSettled),
      });

    }

    // ---------------------------------------------------------------- cancel
    // 信用卡（tappay）：card_refund → refund-first，TapPay 退刷成功後才真正取消訂單。
    const refundAmount = (refundAction === "mark_refunded" || refundAction === "card_refund")
      ? Math.max(0, Math.round(refundAmountRaw || 0))
      : 0;

    if (refundAmount > refundable) {
      return json({ error: `退款金額超過可退金額 ${twd(refundable)}` }, 400);
    }
    // pending_refund 為「稍後處理」，不算金額覆寫；其餘與建議金額不同者理由必填
    if (refundAction !== "pending_refund") {
      const reasonError = requireReasonIfOverride(refundAmount);
      if (reasonError) return reasonError;
    }

    /** 取消時同步退款：refundAmount 為沖銷總額，人工退款需扣館別手續費 */
    const { fee: cancelRefundFee, payout: cancelRefundPayout } = splitRefundFee({
      gross: refundAmount,
      configuredFee: configuredRefundFee,
      isCardRefund: isCardOrder,
    });

    let cancelRefundRecTradeId: string | null = null;
    if (refundAmount > 0) {
      const settle = await adapter.refundPayment({
        order: { ...order, id: order.id },
        amount: cancelRefundPayout,
        note: reason,
        supabase: admin,
        triggerSource: "group_buy_cancel_refund",
      });
      if (!settle.ok) {
        return json({
          error: settle.message ?? settle.error ?? "退款處理失敗",
          errorCode: settle.error,
          needsReconciliation: settle.needsReconciliation ?? false,
        }, 400);
      }
      cancelRefundRecTradeId = settle.recTradeId ?? null;
    }

    const totalRefunded = alreadyRefunded + cancelRefundPayout;
    const totalRefundFee = alreadyRefundFee + cancelRefundFee;
    const totalSettled = totalRefunded + totalRefundFee;
    /**
     * 信用卡在依法規建議退款 0 元時仍走 card_refund（不呼叫 TapPay），
     * 語意等同「不需退款」，不可留下 pending_manual 讓人以為還要退錢。
     */
    const noRefundSemantics = refundAction === "no_refund" ||
      (isCardOrder && refundAction === "card_refund" && refundAmount === 0);
    const refundStatus = noRefundSemantics
      // 管理員明確決定不需退款（違約金／不可退方案）
      ? (totalSettled > 0 ? refundStatusAfterRefund(paid, totalSettled) : "none")
      // 有已收款但尚未退回 → pending（待退款），之後用「處理退款」完成
      : refundStatusAfterRefund(paid, totalSettled);

    /** 退款成功才同步 payment_status；paid_amount 一律維持原實收 */
    const cancelPaymentStatus = totalSettled <= 0
      ? null
      : totalSettled >= paid
      ? "refunded"
      : "partial_refunded";

    const noteLines = [
      order.notes ?? "",
      `【取消】${nowIso} 由 ${actor} 取消訂單`,
      noRefundSemantics
        ? "退款處理：確認不需退款（依取消政策不予退款）"
        : refundAmount > 0
        ? isCardOrder
          ? `退款處理：已完成原信用卡退刷 ${twd(refundAmount)}（TapPay${cancelRefundRecTradeId ? ` ${cancelRefundRecTradeId}` : ""}）`
          : `退款處理：已登記人工退款 ${twd(refundAmount)}（銀行匯回${
          cancelRefundFee > 0
            ? `／扣手續費 ${twd(cancelRefundFee)}／實退旅客 ${twd(cancelRefundPayout)}`
            : ""
        }）`
        : paid > 0
        ? "退款處理：待退款（尚未退回旅客）"
        : "退款處理：未收款，不需退款",
      `取消政策：${policyQuote.policy}（${policyQuote.policyReason}）／距入住 ${policyQuote.daysBefore} 天／比例 ${policyQuote.refundPercent}%／` +
      `已付 ${twd(paid)}／已退 ${twd(alreadyRefunded)}／最高可退 ${twd(refundable)}／建議退款 ${twd(suggestedRefund)}／實際 ${twd(refundAmount)}` +
      (refundAmount !== suggestedRefund && refundAction !== "pending_refund" ? "／⚠️ 人工調整" : "") +
      (policyQuote.requiresManualReview ? "／⚠️ 無法自動判定政策，需人工確認" : ""),
      reason ? `原因：${reason}` : null,
    ].filter(Boolean).join("\n");


    const { error: uErr } = await admin
      .from("orders")
      .update({
        order_status: "cancelled",
        cancelled_at: (order as any).cancelled_at ?? nowIso,
        refunded_amount: totalRefunded,
        refund_fee_amount: totalRefundFee,
        refunded_at: refundAmount > 0 ? nowIso : order.refunded_at,
        refund_status: refundStatus,
        ...(cancelPaymentStatus ? { payment_status: cancelPaymentStatus } : {}),
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
            isCardOrder
              ? `原信用卡退刷（TapPay${cancelRefundRecTradeId ? ` ${cancelRefundRecTradeId}` : ""}）`
              : `人工退款（${provider === "manual" ? "銀行匯回" : provider}）`,

            `本次沖銷 ${twd(refundAmount)}`,
            cancelRefundFee > 0 ? `手續費 ${twd(cancelRefundFee)}` : null,
            `實退旅客 ${twd(cancelRefundPayout)}`,
            `累計實退 ${twd(totalRefunded)}`,
            totalRefundFee > 0 ? `累計手續費 ${twd(totalRefundFee)}` : null,
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
        refund_fee_amount: cancelRefundFee,
        refund_payout_amount: cancelRefundPayout,
        total_refund_fee_amount: totalRefundFee,
        manual_refund_fee_setting: configuredRefundFee,
        total_refunded_amount: totalRefunded,
        paid_amount: paid,
        refund_status: refundStatus,
        policy: policyQuote.policy,
        policy_reason: policyQuote.policyReason,
        policy_days_before: policyQuote.daysBefore,
        policy_refund_percent: policyQuote.refundPercent,
        suggested_refund_amount: suggestedRefund,
        manual_override: refundAmount !== suggestedRefund,
        override_reason: refundAmount !== suggestedRefund ? (reason || null) : null,
        rec_trade_id: cancelRefundRecTradeId,
        refund_channel: isCardOrder ? "tappay_card" : "manual_bank",
        payment_status: cancelPaymentStatus ?? order.payment_status,

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
        refundFeeTotal: totalRefundFee,
        handlingFee: configuredRefundFee,
        refundStatus,
        reason: reason || null,
      }),
    );

    return json({
      success: true,
      mode: "cancel",
      refundAmount,
      refundFee: cancelRefundFee,
      refundPayout: cancelRefundPayout,
      totalRefundFee,
      refundStatus,
      paymentStatus: cancelPaymentStatus ?? order.payment_status,
      refundChannel: isCardOrder ? "tappay_card" : "manual_bank",
      recTradeId: cancelRefundRecTradeId,
      totalRefunded,
      remainingRefundable: Math.max(0, paid - totalSettled),
    });


  } catch (e) {
    console.error(`[${FN}] error`, e);
    return json({ error: e instanceof Error ? e.message : "internal_error" }, 500);
  }
});
