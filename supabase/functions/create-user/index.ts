import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const createUserSchema = z.object({
  name: z.string().trim().min(1, "名稱不可為空").max(100, "名稱不可超過 100 字元"),
  email: z.string().email("Email 格式不正確").max(255, "Email 不可超過 255 字元"),
  password: z.string().min(6, "密碼至少需要 6 個字元").max(72, "密碼不可超過 72 字元"),
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

    const { name, email, password, role, accommodationId } = validation.data;

    console.log("Creating user:", { name, email, role, accommodationId });

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

    // Create user with admin API
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        force_password_change: true,
      },
    });

    if (userError) {
      console.error("Error creating user:", userError);
      
      // Return friendly error messages
      let errorMessage = userError.message;
      if (userError.message.includes("already been registered")) {
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

    console.log("User created successfully:", userData.user.id);

    // Create user role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userData.user.id,
        accommodation_id: accommodationId,
        role: role,
      });

    if (roleError) {
      console.error("Error creating user role:", roleError);
      // Rollback: delete the created user
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      throw new Error("建立使用者角色失敗");
    }

    console.log("User role created successfully");

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
