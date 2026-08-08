import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: authRes.error }),
        { status: authRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSuperAdmin(authRes.ctx)) {
      return new Response(
        JSON.stringify({ success: false, error: '需要超級管理員權限' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = authRes.ctx.admin;
    const callerUserId = authRes.ctx.userId;
    const callerUserEmail = authRes.ctx.userEmail;

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email 是必填欄位' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Attempting to delete user with email: ${email}`);

    // Find user by email
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ success: false, error: '查詢用戶失敗' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetUser = existingUsers.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return new Response(
        JSON.stringify({ success: false, error: '找不到該用戶' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found user with ID: ${targetUser.id}`);

    // staff_module_permissions 沒有指向 auth.users 的外鍵，需手動清除避免殘留孤兒資料
    const { count: permCount, error: permError } = await supabaseAdmin
      .from("staff_module_permissions")
      .delete({ count: "exact" })
      .eq("user_id", targetUser.id);
    if (permError) {
      console.error("Error deleting staff_module_permissions:", permError);
      return new Response(
        JSON.stringify({ success: false, error: `清除模組權限失敗: ${permError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // user_roles 有 ON DELETE CASCADE，但先行刪除可取得筆數並確保順序一致
    const { count: roleCount, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .delete({ count: "exact" })
      .eq("user_id", targetUser.id);
    if (roleError) {
      console.error("Error deleting user_roles:", roleError);
      return new Response(
        JSON.stringify({ success: false, error: `清除角色權限失敗: ${roleError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete user from auth system (this will cascade delete profiles via trigger)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUser.id);


    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      // Audit failed deletion
      await supabaseAdmin.from("audit_logs").insert({
        user_id: callerUserId,
        user_email: callerUserEmail,
        action_category: "user_management",
        action_type: "delete_user_failed",
        entity_type: "user",
        entity_id: targetUser.id,
        entity_name: email,
        ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
        details: { reason: deleteError.message },
      });
      return new Response(
        JSON.stringify({ success: false, error: `刪除用戶失敗: ${deleteError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted user ${email}`);

    // Audit successful deletion
    await supabaseAdmin.from("audit_logs").insert({
      user_id: callerUserId,
      user_email: callerUserEmail,
      action_category: "user_management",
      action_type: "delete_user",
      entity_type: "user",
      entity_id: targetUser.id,
      entity_name: email,
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
      details: { deleted_email: email },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `已成功刪除用戶 ${email}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in delete-user function:", error);
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
