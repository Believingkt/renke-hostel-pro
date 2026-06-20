// Cancel an order. Optionally refund the paid amount.
// - credit_card / credit_card_3ds: auto-call TapPay refund using rec_trade_id parsed from notes or deposit_charges
// - atm: cannot auto-refund (funds settled to merchant bank). Marks order for manual refund.
// - other (cash/bank_transfer/manual): just cancel; refund handled offline.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { refundTapPay } from "../_shared/tappay.ts";

interface Body {
  orderId: string;
  // "auto_refund" = call TapPay refund (credit card only)
  // "mark_manual_refund" = cancel + add audit note (ATM / cash / bank_transfer)
  // "no_refund" = cancel without refund
  refundAction: "auto_refund" | "mark_manual_refund" | "no_refund";
  refundAmount?: number; // optional override; defaults to paid_amount
}

function extractRecTradeId(notes: string | null): string | null {
  if (!notes) return null;
  // 優先比對 tappay-notify / atm-create 寫入的 "(rec_trade_id: XXX)" 格式，取最後一筆（最新）
  const matches = [...notes.matchAll(/rec_trade_id[:\s]+([A-Za-z0-9_\-]+)/gi)];
  if (matches.length > 0) {
    return matches[matches.length - 1][1];
  }
  // Fallback：舊版 "TapPay 交易：XXX" 格式
  const m = notes.match(/TapPay(?:\s+3DS)?\s*交易[:：]\s*([A-Za-z0-9_\-]+)/);
  return m ? m[1] : null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    if (!body?.orderId || !body?.refundAction) {
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
      .select("id, accommodation_id, order_number, order_status, payment_status, paid_amount, payment_method, deposit_payment_method, balance_payment_method, atm_rec_trade_id, notes")
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

    // Permission check: super_admin OR hotel_admin of this accommodation
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, accommodation_id")
      .eq("user_id", userId);
    const allowed = (roles || []).some(
      (r: any) =>
        r.role === "super_admin" ||
        ((r.role === "hotel_admin" || r.role === "staff") &&
          r.accommodation_id === order.accommodation_id),
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ success: false, message: "無權限取消此訂單" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const paidAmount = order.paid_amount || 0;
    const refundAmount = body.refundAmount ?? paidAmount;
    const nowIso = new Date().toISOString();
    const auditPrefix = `🔒 [${nowIso}] ${userEmail} 取消訂單`;

    let refundResultNote = "";
    let refundSucceeded = false;
    let recTradeIdUsed: string | null = null;

    // ===== auto_refund: credit card via TapPay =====
    if (body.refundAction === "auto_refund") {
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

      // Locate rec_trade_id: prefer deposit_charges latest success, then parse from notes
      const { data: lastCharge } = await supabase
        .from("deposit_charges")
        .select("rec_trade_id")
        .eq("order_id", order.id)
        .eq("action", "charge")
        .eq("status", "success")
        .not("rec_trade_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      recTradeIdUsed = lastCharge?.rec_trade_id || extractRecTradeId(order.notes);

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

      refundSucceeded = await refundTapPay(partnerKey, recTradeIdUsed, refundAmount);
      if (!refundSucceeded) {
        // Do NOT cancel the order if refund failed — keep money + order in sync
        return new Response(
          JSON.stringify({
            success: false,
            message: "TapPay 退款失敗，訂單未取消。請至 TapPay 後台檢查或改用手動退款。",
            recTradeId: recTradeIdUsed,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      refundResultNote = `\n${auditPrefix}，已自動退刷 NT$${refundAmount}（rec_trade_id: ${recTradeIdUsed}）`;
    }

    // ===== mark_manual_refund: ATM / cash / bank_transfer =====
    if (body.refundAction === "mark_manual_refund") {
      refundResultNote = `\n${auditPrefix}，需手動退款 NT$${refundAmount}（付款方式：${order.payment_method || order.deposit_payment_method || "未知"}）⚠️ 請聯絡客人退款`;
    }

    // ===== no_refund =====
    if (body.refundAction === "no_refund") {
      const reason = paidAmount > 0 ? `（保留已收 NT$${paidAmount}）` : "";
      refundResultNote = `\n${auditPrefix}${reason}，未退款`;
    }

    const newNotes = (order.notes || "") + refundResultNote;

    // Build update patch
    const patch: Record<string, any> = {
      order_status: "cancelled",
      cancelled_at: nowIso,
      notes: newNotes,
      updated_at: nowIso,
    };
    if (body.refundAction === "auto_refund" && refundSucceeded) {
      const newPaid = Math.max(0, paidAmount - refundAmount);
      patch.paid_amount = newPaid;
      patch.payment_status = newPaid === 0 ? "refunded" : "partial_refunded";
    }

    const { error: upErr } = await supabase.from("orders").update(patch).eq("id", order.id);
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
