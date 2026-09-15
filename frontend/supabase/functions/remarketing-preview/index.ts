// E2 分群即時預覽
// POST /functions/v1/remarketing-preview  body: { segment, limit? }
// deno-lint-ignore-file no-explicit-any
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchSegment, summarizeSegment, type TravelerRow } from "../_shared/remarketingSegment.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ADMIN_ROLES = ["super_admin", "admin", "hotel_admin", "owner"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== serviceKey) {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
      if (!(roles ?? []).some((r: any) => ADMIN_ROLES.includes(r.role))) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const segment = body?.segment ?? { rules: [] };
    const limit = Math.min(Math.max(Number(body?.limit) || 50, 1), 200);

    const { data, error } = await admin
      .from("traveler_profiles")
      .select("id,display_name,email,phone,interest_tags,custom_needs,consumption,updated_at")
      .limit(5000);
    if (error) return json({ error: error.message }, 500);

    const rows = ((data ?? []) as TravelerRow[]).filter((p) => matchSegment(p, segment));
    const emailReachable = rows.filter((p) => !!p.email).length;

    return json({
      success: true,
      summary: summarizeSegment(segment),
      total: rows.length,
      email_reachable: emailReachable,
      preview: rows.slice(0, limit).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        phone: p.phone,
        interest_tags: p.interest_tags ?? [],
        total_amount: Number((p.consumption as any)?.total_amount ?? 0),
        order_count: Number((p.consumption as any)?.order_count ?? 0),
        last_order_at: (p.consumption as any)?.last_order_at ?? null,
      })),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
