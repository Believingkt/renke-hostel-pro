import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface TestEmailRequest {
  email: string;
}

const handler = async (req: Request): Promise<Response> => {
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
        JSON.stringify({ error: "只有管理員可以發送測試郵件" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Test Email] Admin ${user.email} sending test email`);

    const { email }: TestEmailRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "請提供收件人郵箱地址" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`準備發送測試郵件至: ${email}`);

    const emailResponse = await resend.emails.send({
      from: "森山寫照測試 <onboarding@resend.dev>",
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
              <li>發件人：森山寫照測試 &lt;onboarding@resend.dev&gt;</li>
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
      const isVerificationError = emailResponse.error.message?.includes("not verified");
      
      return new Response(
        JSON.stringify({ 
          error: isVerificationError 
            ? "域名尚未在 Resend 驗證。請前往 https://resend.com/domains 添加並驗證域名。"
            : emailResponse.error.message,
          details: emailResponse.error,
          isVerificationError 
        }),
        { status: isVerificationError ? 403 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "測試郵件已發送", emailId: emailResponse.data?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("測試郵件發送錯誤:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
