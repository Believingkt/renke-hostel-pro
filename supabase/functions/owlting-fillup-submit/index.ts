// Public endpoint: owner submits PII → promote staging to a real order.
// POST { token, guest_name, guest_phone, guest_email, room_type_id?, total_amount? }
// Rate-limited: fail_count++ on bad inputs, lock 1h after 5.
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

function validatePhone(p: string): boolean {
  const trimmed = p.replace(/[\s\-()+]/g, "");
  return /^[0-9]{8,15}$/.test(trimmed);
}

function validateEmail(e: string): boolean {
  if (!e) return true; // email optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function bumpFailure(admin: any, tokenId: string, currentFail: number, ip: string) {
  const newFail = currentFail + 1;
  const update: any = { fail_count: newFail, last_attempt_ip: ip };
  if (newFail >= 5) {
    update.locked_until = new Date(Date.now() + 3600 * 1000).toISOString();
  }
  await admin.from("owlting_fillup_tokens").update(update).eq("id", tokenId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const guestName = String(body.guest_name ?? "").trim();
    const guestPhoneRaw = String(body.guest_phone ?? "").trim();
    const guestPhone = guestPhoneRaw.replace(/[\s\-()+]/g, "");
    const guestEmail = String(body.guest_email ?? "").trim();
    const roomTypeId = body.room_type_id ? String(body.room_type_id) : null;
    const totalAmount = body.total_amount != null ? Number(body.total_amount) : null;
    const ip = clientIp(req);

    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tokenHash = await sha256Hex(token);

    const { data: tok } = await admin
      .from("owlting_fillup_tokens")
      .select("id, staging_id, accommodation_id, expires_at, used_at, fail_count, locked_until")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!tok) {
      return new Response(JSON.stringify({ error: "Token not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const now = new Date();
    if (tok.locked_until && new Date(tok.locked_until) > now) {
      return new Response(JSON.stringify({ error: "Token locked, try later" }), {
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

    // Input validation
    if (guestName.length < 1 || guestName.length > 100) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "姓名長度必須 1-100 字" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validatePhone(guestPhone)) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "電話格式不正確（需 8-15 碼）" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!validateEmail(guestEmail)) {
      await bumpFailure(admin, tok.id, tok.fail_count, ip);
      return new Response(JSON.stringify({ error: "Email 格式不正確" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staging } = await admin
      .from("owlting_email_parsed_staging")
      .select("*").eq("id", tok.staging_id).maybeSingle();
    if (!staging || staging.pii_status === "promoted_to_booking") {
      return new Response(JSON.stringify({ error: "Order already submitted" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accId = tok.accommodation_id ?? staging.accommodation_id;
    if (!accId) {
      return new Response(JSON.stringify({ error: "Accommodation unresolved" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine final amount
    const resolvedTotal = totalAmount != null && !Number.isNaN(totalAmount)
      ? Math.max(0, Math.round(totalAmount))
      : Math.max(0, Math.round(Number(staging.total_amount ?? 0)));

    // Idempotency: avoid duplicate OBE inserts
    if (staging.obe_number) {
      const { data: existing } = await admin
        .from("orders").select("id")
        .eq("owlting_reservation_id", staging.obe_number).maybeSingle();
      if (existing) {
        await admin.from("owlting_email_parsed_staging").update({
          pii_status: "promoted_to_booking",
          promoted_order_id: existing.id,
          owner_filled_at: new Date().toISOString(),
        }).eq("id", staging.id);
        await admin.from("owlting_fillup_tokens").update({
          used_at: new Date().toISOString(),
          last_attempt_ip: ip,
        }).eq("id", tok.id);
        return new Response(JSON.stringify({ ok: true, order_id: existing.id, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert order
    const { data: inserted, error: insErr } = await admin.from("orders").insert({
      accommodation_id: accId,
      room_type_id: roomTypeId,
      check_in_date: staging.check_in_date,
      check_out_date: staging.check_out_date,
      guest_count: staging.guest_count ?? 2,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      total_price: resolvedTotal,
      final_price: resolvedTotal,
      discount_amount: 0,
      order_source: "owlting",
      order_status: "confirmed",
      payment_status: "paid",
      requires_owner_review: true,
      owlting_reservation_id: staging.obe_number,
      notes: `奧丁丁訂單由業主補單 (OBE: ${staging.obe_number ?? ""}, ${staging.room_type_name ?? ""})`,
    }).select("id, order_number").single();

    if (insErr) {
      console.error("[owlting-fillup-submit] order insert error:", insErr);
      return new Response(JSON.stringify({ error: "訂單建立失敗", detail: insErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark staging promoted + token used
    await admin.from("owlting_email_parsed_staging").update({
      pii_status: "promoted_to_booking",
      promoted_order_id: inserted!.id,
      owner_filled_at: new Date().toISOString(),
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail || null,
      pii_masked: false,
    }).eq("id", staging.id);

    await admin.from("owlting_fillup_tokens").update({
      used_at: new Date().toISOString(),
      last_attempt_ip: ip,
    }).eq("id", tok.id);

    return new Response(JSON.stringify({
      ok: true,
      order_id: inserted!.id,
      order_number: inserted!.order_number,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-fillup-submit] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
