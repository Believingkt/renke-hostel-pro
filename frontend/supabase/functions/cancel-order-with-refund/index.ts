// Cancel an order. Optionally refund the paid amount.
// - credit_card / credit_card_3ds: auto-call TapPay refund using rec_trade_id parsed from notes or deposit_charges
// - atm: cannot auto-refund (funds settled to merchant bank). Marks order for manual refund.
// - other (cash/bank_transfer/manual): just cancel; refund handled offline.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { refundTapPay } from "../_shared/tappay.ts";
import {
  extractRecTradeIdFromNotes,
  flagRefundNeedsManual,
  resolveCardRecTradeId,
} from "../_shared/orderRefund.ts";
import { canEditModule, resolveCaller } from "../_shared/authz.ts";
import { quoteCancellation, taipeiToday } from "../_shared/cancellationPolicy.ts";
import { pushOrderEvent } from "../_shared/push.ts";
import { buildCancelOrderPatch, buildCancelRefundFailurePatch } from "../_shared/patchBuilders.ts";



interface Body {
  orderId: string;
  // "auto_refund" = call TapPay refund (credit card only)
  // "mark_manual_refund" = cancel + add audit note (ATM / cash / bank_transfer)
  // "no_refund" = cancel without refund
  refundAction: "auto_refund" | "mark_manual_refund" | "no_refund";
  refundAmount?: number; // optional manual override; defaults to the server-computed policy amount
  /** 人工調整退款金額（refundAmount !== suggestedRefund）時「必填」的理由，會寫入 audit */
  overrideReason?: string;
  /** mode: "quote" 只回傳建議退款金額，不異動資料 */
  mode?: "quote" | "apply";

}

