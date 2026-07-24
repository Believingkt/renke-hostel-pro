const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "人客多會員 <noreply@lakeze.com>";
const RESEND_URL = "https://api.resend.com/emails";

const BRAND = {
  primary: "#d07218",
  primaryLight: "#fdf0e3",
  accent: "#d47a0a",
  foreground: "#2d3344",
  muted: "#6b7280",
  radius: "8px",
};

function baseLayout(title: string, previewText: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden">${previewText}</div>
  <div style="padding:24px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,${BRAND.primary},${BRAND.accent});padding:28px 24px;text-align:center;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:2px;">人客多 Lakeze</div>
      </div>
      <div style="padding:32px 28px;color:${BRAND.foreground};font-size:15px;line-height:1.7;">
        ${bodyContent}
      </div>
      <div style="background:#fafafa;padding:20px 28px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#999;font-size:12px;margin:0;">© ${new Date().getFullYear()} 人客多 Lakeze. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function otpBlock(token: string): string {
  return `<p style="text-align:center;margin:8px 0 4px;color:${BRAND.muted};font-size:14px;">您的 6 位數驗證碼</p>
    <div style="background:${BRAND.primaryLight};border:1px solid ${BRAND.primary}33;border-radius:${BRAND.radius};padding:18px;text-align:center;font-size:32px;font-weight:700;letter-spacing:10px;color:${BRAND.foreground};margin:16px 0;">${token}</div>
    <p style="text-align:center;font-size:12px;color:#999;margin:0 0 20px;">請於 10 分鐘內於結帳頁面輸入驗證碼</p>`;
}

function linkButton(url: string, label: string): string {
  return `<p style="text-align:center;margin:24px 0;">
    <a href="${url}" style="display:inline-block;background:${BRAND.primary};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:${BRAND.radius};font-size:16px;font-weight:600;">${label}</a>
  </p>
  <p style="font-size:12px;color:#999;word-break:break-all;">如按鈕無法點擊，請複製此連結至瀏覽器：<br/><a href="${url}" style="color:${BRAND.primary};">${url}</a></p>`;
}

function renderSignup(token: string | undefined, url: string | undefined): { subject: string; html: string } {
  const parts: string[] = [`<h1 style="margin:0 0 16px;font-size:22px;">歡迎加入人客多 🎉</h1>`,
    `<p style="color:${BRAND.muted};margin:0 0 20px;">感謝您註冊人客多會員。請使用下方 6 位數驗證碼完成 Email 驗證。</p>`];
  if (token) parts.push(otpBlock(token));
  if (url) parts.push(linkButton(url, "或點此直接驗證"));
  parts.push(`<p style="font-size:13px;color:#999;">若非本人操作，請忽略此郵件。</p>`);
  return {
    subject: token ? `【人客多】您的註冊驗證碼 ${token}` : "歡迎加入人客多 — 請驗證您的 Email",
    html: baseLayout("Email 驗證", token ? `您的註冊驗證碼：${token}` : "請驗證您的 Email 以啟用帳號", parts.join("\n")),
  };
}

function renderMagicLink(token: string | undefined, url: string | undefined): { subject: string; html: string } {
  const parts: string[] = [`<h1 style="margin:0 0 16px;font-size:22px;">快速登入人客多</h1>`,
    `<p style="color:${BRAND.muted};margin:0 0 20px;">請於結帳頁面輸入以下 6 位數驗證碼完成登入。</p>`];
  if (token) parts.push(otpBlock(token));
  if (url) parts.push(linkButton(url, "或點此直接登入"));
  parts.push(`<p style="font-size:13px;color:#999;">若非本人操作，請忽略此郵件。</p>`);
  return {
    subject: token ? `【人客多】您的登入驗證碼 ${token}` : "人客多 — 您的登入連結",
    html: baseLayout("快速登入", token ? `您的登入驗證碼：${token}` : "使用此連結快速登入", parts.join("\n")),
  };
}

function renderRecovery(token: string | undefined, url: string | undefined): { subject: string; html: string } {
  const parts: string[] = [`<h1 style="margin:0 0 16px;font-size:22px;">重設您的密碼</h1>`,
    `<p style="color:${BRAND.muted};margin:0 0 20px;">我們收到您的密碼重設請求。請使用下方驗證碼或點擊連結設定新密碼。</p>`];
  if (token) parts.push(otpBlock(token));
  if (url) parts.push(linkButton(url, "重設密碼"));
  parts.push(`<p style="font-size:13px;color:#999;">若您沒有申請重設密碼，請忽略此郵件。</p>`);
  return {
    subject: "【人客多】重設您的密碼",
    html: baseLayout("密碼重設", "您已申請重設密碼", parts.join("\n")),
  };
}

function renderInvite(url: string): { subject: string; html: string } {
  return {
    subject: "您已被邀請加入人客多",
    html: baseLayout("帳號邀請", "您已被邀請加入人客多系統",
      `<h1 style="margin:0 0 16px;font-size:22px;">您已被邀請加入人客多！</h1>
       <p style="color:${BRAND.muted};margin:0 0 20px;">請點擊下方按鈕設定您的密碼並啟用帳號。</p>
       ${linkButton(url, "接受邀請")}`),
  };
}

function renderEmailChange(url: string): { subject: string; html: string } {
  return {
    subject: "【人客多】確認變更 Email",
    html: baseLayout("Email 變更", "請確認您的新 Email 地址",
      `<h1 style="margin:0 0 16px;font-size:22px;">確認變更 Email</h1>
       <p style="color:${BRAND.muted};margin:0 0 20px;">您已申請變更 Email。請點擊下方按鈕完成確認。</p>
       ${linkButton(url, "確認變更")}
       <p style="font-size:13px;color:#999;">若您沒有申請變更 Email，請忽略此郵件。</p>`),
  };
}

function renderReauth(token: string): { subject: string; html: string } {
  return {
    subject: `【人客多】您的驗證碼 ${token}`,
    html: baseLayout("驗證碼", `您的驗證碼：${token}`,
      `<h1 style="margin:0 0 16px;font-size:22px;">您的驗證碼</h1>
       <p style="color:${BRAND.muted};margin:0 0 20px;">請使用以下驗證碼完成身份驗證：</p>
       ${otpBlock(token)}
       <p style="font-size:13px;color:#999;">此驗證碼將在 10 分鐘後失效。</p>`),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY_LAKEZE");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY_LAKEZE is not configured");

    const payload = await req.json();
    console.log("Auth email hook received:", JSON.stringify({
      type: payload.type,
      email: payload.email,
      hasEmailData: !!payload.email_data,
      hasWebhookSignature: !!req.headers.get("webhook-signature") || !!req.headers.get("x-supabase-signature"),
    }));

    const userObj = payload.user || {};
    const emailPayload = typeof payload.email === "object" && payload.email !== null ? payload.email : {};
    const emailData = payload.email_data || emailPayload || {};
    const type: string = payload.type || emailData.email_action_type || emailPayload.email_action_type;
    const email: string = typeof payload.email === "string" ? payload.email : (emailData.to || emailData.email || userObj.email);
    const token: string | undefined = payload.token || emailData.token || emailPayload.token;
    const tokenHash: string | undefined = emailData.token_hash || emailPayload.token_hash;
    const redirectTo: string | undefined = emailData.redirect_to || emailPayload.redirect_to || payload.redirect_to;
    const siteUrl: string | undefined = emailData.site_url || emailPayload.site_url || payload.site_url || Deno.env.get("SUPABASE_URL");
    let confirmationUrl: string | undefined = payload.confirmation_url;
    if (!confirmationUrl && tokenHash && type && siteUrl) {
      const redirectParam = redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : "";
      confirmationUrl = `${siteUrl}/auth/v1/verify?token=${tokenHash}&type=${type}${redirectParam}`;
    }

    if (!email || !type) {
      console.log("Auth email hook validation event skipped:", JSON.stringify({ hasType: !!type, hasEmail: !!email }));
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "validation_event_missing_type_or_email" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let rendered: { subject: string; html: string };
    switch (type) {
      case "signup":
        rendered = renderSignup(token, confirmationUrl); break;
      case "magiclink":
      case "magic_link":
        rendered = renderMagicLink(token, confirmationUrl); break;
      case "recovery":
        rendered = renderRecovery(token, confirmationUrl); break;
      case "invite":
        if (!confirmationUrl) throw new Error("invite missing confirmation URL");
        rendered = renderInvite(confirmationUrl); break;
      case "email_change":
      case "email_change_new":
      case "email_change_current":
        if (!confirmationUrl) throw new Error("email_change missing confirmation URL");
        rendered = renderEmailChange(confirmationUrl); break;
      case "reauthentication":
        if (!token) throw new Error("reauthentication missing token");
        rendered = renderReauth(token); break;
      default:
        console.log("Unknown auth email type, skipping:", type);
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: rendered.subject,
        html: rendered.html,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend API error:", response.status, JSON.stringify(result));
      throw new Error(`Resend failed [${response.status}]: ${JSON.stringify(result)}`);
    }

    console.log("Auth email sent:", { type, email, resendId: (result as { id?: string }).id });
    return new Response(JSON.stringify({ success: true, id: (result as { id?: string }).id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Auth email hook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
