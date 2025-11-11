import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BookingConfirmationRequest {
  guestName: string;
  guestEmail: string;
  orderNumber: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  mealPlan: string;
  finalPrice: number;
  depositAmount: number;
  paymentMethod: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      guestName,
      guestEmail,
      orderNumber,
      roomName,
      checkInDate,
      checkOutDate,
      guestCount,
      mealPlan,
      finalPrice,
      depositAmount,
      paymentMethod,
    }: BookingConfirmationRequest = await req.json();

    console.log("Sending booking confirmation email to:", guestEmail);

    const mealPlanText = mealPlan === "2_meals" ? "一泊二食" : "一泊三食";

    // 使用 Resend API 發送郵件
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sensan <onboarding@resend.dev>",
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
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; }
            .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
            .info-label { color: #666; font-weight: 500; }
            .info-value { color: #333; font-weight: 600; }
            .price-highlight { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .total-price { font-size: 24px; color: #667eea; font-weight: bold; }
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
                <div class="info-row">
                  <span class="info-label">訂單編號</span>
                  <span class="info-value">${orderNumber}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">房型</span>
                  <span class="info-value">${roomName}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">入住日期</span>
                  <span class="info-value">${checkInDate}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">退房日期</span>
                  <span class="info-value">${checkOutDate}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">入住人數</span>
                  <span class="info-value">${guestCount} 人</span>
                </div>
                <div class="info-row">
                  <span class="info-label">餐食方案</span>
                  <span class="info-value">${mealPlanText}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">付款方式</span>
                  <span class="info-value">${paymentMethod}</span>
                </div>
              </div>

              <div class="price-highlight">
                <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                  <span style="font-size: 18px; font-weight: 600;">總金額</span>
                  <span class="total-price">NT$ ${finalPrice.toLocaleString()}</span>
                </div>
                ${depositAmount > 0 ? `
                <div style="display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px solid #e0e0e0;">
                  <span style="color: #666;">需支付訂金</span>
                  <span style="font-size: 20px; font-weight: bold; color: #dc3545;">NT$ ${depositAmount.toLocaleString()}</span>
                </div>
                <p style="margin-top: 10px; color: #666; font-size: 14px;">剩餘款項請於入住時支付</p>
                ` : ''}
              </div>

              <div class="notice">
                <strong style="color: #856404;">⚠️ 重要提醒</strong>
                <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #856404;">
                  <li>請於入住日前確認訂單狀態</li>
                  <li>如需取消或變更訂單，請盡早與我們聯繫</li>
                  <li>入住時請攜帶有效身份證件</li>
                </ul>
              </div>

              <p style="margin-top: 30px;">如有任何疑問，歡迎隨時與我們聯繫。</p>
              <p style="margin-top: 20px;">期待您的光臨！</p>
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
      throw new Error(`Resend API error: ${errorText}`);
    }

    const emailData = await emailResponse.json();
    console.log("Booking confirmation email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, emailData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-booking-confirmation function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
