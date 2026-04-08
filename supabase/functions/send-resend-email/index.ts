import { corsHeaders } from "@supabase/supabase-js/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "人客多 Lakeze <noreply@lakeze.com>";
const LOGO_URL = "https://dmafqwfynatdvnaeovhz.supabase.co/storage/v1/object/public/email-assets/lakeze-logo.png";

// Brand colors (from index.css)
const BRAND = {
  primary: "#d07218",       // hsl(25, 76%, 50%)
  primaryLight: "#fdf0e3",  // hsl(25, 70%, 94%)
  accent: "#d47a0a",        // hsl(30, 84%, 45%)
  foreground: "#2d3344",    // hsl(220, 15%, 20%)
  muted: "#6b7280",         // hsl(220, 10%, 50%)
  radius: "8px",
};

function baseLayout(title: string, previewText: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent}); padding: 32px 24px; text-align: center; }
    .header img { height: 48px; }
    .body { padding: 32px 28px; }
    .body h1 { color: ${BRAND.foreground}; font-size: 22px; font-weight: 700; margin: 0 0 16px; }
    .body p { color: ${BRAND.muted}; font-size: 15px; line-height: 1.7; margin: 0 0 20px; }
    .btn { display: inline-block; background: ${BRAND.primary}; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: ${BRAND.radius}; font-size: 16px; font-weight: 600; }
    .btn:hover { background: ${BRAND.accent}; }
    .code-box { background: ${BRAND.primaryLight}; border: 1px solid ${BRAND.primary}33; border-radius: ${BRAND.radius}; padding: 16px; text-align: center; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: ${BRAND.foreground}; margin: 20px 0; }
    .footer { background: #fafafa; padding: 20px 28px; text-align: center; border-top: 1px solid #eee; }
    .footer p { color: #999; font-size: 12px; margin: 0; }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden">${previewText}</div>
  <div style="padding: 24px 16px;">
    <div class="container">
      <div class="header">
        <img src="${LOGO_URL}" alt="人客多 Lakeze" />
      </div>
      <div class="body">
        ${bodyContent}
      </div>
      <div class="footer">
        <p>© ${new Date().getFullYear()} 人客多 Lakeze. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Templates ──────────────────────────────────────────────

function signupTemplate(data: { confirmationUrl: string }): { subject: string; html: string } {
  return {
    subject: "歡迎加入人客多 — 請驗證您的 Email",
    html: baseLayout(
      "Email 驗證",
      "請驗證您的 Email 以啟用帳號",
      `<h1>歡迎加入人客多！🎉</h1>
       <p>感謝您註冊人客多會員。請點擊下方按鈕完成 Email 驗證，即可開始使用所有會員功能。</p>
       <p style="text-align:center; margin: 28px 0;">
         <a href="${data.confirmationUrl}" class="btn">驗證 Email</a>
       </p>
       <p style="font-size:13px; color:#999;">如果按鈕無法點擊，請複製以下連結至瀏覽器：<br/><a href="${data.confirmationUrl}" style="color:${BRAND.primary}; word-break:break-all;">${data.confirmationUrl}</a></p>`
    ),
  };
}

function recoveryTemplate(data: { confirmationUrl: string }): { subject: string; html: string } {
  return {
    subject: "人客多 — 重設您的密碼",
    html: baseLayout(
      "密碼重設",
      "您已申請重設密碼",
      `<h1>重設您的密碼</h1>
       <p>我們收到您的密碼重設請求。請點擊下方按鈕設定新密碼。</p>
       <p style="text-align:center; margin: 28px 0;">
         <a href="${data.confirmationUrl}" class="btn">重設密碼</a>
       </p>
       <p style="font-size:13px; color:#999;">如果您沒有申請重設密碼，請忽略此郵件。此連結將在 24 小時後失效。</p>
       <p style="font-size:13px; color:#999;">如果按鈕無法點擊，請複製以下連結至瀏覽器：<br/><a href="${data.confirmationUrl}" style="color:${BRAND.primary}; word-break:break-all;">${data.confirmationUrl}</a></p>`
    ),
  };
}

function magicLinkTemplate(data: { confirmationUrl: string }): { subject: string; html: string } {
  return {
    subject: "人客多 — 您的登入連結",
    html: baseLayout(
      "快速登入",
      "使用此連結快速登入您的帳號",
      `<h1>快速登入</h1>
       <p>點擊下方按鈕即可登入您的人客多帳號，無需輸入密碼。</p>
       <p style="text-align:center; margin: 28px 0;">
         <a href="${data.confirmationUrl}" class="btn">立即登入</a>
       </p>
       <p style="font-size:13px; color:#999;">此連結僅限使用一次，且將在 5 分鐘後失效。</p>`
    ),
  };
}

function inviteTemplate(data: { confirmationUrl: string }): { subject: string; html: string } {
  return {
    subject: "您已被邀請加入人客多",
    html: baseLayout(
      "帳號邀請",
      "您已被邀請加入人客多系統",
      `<h1>您已被邀請加入人客多！</h1>
       <p>管理員已邀請您加入人客多 PMS 管理系統。請點擊下方按鈕設定您的密碼並啟用帳號。</p>
       <p style="text-align:center; margin: 28px 0;">
         <a href="${data.confirmationUrl}" class="btn">接受邀請</a>
       </p>
       <p style="font-size:13px; color:#999;">如果按鈕無法點擊，請複製以下連結至瀏覽器：<br/><a href="${data.confirmationUrl}" style="color:${BRAND.primary}; word-break:break-all;">${data.confirmationUrl}</a></p>`
    ),
  };
}

function emailChangeTemplate(data: { confirmationUrl: string }): { subject: string; html: string } {
  return {
    subject: "人客多 — 確認變更 Email",
    html: baseLayout(
      "Email 變更確認",
      "請確認您的新 Email 地址",
      `<h1>確認變更 Email</h1>
       <p>您已申請變更 Email 地址。請點擊下方按鈕確認新的 Email。</p>
       <p style="text-align:center; margin: 28px 0;">
         <a href="${data.confirmationUrl}" class="btn">確認變更</a>
       </p>
       <p style="font-size:13px; color:#999;">如果您沒有申請變更 Email，請忽略此郵件。</p>`
    ),
  };
}

function reauthenticationTemplate(data: { token: string }): { subject: string; html: string } {
  return {
    subject: "人客多 — 您的驗證碼",
    html: baseLayout(
      "驗證碼",
      "您的驗證碼",
      `<h1>您的驗證碼</h1>
       <p>請使用以下驗證碼完成身份驗證：</p>
       <div class="code-box">${data.token}</div>
       <p style="font-size:13px; color:#999;">此驗證碼將在 5 分鐘後失效。如果您未發起此操作，請忽略此郵件。</p>`
    ),
  };
}

function bookingConfirmationTemplate(data: {
  guestName: string;
  accommodationName: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  orderNumber: string;
  totalPrice: number;
}): { subject: string; html: string } {
  return {
    subject: `人客多 — 訂房確認 #${data.orderNumber}`,
    html: baseLayout(
      "訂房確認",
      `${data.guestName}，您的訂房已確認`,
      `<h1>${data.guestName}，訂房已確認！✅</h1>
       <p>感謝您的預訂，以下是您的訂房資訊：</p>
       <div style="background:${BRAND.primaryLight}; border-radius:${BRAND.radius}; padding:20px; margin:20px 0;">
         <table style="width:100%; font-size:14px; color:${BRAND.foreground};">
           <tr><td style="padding:6px 0; color:${BRAND.muted};">訂單編號</td><td style="padding:6px 0; font-weight:600; text-align:right;">${data.orderNumber}</td></tr>
           <tr><td style="padding:6px 0; color:${BRAND.muted};">住宿名稱</td><td style="padding:6px 0; font-weight:600; text-align:right;">${data.accommodationName}</td></tr>
           <tr><td style="padding:6px 0; color:${BRAND.muted};">房型</td><td style="padding:6px 0; font-weight:600; text-align:right;">${data.roomType}</td></tr>
           <tr><td style="padding:6px 0; color:${BRAND.muted};">入住日期</td><td style="padding:6px 0; font-weight:600; text-align:right;">${data.checkIn}</td></tr>
           <tr><td style="padding:6px 0; color:${BRAND.muted};">退房日期</td><td style="padding:6px 0; font-weight:600; text-align:right;">${data.checkOut}</td></tr>
           <tr><td style="padding:6px 0; border-top:1px solid ${BRAND.primary}33; color:${BRAND.muted};">總金額</td><td style="padding:6px 0; border-top:1px solid ${BRAND.primary}33; font-weight:700; text-align:right; color:${BRAND.primary};">NT$ ${data.totalPrice.toLocaleString()}</td></tr>
         </table>
       </div>
       <p>如有任何問題，歡迎透過訂房頁面與我們聯繫。</p>`
    ),
  };
}

// ── Template Router ────────────────────────────────────────

type TemplateType = "signup" | "recovery" | "magiclink" | "invite" | "email_change" | "reauthentication" | "booking_confirmation";

function renderTemplate(type: TemplateType, data: Record<string, any>): { subject: string; html: string } {
  switch (type) {
    case "signup": return signupTemplate(data as any);
    case "recovery": return recoveryTemplate(data as any);
    case "magiclink": return magicLinkTemplate(data as any);
    case "invite": return inviteTemplate(data as any);
    case "email_change": return emailChangeTemplate(data as any);
    case "reauthentication": return reauthenticationTemplate(data as any);
    case "booking_confirmation": return bookingConfirmationTemplate(data as any);
    default: throw new Error(`Unknown template type: ${type}`);
  }
}

// ── Main Handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY_1 is not configured");

    const body = await req.json();
    const { templateType, recipientEmail, templateData } = body;

    if (!templateType || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "templateType and recipientEmail are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { subject, html } = renderTemplate(templateType, templateData || {});

    const response = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", JSON.stringify(result));
      throw new Error(`Resend API failed [${response.status}]: ${JSON.stringify(result)}`);
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