const extractRecTradeId = (notes: string | null) => extractRecTradeIdFromNotes(notes);

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    if (!body?.orderId || (body?.mode !== "quote" && !body?.refundAction)) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少必要參數" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id;
    const userEmail = userData?.user?.email || "unknown";
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, message: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, accommodation_id, order_number, order_status, payment_status, paid_amount, refunded_amount, final_price, deposit_amount, check_in_date, order_source, payment_provider, payment_method, deposit_payment_method, balance_payment_method, atm_rec_trade_id, room_charge_rec_trade_id, room_charge_status, notes")
      .eq("id", body.orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到訂單" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (order.order_status === "cancelled") {
      return new Response(
        JSON.stringify({ success: true, message: "訂單已是取消狀態" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Permission: admin OR staff with `orders` module editable on this accommodation
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return new Response(JSON.stringify({ success: false, message: "未授權" }), {
        status: authRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowed = await canEditModule(authRes.ctx, order.accommodation_id, "orders");
    if (!allowed) {
      return new Response(
        JSON.stringify({ success: false, message: "無權限取消此訂單" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );

    }

    const paidAmount = order.paid_amount || 0;

    // 建議退款金額：一律由 server 依訂單真實付款制度 + 法規級距計算
    const policyQuote = quoteCancellation({
      order: order as any,
      checkInDate: String(order.check_in_date),
      cancellationDate: taipeiToday(),
      alreadyRefunded: Number(order.refunded_amount || 0),
      guaranteeBase: Number(order.final_price || 0),
    });
    const suggestedRefund = Math.max(0, Math.round(policyQuote.refundAmount));

    const alreadyRefunded = Math.max(0, Math.round(Number(order.refunded_amount || 0)));
    const remainingRefundable = Math.max(0, Math.round(paidAmount - alreadyRefunded));

    if (body.mode === "quote") {
      return new Response(
        JSON.stringify({
          success: true,
          quote: policyQuote,
          policy: policyQuote.policy,
          suggestedRefund,
          paidAmount,
          alreadyRefunded,
          remainingRefundable,
          requiresManualReview: policyQuote.requiresManualReview,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 未指定金額 → 採用法規建議金額（不再預設全額退）
    const refundAmount = Number.isFinite(body.refundAmount as number)
      ? Math.max(0, Math.round(Number(body.refundAmount)))
      : suggestedRefund;
    const isManualOverride = refundAmount !== suggestedRefund;
    const overrideReason = String(body.overrideReason ?? "").trim();

    // 人工覆寫退款金額時，理由必填（與團購規則一致）
    if (isManualOverride && overrideReason.length < 2) {
      return new Response(
        JSON.stringify({
          success: false,
          requiresReason: true,
          suggestedRefund,
          message: `實際退款金額與系統建議（NT$${suggestedRefund.toLocaleString()}）不同，請填寫調整原因。`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const nowIso = new Date().toISOString();
    const auditPrefix = `🔒 [${nowIso}] ${userEmail} 取消訂單`;

    let refundResultNote = "";
    let refundSucceeded = false;
    let recTradeIdUsed: string | null = null;


    // ===== auto_refund: credit card via TapPay =====
    if (body.refundAction === "auto_refund") {
      if (policyQuote.requiresManualReview && !Number.isFinite(body.refundAmount as number)) {
        return new Response(
          JSON.stringify({
            success: false,
            needsManualReview: true,
            quote: policyQuote,
            message: "此訂單無法自動判定取消政策（歷史訂單），請人工確認退款金額後再送出。",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (refundAmount <= 0) {
        return new Response(
          JSON.stringify({ success: false, message: "退款金額必須大於 0" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (refundAmount > paidAmount) {
        return new Response(
          JSON.stringify({ success: false, message: `退款金額不可超過已收金額 NT$${paidAmount}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Locate rec_trade_id: orders 欄位 → deposit_charges 最新成功扣款 → notes 解析
      recTradeIdUsed = (await resolveCardRecTradeId(supabase, order as any)) ||
        extractRecTradeId(order.notes);


      if (!recTradeIdUsed) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "找不到刷卡交易編號（rec_trade_id），無法自動退款。請改選『手動退款』或於 TapPay 後台處理。",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
      if (!partnerKey) {
        return new Response(
          JSON.stringify({ success: false, message: "TapPay 設定未配置" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const refundResult = await refundTapPay(partnerKey, recTradeIdUsed, refundAmount);
      refundSucceeded = refundResult.success;
      await supabase.from("deposit_charges").insert({
        order_id: order.id,
        accommodation_id: order.accommodation_id,
        action: "refund",
        amount: refundAmount,
        status: refundSucceeded ? "success" : "failed",
        trigger_source: "admin_cancel",
        rec_trade_id: recTradeIdUsed,
        webhook_status: refundSucceeded ? "pending" : "failed",
        needs_manual_review: !refundSucceeded,
        error_message: refundSucceeded ? null : (refundResult.msg || `TapPay error ${refundResult.status}`),
      });
      if (!refundSucceeded) {
        // Do NOT cancel the order if refund failed — keep money + order in sync
        const msgLower = typeof refundResult.msg === "string" ? refundResult.msg.toLowerCase() : "";
        const isBankCapturing =
          refundResult.status === 946 || msgLower.includes("bank capturing");
        const isRisky =
          refundResult.status === 10016 || msgLower.includes("risky");
        const failMessage = isBankCapturing
          ? "此交易正在銀行請款中，暫時無法自動退款。請於請款完成後（通常隔日）再試，或改用「手動退款」。"
          : isRisky
            ? "此筆退款被 TapPay 風控暫時拒絕（代碼 10016），訂單未取消。請改用「手動退款」，或聯絡 TapPay 客服了解原因。"
            : `TapPay 退款失敗（代碼 ${refundResult.status}：${refundResult.msg}），訂單未取消，請改用手動退款或至 TapPay 後台處理。`;
        await supabase.rpc("update_order_with_context", {
          p_order_id: order.id,
          p_patch: buildCancelRefundFailurePatch({ recTradeId: recTradeIdUsed }),
          p_source: "admin_cancel_refund",
          p_reason: `TapPay 退款失敗（代碼 ${refundResult.status}：${refundResult.msg}）`,
          p_actor_label: `取消退款（操作者 ${userEmail}）`,
          p_actor_type: "system",
        });
        await flagRefundNeedsManual(supabase, order as any, refundAmount, {
          attempted: true,
          success: false,
          refunded: 0,
          recTradeId: recTradeIdUsed,
          status: refundResult.status,
          msg: refundResult.msg,
          reason: "tappay_error",
          note: failMessage,
        });
        return new Response(
          JSON.stringify({
            success: false,
            message: failMessage,
            recTradeId: recTradeIdUsed,
            tappayStatus: refundResult.status,
            tappayMsg: refundResult.msg,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      refundResultNote = `\n${auditPrefix}，已自動退刷 NT$${refundAmount}（rec_trade_id: ${recTradeIdUsed}）`;
    }

    // ===== mark_manual_refund: ATM / cash / bank_transfer =====
    // TECH-DEBT: cancel-order-with-refund mark_manual_refund 超退上限檢查
    if (body.refundAction === "mark_manual_refund") {
      refundResultNote = `\n${auditPrefix}，需手動退款 NT$${refundAmount}（付款方式：${order.payment_method || order.deposit_payment_method || "未知"}）⚠️ 請聯絡客人退款`;
    }

    // ===== no_refund =====
    if (body.refundAction === "no_refund") {
      const reason = paidAmount > 0 ? `（保留已收 NT$${paidAmount}）` : "";
      refundResultNote = `\n${auditPrefix}${reason}，未退款`;
    }

    const policyNote =
      `\n🔒 [${nowIso}] 取消政策：${policyQuote.policy}（${policyQuote.policyReason}）／距入住 ${policyQuote.daysBefore} 天／` +
      `比例 ${policyQuote.refundPercent}%／已付 NT$${paidAmount.toLocaleString()}／已退 NT$${alreadyRefunded.toLocaleString()}／` +
      `最高可退 NT$${remainingRefundable.toLocaleString()}／` +
      `建議退款 NT$${suggestedRefund.toLocaleString()}／實際處理 NT$${refundAmount.toLocaleString()}` +
      (isManualOverride ? `／⚠️ 人工調整（操作者 ${userEmail}，原因：${overrideReason}）` : "") +

      (policyQuote.requiresManualReview ? "／⚠️ 無法自動判定政策，需人工確認" : "");
    const newNotes = (order.notes || "") + refundResultNote + policyNote;

    // Build update patch
    const patch = buildCancelOrderPatch({
      nowIso,
      notes: newNotes,
      refundAction: body.refundAction,
      refundSucceeded,
      paidAmount,
      refundAmount,
      recTradeId: recTradeIdUsed ?? null,
    });

    const cancelReason =
      body.refundAction === "auto_refund" && refundSucceeded
        ? `自動退刷 NT$${refundAmount}`
        : body.refundAction === "mark_manual_refund"
          ? `需手動退款 NT$${refundAmount}`
          : "未退款";

    const { error: upErr } = await supabase.rpc("update_order_with_context", {
      p_order_id: order.id,
      p_patch: patch,
      p_source: "admin_cancel_refund",
      p_reason: `取消訂單：${cancelReason}`,
      p_actor_label: `取消退款（操作者 ${userEmail}）`,
      p_actor_type: "system",
    });
    if (upErr) {
      console.error("[cancel-order-with-refund] update error", upErr);
      return new Response(
        JSON.stringify({
          success: false,
          message: refundSucceeded
            ? `已退款 NT$${refundAmount} 但訂單狀態更新失敗，請聯繫工程師。rec_trade_id: ${recTradeIdUsed}`
            : "訂單更新失敗",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.refundAction === "mark_manual_refund" && refundAmount > 0) {
      await flagRefundNeedsManual(supabase, order as any, refundAmount, {
        attempted: false,
        success: false,
        refunded: 0,
        recTradeId: null,
        reason: "not_card",
        note: "後台標記手動退款",
      });
    }

    // 取消通知信（含退款資訊，best-effort）
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-order-cancelled-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          chargedFee: Math.max(0, paidAmount - (refundSucceeded ? refundAmount : 0)),
          refunded: refundSucceeded ? refundAmount : 0,
          needManual: body.refundAction === "mark_manual_refund" && refundAmount > 0,
          triggerSource: "admin_cancel",
        }),
      });
    } catch (mailErr) {
      console.error("[cancel-order-with-refund] email failed", mailErr);
    }

    // App 推播：訂單取消／退款
    await pushOrderEvent(order.id, "order_cancelled", {
      amount: refundSucceeded ? refundAmount : 0,
    });



    return new Response(
      JSON.stringify({
        success: true,
        message:
          body.refundAction === "auto_refund"
            ? `已取消訂單並退款 NT$${refundAmount}`
            : body.refundAction === "mark_manual_refund"
              ? "已取消訂單，請手動退款給客人"
              : "已取消訂單",
        refunded: refundSucceeded ? refundAmount : 0,
        quote: policyQuote,
        suggestedRefund,
        manualOverride: isManualOverride,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("[cancel-order-with-refund] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: "處理失敗", technicalMessage: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
