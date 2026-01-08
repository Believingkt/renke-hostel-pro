import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Allowed origins for CORS
const allowedOrigins = [
  'https://sensan.lovable.app',
  'https://dmafqwfynatdvnaeovhz.lovableproject.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

interface InviteEmailRequest {
  email: string;
  inviteLink: string;
  senderName?: string;
  recipientName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  
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
        JSON.stringify({ error: "未提供授權標頭" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "身份驗證失敗" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isAdmin = roles?.some(r => r.role === "super_admin" || r.role === "hotel_admin");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "只有管理員可以發送邀請郵件" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Send Invite] Admin ${user.email} sending invite`);

    const { email, inviteLink, senderName = "系統管理員", recipientName = "使用者" }: InviteEmailRequest = await req.json();

    const emailResponse = await resend.emails.send({
      from: "森山寫照 <noreply@sensaninn.lakeze.com>",
      to: [email],
      subject: "歡迎加入森山寫照 PMS 管理系統",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, "Microsoft JhengHei", sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
            .button { display: inline-block; padding: 12px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: 600; }
            .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏡 歡迎加入森山寫照</h1>
            </div>
            <div class="content">
              <p>${recipientName}您好：</p>
              <p>邀請您加入森山寫照 PMS 管理系統。</p>
              
              <p>請點擊下方按鈕來設定您的密碼並啟用帳號：</p>
              <div style="text-align: center;">
                <a href="${inviteLink}" class="button" style="color: white !important; text-decoration: none;">設定密碼並啟用帳號</a>
              </div>
              <p style="color: #666; font-size: 14px;">
                或複製以下連結到瀏覽器：<br>
                <span style="word-break: break-all;">${inviteLink}</span>
              </p>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0; color: #92400e; font-weight: 600;">
                  ⏰ 重要提醒：此邀請鏈接將在 <span style="color: #b45309; font-size: 16px;">24小時內</span>有效
                </p>
              </div>
              <p style="margin-top: 30px; color: #888; font-size: 13px;">
                如果您沒有要求此邀請，請忽略此郵件。
              </p>
            </div>
            <div class="footer">
              <p>© 2025 Lakeze.</p>
              <p>此為系統自動發送的郵件，請勿直接回覆</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("邀請郵件已發送:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("發送邀請郵件時發生錯誤:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
