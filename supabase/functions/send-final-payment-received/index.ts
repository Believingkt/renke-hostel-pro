import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface FinalPaymentRequest {
  orderId: string;
  triggerSource?: string;
  triggeredBy?: string | null;
  paymentMethodLabel?: string;
  paidThisTime?: number;
  /** 'deposit' = 訂金入帳通知；'final' = 尾款/全額付清通知 */
  paymentKind?: "deposit" | "final";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, triggerSource = "auto_final_payment", triggeredBy = null, paymentMethodLabel, paidThisTime, paymentKind = "final" }: FinalPaymentRequest = await req.json();
    const isDeposit = paymentKind === "deposit";
    const emailType = isDeposit ? "deposit_received" : "final_payment_received";

    if (!orderId) {
      return new Response(JSON.stringify({ success: false, error: "orderId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id, order_number, guest_name, guest_email, accommodation_id,
        check_in_date, check_out_date, guest_count,
        final_price, paid_amount, balance_payment_method, payment_method,
        room_types ( name )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      return new Response(JSON.stringify({ success: false, error: "order_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order.guest_email) {
      return new Response(JSON.stringify({ success: false, error: "no_email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check (defence-in-depth on top of unique index)
    const { data: existing } = await supabase
      .from("booking_email_log")
      .select("id")
      .eq("order_id", orderId)
      .eq("email_type", emailType)
      .eq("status", "sent")
      .limit(1);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ success: true, already_sent: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accommodationName = "";
    let accommodationPhone = "";
    let accommodationEmail = "";
    let accommodationLineId = "";
    let accommodationServiceHours = "";
    if (order.accommodation_id) {
      const { data: acc } = await supabase
        .from("accommodation_info")
        .select("name, phone, email, line_id, email_service_hours")
        .eq("id", order.accommodation_id)
        .single();
      accommodationName = acc?.name ?? "";
      accommodationPhone = acc?.phone ?? "";
      accommodationEmail = acc?.email ?? "";
      accommodationLineId = acc?.line_id ?? "";
      accommodationServiceHours = (acc as any)?.email_service_hours ?? "";
    }

    const roomName = (order as any).room_types?.name ?? "";
    const finalPrice = Number(order.final_price) || 0;
    const paidAmount = Number(order.paid_amount) || 0;
    const thisTime = typeof paidThisTime === "number" && paidThisTime > 0 ? paidThisTime : Math.max(0, paidAmount - 0);
    const method = paymentMethodLabel || order.balance_payment_method || order.payment_method || "";

    const balance = Math.max(0, finalPrice - paidAmount);
    const headline = isDeposit ? "✅ 訂金已收到" : "✅ 尾款已收到";
    const subject = `${accommodationName ? `【${accommodationName}】` : ""}${isDeposit ? "訂金已收到" : "尾款已收到"} - 訂單編號 ${order.order_number}`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Microsoft JhengHei', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #fff; padding: 30px; border: 1px solid #e0e0e0; }
        .price-highlight { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0; }
        .total-price { font-size: 24px; color: #16a34a; font-weight: bold; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 10px 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 26px;">${headline}</h1>
          ${accommodationName ? `<p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">${accommodationName}</p>` : ""}
          <p style="margin: 8px 0 0 0; opacity: 0.9;">感謝您完成本次付款！</p>
        </div>

        <div class="content">
          <p style="font-size: 16px;">親愛的 ${order.guest_name} 您好，</p>
          <p>${isDeposit ? "我們已收到您的訂金，訂單已確認，以下為付款明細：" : "我們已收到您的款項，訂單已全額付清，以下為付款明細："}</p>

          <div style="margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color:#666; padding:12px 0;">訂單編號</td><td style="text-align:right; font-weight:600; padding:12px 0;">${order.order_number}</td></tr>
              ${roomName ? `<tr style="border-bottom: 1px solid #f0f0f0;"><td style="color:#666; padding:12px 0;">房型</td><td style="text-align:right; font-weight:600; padding:12px 0;">${roomName}</td></tr>` : ""}
              <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color:#666; padding:12px 0;">入住 / 退房</td><td style="text-align:right; font-weight:600; padding:12px 0;">${order.check_in_date} → ${order.check_out_date}</td></tr>
              <tr style="border-bottom: 1px solid #f0f0f0;"><td style="color:#666; padding:12px 0;">入住人數</td><td style="text-align:right; font-weight:600; padding:12px 0;">${order.guest_count} 人</td></tr>
              ${method ? `<tr style="border-bottom: 1px solid #f0f0f0;"><td style="color:#666; padding:12px 0;">${isDeposit ? "付款方式" : "尾款付款方式"}</td><td style="text-align:right; font-weight:600; padding:12px 0;">${method}</td></tr>` : ""}
            </table>
          </div>

          <div class="price-highlight">
            <table style="width:100%; border-collapse: collapse;">
              <tr><td style="font-size:15px; color:#333; padding:6px 0;">本次繳付</td><td style="text-align:right; font-weight:700; color:#16a34a; font-size:18px; padding:6px 0;">NT$ ${thisTime.toLocaleString()}</td></tr>
              <tr><td style="font-size:15px; color:#666; padding:6px 0; border-top:1px dashed #d0d0d0;">累計已付</td><td style="text-align:right; font-weight:600; padding:6px 0; border-top:1px dashed #d0d0d0;">NT$ ${paidAmount.toLocaleString()}</td></tr>
              <tr><td style="font-size:18px; font-weight:600; padding:10px 0;">訂單總額</td><td style="text-align:right; padding:10px 0;"><span class="total-price">NT$ ${finalPrice.toLocaleString()}</span></td></tr>
              ${balance > 0 ? `<tr><td style="font-size:15px; color:#b45309; padding:6px 0; border-top:1px dashed #d0d0d0;">尚需支付餘額</td><td style="text-align:right; font-weight:700; color:#b45309; padding:6px 0; border-top:1px dashed #d0d0d0;">NT$ ${balance.toLocaleString()}</td></tr>` : ""}
            </table>
          </div>

          <div style="margin-top: 24px; padding: 20px; background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; border: 2px solid #16a34a; text-align:center;">
            <p style="margin:0 0 10px 0; font-weight:700; color:#166534;">📋 查詢訂單資訊</p>
            <a href="https://booking.lakeze.com/member/orders" style="display:inline-block; padding:12px 32px; background:#16a34a; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">立即查詢訂單</a>
          </div>

          ${(accommodationPhone || accommodationLineId || accommodationEmail || accommodationServiceHours) ? `
          <div style="margin-top:24px; padding:20px; background:#f8f9fa; border-radius:8px; border-left:4px solid #16a34a;">
            <p style="margin:0 0 12px 0; font-weight:600;">如有任何疑問，歡迎聯繫${accommodationName ? ` ${accommodationName}` : ""}：</p>
            <div style="color:#666; line-height:1.8;">
              ${accommodationPhone ? `<p style="margin:6px 0;">📞 ${accommodationPhone}</p>` : ""}
              ${accommodationLineId ? `<p style="margin:6px 0;">💬 LINE：${accommodationLineId}</p>` : ""}
              ${accommodationEmail ? `<p style="margin:6px 0;">📧 ${accommodationEmail}</p>` : ""}
              ${accommodationServiceHours ? `<p style="margin:6px 0;">🕒 客服時間：${accommodationServiceHours}</p>` : ""}
            </div>
          </div>` : ""}

          ${isDeposit && balance > 0 ? `<p style="margin-top:20px; color:#b45309;">餘額 NT$ ${balance.toLocaleString()} 請依住宿指示於入住前或入住當日繳付。</p>` : ""}
          <p style="margin-top:20px; color:#16a34a; font-weight:600;">期待您的光臨！</p>
        </div>

        <div class="footer">
          <p style="margin:0; font-size:14px;">此為系統自動發送的郵件，請勿直接回覆</p>
          <p style="margin:10px 0 0 0; font-size:12px; color:#999;">© 2026 人客多. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "人客多通知 <noreply@sensaninn.lakeze.com>",
        to: [order.guest_email],
        subject,
        html,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error("[send-payment-received] Resend error:", errorText);
      try {
        await supabase.from("booking_email_log").insert({
          order_id: order.id,
          order_number: order.order_number,
          email_type: emailType,
          recipient: order.guest_email,
          subject,
          status: "failed",
          error_message: errorText.slice(0, 1000),
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
        });
      } catch (logErr) {
        console.error("[send-payment-received] log failure:", logErr);
      }
      return new Response(JSON.stringify({ success: false, error: errorText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emailData = await resp.json();
    try {
      await supabase.from("booking_email_log").insert({
        order_id: order.id,
        order_number: order.order_number,
        email_type: emailType,
        recipient: order.guest_email,
        subject,
        status: "sent",
        resend_id: emailData?.id ?? null,
        triggered_by: triggeredBy,
        trigger_source: triggerSource,
      });
    } catch (logErr: any) {
      // If unique index blocked a duplicate, treat as already sent
      console.warn("[send-final-payment-received] insert log warn:", logErr?.message);
    }

    return new Response(JSON.stringify({ success: true, emailData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-payment-received] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
