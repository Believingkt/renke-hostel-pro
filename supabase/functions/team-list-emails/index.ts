import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: authRes.error }),
        { status: authRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isSuperAdmin(authRes.ctx)) {
      return new Response(
        JSON.stringify({ success: false, error: "權限不足" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = authRes.ctx.admin;

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
