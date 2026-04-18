import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10; // Max 10 user creations
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

const createUserSchema = z.object({
  name: z.string().trim().min(1, "名稱不可為空").max(100, "名稱不可超過 100 字元"),
  email: z.string().email("Email 格式不正確").max(255, "Email 不可超過 255 字元"),
  role: z.enum(['super_admin', 'hotel_admin', 'staff'], { errorMap: () => ({ message: "無效的角色" }) }),
  accommodationId: z.string().uuid("無效的住宿 ID 格式")
});

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get JWT token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '需要驗證' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const jwt = authHeader.replace('Bearer ', '');
    
    // Parse JWT to get user ID (JWT is already verified by Supabase via verify_jwt = true)
    let userId: string;
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }
      const payload = JSON.parse(atob(parts[1]));
      userId = payload.sub;
      
      if (!userId) {
        throw new Error('No user ID in JWT');
      }
    } catch (e) {
      console.error("JWT parse error:", e);
      return new Response(
        JSON.stringify({ success: false, error: '無效的驗證令牌' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client for all operations
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

    // Check rate limit
    if (!checkRateLimit(userId)) {
      console.warn(`Rate limit exceeded for user ${userId}`);
      return new Response(
        JSON.stringify({ success: false, error: '操作過於頻繁，請稍後再試（每小時最多 10 次）' }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    
    // Validate inputs with Zod schema
    const validation = createUserSchema.safeParse(body);
    if (!validation.success) {
      const errorMessage = validation.error.issues.map(issue => issue.message).join(", ");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { name, email, role, accommodationId } = validation.data;

    console.log('Request from user:', userId, 'for accommodation:', accommodationId);

    // Check if caller has admin role for this accommodation
    const { data: userRoles, error: roleQueryError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('accommodation_id', accommodationId);

    console.log('User roles query result:', { userRoles, roleQueryError });

    const isAdmin = userRoles?.some(r => 
      r.role === 'super_admin' || r.role === 'hotel_admin'
    );

    console.log('Is admin check:', isAdmin);

    if (!isAdmin) {
      console.error('Authorization failed: User', userId, 'is not admin for accommodation', accommodationId);
      return new Response(
        JSON.stringify({ success: false, error: '需要管理員權限' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify accommodationId exists
    const { data: accommodation, error: accommodationError } = await supabaseAdmin
      .from('accommodation_info')
      .select('id, name')
      .eq('id', accommodationId)
      .single();

    if (accommodationError || !accommodation) {
      return new Response(
        JSON.stringify({ success: false, error: '無效的住宿 ID' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists in profiles (by email)
    const { data: existingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email')
      .ilike('email', email)
      .maybeSingle();

    let targetUserId: string;
    let isNewUser = false;
    let inviteLink: string | null = null;

    // Use production domain for redirect
    const siteUrl = 'https://sensaninn.lakeze.com';

    if (existingProfile) {
      // User already exists - check if they already have a role in this accommodation
      const { data: existingRole, error: existingRoleError } = await supabaseAdmin
        .from('user_roles')
        .select('id, role')
        .eq('user_id', existingProfile.id)
        .eq('accommodation_id', accommodationId)
        .maybeSingle();

      if (existingRole) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `此用戶已在「${accommodation.name}」擁有「${getRoleLabel(existingRole.role)}」權限` 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // User exists but not in this accommodation - add role
      targetUserId = existingProfile.id;
      isNewUser = false;
      console.log('Existing user found, adding role to new accommodation:', targetUserId);

    } else {
      // User does not exist - create new user
      isNewUser = true;
      
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name,
          force_password_change: true,
        },
      });

      if (userError) {
        let errorMessage = userError.message;
        if (userError.message.includes("already been registered") || userError.message.includes("already registered")) {
          errorMessage = "此 Email 已被註冊";
        } else if (userError.message.includes("Invalid email")) {
          errorMessage = "Email 格式不正確";
        }
        
        return new Response(
          JSON.stringify({
            success: false,
            error: errorMessage,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        );
      }

      if (!userData.user) {
        return new Response(
          JSON.stringify({ success: false, error: '建立使用者失敗' }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetUserId = userData.user.id;

      // Create our own password setup token so password changes go through our reset flow
      // (which enforces server-side password strength + leaked-password checks).
      const token = crypto.randomUUID() + crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const { error: tokenInsertError } = await supabaseAdmin
        .from("password_reset_tokens")
        .insert({
          user_id: targetUserId,
          email: email.toLowerCase(),
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenInsertError) {
        console.error("Failed to create password setup token:", tokenInsertError);
        // Fallback to login page. (User may still need manual password assistance.)
        inviteLink = `${siteUrl}/auth`;
      } else {
        inviteLink = `${siteUrl}/reset-password?token=${token}`;
      }
    }

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: targetUserId,
        accommodation_id: accommodationId,
        role: role,
      });

    if (roleError) {
      // Rollback: delete the created user if it was new
      if (isNewUser) {
        await supabaseAdmin.auth.admin.deleteUser(targetUserId);
      }
      console.error("建立使用者角色失敗:", roleError);
      throw new Error("建立使用者角色失敗");
    }

    // Send email notification
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      
      if (isNewUser && inviteLink) {
        // New user - send invitation email with password setup link
        const emailResponse = await resend.emails.send({
          from: "森山寫照 <noreply@sensaninn.lakeze.com>",
          to: [email],
          subject: "歡迎加入森山寫照 PMS 管理系統",
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
                .button:hover { background: #1d4ed8; }
                .footer { text-align: center; color: #888; font-size: 12px; margin-top: 20px; }
                .highlight { color: #2563eb; font-weight: 600; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🏡 歡迎加入森山寫照</h1>
                </div>
                <div class="content">
                  <p>使用者您好：</p>
                  <p>${name} 邀請您加入「<strong>${accommodation.name}</strong>」的管理團隊。</p>
                  
                  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #92400e; font-weight: 600;">
                      ⏰ 重要提醒：此邀請鏈接將在 <span style="color: #b45309; font-size: 16px;">24小時內</span>有效
                    </p>
                    <p style="margin: 5px 0 0 0; color: #92400e; font-size: 13px;">
                      請盡快完成密碼設定以啟用您的帳號
                    </p>
                  </div>
                  
                  <p>請點擊下方按鈕來設定您的密碼並啟用帳號：</p>
                  <div style="text-align: center;">
                    <a href="${inviteLink}" class="button" style="color: white !important; text-decoration: none;">設定密碼並啟用帳號</a>
                  </div>
                  <p style="color: #666; font-size: 14px;">
                    或複製以下連結到瀏覽器：<br>
                    <span style="word-break: break-all;">${inviteLink}</span>
                  </p>
                  <p style="margin-top: 30px; color: #888; font-size: 13px;">
                    如果您沒有要求此邀請，請忽略此郵件。
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
        
        console.log("邀請郵件已發送:", emailResponse);
      } else {
        // Existing user - send notification email about new accommodation access
        const emailResponse = await resend.emails.send({
          from: "森山寫照 <noreply@sensaninn.lakeze.com>",
          to: [email],
          subject: `您已獲得「${accommodation.name}」的管理權限`,
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
                .info-box { background: #eff6ff; border: 1px solid #bfdbfe; padding: 15px; border-radius: 8px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🏡 新增管理權限通知</h1>
                </div>
                <div class="content">
                  <p>您好：</p>
                  <p>您的帳號已被授權管理「<strong>${accommodation.name}</strong>」。</p>
                  
                  <div class="info-box">
                    <p style="margin: 0;"><strong>📋 權限資訊</strong></p>
                    <p style="margin: 10px 0 0 0;">
                      民宿：${accommodation.name}<br>
                      角色：${getRoleLabel(role)}
                    </p>
                  </div>
                  
                  <p>您可以使用現有帳號登入系統，並在左上角切換到新的民宿進行管理。</p>
                  
                  <div style="text-align: center;">
                    <a href="${siteUrl}/auth" class="button" style="color: white !important; text-decoration: none;">前往登入</a>
                  </div>
                  
                  <p style="margin-top: 30px; color: #888; font-size: 13px;">
                    如果您對此授權有任何疑問，請聯繫系統管理員。
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
        
        console.log("權限通知郵件已發送:", emailResponse);
      }
    } catch (emailError) {
      console.error("發送郵件異常:", emailError);
      // Don't fail the operation if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        isNewUser,
        user: {
          id: targetUserId,
          email: email,
          name,
        },
        message: isNewUser 
          ? "邀請郵件已發送，請通知使用者檢查信箱" 
          : `已將「${accommodation.name}」的管理權限授予現有用戶`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in create-user function:", error);
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

function getRoleLabel(role: string): string {
  switch (role) {
    case 'super_admin': return '總部管理員';
    case 'hotel_admin': return '民宿管理員';
    case 'staff': return '現場營運';
    default: return role;
  }
}
