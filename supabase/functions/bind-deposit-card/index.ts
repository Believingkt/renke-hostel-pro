// Bind a credit card for deposit pre-authorization (押金綁卡)
// Uses TapPay Bind Card API to obtain long-lived card_key/card_token without charging.
// Docs: https://docs.tappaysdk.com/tutorial/zh/back.html#bind-card-api
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

function normalizePhoneE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("09") && cleaned.length === 10) return "+886" + cleaned.substring(1);
  if (cleaned.startsWith("886")) return "+" + cleaned;
  return "+886" + cleaned;
}

function getBindCardEndpoint(): string {
  const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
  return env === "sandbox"
    ? "https://sandbox.tappaysdk.com/tpc/card/bind"
    : "https://prod.tappaysdk.com/tpc/card/bind";
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { prime, orderId, cardholder } = body ?? {};

    if (!prime || typeof prime !== "string" || prime.length < 10) {
      return new Response(
        JSON.stringify({ success: false, message: "綁卡資訊缺失,請重新填寫卡片資料" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ success: false, message: "缺少訂單編號" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!cardholder?.name || !cardholder?.email || !cardholder?.phoneNumber) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少持卡人資料" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
    if (!partnerKey || !merchantId) throw new Error("TapPay credentials not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up the order so we can store accommodation_id with the token
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, accommodation_id, order_number, deposit_status")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      return new Response(
        JSON.stringify({ success: false, message: "找不到訂單" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Call TapPay Bind Card
    const tapBody = {
      prime,
      partner_key: partnerKey,
      merchant_id: merchantId,
      currency: "TWD",
      cardholder: {
        phone_number: normalizePhoneE164(cardholder.phoneNumber),
        name: cardholder.name,
        email: cardholder.email,
      },
    };

    const resp = await fetch(getBindCardEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
      body: JSON.stringify(tapBody),
    });
    const result = await resp.json();

    console.log("[bind-deposit-card] TapPay response", {
      status: result.status,
      msg: result.msg,
      orderNumber: order.order_number,
    });

    if (result.status !== 0 || !result.card_secret?.card_key || !result.card_secret?.card_token) {
      return new Response(
        JSON.stringify({
          success: false,
          message: result.msg || "綁卡失敗",
          suggestion: "請檢查卡片資訊是否正確,或更換其他卡片",
          errorCode: result.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Save token (deactivate any previous tokens for this order)
    await supabase
      .from("deposit_card_tokens")
      .update({ is_active: false })
      .eq("order_id", order.id);

    const cardInfo = result.card_info ?? {};
    const { error: insertErr } = await supabase.from("deposit_card_tokens").insert({
      order_id: order.id,
      accommodation_id: order.accommodation_id,
      card_key: result.card_secret.card_key,
      card_token: result.card_secret.card_token,
      card_last_four: cardInfo.last_four ?? null,
      card_type: cardInfo.type ? String(cardInfo.type) : null,
      card_expiry: cardInfo.expiry_date ?? null,
      is_active: true,
    });

    if (insertErr) {
      console.error("[bind-deposit-card] Failed to insert token", insertErr);
      throw new Error("Failed to save card token");
    }

    // Update order deposit status
    await supabase
      .from("orders")
      .update({
        deposit_method: "card",
        deposit_status: "card_bound",
      })
      .eq("id", order.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "綁卡成功,押金將於入住前一天扣款",
        cardLastFour: cardInfo.last_four ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[bind-deposit-card] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: "綁卡處理失敗", technicalMessage: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
