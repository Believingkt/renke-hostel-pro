// hotelnabe-push-inventory-worker
// Direction: PMS → HotelNabe outbound ARI push (worker).
// Reads pending rows from hotelnabe_ari_push_queue, computes remaining per date,
// merges consecutive same-value dates into AvailStatusMessage(s), builds
// OTA_HotelAvailNotifRQ XML, and:
//   - dryrun (default): writes hotelnabe_ari_push_log only, marks queue rows 'sent'
//   - live (HOTELNABE_ARI_PUSH_MODE=live): POSTs to HotelNabe, parses RS,
//     mark sent on success or schedule retry on failure.
//
// Trigger: pg_cron every minute (see accompanying insert).
// Auth: service role only (invoked via cron with anon+service auth headers or by admin).

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildHotelnabeAvailNotifRQ,
  parseHotelnabeAvailNotifRS,
  maskPasswordInXml,
  type AvailMessage,
} from "./xml.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_ID = Deno.env.get("HOTELNABE_INBOUND_ID") ?? "";
const INBOUND_PASSWORD = Deno.env.get("HOTELNABE_INBOUND_PASSWORD") ?? "";
const PMS_ID = Deno.env.get("HOTELNABE_PMS_ID") ?? "";
const PUSH_MODE = (Deno.env.get("HOTELNABE_ARI_PUSH_MODE") ?? "dryrun").toLowerCase();
const HOTELNABE_BASE = Deno.env.get("HOTELNABE_BASE_URL") ?? "https://xml.hotelnabe.com.tw";
const ENDPOINT = `${HOTELNABE_BASE.replace(/\/+$/, "")}/pms/inventory`;
const BATCH_LIMIT = Number(Deno.env.get("HOTELNABE_ARI_WORKER_BATCH") ?? "200");
const MAX_ATTEMPTS = 5;

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

interface QueueRow {
  id: string;
  accommodation_id: string;
  room_type_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  attempt_count: number;
}

interface DayRemaining {
  date: string;
  remaining: number;
  is_available: boolean;
}

/**
 * Group consecutive dates whose (BookingLimit) is equal into ranges.
 * Returns AvailMessages (booking_limit) with Start/End inclusive.
 */
export function mergeConsecutive(days: DayRemaining[], invTypeCode: string): AvailMessage[] {
  if (days.length === 0) return [];
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const out: AvailMessage[] = [];
  let start = sorted[0].date;
  let end = sorted[0].date;
  // Effective booking limit: remaining, forced to 0 when is_available is false.
  const effLimit = (d: DayRemaining) => (d.is_available ? d.remaining : 0);
  let currLimit = effLimit(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i];
    const nextExpected = addDays(end, 1);
    const limit = effLimit(d);
    if (d.date === nextExpected && limit === currLimit) {
      end = d.date;
    } else {
      out.push({ kind: "booking_limit", start, end, invTypeCode, bookingLimit: currLimit });
      start = d.date;
      end = d.date;
      currLimit = limit;
    }
  }
  out.push({ kind: "booking_limit", start, end, invTypeCode, bookingLimit: currLimit });
  return out;
}

/**
 * Classify HotelNabe RS errors.
 * "no_price": HotelNabe rejects because rate/price for that date range is not yet
 * pushed (Code=450 or ShortText contains "push price first" / "please push price").
 * These are expected rejections — skip the queue row, do NOT retry, do NOT bump attempt.
 */
