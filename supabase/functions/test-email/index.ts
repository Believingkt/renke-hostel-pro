import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestEmailRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: TestEmailRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "請提供收件人郵箱地址" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log(`準備發送測試郵件至: ${email}`);

    const emailResponse = await resend.emails.send({
      from: "森山民宿 <noreply@sensaninn.lakeze.com>",
      to: [email],
      subject: "Resend 郵件測試",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            🎉 郵件發送測試成功！
          </h1>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            恭喜！如果您收到這封郵件，表示您的 Resend 郵件服務配置正確。
          </p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #333;">配置資訊：</h3>
            <ul style="color: #666;">
              <li>發件人：森山民宿 &lt;noreply@sensaninn.lakeze.com&gt;</li>
              <li>收件人：${email}</li>
              <li>發送時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</li>
            </ul>
          </div>
          <p style="font-size: 14px; color: #999; margin-top: 30px;">
            此為系統自動發送的測試郵件，無需回覆。
          </p>
        </div>
      `,
    });

    console.log("測試郵件發送結果:", emailResponse);

    if (emailResponse.error) {
      console.error("發送失敗:", emailResponse.error);
      return new Response(
        JSON.stringify({ 
          error: emailResponse.error.message,
          details: emailResponse.error 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "測試郵件已發送",
        emailId: emailResponse.data?.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("測試郵件發送錯誤:", error);
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
