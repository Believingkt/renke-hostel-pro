// Public endpoint: validate a magic-link token and return safe staging info.
// POST { token: string } → { ok, staging: {...non-PII fields}, accommodation: {...}, room_types: [...] }
// Rate limit: per (IP, token-hash) — 5 fails locks the token for 1 hour.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tokenHash = await sha256Hex(token);
    const ip = clientIp(req);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: tok } = await admin
      .from("owlting_fillup_tokens")
      .select("id, staging_id, accommodation_id, expires_at, used_at, fail_count, locked_until, ip_attempts")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tok) {
      return new Response(JSON.stringify({ error: "Token not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const now = new Date();
    if (tok.locked_until && new Date(tok.locked_until) > now) {
      return new Response(JSON.stringify({ error: "Token locked, try later", locked_until: tok.locked_until }), {
        status: 423, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tok.used_at) {
      return new Response(JSON.stringify({ error: "Token already used" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(tok.expires_at) < now) {
      return new Response(JSON.stringify({ error: "Token expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staging } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, obe_number, accommodation_name, accommodation_id, room_type_name, project_name, room_quantity, check_in_date, check_out_date, guest_count, adult_count, child_count, nights, total_amount, remaining_amount, currency, payment_status, addons, pii_status, pii_due_at")
      .eq("id", tok.staging_id)
      .maybeSingle();

    if (!staging || staging.pii_status === "promoted_to_booking") {
      return new Response(JSON.stringify({ error: "Order already submitted" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accId = tok.accommodation_id ?? staging.accommodation_id;
    const { data: acc } = await admin
      .from("accommodation_info").select("id, name, short_url_alias").eq("id", accId).maybeSingle();

    const { data: roomTypes } = await admin
      .from("room_types").select("id, name, base_price")
      .eq("accommodation_id", accId).order("name");

    return new Response(JSON.stringify({
      ok: true,
      staging: {
        id: staging.id,
        obe_number: staging.obe_number,
        accommodation_name: staging.accommodation_name,
        room_type_name: staging.room_type_name,
        project_name: staging.project_name,
        room_quantity: staging.room_quantity,
        check_in_date: staging.check_in_date,
        check_out_date: staging.check_out_date,
        guest_count: staging.guest_count,
        nights: staging.nights,
        total_amount: staging.total_amount,
        remaining_amount: staging.remaining_amount,
        currency: staging.currency,
        payment_status: staging.payment_status,
        addons: staging.addons,
        pii_due_at: staging.pii_due_at,
      },
      accommodation: acc,
      room_types: roomTypes ?? [],
      _ip: ip,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-fillup-validate] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
