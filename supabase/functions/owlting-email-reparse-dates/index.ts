// Backfill check_in_date / check_out_date on owlting_email_parsed_staging
// by re-running the HTML parser against owlting_email_orders_raw.html_body.
// POST { accommodation_id: uuid, raw_email_id?: uuid (single), overwrite?: boolean }
// Requires authenticated admin (super_admin / hotel_admin).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { parseOwlNestForwardEmail } from "../_shared/owltingHtmlParser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleData } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = (roleData ?? []).some((r: any) => r.role === "super_admin" || r.role === "hotel_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const accId = body.accommodation_id ? String(body.accommodation_id) : null;
    const singleRawId = body.raw_email_id ? String(body.raw_email_id) : null;
    const overwrite = body.overwrite === true;

    if (!accId && !singleRawId) {
      return new Response(JSON.stringify({ error: "accommodation_id or raw_email_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let q = admin
      .from("owlting_email_orders_raw")
      .select("id, subject, text_body, html_body, accommodation_id")
      .not("html_body", "is", null);
    if (singleRawId) q = q.eq("id", singleRawId);
    else if (accId) q = q.eq("accommodation_id", accId);

    const { data: rawRows, error: rawErr } = await q.limit(500);
    if (rawErr) {
      return new Response(JSON.stringify({ error: rawErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = rawRows ?? [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, updated: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawIds = rows.map((r: any) => r.id);
    const { data: stagings } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, raw_email_id, check_in_date, check_out_date")
      .in("raw_email_id", rawIds);
    const stagingByRaw = new Map<string, any>();
    (stagings ?? []).forEach((s: any) => stagingByRaw.set(s.raw_email_id, s));

    let updated = 0;
    let parsedCount = 0;
    let skippedNoStaging = 0;

    for (const r of rows as any[]) {
      const parsed = parseOwlNestForwardEmail({
        subject: r.subject ?? null,
        text_body: r.text_body ?? null,
        html_body: r.html_body ?? null,
      });
      if (!parsed.check_in_date && !parsed.check_out_date) continue;
      parsedCount += 1;

      const st = stagingByRaw.get(r.id);
      if (!st) { skippedNoStaging += 1; continue; }

      const patch: Record<string, string> = {};
      if (parsed.check_in_date && (overwrite || !st.check_in_date)) {
        patch.check_in_date = parsed.check_in_date;
      }
      if (parsed.check_out_date && (overwrite || !st.check_out_date)) {
        patch.check_out_date = parsed.check_out_date;
      }
      if (Object.keys(patch).length === 0) continue;

      const { error: upErr } = await admin
        .from("owlting_email_parsed_staging")
        .update(patch).eq("id", st.id);
      if (!upErr) updated += 1;
      else console.error("[reparse-dates] update failed", st.id, upErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      scanned: rows.length,
      parsed_with_date: parsedCount,
      updated,
      skipped_no_staging: skippedNoStaging,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[owlting-email-reparse-dates] threw", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
