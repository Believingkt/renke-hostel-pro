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
      // Fallback: check auth.users
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
      // listUsers doesn't filter by email; use rpc-less query via admin.getUserByEmail if available
      // @ts-ignore - getUserByEmail is available in newer SDKs
      const byEmail = await (admin.auth.admin as any).getUserByEmail?.(normalized).catch(() => null);
      if (byEmail?.data?.user) exists = true;
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
