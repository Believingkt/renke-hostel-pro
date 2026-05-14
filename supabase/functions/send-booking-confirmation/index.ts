import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Simple in-memory rate limiter by email
const emailRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const EMAIL_RATE_LIMIT_MAX = 5; // Max 5 emails per window per email
const EMAIL_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

// IP-based rate limiter
const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const IP_RATE_LIMIT_MAX = 10; // Max 10 requests per window per IP
const IP_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute window

function checkRateLimit(map: Map<string, { count: number; resetTime: number }>, identifier: string, max: number, window: number): boolean {
  const now = Date.now();
  const record = map.get(identifier);
  
  if (!record || now > record.resetTime) {
    map.set(identifier, { count: 1, resetTime: now + window });
    return true;
  }
  
  if (record.count >= max) {
    return false;
  }
  
  record.count++;
  return true;
}

interface BookingConfirmationRequest {
  guestName: string;
  guestEmail: string;
  orderNumber: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  mealPlan: string;
  mealPlanDisplayName?: string;
  finalPrice: number;
  depositAmount: number;
  paymentMethod: string;
  petCount?: number;
  petPlanPrice?: number;
  mealPlanDetails?: Array<{ date: string; count: number; price: number }>;
  mealPlanTotal?: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // IP-based rate limiting
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 
                     'unknown';
    
