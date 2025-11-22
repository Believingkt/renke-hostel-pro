import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteEmailRequest {
  email: string;
  inviteLink: string;
  senderName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, inviteLink, senderName = "系統管理員" }: InviteEmailRequest = await req.json();

    const emailResponse = await resend.emails.send({
      from: "森山寫照 <noreply@sensaninn.lakeze.com>",
      to: [email],
      subject: "歡迎加入森山寫照管理系統",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, "Microsoft JhengHei", sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🏡 歡迎加入森山寫照</h1>
            </div>
            <div class="content">
              <p>您好，</p>
              <p>${senderName} 邀請您加入森山寫照管理系統。</p>
              <p>請點擊下方按鈕來設定您的密碼並啟用帳號：</p>
              <div style="text-align: center;">
                <a href="${inviteLink}" class="button">設定密碼並啟用帳號</a>
              </div>
              <p style="color: #666; font-size: 14px;">
                或複製以下連結到瀏覽器：<br>
                <span style="word-break: break-all;">${inviteLink}</span>
              </p>
              <p style="margin-top: 30px; color: #888; font-size: 13px;">
                ⚠️ 此連結將在 24 小時後失效。如果您沒有要求此邀請，請忽略此郵件。
              </p>
            </div>
            <div class="footer">
              <p>© 2024 森山寫照管理系統</p>
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
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("發送邀請郵件時發生錯誤:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
