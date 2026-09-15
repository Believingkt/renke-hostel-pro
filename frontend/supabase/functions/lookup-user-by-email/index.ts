import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to query auth.users
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

    // Create regular client to verify the caller's identity
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      }
    );

    // Verify the caller is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Authentication failed:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "驗證失敗" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { email, accommodationId } = await req.json();

    if (!email || !accommodationId) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少必要參數" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the caller has admin access to this accommodation
    const { data: callerRole, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("accommodation_id", accommodationId)
      .maybeSingle();

    if (roleError || !callerRole || (callerRole.role !== "hotel_admin" && callerRole.role !== "super_admin")) {
      console.error("Insufficient permissions:", user.id, accommodationId);
      return new Response(
        JSON.stringify({ success: false, error: "權限不足" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up user by email using admin client
    const { data: authData, error: lookupError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (lookupError) {
      console.error("Error looking up user:", lookupError);
      return new Response(
        JSON.stringify({ success: false, error: "查詢用戶失敗" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const foundUser = authData.users.find((u) => u.email === email);

    if (!foundUser) {
      return new Response(
        JSON.stringify({ success: false, error: "找不到此用戶" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return only necessary user information
    return new Response(
      JSON.stringify({ 
        success: true, 
        user: {
          id: foundUser.id,
          email: foundUser.email,
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lookup-user-by-email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "未知錯誤" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
