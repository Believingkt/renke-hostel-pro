import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '需要驗證' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: '驗證失敗' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, accommodationId } = await req.json();

    if (!userId || !accommodationId) {
      return new Response(
        JSON.stringify({ success: false, error: '缺少必要參數' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if caller has admin role
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('accommodation_id', accommodationId);

    const isAdmin = userRoles?.some(r => 
      r.role === 'super_admin' || r.role === 'hotel_admin'
    );

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: '需要管理員權限' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get target user details
    const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (getUserError || !targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: '找不到該用戶' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user profile for name
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .single();

    // Get accommodation name
    const { data: accommodation } = await supabaseAdmin
      .from('accommodation_info')
      .select('name')
      .eq('id', accommodationId)
      .single();

    const recipientName = profile?.name || targetUser.user.user_metadata?.name || '使用者';
    const accommodationName = accommodation?.name || '民宿';
    const siteUrl = 'https://pms.lakeze.com';

    // Generate custom password reset token (same flow as create-user)
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: tokenInsertError } = await supabaseAdmin
      .from("password_reset_tokens")
      .insert({
        user_id: userId,
        email: targetUser.user.email!.toLowerCase(),
        token,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenInsertError) {
      console.error("Failed to create password reset token:", tokenInsertError);
      return new Response(
        JSON.stringify({ success: false, error: '生成邀請連結失敗' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const inviteLink = `${siteUrl}/reset-password?token=${token}`;

    // Ensure force_password_change is set so the user is prompted
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...(targetUser.user.user_metadata ?? {}),
        force_password_change: true,
      },
    });
    await supabaseAdmin
      .from("profiles")
      .update({ force_password_change: true })
      .eq("id", userId);

    // Send email via Resend
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

      await resend.emails.send({
        from: "森山寫照 <noreply@sensaninn.lakeze.com>",
        to: [targetUser.user.email!],
        subject: "重新設定您的密碼 - 森山寫照 PMS",
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
                <h1>🔑 設定密碼</h1>
              </div>
              <div class="content">
                <p>${recipientName} 您好：</p>
                <p>「<strong>${accommodationName}</strong>」的管理員已為您重新發送密碼設定連結。</p>
                
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #92400e; font-weight: 600;">
                    ⏰ 重要提醒：此連結將在 <span style="color: #b45309; font-size: 16px;">24小時內</span>有效
                  </p>
                </div>
                
                <p>請點擊下方按鈕設定您的密碼：</p>
                <div style="text-align: center;">
                  <a href="${inviteLink}" class="button" style="color: white !important; text-decoration: none;">設定密碼</a>
                </div>
                <p style="color: #666; font-size: 14px;">
                  或複製以下連結到瀏覽器：<br>
                  <span style="word-break: break-all;">${inviteLink}</span>
                </p>
                <p style="margin-top: 30px; color: #888; font-size: 13px;">
                  如果您沒有要求此操作，請忽略此郵件。
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

      console.log("已重新發送密碼設定郵件至:", targetUser.user.email);
    } catch (emailError) {
      console.error("發送郵件失敗:", emailError);
      return new Response(
        JSON.stringify({ success: false, error: '發送邀請郵件失敗' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: '邀請郵件已重新發送' }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in resend-invite function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "發生未知錯誤" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
