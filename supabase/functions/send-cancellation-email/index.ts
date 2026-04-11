import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface CancellationEmailRequest {
  orderNumber: string;
  guestName: string;
  guestEmail: string;
  roomTypeName: string;
  checkInDate: string;
  checkOutDate: string;
  mealPlan?: string;
  mealPlanDisplayName?: string;
  accommodationName: string;
  accommodationPhone?: string;
  accommodationEmail?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "未提供授權標頭" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "身份驗證失敗" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user has staff or admin role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const hasRole = roles?.some(r => ["super_admin", "hotel_admin", "staff"].includes(r.role));
    if (!hasRole) {
      return new Response(
        JSON.stringify({ success: false, error: "沒有權限發送取消郵件" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cancellation Email] User ${user.email} sending cancellation email`);

    const {
      orderNumber,
      guestName,
      guestEmail,
      roomTypeName,
      checkInDate,
      checkOutDate,
      mealPlan,
      mealPlanDisplayName,
      accommodationName,
      accommodationPhone,
      accommodationEmail,
    }: CancellationEmailRequest = await req.json();

    console.log("Sending cancellation email to:", guestEmail, "for order:", orderNumber);

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-TW', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      });
    };

    const getMealPlanText = () => {
      if (mealPlanDisplayName) return mealPlanDisplayName;
      if (mealPlan === "2_meals") return "一泊二食";
      if (mealPlan === "3_meals") return "一泊三食";
      return mealPlan || "";
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -30px -30px 30px -30px;
          }
          .header h1 { margin: 0; font-size: 24px; }
          .alert-box {
            background: #fee2e2;
            border-left: 4px solid #ef4444;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-row {
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .info-row:last-child { border-bottom: none; }
          .label { color: #6b7280; font-weight: 500; display: inline-block; width: 100px; }
          .value { color: #111827; font-weight: 600; }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
          }
          .contact-info {
            background: #f9fafb;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>訂單取消通知</h1>
          </div>
          
          <p>親愛的 ${guestName} 您好，</p>
          
          <div class="alert-box">
            <strong>⚠️ 您的訂單已被取消</strong>
            <p style="margin: 10px 0 0 0;">由於房型庫存調整，您的訂單已被取消。造成您的不便，我們深感抱歉。</p>
          </div>

          <h3>訂單資訊</h3>
          <div class="info-row">
            <span class="label">訂單編號：</span>
            <span class="value">${orderNumber}</span>
          </div>
          <div class="info-row">
            <span class="label">房型：</span>
            <span class="value">${roomTypeName}</span>
          </div>
          ${mealPlan ? `
          <div class="info-row">
            <span class="label">餐食方案：</span>
            <span class="value">${getMealPlanText()}</span>
          </div>
          ` : ''}
          <div class="info-row">
            <span class="label">入住日期：</span>
            <span class="value">${formatDate(checkInDate)}</span>
          </div>
          <div class="info-row">
            <span class="label">退房日期：</span>
            <span class="value">${formatDate(checkOutDate)}</span>
          </div>

          ${accommodationPhone || accommodationEmail ? `
          <div class="contact-info">
            <h4 style="margin-top: 0;">如有疑問，請聯繫我們：</h4>
            ${accommodationPhone ? `<p style="margin: 5px 0;">📞 電話：${accommodationPhone}</p>` : ''}
            ${accommodationEmail ? `<p style="margin: 5px 0;">📧 Email：${accommodationEmail}</p>` : ''}
          </div>
          ` : ''}

          <div class="footer">
            <p>此為系統自動發送的郵件，請勿直接回覆。</p>
            <p style="margin: 5px 0;">© ${new Date().getFullYear()} ${accommodationName}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${accommodationName} <onboarding@resend.dev>`,
        to: [guestEmail],
        subject: `訂單取消通知 - ${orderNumber}`,
        html: emailHtml,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to send email");
    }

    console.log("Email sent successfully:", data);

    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error sending cancellation email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