    if (!checkRateLimit(ipRateLimitMap, `ip:${clientIP}`, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW)) {
      console.warn(`[Rate Limit] IP rate limit exceeded: ${clientIP}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "請求過於頻繁，請稍後再試" 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      guestName,
      guestEmail,
      orderNumber,
      roomName,
      checkInDate,
      checkOutDate,
      guestCount,
      mealPlan,
      mealPlanDisplayName,
      finalPrice,
      depositAmount,
      paymentMethod,
      petCount,
      petPlanPrice,
      mealPlanDetails,
      mealPlanTotal,
    }: BookingConfirmationRequest = await req.json();

    // Basic input validation
    if (!guestEmail || typeof guestEmail !== 'string' || !guestEmail.includes('@')) {
      return new Response(
        JSON.stringify({ success: false, error: "無效的 Email 格式" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!orderNumber || typeof orderNumber !== 'string' || orderNumber.length < 5) {
      return new Response(
        JSON.stringify({ success: false, error: "無效的訂單編號" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit by email address
    const emailRateLimitKey = `booking:${guestEmail.toLowerCase()}`;
    if (!checkRateLimit(emailRateLimitMap, emailRateLimitKey, EMAIL_RATE_LIMIT_MAX, EMAIL_RATE_LIMIT_WINDOW)) {
      console.warn(`[Rate Limit] Too many booking confirmations for: ${guestEmail}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "請求過於頻繁，請稍後再試" 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify order exists in database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, guest_email, order_number')
      .eq('order_number', orderNumber)
      .single();
    
    if (orderError || !order) {
      console.warn(`[Validation] Order not found: ${orderNumber}`);
      return new Response(
        JSON.stringify({ success: false, error: "找不到指定的訂單" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify email matches order (case-insensitive)
    if (order.guest_email?.toLowerCase() !== guestEmail.toLowerCase()) {
      console.warn(`[Validation] Email mismatch for order ${orderNumber}: expected ${order.guest_email}, got ${guestEmail}`);
      return new Response(
        JSON.stringify({ success: false, error: "Email 與訂單不符" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending booking confirmation email to:", guestEmail);

    const mealPlanText = mealPlanDisplayName || (mealPlan === "2_meals" ? "一泊二食" : "一泊三食");

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "森山寫照 <onboarding@resend.dev>",
        to: [guestEmail],
        subject: `訂房確認通知 - 訂單編號 ${orderNumber}`,
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Microsoft JhengHei', Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1fa958 0%, #33c566 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
            .price-highlight { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .total-price { font-size: 24px; color: #1fa958; font-weight: bold; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-radius: 0 0 10px 10px; }
            .notice { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">訂房確認通知</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">感謝您的訂購！</p>
            </div>
            
            <div class="content">
              <p style="font-size: 16px; margin-bottom: 20px;">親愛的 ${guestName} 您好，</p>
              <p>我們已收到您的訂房申請，以下是您的訂單詳情：</p>
              
              <div style="margin: 30px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0; width: 35%;">訂單編號</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${orderNumber}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">房型</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${roomName}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">入住日期</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${checkInDate}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">退房日期</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${checkOutDate}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">入住人數</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${guestCount} 人</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">餐食方案</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${mealPlanText}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f0f0f0;">
                    <td style="color: #666; font-weight: 500; padding: 12px 0;">付款方式</td>
                    <td style="color: #333; font-weight: 600; padding: 12px 0; text-align: right;">${paymentMethod}</td>
                  </tr>
                </table>
              </div>

              ${petCount || mealPlanDetails?.length ? `
              <div style="margin: 30px 0; background: #f8f9fa; padding: 20px; border-radius: 8px;">
                <h3 style="margin: 0 0 15px 0; color: #333; font-size: 18px; font-weight: 600;">📦 加購方案</h3>
                ${petCount ? `
                <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 12px; margin-bottom: 12px;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="color: #333; padding: 8px 0;">🐾 寵物方案</td>
                      <td style="text-align: right; color: #333; font-weight: 600; padding: 8px 0;">NT$ ${petPlanPrice?.toLocaleString()}</td>
                    </tr>
                  </table>
                </div>
                ` : ''}
                ${mealPlanDetails && mealPlanDetails.length > 0 ? `
                <div>
                  <div style="color: #333; font-size: 16px; margin-bottom: 8px;">🍖 餐食方案</div>
                  ${mealPlanDetails.map(detail => `
                    <div style="padding-left: 20px; margin: 6px 0;">
                      <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                          <td style="color: #666; font-size: 14px; padding: 4px 0;">${detail.date} - ${detail.count} 人</td>
                          <td style="text-align: right; color: #666; font-size: 14px; padding: 4px 0;">NT$ ${detail.price.toLocaleString()}</td>
                        </tr>
                      </table>
                    </div>
                  `).join('')}
                  ${mealPlanTotal ? `
                  <div style="border-top: 1px solid #e0e0e0; padding-top: 8px; margin-top: 8px;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="color: #333; font-weight: 600; padding: 4px 0;">餐食方案小計</td>
                        <td style="text-align: right; color: #333; font-weight: 600; padding: 4px 0;">NT$ ${mealPlanTotal.toLocaleString()}</td>
                      </tr>
                    </table>
                  </div>
                  ` : ''}
                </div>
                ` : ''}
              </div>
              ` : ''}

              <div class="price-highlight">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="font-size: 18px; font-weight: 600; padding-bottom: 15px;">總金額</td>
                    <td style="text-align: right; padding-bottom: 15px;">
                      <span class="total-price">NT$ ${finalPrice.toLocaleString()}</span>
                    </td>
                  </tr>
                </table>
              </div>

              <div class="notice">
                <strong style="color: #856404;">⚠️ 重要提醒</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">
                  <li>請於入住日前確認訂單狀態</li>
                  <li>如需取消或變更訂單，請盡早與我們聯繫</li>
                  <li>入住時請攜帶有效身份證件</li>
                </ul>
              </div>

              <div style="margin-top: 30px; padding: 25px; background: linear-gradient(135deg, #f0fdf5 0%, #dcfce7 100%); border-radius: 12px; border: 2px solid #1fa958; text-align: center;">
                <p style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #1fa958;">📋 查詢訂單資訊</p>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 14px; line-height: 1.6;">
                  您可以隨時透過以下連結查詢您的訂單狀態、付款記錄及住宿詳情
                </p>
                <a href="https://booking.lakeze.com/order-search?orderNumber=${orderNumber}" 
                   style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #1fa958 0%, #33c566 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(31, 169, 88, 0.3);">
                  🔍 立即查詢訂單
                </a>
              </div>

              <div style="margin-top: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #1fa958;">
                <p style="margin: 0 0 15px 0; font-weight: 600; color: #333;">如有任何疑問，歡迎透過下列方式與我們聯繫：</p>
                <div style="color: #666; line-height: 1.8;">
                  <p style="margin: 8px 0;">📞 聯絡電話：<a href="tel:0903178518" style="color: #1fa958; text-decoration: none;">0903178518</a></p>
                  <p style="margin: 8px 0;">💬 LINE 官方帳號：<a href="https://line.me/R/ti/p/@042deypa" style="color: #1fa958; text-decoration: none;">@042deypa</a></p>
                  <p style="margin: 8px 0;">📧 電子郵件：<a href="mailto:sensan.inn@gmail.com" style="color: #1fa958; text-decoration: none;">sensan.inn@gmail.com</a></p>
                </div>
              </div>
              <p style="margin-top: 20px; font-size: 16px; font-weight: 500; color: #1fa958;">期待您的光臨！</p>
            </div>

            <div class="footer">
              <p style="margin: 0; font-size: 14px;">此為系統自動發送的郵件，請勿直接回覆</p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">© 2025 Sensan. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          warning: "Email sending was skipped due to development environment restrictions",
          details: errorText 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailData = await emailResponse.json();
    console.log("Booking confirmation email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, emailData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-booking-confirmation function:", error);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        warning: "Email could not be sent, but booking was successful",
        error: error.message 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
