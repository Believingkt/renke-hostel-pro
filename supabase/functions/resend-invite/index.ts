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

    // Get the site URL for redirect
    const siteUrl = Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.lovable.app') || '';
    
    // Resend invite email
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      targetUser.user.email!,
      {
        redirectTo: `${siteUrl}/auth`,
      }
    );

    if (inviteError) {
      console.error("Error resending invite:", inviteError);
      return new Response(
        JSON.stringify({ success: false, error: '發送邀請失敗：' + inviteError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
