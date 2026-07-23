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

    const { data: profile } = await admin
      .from("platform_members")
      .select("id")
      .ilike("email", normalized)
      .maybeSingle();

    let exists = !!profile;

    if (!exists) {
      // Fallback: check auth.users via admin.listUsers with email filter
      try {
        // @ts-ignore - filter param is supported in newer SDKs
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1, filter: `email.eq.${normalized}` } as any);
        const users = (list as any)?.users || [];
        if (users.some((u: any) => (u.email || "").toLowerCase() === normalized)) {
          exists = true;
        }
      } catch (e) {
        console.warn("listUsers fallback failed:", (e as Error).message);
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
