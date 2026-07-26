// payment-audit-resolve
// 客服在「金流稽核」頁對待人工處理事件的一鍵式處理：
//   action = "verify"  → 只向 TapPay 查詢真實交易狀態與金額，回傳比對結果（不寫入）
//   action = "resolve" → 依核對結果回寫 deposit_charges 與 orders 的正確狀態，並解除待處理旗標
//   action = "dismiss" → 確認無需處理（例如重複通知），僅記錄處理說明
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { forbiddenResponse, isAccommodationAdmin, resolveCaller, unauthorizedResponse } from "../_shared/authz.ts";
import { queryTapPayRecord } from "../_shared/tappay.ts";

type Json = Record<string, unknown>;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  const caller = await resolveCaller(req);
  if (!caller.ok) return unauthorizedResponse(corsHeaders, caller.error);

  let body: {
    chargeId?: string;
    action?: "verify" | "resolve" | "dismiss";
    note?: string;
    /** resolve 時客服確認的實際金額（預設採用 TapPay 查詢結果） */
    verifiedAmount?: number;
    /** resolve 時要回寫的最終狀態 */
    finalStatus?: "success" | "failed";
  };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "Invalid JSON" }, 400);
  }

  const { chargeId, action = "verify" } = body;
  if (!chargeId) return json({ success: false, message: "缺少 chargeId" }, 400);

  const admin = caller.ctx.admin;
  const { data: charge, error: chargeErr } = await admin
    .from("deposit_charges")
    .select("*")
    .eq("id", chargeId)
    .maybeSingle();
  if (chargeErr || !charge) return json({ success: false, message: "找不到金流紀錄" }, 404);

  const allowed = await isAccommodationAdmin(caller.ctx, charge.accommodation_id);
  if (!allowed) return forbiddenResponse(corsHeaders, "沒有處理金流稽核的權限");

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, final_price, paid_amount, refunded_amount, payment_status, room_charge_status, notes")
    .eq("id", charge.order_id)
    .maybeSingle();

  // ---- 1) 向 TapPay 查詢真實狀態 ----
  let tappay: Awaited<ReturnType<typeof queryTapPayRecord>> | null = null;
  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
  if (charge.rec_trade_id && partnerKey) {
    try {
      tappay = await queryTapPayRecord({ partnerKey, recTradeId: charge.rec_trade_id });
    } catch (e) {
      console.error("[payment-audit-resolve] TapPay query failed:", e);
    }
  }

  const recordedAmount = Number(charge.amount || 0);
  const actualAmount = tappay?.found ? Number(tappay.amount ?? 0) : null;
  const actualRefunded = tappay?.found ? Number(tappay.refundedAmount ?? 0) : null;
  // record_status: 0=已授權未請款, 1=已請款, 2=已退款/取消
  const tappaySucceeded = tappay?.found ? tappay.recordStatus !== null && tappay.recordStatus >= 0 : null;
  const amountMatches = actualAmount === null ? null : actualAmount === recordedAmount;

  const verification = {
    recTradeId: charge.rec_trade_id,
    queried: !!tappay,
    found: tappay?.found ?? false,
    recordedAmount,
    actualAmount,
    actualRefunded,
    recordStatus: tappay?.recordStatus ?? null,
    bankTransactionId: tappay?.bankTransactionId ?? null,
    amountMatches,
    tappaySucceeded,
    suggestion: !tappay
      ? (charge.rec_trade_id ? "無法連線 TapPay，請人工於 TapPay 後台核對後手動結案" : "此筆無交易編號（例如綁卡事件），可直接結案")
      : !tappay.found
        ? "TapPay 查無此交易，建議標記為失敗並結案"
        : tappay.recordStatus === 2
          ? "TapPay 顯示此交易已退款／取消，建議以退款狀態回寫"
          : amountMatches
            ? "TapPay 交易存在且金額相符，建議標記為成功並回寫訂單"
            : "TapPay 金額與系統紀錄不一致，請確認後以實際金額回寫",
  };

  if (action === "verify") {
    return json({ success: true, verification });
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const appendNote = (line: string) =>
    `${order?.notes ? order.notes + "\n" : ""}🔒 ${stamp} ${line}（處理人：${caller.ctx.userEmail ?? "系統"}）`;

  // 處理前狀態快照（供稽核追查）
  const beforeState = {
    charge_status: charge.status,
    charge_amount: Number(charge.amount || 0),
    webhook_status: charge.webhook_status ?? null,
    needs_manual_review: charge.needs_manual_review ?? false,
    error_message: charge.error_message ?? null,
    order_payment_status: order?.payment_status ?? null,
    order_paid_amount: order ? Number(order.paid_amount || 0) : null,
    order_refunded_amount: order ? Number(order.refunded_amount || 0) : null,
    order_room_charge_status: order?.room_charge_status ?? null,
  };

  const writeAuditAction = async (
    resolutionAction: string,
    afterState: Json,
    extra: { finalStatus?: string | null; verifiedAmount?: number | null } = {},
  ) => {
    const { error } = await admin.from("payment_audit_actions").insert({
      charge_id: charge.id,
      order_id: charge.order_id,
      order_number: order?.order_number ?? null,
      accommodation_id: charge.accommodation_id,
      rec_trade_id: charge.rec_trade_id,
      charge_action: charge.action,
      resolution_action: resolutionAction,
      final_status: extra.finalStatus ?? null,
      recorded_amount: recordedAmount,
      verified_amount: extra.verifiedAmount ?? null,
      tappay_amount: actualAmount,
      amount_matches: amountMatches,
      before_state: beforeState,
      after_state: afterState,
      verification,
      note: body.note ?? null,
      operator_id: caller.ctx.userId,
      operator_email: caller.ctx.userEmail ?? null,
    });
    if (error) console.error("[payment-audit-resolve] audit insert failed:", error.message);
  };

  if (action === "dismiss") {
    const resolutionNote = body.note || "客服確認無需處理";
    await admin
      .from("deposit_charges")
      .update({
        needs_manual_review: false,
        resolved_at: new Date().toISOString(),
        resolved_by: caller.ctx.userId,
        resolution_action: "dismiss",
        resolution_note: resolutionNote,
      })
      .eq("id", chargeId);
    await writeAuditAction("dismiss", {
      charge_status: charge.status,
      charge_amount: Number(charge.amount || 0),
      needs_manual_review: false,
      resolution_note: resolutionNote,
      order_payment_status: order?.payment_status ?? null,
    });
    return json({ success: true, action: "dismiss", verification });
  }


  // ---- 2) resolve：回寫正確狀態 ----
  const finalStatus: "success" | "failed" =
    body.finalStatus ?? (tappay?.found && tappay.recordStatus !== 2 ? "success" : "failed");
  const verifiedAmount = Number(
    body.verifiedAmount ?? (actualAmount != null ? actualAmount : recordedAmount),
  );

  const chargePatch: Json = {
    status: finalStatus,
    amount: verifiedAmount,
    verified_amount: verifiedAmount,
    webhook_status: tappay?.found ? "confirmed" : (charge.webhook_status ?? "failed"),
    bank_transaction_id: tappay?.bankTransactionId ?? charge.bank_transaction_id,
    needs_manual_review: false,
    resolved_at: new Date().toISOString(),
    resolved_by: caller.ctx.userId,
    resolution_action: `resolve_${finalStatus}`,
    resolution_note:
      body.note ||
      `客服核對：TapPay ${tappay?.found ? "查得" : "查無"}交易，回寫為${finalStatus === "success" ? "成功" : "失敗"} NT$${verifiedAmount.toLocaleString()}`,
    error_message: finalStatus === "success" ? null : charge.error_message,
  };
  const { error: updChargeErr } = await admin.from("deposit_charges").update(chargePatch).eq("id", chargeId);
  if (updChargeErr) return json({ success: false, message: updChargeErr.message }, 500);

  // 回寫訂單狀態
  let orderAfter: Json = {};
  if (order) {

    const orderPatch: Json = {};
    const isRefund = charge.action === "refund" || charge.action === "cancellation_fee_refund";

    if (finalStatus === "success") {
      if (isRefund) {
        const refunded = Math.max(Number(order.refunded_amount || 0), verifiedAmount);
        orderPatch.refunded_amount = refunded;
        orderPatch.paid_amount = Math.max(0, Number(order.paid_amount || 0) - verifiedAmount);
        orderPatch.payment_status = "refunded";
      } else if (charge.action !== "card_bind") {
        const newPaid = Math.max(Number(order.paid_amount || 0), verifiedAmount);
        orderPatch.paid_amount = newPaid;
        orderPatch.payment_status = newPaid >= Number(order.final_price || 0) ? "paid" : "partial";
        if (order.room_charge_status && order.room_charge_status !== "cancelled") {
          orderPatch.room_charge_status = "charged";
          orderPatch.room_charge_at = new Date().toISOString();
          orderPatch.room_charge_error = null;
        }
      }
      orderPatch.notes = appendNote(
        `金流稽核人工核對完成：${isRefund ? "退款" : "扣款"} NT$${verifiedAmount.toLocaleString()} 確認成功`,
      );
    } else {
      if (!isRefund && charge.action !== "card_bind") {
        if (order.room_charge_status && order.room_charge_status !== "cancelled") {
          orderPatch.room_charge_status = "failed";
          orderPatch.room_charge_error = charge.error_message ?? "人工核對確認扣款失敗";
        }
        if (Number(order.paid_amount || 0) <= 0) orderPatch.payment_status = "unpaid";
      }
      orderPatch.notes = appendNote(
        `金流稽核人工核對完成：確認${isRefund ? "退款" : "扣款"}失敗，已回寫未收款狀態`,
      );
    }

    if (Object.keys(orderPatch).length > 0) {
      await admin.from("orders").update(orderPatch).eq("id", order.id);
    }
  }

  // 同步結束對應 webhook 事件的重試
  if (charge.rec_trade_id) {
    await admin
      .from("tappay_webhook_events")
      .update({ processed: true, gave_up: false, next_retry_at: null, process_error: "人工處理完成" })
      .eq("rec_trade_id", charge.rec_trade_id)
      .eq("processed", false);
  }

  return json({ success: true, action: "resolve", finalStatus, verifiedAmount, verification });
});
