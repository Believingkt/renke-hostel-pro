// Detect self-pushed staging rows (channel_source = 人客多 / Lakeze) and
// link them back to the existing PMS order instead of creating a duplicate.
// POST { staging_id: uuid }
// Requires authenticated admin OR service-role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sources that indicate the OTA email was triggered by our own push
// (i.e. PMS → OwlNest → email back to us). These must NOT create new orders.
const SELF_PUSH_SOURCES = ["人客多", "lakeze", "人客多 lakeze", "lakeze 人客多"];

export function isSelfPushSource(channelSource: string | null | undefined): boolean {
  if (!channelSource) return false;
  const norm = channelSource.trim().toLowerCase();
  if (!norm) return false;
  if (norm.includes("人客多")) return true;
  if (norm.includes("lakeze")) return true;
  return SELF_PUSH_SOURCES.includes(norm);
}

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").toLowerCase();
}

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
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = !!bearer && bearer === serviceKey;
    if (!isServiceRole) {
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
      const { data: roleData } = await admin
        .from("user_roles").select("role").eq("user_id", userData.user.id);
      const isAdmin = (roleData ?? []).some(
        (r: any) => r.role === "super_admin" || r.role === "hotel_admin",
      );
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const stagingId = String(body.staging_id ?? "").trim();
    if (!stagingId) {
      return new Response(JSON.stringify({ error: "staging_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: staging } = await admin
      .from("owlting_email_parsed_staging")
      .select("id, obe_number, channel_source, accommodation_id, room_type_name, check_in_date, check_out_date, total_amount, guest_name, pii_status, promoted_order_id, project_name, extracted_fields")
      .eq("id", stagingId)
      .maybeSingle();

    if (!staging) {
      return new Response(JSON.stringify({ error: "Staging not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isSelfPushSource(staging.channel_source)) {
      return new Response(JSON.stringify({
        ok: false,
        is_self_push: false,
        channel_source: staging.channel_source,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If already linked, return success idempotently.
    if (staging.pii_status === "self_pushed" && staging.promoted_order_id) {
      return new Response(JSON.stringify({
        ok: true, is_self_push: true, already_linked: true,
        matched_order_id: staging.promoted_order_id,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Try to match an existing order:
    // 1) Prefer owlting_unique_id if we can pull one out of extracted_fields.
    // 2) Otherwise fuzzy-match by (accommodation + dates + amount [+ guest name if present]).
    let matchedOrder: any = null;
    let matchReason = "";

    const fields = (staging.extracted_fields ?? {}) as Record<string, unknown>;
    const uniqCandidates: string[] = [];
    for (const key of ["owlting_unique_id", "unique_id", "reference", "external_reference", "order_number"]) {
      const v = fields[key];
      if (typeof v === "string" && v.trim()) uniqCandidates.push(v.trim());
    }
    if (uniqCandidates.length > 0) {
      const { data } = await admin
        .from("orders")
        .select("id, order_number, owlting_reservation_id, guest_name, total_price, final_price, check_in_date, check_out_date, room_type_id, accommodation_id")
        .in("owlting_unique_id", uniqCandidates)
        .eq("accommodation_id", staging.accommodation_id ?? "00000000-0000-0000-0000-000000000000")
        .limit(1);
      if (data && data.length > 0) {
        matchedOrder = data[0];
        matchReason = `owlting_unique_id=${matchedOrder.order_number}`;
      }
    }

    if (!matchedOrder && staging.accommodation_id && staging.check_in_date && staging.check_out_date) {
      // OwlNest 回寄的信帶「原價 (未折扣)」= orders.total_price（gross），不是 final_price。
      // 因此用 total_price ±1 比對，才能配得上有折扣的自家訂單。
      const amount = Number(staging.total_amount ?? 0);
      const amountLo = amount > 0 ? amount - 1 : 0;
      const amountHi = amount > 0 ? amount + 1 : 999_999_999;
      // 排除 OTA / channel-manager 來源；其餘（website/line/kol/phone/walk_in/manual/...）皆視為自家訂單候選。
      const q = admin
        .from("orders")
        .select("id, order_number, guest_name, total_price, final_price, check_in_date, check_out_date, room_type_id, accommodation_id, order_source, owlting_reservation_id")
        .eq("accommodation_id", staging.accommodation_id)
        .eq("check_in_date", staging.check_in_date)
        .eq("check_out_date", staging.check_out_date)
        .not("order_source", "in", "(owlting,hotelnabe)")
        .neq("order_status", "cancelled");
      const { data: candidates } = await q;

      // Resolve staging room_type_name → orders.room_type_id (best-effort) to add
      // 房型 as a soft matching key.
      let stagingRoomTypeId: string | null = null;
      const roomName = (staging.room_type_name ?? "").trim();
      if (roomName) {
        const { data: rts } = await admin
          .from("room_types")
          .select("id, name")
          .eq("accommodation_id", staging.accommodation_id);
        const normRoom = roomName.replace(/\s+/g, "").toLowerCase();
        const hit = (rts ?? []).find((r: any) => {
          const n = String(r.name ?? "").replace(/\s+/g, "").toLowerCase();
          return n && (n === normRoom || n.includes(normRoom) || normRoom.includes(n));
        });
        stagingRoomTypeId = hit?.id ?? null;
      }

      const target = normalizeName(staging.guest_name ?? "");
      const filtered = (candidates ?? []).filter((o: any) => {
        // Prefer total_price (gross); fall back to final_price if total_price missing.
        const gross = Number(o.total_price ?? o.final_price ?? 0);
        const priceOk = amount === 0
          || gross === 0 // order not yet priced — allow match on dates/name
          || (gross >= amountLo && gross <= amountHi);
        if (!priceOk) return false;
        // Soft room-type filter: only exclude when we resolved a staging room and the order has a different one.
        if (stagingRoomTypeId && o.room_type_id && o.room_type_id !== stagingRoomTypeId) return false;
        if (!target) return true;
        return normalizeName(o.guest_name).includes(target) || target.includes(normalizeName(o.guest_name));
      });
      if (filtered.length === 1) {
        matchedOrder = filtered[0];
        matchReason = `date+gross${stagingRoomTypeId ? "+room" : ""}${target ? "+guest" : ""}=${matchedOrder.order_number}`;
      } else if (filtered.length > 1) {
        // Ambiguous — mark manual review.
        await admin.from("owlting_email_parsed_staging").update({
          pii_status: "manual_review",
          review_notes: `[self-push] 找到 ${filtered.length} 筆同日期/原價訂單，需人工確認。候選：${filtered.map((o: any) => o.order_number).join(", ")}`,
        }).eq("id", stagingId);
        return new Response(JSON.stringify({
          ok: false, is_self_push: true, ambiguous: true,
          candidates: filtered.map((o: any) => ({ id: o.id, order_number: o.order_number })),
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (!matchedOrder) {
      await admin.from("owlting_email_parsed_staging").update({
        pii_status: "manual_review",
        review_notes: `[self-push] 找不到對應本站訂單（accommodation=${staging.accommodation_id}, ${staging.check_in_date}~${staging.check_out_date}, ${staging.total_amount}）`,
      }).eq("id", stagingId);
      return new Response(JSON.stringify({
        ok: false, is_self_push: true, not_found: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Write the OBE back onto the existing order if slot is free.
    const nowIso = new Date().toISOString();
    if (staging.obe_number && !matchedOrder.owlting_reservation_id) {
      const { error: updErr } = await admin
        .from("orders")
        .update({ owlting_reservation_id: staging.obe_number })
        .eq("id", matchedOrder.id);
      if (updErr) {
        console.error("[owlting-selfpush-link] link OBE failed:", updErr);
        // Fall through: still mark staging linked (matched_order_id captured).
      }
    }

    await admin.from("owlting_email_parsed_staging").update({
      pii_status: "self_pushed",
      promoted_order_id: matchedOrder.id,
      owner_filled_at: nowIso,
      review_notes: `[self-push] 自動連結至本站訂單 ${matchedOrder.order_number} (${matchReason})`,
    }).eq("id", stagingId);

    return new Response(JSON.stringify({
      ok: true,
      is_self_push: true,
      matched_order_id: matchedOrder.id,
      matched_order_number: matchedOrder.order_number,
      match_reason: matchReason,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[owlting-selfpush-link] fatal:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
