// notify-booking-confirmation
// 用戶端（如 LinePayConfirm、BookingFlow）唯一寄送訂房通知信的入口。
// 後端 Edge Function 直接 import _shared/sendBookingEmail.ts 即可，不需要走這個 HTTP 入口。
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sendBookingConfirmationByOrderId } from "../_shared/sendBookingEmail.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { orderId, paymentMethodLabel } = await req.json();
    if (!orderId || typeof orderId !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "orderId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const result = await sendBookingConfirmationByOrderId(
      supabaseUrl,
      supabaseServiceKey,
      orderId,
      paymentMethodLabel || "線上付款",
    );

    return new Response(
      JSON.stringify({ success: result.ok, reason: result.reason }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[notify-booking-confirmation] error", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
