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

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email 是必填欄位' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Attempting to delete orphan user: ${email}`);

    // Find user by email in auth system
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error("[Cleanup] Error listing users:", listError);
      return new Response(
        JSON.stringify({ success: false, error: '查詢用戶失敗' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUser = existingUsers.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      console.log(`[Cleanup] User not found: ${email}`);
      return new Response(
        JSON.stringify({ success: false, error: '找不到該用戶' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Found user with ID: ${targetUser.id}, created: ${targetUser.created_at}`);

    // Check if user has a profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, name')
      .eq('id', targetUser.id)
      .maybeSingle();

    console.log(`[Cleanup] Profile exists: ${!!profile}`);

    // Check if user has any roles
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('id, role, accommodation_id')
      .eq('user_id', targetUser.id);

    console.log(`[Cleanup] User has ${roles?.length || 0} roles`);

    // Delete user from auth system (cascades to profiles)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUser.id);

    if (deleteError) {
      console.error("[Cleanup] Error deleting user:", deleteError);
      return new Response(
        JSON.stringify({ success: false, error: `刪除用戶失敗: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Cleanup] Successfully deleted user ${email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `已成功刪除帳號 ${email}`,
        details: {
          userId: targetUser.id,
          hadProfile: !!profile,
          rolesCount: roles?.length || 0,
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[Cleanup] Error in cleanup function:", error);
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