export function classifyRsErrors(
  errors: { type: string | null; code: string | null; message: string }[],
): { kind: "no_price" | "other"; message: string } | null {
  if (!errors || errors.length === 0) return null;
  for (const e of errors) {
    const msg = (e.message || "").toLowerCase();
    if (
      e.code === "450" ||
      msg.includes("push price first") ||
      msg.includes("please push price")
    ) {
      return {
        kind: "no_price",
        message: `[450 no_price] ${e.message || "please push price first"}`,
      };
    }
  }
  return { kind: "other", message: errors[0].message || "unknown_error" };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, cors);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Atomically claim a batch (SELECT ... FOR UPDATE SKIP LOCKED + flip to 'sending').
  //    This makes concurrent invocations (realtime trigger + cron) safe: each row is
  //    claimed by exactly one worker call.
  const { data: pending, error: pErr } = await admin.rpc(
    "claim_hotelnabe_ari_push_batch",
    { _limit: BATCH_LIMIT },
  );

  if (pErr) return json({ error: "queue_claim_failed", detail: pErr.message }, 500, cors);
  if (!pending || pending.length === 0) {
    return json({ ok: true, mode: PUSH_MODE, processed: 0 }, 200, cors);
  }

  // 2) Group by (accommodation_id, room_type_id).
  const groups = new Map<string, QueueRow[]>();
  for (const r of pending as QueueRow[]) {
    const k = `${r.accommodation_id}::${r.room_type_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const results: any[] = [];

  for (const [key, rows] of groups) {
    const [accommodationId, roomTypeId] = key.split("::");
    const queueIds = rows.map((r) => r.id);

    // Mark rows as sending (best-effort).
    await admin
      .from("hotelnabe_ari_push_queue")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .in("id", queueIds);

    try {
      // 3) Gather all target dates (each row is one day since Step 2 enqueues per-day).
      const dateSet = new Set<string>();
      for (const r of rows) {
        // Support legacy range rows if any: expand from_date..to_date inclusive.
        let d = r.from_date;
        while (d <= r.to_date) { dateSet.add(d); d = addDays(d, 1); }
      }
      const dates = Array.from(dateSet).sort();

      // 4) Look up HotelCode + room_type numeric_code.
      const [{ data: cfg }, { data: rt }] = await Promise.all([
        admin.from("accommodation_hotelnabe_config")
          .select("hotelnabe_hotel_code, sync_enabled")
          .eq("accommodation_id", accommodationId).maybeSingle(),
        admin.from("room_types")
          .select("numeric_code, name").eq("id", roomTypeId).maybeSingle(),
      ]);

      if (!cfg?.hotelnabe_hotel_code || !cfg.sync_enabled) {
        await admin.from("hotelnabe_ari_push_queue")
          .update({ status: "skipped", last_error: "hotel_code_missing_or_sync_disabled", updated_at: new Date().toISOString() })
          .in("id", queueIds);
        results.push({ accommodationId, roomTypeId, skipped: "config_missing_or_disabled", queue_ids: queueIds });
        continue;
      }
      if (!rt?.numeric_code) {
        await admin.from("hotelnabe_ari_push_queue")
          .update({ status: "skipped", last_error: "room_type_numeric_code_missing", updated_at: new Date().toISOString() })
          .in("id", queueIds);
        results.push({ accommodationId, roomTypeId, skipped: "numeric_code_missing", queue_ids: queueIds });
        continue;
      }

      const hotelCode = String(cfg.hotelnabe_hotel_code);
      const invTypeCode = String(rt.numeric_code);

      // 5) Compute remaining per date via RPC.
      const perDay: DayRemaining[] = [];
      for (const date of dates) {
        const { data: rem, error: rErr } = await admin.rpc("calculate_room_remaining", {
          _accommodation_id: accommodationId,
          _room_type_id: roomTypeId,
          _date: date,
        });
        if (rErr) throw new Error(`calculate_room_remaining ${date}: ${rErr.message}`);
        const row = Array.isArray(rem) ? rem[0] : rem;
        perDay.push({
          date,
          remaining: Number(row?.remaining ?? 0),
          is_available: Boolean(row?.is_available ?? false),
        });
      }

      // 6) Merge consecutive.
      const messages = mergeConsecutive(perDay, invTypeCode);

      // 7) Build XML.
      const echoToken = `LK-ARI-${crypto.randomUUID()}`;
      const requestXml = buildHotelnabeAvailNotifRQ({
        echoToken,
        hotelCode,
        requestorId: INBOUND_ID || "PENDING_SECRET",
        password: INBOUND_PASSWORD || "PENDING_SECRET",
        pmsName: PMS_ID || "11",
        messages,
      });
      const requestXmlMasked = maskPasswordInXml(requestXml);

      const summary = {
        mode: PUSH_MODE,
        room_type_id: roomTypeId,
        room_type_name: rt.name,
        inv_type_code: invTypeCode,
        queue_ids: queueIds,
        trigger_reasons: Array.from(new Set(rows.map((r) => r.reason))),
        per_day: perDay,
        merged_messages: messages.map((m: any) => ({
          start: m.start, end: m.end, booking_limit: m.bookingLimit,
        })),
      };

      let success = false;
      let httpStatus = 0;
      let responseXml = "";
      let errorMessage: string | null = null;
      let noPriceSkip = false;

      if (PUSH_MODE === "live") {
        // Guard: require secrets before we ever POST.
        if (!INBOUND_ID || !INBOUND_PASSWORD || !PMS_ID) {
          errorMessage = "missing_secrets_for_live";
        } else {
          try {
            const resp = await fetch(ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml" },
              body: requestXml,
            });
            httpStatus = resp.status;
            responseXml = await resp.text();
            const parsed = parseHotelnabeAvailNotifRS(responseXml);
            success = httpStatus >= 200 && httpStatus < 300 && parsed.errors.length === 0;
            if (!success) {
              const cls = classifyRsErrors(parsed.errors);
              if (cls?.kind === "no_price") {
                noPriceSkip = true;
                errorMessage = cls.message;
              } else {
                errorMessage = parsed.errors[0]?.message || `HTTP ${httpStatus}`;
              }
            }
          } catch (e) {
            errorMessage = (e as Error).message;
          }
        }
      } else {
        // dryrun
        success = true;
      }

      // 8) Persist log.
      await admin.from("hotelnabe_ari_push_log").insert({
        accommodation_id: accommodationId,
        hotel_code: hotelCode,
        mode: PUSH_MODE === "live" ? "live" : "dryrun",
        echo_token: echoToken,
        message_count: messages.length,
        queue_ids: queueIds,
        request_xml: requestXmlMasked,
        response_xml: responseXml || null,
        http_status: httpStatus || null,
        success,
        error_message: errorMessage,
        summary: { ...summary, skip_kind: noPriceSkip ? "no_price_450" : undefined },
      });

      // 9) Update queue rows.
      if (success) {
        await admin.from("hotelnabe_ari_push_queue")
          .update({ status: "sent", updated_at: new Date().toISOString(), last_error: null })
          .in("id", queueIds);
      } else if (noPriceSkip) {
        // Expected rejection — skip without retry, do NOT bump attempt_count.
        await admin.from("hotelnabe_ari_push_queue")
          .update({
            status: "skipped",
            next_retry_at: null,
            last_error: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .in("id", queueIds);
      } else {
        // Retry with exponential backoff (capped).
        for (const r of rows) {
          const nextAttempt = (r.attempt_count ?? 0) + 1;
          const backoffMin = Math.min(60, Math.pow(2, nextAttempt)); // 2,4,8,16,32,60
          const nextRetryAt = new Date(Date.now() + backoffMin * 60 * 1000).toISOString();
          const isFatal = nextAttempt >= MAX_ATTEMPTS;
          await admin.from("hotelnabe_ari_push_queue")
            .update({
              status: isFatal ? "failed" : "pending",
              attempt_count: nextAttempt,
              next_retry_at: isFatal ? null : nextRetryAt,
              last_error: errorMessage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        }
      }

      results.push({
        accommodationId, roomTypeId,
        queue_ids: queueIds,
        mode: PUSH_MODE, success, http_status: httpStatus, message_count: messages.length,
        skipped: noPriceSkip ? "no_price_450" : undefined,
      });
    } catch (e) {
      const msg = (e as Error).message;
      // Re-mark rows as pending with error so cron retries.
      for (const r of rows) {
        const nextAttempt = (r.attempt_count ?? 0) + 1;
        const isFatal = nextAttempt >= MAX_ATTEMPTS;
        const backoffMin = Math.min(60, Math.pow(2, nextAttempt));
        await admin.from("hotelnabe_ari_push_queue")
          .update({
            status: isFatal ? "failed" : "pending",
            attempt_count: nextAttempt,
            next_retry_at: isFatal ? null : new Date(Date.now() + backoffMin * 60 * 1000).toISOString(),
            last_error: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
      }
      results.push({ accommodationId, roomTypeId, error: msg, queue_ids: queueIds });
    }
  }

  return json({ ok: true, mode: PUSH_MODE, processed: pending.length, groups: results.length, results }, 200, cors);
});
