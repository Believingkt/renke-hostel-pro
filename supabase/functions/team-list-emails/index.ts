import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = new Set(["super_admin", "admin", "scout_manager"]);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "未授權" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authHeader } },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "驗證失敗" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: roles } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .is("accommodation_id", null);

    const hasAccess = (roles ?? []).some(
      (r: { role: string }) => ALLOWED_ROLES.has(r.role),
    );
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ success: false, error: "權限不足" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let requestedIds: Set<string> | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.user_ids) && body.user_ids.length > 0) {
        requestedIds = new Set(body.user_ids.filter((x: unknown) => typeof x === "string"));
      }
    } catch {
      // 沒帶 body 也 OK
    }

    // 分頁掃 auth.users
    const results: { id: string; email: string }[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: "查詢用戶失敗" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      for (const u of data.users) {
        if (requestedIds && !requestedIds.has(u.id)) continue;
        results.push({ id: u.id, email: u.email ?? "" });
      }
      if (data.users.length < perPage) break;
      page += 1;
    }

    return new Response(
      JSON.stringify({ success: true, users: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "未知錯誤",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
