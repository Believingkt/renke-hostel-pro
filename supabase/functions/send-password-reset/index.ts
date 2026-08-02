import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { z } from "npm:zod@3.25.76";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resetUrlBase = "https://pms.lakeze.com/reset-password";
const fromAddress = "人客多 <noreply@lakeze.com>";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: max 3 requests per email per 15 minutes
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const key = `reset:${email.toLowerCase()}`;
  const record = rateLimitMap.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

const RequestSchema = z.object({ email: z.string().trim().email().max(320) });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "請輸入有效的電子郵件" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const email = parsed.data.email.toLowerCase();
    
    // Check rate limit
    if (!checkRateLimit(email)) {
      console.warn(`[Rate Limit] Too many password reset requests for: ${email}`);
      // Still return success to not reveal if rate limited
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth users can exceed one page. Iterate without exposing account existence.
    let user: { id: string; email?: string } | undefined;
    for (let page = 1; page <= 20 && !user; page += 1) {
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (userError) {
        console.error("Error listing users:", userError.message);
        throw new Error("無法驗證使用者");
      }
      user = userData.users.find((candidate) => candidate.email?.toLowerCase() === email);
      if (userData.users.length < 1000) break;
    }

    if (!user) {
      // Don't reveal if user exists or not for security
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Generate secure random token
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: user.id,
        email: email.toLowerCase(),
        token: token,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("Error storing token:", insertError);
      throw new Error("無法建立重設連結");
    }

    // Build reset URL
    const resetUrl = `${resetUrlBase}?token=${encodeURIComponent(token)}`;

    const resendKey = Deno.env.get("RESEND_API_KEY_LAKEZE");
    if (!resendKey) throw new Error("郵件服務尚未設定");

    const messageId = crypto.randomUUID();
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "pms_password_recovery",
      recipient_email: email,
      status: "pending",
      metadata: { provider: "resend", sender: "lakeze.com", via: "send-password-reset" },
    });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [email],
        subject: "【人客多】重設您的密碼",
        html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #d07218; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">密碼重設請求</h1>
          </div>
          <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
            <p style="margin-bottom: 20px;">您好，</p>
            <p style="margin-bottom: 20px;">我們收到了您的密碼重設請求。請點擊下方按鈕來重設您的密碼：</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #d07218; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">重設密碼</a>
            </div>
            <p style="margin-bottom: 10px; color: #666; font-size: 14px;">此連結將在 1 小時後失效。</p>
            <p style="margin-bottom: 20px; color: #666; font-size: 14px;">如果您沒有要求重設密碼，請忽略此郵件。</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">此郵件由系統自動發送，請勿直接回覆。</p>
          </div>
        </body>
        </html>
        `,
      }),
    });

    const responseBody = await emailResponse.text();
    if (!emailResponse.ok) {
      console.error("Password reset email failed", { status: emailResponse.status, body: responseBody.slice(0, 500) });
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: "pms_password_recovery",
        recipient_email: email,
        status: "failed",
        error_message: `resend ${emailResponse.status}: ${responseBody.slice(0, 500)}`,
        metadata: { provider: "resend", via: "send-password-reset" },
      });
      throw new Error("郵件發送失敗");
    }

    let resendId: string | undefined;
    try { resendId = JSON.parse(responseBody)?.id; } catch { /* ignore malformed success body */ }
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: "pms_password_recovery",
      recipient_email: email,
      status: "sent",
      metadata: { provider: "resend", resend_id: resendId, sender: "lakeze.com", via: "send-password-reset" },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-password-reset function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "發送失敗" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
