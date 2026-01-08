import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

// Allowed origins for CORS
const allowedOrigins = [
  'https://sensan.lovable.app',
  'https://dmafqwfynatdvnaeovhz.lovableproject.com',
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

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
  const corsHeaders = getCorsHeaders(req);
  
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
      .select('id')
      .eq('id', accommodationId)
      .single();

    if (accommodationError || !accommodation) {
      return new Response(
        JSON.stringify({ success: false, error: '無效的住宿 ID' }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use production domain for redirect
    const siteUrl = 'https://sensaninn.lakeze.com';
    
    // Create user without sending default email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Auto-confirm email since we have auto_confirm enabled
      user_metadata: {
        name,
        force_password_change: true,
      },
    });

    if (userError) {
      // Return friendly error messages
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

    // Generate password reset link for the new user
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${siteUrl}/auth`,
      },
    });

    if (resetError) {
      console.error("生成重設密碼連結失敗:", resetError);
    }

    // Send custom Chinese email with password setup link using Resend
    try {
      const inviteLink = resetData?.properties?.action_link || `${siteUrl}/auth`;
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      
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
                <p>${name} 邀請您加入森山寫照 PMS 管理系統。</p>
                
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
    } catch (emailError) {
      console.error("發送自定義邀請郵件異常:", emailError);
      // Don't fail the user creation if email fails
    }

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userData.user.id,
        accommodation_id: accommodationId,
        role: role,
      });

    if (roleError) {
      // Rollback: delete the created user
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      throw new Error("建立使用者角色失敗");
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userData.user.id,
          email: userData.user.email,
          name,
        },
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
