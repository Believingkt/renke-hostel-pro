import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Create Supabase admin client for authorization check
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

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      console.warn(`Rate limit exceeded for user ${user.id}`);
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
        redirectTo: `${siteUrl}/auth?type=recovery`,
      },
    });

    if (resetError) {
      console.error("生成重設密碼連結失敗:", resetError);
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
          email,
          inviteLink,
          senderName: name
        })
      });
      
      console.log("已發送中文邀請郵件至:", email);
    } catch (emailError) {
      console.error("發送自定義邀請郵件失敗:", emailError);
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
