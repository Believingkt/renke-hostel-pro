import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { email } = await req.json();
    const normalized = String(email || "").trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1) Primary check: platform_members
    const { data: profile, error: profileErr } = await admin
      .from("platform_members")
      .select("id")
      .ilike("email", normalized)
      .maybeSingle();
    if (profileErr) console.warn("platform_members lookup failed:", profileErr.message);

    let exists = !!profile;

    // 2) Fallback: paginate auth.users and match in JS (SDK does not support server-side filter)
    if (!exists) {
      try {
        const perPage = 200;
        const maxPages = 25; // safety cap: 5000 users
        for (let page = 1; page <= maxPages; page++) {
          const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
          if (listErr) {
            console.warn("listUsers failed:", listErr.message);
            break;
          }
          const users = (list as any)?.users || [];
          if (users.some((u: any) => (u.email || "").toLowerCase() === normalized)) {
            exists = true;
            break;
          }
          if (users.length < perPage) break; // last page
        }
      } catch (e) {
        console.warn("listUsers fallback error:", (e as Error).message);
      }
    }

    return new Response(JSON.stringify({ exists }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || "server_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
