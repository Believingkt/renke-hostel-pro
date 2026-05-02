// Refund a deposit (full or partial). Admin-only, manual trigger from order detail page.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

function getRefundEndpoint(): string {
  const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
  return env === "sandbox"
    ? "https://sandbox.tappaysdk.com/tpc/transaction/refund"
    : "https://prod.tappaysdk.com/tpc/transaction/refund";
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orderId, amount } = await req.json();
    if (!orderId || !Number.isInteger(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ success: false, message: "請輸入有效的退款金額" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    if (!partnerKey) throw new Error("TapPay credentials not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth check - must be admin of this accommodation
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, message: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: order } = await supabase
      .from("orders")
      .select("id, accommodation_id, order_number, deposit_charged_amount, deposit_refunded_amount, deposit_status")
      .eq("id", orderId)
      .single();
    if (!order) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到訂單" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("accommodation_id", order.accommodation_id);
    const isSuperAdmin = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const allowed =
      isSuperAdmin.data ||
      roles?.some((r: any) => r.role === "hotel_admin" || r.role === "super_admin");
    if (!allowed) {
      return new Response(
        JSON.stringify({ success: false, message: "無權限執行此操作" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const refundable =
      (order.deposit_charged_amount || 0) - (order.deposit_refunded_amount || 0);
    if (amount > refundable) {
      return new Response(
        JSON.stringify({ success: false, message: `退款金額超過可退金額 NT$${refundable}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find latest successful charge with rec_trade_id
    const { data: lastCharge } = await supabase
      .from("deposit_charges")
      .select("id, rec_trade_id, card_token_id")
      .eq("order_id", order.id)
      .eq("action", "charge")
      .eq("status", "success")
      .not("rec_trade_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastCharge?.rec_trade_id) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到可退款的扣款紀錄" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resp = await fetch(getRefundEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify({
        partner_key: partnerKey,
        rec_trade_id: lastCharge.rec_trade_id,
        amount,
      }),
    });
    const result = await resp.json();
    const success = result.status === 0;

    await supabase.from("deposit_charges").insert({
      order_id: order.id,
      accommodation_id: order.accommodation_id,
      card_token_id: lastCharge.card_token_id,
      action: "refund",
      amount,
      status: success ? "success" : "failed",
      trigger_source: "manual",
      rec_trade_id: lastCharge.rec_trade_id,
      error_message: success ? null : (result.msg || `TapPay error ${result.status}`),
      performed_by: userId,
    });

    if (success) {
      const newRefunded = (order.deposit_refunded_amount || 0) + amount;
      const fullyRefunded = newRefunded >= (order.deposit_charged_amount || 0);
      await supabase
        .from("orders")
        .update({
          deposit_refunded_amount: newRefunded,
          deposit_refunded_at: new Date().toISOString(),
          deposit_status: fullyRefunded ? "refunded" : "partially_refunded",
        })
        .eq("id", order.id);

      return new Response(
        JSON.stringify({ success: true, message: "退款成功", amount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: result.msg || "退款失敗",
          errorCode: result.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    console.error("[refund-deposit] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: "退款處理失敗", technicalMessage: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
