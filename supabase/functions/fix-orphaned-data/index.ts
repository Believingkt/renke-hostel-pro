import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

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
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify caller has admin privileges
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: '驗證失敗' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is super admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');
    
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: '需要超級管理員權限' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all auth users
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`列出用戶失敗: ${listError.message}`);
    }

    console.log(`找到 ${allUsers.users.length} 個認證用戶`);

    // Get existing profiles
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id');
    
    const existingProfileIds = new Set(existingProfiles?.map(p => p.id) || []);

    // Get existing user_roles
    const { data: existingRoles } = await supabaseAdmin
      .from('user_roles')
      .select('user_id');
    
    const existingRoleUserIds = new Set(existingRoles?.map(r => r.user_id) || []);

    const missingProfiles = [];
    const missingRoles = [];

    for (const authUser of allUsers.users) {
      if (!existingProfileIds.has(authUser.id)) {
        missingProfiles.push({
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Unknown',
        });
      }

      if (!existingRoleUserIds.has(authUser.id)) {
        missingRoles.push({
          user_id: authUser.id,
          email: authUser.email,
        });
      }
    }

    console.log(`缺少 ${missingProfiles.length} 個 profiles`);
    console.log(`缺少 ${missingRoles.length} 個 user_roles`);

    return new Response(
      JSON.stringify({
        success: true,
        total_auth_users: allUsers.users.length,
        existing_profiles: existingProfileIds.size,
        existing_roles: existingRoleUserIds.size,
        missing_profiles: missingProfiles,
        missing_roles: missingRoles,
        message: '診斷完成。請查看 missing_profiles 和 missing_roles 了解需要修復的數據。',
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in fix-orphaned-data function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "發生未知錯誤",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
