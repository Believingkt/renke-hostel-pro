// Charge a deposit using a previously bound card token (Pay by Card Token API)
// Docs: https://docs.tappaysdk.com/tutorial/zh/back.html#pay-by-card-token-api
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

function getPayByTokenEndpoint(): string {
  const env = Deno.env.get("TAPPAY_ENV") === "sandbox" ? "sandbox" : "production";
  return env === "sandbox"
    ? "https://sandbox.tappaysdk.com/tpc/payment/pay-by-token"
    : "https://prod.tappaysdk.com/tpc/payment/pay-by-token";
}

interface ChargeRequest {
  orderId: string;
  amount?: number;          // optional override; defaults to deposit_required_amount - already_charged
  triggerSource?: "manual" | "scheduled";
}

async function chargeOne(supabase: any, orderId: string, amountOverride: number | undefined, triggerSource: string, performedBy: string | null) {
  const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
  const merchantId = Deno.env.get("TAPPAY_MERCHANT_ID");
  if (!partnerKey || !merchantId) throw new Error("TapPay credentials not configured");

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, accommodation_id, order_number, order_status, guest_name, guest_email, guest_phone, deposit_required_amount, deposit_charged_amount, deposit_status, deposit_method")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { success: false, message: "找不到訂單" };

  if (order.order_status === "cancelled") {
    return { success: false, message: "訂單已取消,不執行扣款" };
  }
  if (order.deposit_method !== "card") {
    return { success: false, message: "此訂單未綁卡,無法線上扣款" };
  }

  const remaining = (order.deposit_required_amount || 0) - (order.deposit_charged_amount || 0);
  const amount = amountOverride ?? remaining;

  if (!Number.isInteger(amount) || amount <= 0) {
    return { success: false, message: "扣款金額無效" };
  }
  if (amount > remaining) {
    return { success: false, message: `扣款金額超過剩餘押金 NT$${remaining}` };
  }

  // Get active token
  const { data: tokenRow } = await supabase
    .from("deposit_card_tokens")
    .select("*")
    .eq("order_id", order.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tokenRow) return { success: false, message: "找不到有效的綁卡資料" };

  const tapBody = {
    card_key: tokenRow.card_key,
    card_token: tokenRow.card_token,
    partner_key: partnerKey,
    merchant_id: merchantId,
    amount,
    currency: "TWD",
    details: `押金 - 訂單 ${order.order_number}`,
    order_number: `DEP-${order.order_number}`.substring(0, 50),
    three_domain_secure: false,
  };

  const resp = await fetch(getPayByTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": partnerKey },
    body: JSON.stringify(tapBody),
  });
  const result = await resp.json();

  console.log("[charge-deposit] TapPay response", {
    status: result.status,
    msg: result.msg,
    orderNumber: order.order_number,
    amount,
  });

  const success = result.status === 0;

  // Log charge
  await supabase.from("deposit_charges").insert({
    order_id: order.id,
    accommodation_id: order.accommodation_id,
    card_token_id: tokenRow.id,
    action: "charge",
    amount,
    status: success ? "success" : "failed",
    trigger_source: triggerSource,
    rec_trade_id: result.rec_trade_id ?? null,
    error_message: success ? null : (result.msg || `TapPay error ${result.status}`),
    performed_by: performedBy,
  });

  if (success) {
    const newCharged = (order.deposit_charged_amount || 0) + amount;
    const newStatus = newCharged >= (order.deposit_required_amount || 0) ? "charged" : "card_bound";
    await supabase
      .from("orders")
      .update({
        deposit_charged_amount: newCharged,
        deposit_charged_at: new Date().toISOString(),
        deposit_status: newStatus,
      })
      .eq("id", order.id);

    return { success: true, message: "押金扣款成功", amount, recTradeId: result.rec_trade_id };
  } else {
    await supabase
      .from("orders")
      .update({ deposit_status: "failed" })
      .eq("id", order.id);

    return {
      success: false,
      message: result.msg || "扣款失敗",
      errorCode: result.status,
    };
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as ChargeRequest & { batch?: boolean };
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify caller (for manual triggers)
    let performedBy: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      performedBy = data?.user?.id ?? null;
    }

    // Batch mode: scheduled D-1 charge run
    if (body.batch) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().slice(0, 10);

      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("check_in_date", dateStr)
        .eq("deposit_method", "card")
        .eq("deposit_status", "card_bound")
        .neq("order_status", "cancelled");

      if (error) throw error;

      const results = [];
      for (const o of orders ?? []) {
        const r = await chargeOne(supabase, o.id, undefined, "scheduled", null);
        results.push({ orderNumber: o.order_number, ...r });
      }
      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!body.orderId) {
      return new Response(
        JSON.stringify({ success: false, message: "缺少訂單 ID" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await chargeOne(
      supabase,
      body.orderId,
      body.amount,
      body.triggerSource ?? "manual",
      performedBy,
    );
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[charge-deposit] error", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, message: "扣款處理失敗", technicalMessage: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
