import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '需要驗證' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify caller has valid JWT
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

    // Check if caller has admin role for this accommodation
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

    // Get user details from auth
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

    const recipientName = profile?.name || targetUser.user.user_metadata?.name || '使用者';

    // Use production domain for redirect
    const siteUrl = 'https://sensaninn.lakeze.com';
    
    // Generate password reset link for the user
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: targetUser.user.email!,
      options: {
        redirectTo: `${siteUrl}/auth?type=recovery`,
      },
    });

    if (resetError) {
      console.error("生成重設密碼連結失敗:", resetError);
      return new Response(
        JSON.stringify({ success: false, error: '生成邀請連結失敗：' + resetError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send custom Chinese email with password setup link
    try {
      const inviteLink = resetData?.properties?.action_link || `${siteUrl}/auth`;
      
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-invite-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          email: targetUser.user.email,
          inviteLink,
          recipientName
        })
      });
      
      console.log("已重新發送中文邀請郵件至:", targetUser.user.email);
    } catch (emailError) {
      console.error("發送自定義邀請郵件失敗:", emailError);
      return new Response(
        JSON.stringify({ success: false, error: '發送邀請郵件失敗' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '邀請郵件已重新發送',
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in resend-invite function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "發生未知錯誤",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
