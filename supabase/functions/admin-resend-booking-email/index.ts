import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  resolveCaller,
  isAccommodationAdmin,
  canEditModule,
  forbiddenResponse,
  unauthorizedResponse,
} from "../_shared/authz.ts";
import { sendBookingConfirmationByOrderId } from "../_shared/sendBookingEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await resolveCaller(req);
    if (!caller.ok) {
      return new Response(JSON.stringify({ error: caller.error }), {
        status: caller.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ctx = caller.ctx;
    if (!ctx.userId && !ctx.isServiceRole) {
      return unauthorizedResponse(corsHeaders);
    }

    const { orderId, emailType = "booking_confirmation" } = await req.json();
    if (!orderId) {
      return new Response(JSON.stringify({ error: "orderId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: order } = await admin
      .from("orders")
      .select("id, accommodation_id, payment_method, balance_payment_method, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      return new Response(JSON.stringify({ error: "order_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: super_admin / hotel_admin / staff with editable orders module
    const admOk = await isAccommodationAdmin(ctx, order.accommodation_id);
    const editOk = admOk || (await canEditModule(ctx, order.accommodation_id, "orders" as any));
    if (!editOk) {
      return forbiddenResponse(corsHeaders);
    }

    if (emailType === "final_payment_received" || emailType === "deposit_received") {
      // Clear idempotency guard: mark previous 'sent' rows of the same type as 'resent'
      // so the send function proceeds.
      await admin
        .from("booking_email_log")
        .update({ status: "resent" })
        .eq("order_id", orderId)
        .eq("email_type", emailType)
        .eq("status", "sent");

      const methodLabel = order.balance_payment_method || order.payment_method || "";
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-final-payment-received`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          orderId,
          triggerSource: "manual_resend",
          triggeredBy: ctx.userId,
          paymentMethodLabel: methodLabel,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      return new Response(JSON.stringify(body), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: resend booking confirmation
    const methodLabel = order.payment_method === "atm"
      ? "ATM 虛擬帳號轉帳"
      : (order.payment_method === "credit_card_3ds" ? "信用卡(3D驗證)" : (order.payment_method || ""));
    const r = await sendBookingConfirmationByOrderId(
      supabaseUrl,
      serviceKey,
      orderId,
      methodLabel,
      "manual_resend",
      ctx.userId,
    );
    return new Response(JSON.stringify(r), {
      status: r.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[admin-resend-booking-email] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
