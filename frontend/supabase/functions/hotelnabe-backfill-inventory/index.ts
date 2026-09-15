// hotelnabe-backfill-inventory
// Enqueue backfill rows into hotelnabe_ari_push_queue for a given accommodation
// + date range. Default mode = 'dryrun' (does not insert; returns preview).
// mode = 'enqueue' actually inserts (ON CONFLICT DO NOTHING via unique
// partial index on pending rows) and returns per-room summary.
//
// The actual push to HotelNabe is handled by the existing cron worker
// (hotelnabe-push-inventory-worker). We only enqueue here.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_SPAN_DAYS = 400;

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
function daysBetweenInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  while (d <= to) { out.push(d); d = addDays(d, 1); }
  return out;
}

interface DayRemaining {
  date: string;
  remaining: number;
  is_available: boolean;
  available_rooms: number | null;
}
interface MergedMsg { start: string; end: string; booking_limit: number; nights: number }

/** Same merging rule as the push worker: consecutive dates + equal effective limit. */
export function mergeConsecutive(days: DayRemaining[]): MergedMsg[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const eff = (d: DayRemaining) => (d.is_available ? d.remaining : 0);
  const out: MergedMsg[] = [];
  let start = sorted[0].date;
  let end = sorted[0].date;
  let cur = eff(sorted[0]);
  let n = 1;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i];
    const limit = eff(d);
    if (d.date === addDays(end, 1) && limit === cur) { end = d.date; n++; }
    else {
      out.push({ start, end, booking_limit: cur, nights: n });
      start = d.date; end = d.date; cur = limit; n = 1;
    }
  }
  out.push({ start, end, booking_limit: cur, nights: n });
  return out;
}

/**
 * Flag date ranges that we EXPECT HotelNabe to reject with Code 450 "please push
 * price first". Two sources:
 *   (a) HotelNabe declared price max = 2026-12-30 → anything after is expected 450
 *   (b) prior queue rows with status='skipped' and last_error contains '450' /
 *       'no_price' — those dates were rejected historically.
 */
