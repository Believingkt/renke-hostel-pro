import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY_1") ?? Deno.env.get("RESEND_API_KEY") ?? "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";
const FROM_EMAIL = "人客多 Lakeze <noreply@sensaninn.lakeze.com>";

async function sendEmail(payload: { to: string[]; subject: string; html: string }) {
  const res = await fetch(`${GATEWAY_URL}/emails`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend gateway ${res.status}: ${body}`);
  }
  return res.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_INVITABLE = new Set([
  "admin",
  "closer",
  "scout",
  "scout_manager",
  "video",
  "franchise_internal",
  "franchise_external",
  "starlink",
  "kol",
  "owner",
  "finance",
]);
const SCOUT_MANAGER_INVITABLE = new Set(["scout", "kol"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "需要驗證" }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth
      .getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return json({ success: false, error: "驗證失敗" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim();
    const roles: string[] = Array.isArray(body.roles) ? body.roles : [];

    if (!email || !displayName || roles.length === 0) {
      return json(
        { success: false, error: "缺少必要參數 (email / display_name / roles)" },
        400,
      );
    }

    // 取得呼叫者的全域角色
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .is("accommodation_id", null);

    const callerRoleSet = new Set((callerRoles ?? []).map((r) => r.role));
    const isAdmin = callerRoleSet.has("super_admin") ||
      callerRoleSet.has("admin");
    const isScoutManager = callerRoleSet.has("scout_manager");

    if (!isAdmin && !isScoutManager) {
      return json({ success: false, error: "需要管理員或星探主管權限" }, 403);
    }

    const allowed = isAdmin ? ADMIN_INVITABLE : SCOUT_MANAGER_INVITABLE;
    if (roles.some((r) => !allowed.has(r))) {
      return json({ success: false, error: "您沒有權限指派部分角色" }, 403);
    }

    const siteUrl = "https://sensaninn.lakeze.com";

    // 查找既有用戶
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    let targetUserId: string;
    let isNewUser = false;
    let inviteLink: string | null = null;

    if (existingProfile) {
      targetUserId = existingProfile.id;
    } else {
      isNewUser = true;
      const { data: created, error: createErr } = await supabaseAdmin.auth.admin
        .createUser({
          email,
          email_confirm: true,
          user_metadata: { name: displayName, force_password_change: true },
        });
      if (createErr || !created.user) {
        let msg = createErr?.message ?? "建立帳號失敗";
        if (msg.includes("already")) msg = "此 Email 已被註冊";
        return json({ success: false, error: msg }, 400);
      }
      targetUserId = created.user.id;

      // 建立密碼設定 token
      const token = crypto.randomUUID() + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const { error: tokenErr } = await supabaseAdmin
        .from("password_reset_tokens")
        .insert({
          user_id: targetUserId,
          email,
          token,
          expires_at: expiresAt.toISOString(),
        });
      inviteLink = tokenErr
        ? `${siteUrl}/auth`
        : `${siteUrl}/reset-password?token=${token}`;
    }

    // 建立/更新 team profile
    await supabaseAdmin
      .from("team_member_profiles")
      .upsert(
        { user_id: targetUserId, display_name: displayName },
        { onConflict: "user_id" },
      );

    // 既有用戶：直接套用 roles；新用戶：寫入 team_pending_invites
    if (!isNewUser) {
      const { data: existingRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId)
        .is("accommodation_id", null);
      const existSet = new Set((existingRoles ?? []).map((r) => r.role));
      const newRoles = roles.filter((r) => !existSet.has(r));
      if (newRoles.length > 0) {
        await supabaseAdmin.from("user_roles").insert(
          newRoles.map((role) => ({
            user_id: targetUserId,
            accommodation_id: null,
            role,
          })),
        );
      }
    } else {
      const rows = roles.map((role) => ({
        email,
        display_name: displayName,
        role,
        invited_by: user.id,
      }));
      await supabaseAdmin
        .from("team_pending_invites")
        .upsert(rows, { onConflict: "email,role" });
    }

    // 寄信（透過 Lovable Connector Gateway → Resend，使用已驗證的森山子網域）
    let emailSent = false;
    let emailError: string | null = null;
    try {
      if (isNewUser && inviteLink) {
        await sendEmail({
          to: [email],
          subject: "歡迎加入 Team — 請設定您的密碼",
          html: `
            <div style="font-family:Arial,'Microsoft JhengHei',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
              <h2>歡迎加入團隊</h2>
              <p>${displayName} 您好：</p>
              <p>您已被邀請加入 Team 系統，請於 24 小時內點擊下方連結設定密碼：</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${inviteLink}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">設定密碼並啟用帳號</a>
              </p>
              <p style="font-size:13px;color:#666;word-break:break-all">若按鈕無法點擊，請複製連結：<br>${inviteLink}</p>
              <p style="font-size:12px;color:#999;margin-top:30px">如非本人操作請忽略此信。© Lakeze.</p>
            </div>`,
        });
      } else {
        await sendEmail({
          to: [email],
          subject: "您已獲得 Team 新權限",
          html: `
            <div style="font-family:Arial,'Microsoft JhengHei',sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
              <p>${displayName} 您好：</p>
              <p>您的帳號已被授予新的團隊角色：<strong>${roles.join(", ")}</strong></p>
              <p>請使用現有帳號登入系統。</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${siteUrl}/team" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">前往 Team</a>
              </p>
            </div>`,
        });
      }
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      console.error("send email failed:", emailError);
    }

    return json({
      success: true,
      isNewUser,
      emailSent,
      emailError,
      user: { id: targetUserId, email, name: displayName },
    });
  } catch (err) {
    console.error("send-team-invite error:", err);
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return json({ success: false, error: msg }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