export function detectExpectedNoPriceDates(
  dates: string[],
  historicalSkipDates: Set<string>,
  priceMaxDate: string,
): string[] {
  const out: string[] = [];
  for (const d of dates) {
    if (d > priceMaxDate) { out.push(d); continue; }
    if (historicalSkipDates.has(d)) out.push(d);
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400, cors); }

  const accommodationId = String(payload?.accommodation_id ?? "");
  const fromDate = String(payload?.from_date ?? "");
  const toDate = String(payload?.to_date ?? "");
  const mode = String(payload?.mode ?? "dryrun").toLowerCase(); // 'dryrun' | 'enqueue'
  const priceMaxDate = String(payload?.price_max_date ?? "2026-12-30");

  if (!accommodationId || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return json({ error: "missing_or_bad_params" }, 400, cors);
  }
  if (fromDate > toDate) return json({ error: "from_date_after_to_date" }, 400, cors);
  const span = daysBetweenInclusive(fromDate, toDate);
  if (span.length > MAX_SPAN_DAYS) return json({ error: `span_too_large_${span.length}_max_${MAX_SPAN_DAYS}` }, 400, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Config gate
  const { data: cfg, error: cfgErr } = await admin
    .from("accommodation_hotelnabe_config")
    .select("hotelnabe_hotel_code, sync_enabled")
    .eq("accommodation_id", accommodationId).maybeSingle();
  if (cfgErr) return json({ error: "config_fetch_failed", detail: cfgErr.message }, 500, cors);
  if (!cfg?.hotelnabe_hotel_code) return json({ error: "not_a_hotelnabe_accommodation" }, 400, cors);
  if (!cfg.sync_enabled) return json({ error: "sync_disabled" }, 400, cors);

  // 2) All room types with numeric_code
  const { data: rooms, error: rtErr } = await admin
    .from("room_types")
    .select("id, name, numeric_code")
    .eq("accommodation_id", accommodationId)
    .not("numeric_code", "is", null);
  if (rtErr) return json({ error: "room_types_fetch_failed", detail: rtErr.message }, 500, cors);
  if (!rooms || rooms.length === 0) return json({ error: "no_room_types_with_numeric_code" }, 400, cors);

  // 3) Historical 450 skips
  const { data: prior } = await admin
    .from("hotelnabe_ari_push_queue")
    .select("room_type_id, from_date, last_error")
    .eq("accommodation_id", accommodationId)
    .eq("status", "skipped")
    .gte("from_date", fromDate).lte("from_date", toDate);
  const historicalByRoom = new Map<string, Set<string>>();
  for (const p of prior ?? []) {
    const msg = String((p as any).last_error ?? "").toLowerCase();
    if (!(msg.includes("450") || msg.includes("no_price"))) continue;
    if (!historicalByRoom.has(p.room_type_id)) historicalByRoom.set(p.room_type_id, new Set());
    historicalByRoom.get(p.room_type_id)!.add(p.from_date);
  }

  const perRoom: any[] = [];

  for (const rt of rooms) {
    // remaining per date via existing RPC
    const perDay: DayRemaining[] = [];
    for (const d of span) {
      const { data: rem, error: rErr } = await admin.rpc("calculate_room_remaining", {
        _accommodation_id: accommodationId,
        _room_type_id: rt.id,
        _date: d,
      });
      if (rErr) return json({ error: "remaining_calc_failed", room: rt.name, date: d, detail: rErr.message }, 500, cors);
      const row = Array.isArray(rem) ? rem[0] : rem;
      perDay.push({
        date: d,
        remaining: Number(row?.remaining ?? 0),
        is_available: Boolean(row?.is_available ?? false),
        available_rooms: row?.available_rooms == null ? null : Number(row.available_rooms),
      });
    }
    const merged = mergeConsecutive(perDay);
    const expectedNoPrice = detectExpectedNoPriceDates(
      span, historicalByRoom.get(rt.id) ?? new Set(), priceMaxDate,
    );

    let enqueued = 0;
    let already_pending = 0;
    if (mode === "enqueue") {
      // Partial unique index (WHERE status='pending') can't be used as
      // upsert onConflict target. Fetch existing pending rows first, then
      // insert only the missing dates.
      const { data: existing, error: exErr } = await admin
        .from("hotelnabe_ari_push_queue")
        .select("from_date")
        .eq("accommodation_id", accommodationId)
        .eq("room_type_id", rt.id)
        .eq("status", "pending")
        .gte("from_date", fromDate).lte("from_date", toDate);
      if (exErr) return json({ error: "enqueue_fetch_existing_failed", detail: exErr.message }, 500, cors);
      const existingDates = new Set((existing ?? []).map((r: any) => r.from_date));
      const missing = span.filter((d) => !existingDates.has(d));
      already_pending = span.length - missing.length;
      const rowsToInsert = missing.map((d) => ({
        accommodation_id: accommodationId,
        room_type_id: rt.id,
        from_date: d,
        to_date: d,
        reason: "backfill",
        status: "pending",
      }));
      const CHUNK = 500;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const chunk = rowsToInsert.slice(i, i + CHUNK);
        const { data: ins, error: insErr } = await admin
          .from("hotelnabe_ari_push_queue")
          .insert(chunk)
          .select("id");
        if (insErr) return json({ error: "enqueue_failed", detail: insErr.message }, 500, cors);
        enqueued += ins?.length ?? 0;
      }
    }

    perRoom.push({
      room_type_id: rt.id,
      room_type_name: rt.name,
      inv_type_code: String(rt.numeric_code),
      total_days: perDay.length,
      available_days: perDay.filter((d) => d.is_available).length,
      closed_days: perDay.filter((d) => !d.is_available).length,
      no_rip_days: perDay.filter((d) => d.available_rooms === null).length,
      merged_messages: merged,
      merged_message_count: merged.length,
      expected_no_price_dates: expectedNoPrice,
      expected_no_price_count: expectedNoPrice.length,
      enqueued,
      already_pending,
    });
  }

  return json({
    ok: true,
    mode,
    accommodation_id: accommodationId,
    hotel_code: cfg.hotelnabe_hotel_code,
    from_date: fromDate,
    to_date: toDate,
    span_days: span.length,
    price_max_date: priceMaxDate,
    rooms: perRoom,
    totals: {
      rooms: perRoom.length,
      merged_messages: perRoom.reduce((s, r) => s + r.merged_message_count, 0),
      enqueued: perRoom.reduce((s, r) => s + r.enqueued, 0),
      already_pending: perRoom.reduce((s, r) => s + r.already_pending, 0),
      expected_no_price: perRoom.reduce((s, r) => s + r.expected_no_price_count, 0),
    },
  }, 200, cors);
});
