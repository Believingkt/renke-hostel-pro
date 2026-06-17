// owlting-order-push
// Worker invoked every minute by pg_cron. Drains owlting_order_push_queue
// (status='pending', next_retry_at<=now()) up to 50 rows per run.
//
// SAFETY: defaults to dryrun. Set Supabase secret OWLTING_PUSH_MODE='live'
// to actually POST to OwlTing. In dryrun we ONLY assemble the XML and write
// it to owlting_order_push_log with the password masked — no fetch at all.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import {
  buildResNotifXml,
  maskPasswordInXml,
  type OwlOrderInput,
  type OwlConfig,
  type ResStatus,
} from "./xml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODE = (Deno.env.get("OWLTING_PUSH_MODE") ?? "dryrun").toLowerCase();
const BATCH_SIZE = 50;
const BACKOFF_MIN = [1, 5, 15, 60, 360]; // minutes
const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: string;
  accommodation_id: string;
  order_id: string;
  res_status: ResStatus;
  echo_token: string;
  status: string;
  attempt_count: number;
}

// --- Single fetch wrapper: only place that talks to OwlTing externally.
async function sendToOwlting(
  endpoint: string,
  xml: string,
): Promise<{ status: number; text: string; durationMs: number }> {
  const t0 = Date.now();
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "",
    },
    body: xml,
  });
  const text = await resp.text();
  return { status: resp.status, text, durationMs: Date.now() - t0 };
}

function parseOwlNestMd5(xml: string): string | null {
  const m = xml.match(/owlnest_md5\s*=\s*["']([^"']+)["']/i)
    ?? xml.match(/<owlnest_md5>([^<]+)<\/owlnest_md5>/i);
  return m ? m[1] : null;
}

function isSuccessRs(xml: string): boolean {
  return /<Success\b/i.test(xml) && !/<Errors\b/i.test(xml);
}

function computeNextRetry(attempt: number): { iso: string | null; failedFinal: boolean } {
  if (attempt >= MAX_ATTEMPTS) return { iso: null, failedFinal: true };
  const minutes = BACKOFF_MIN[Math.min(attempt, BACKOFF_MIN.length - 1)];
  return { iso: new Date(Date.now() + minutes * 60_000).toISOString(), failedFinal: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const username = Deno.env.get("OWLTING_WS_USERNAME") ?? "";
  const password = Deno.env.get("OWLTING_WS_PASSWORD") ?? "";
  const haveCreds = !!username && !!password;

  // 1) Claim queue rows
  const nowIso = new Date().toISOString();
  const { data: queue, error: qErr } = await admin
    .from("owlting_order_push_queue")
    .select("id, accommodation_id, order_id, res_status, echo_token, status, attempt_count")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (qErr) {
    return new Response(JSON.stringify({ error: qErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const row of (queue ?? []) as QueueRow[]) {
    const r = await processRow(admin, row, { username, password, haveCreds });
    results.push(r);
  }

  return new Response(JSON.stringify({
    mode: MODE,
    processed: results.length,
    haveCreds,
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

async function processRow(
  admin: any,
  row: QueueRow,
  ctx: { username: string; password: string; haveCreds: boolean },
) {
  const baseLog: any = {
    queue_id: row.id,
    accommodation_id: row.accommodation_id,
    res_status: row.res_status,
  };

  // Mark sending
  await admin.from("owlting_order_push_queue").update({
    status: "sending",
    attempt_count: row.attempt_count + 1,
  }).eq("id", row.id);

  // Load config
  const { data: cfg } = await admin
    .from("accommodation_owlting_config")
    .select("owlting_hotel_code, cm_api_endpoint_url, sync_enabled")
    .eq("accommodation_id", row.accommodation_id)
    .maybeSingle();

  if (!cfg || !cfg.sync_enabled) {
    await admin.from("owlting_order_push_queue").update({
      status: "skipped",
      last_error: "sync disabled or no config",
    }).eq("id", row.id);
    await admin.from("owlting_order_push_log").insert({
      ...baseLog, success: false, error_message: "skipped: sync disabled or no config",
    });
    return { id: row.id, outcome: "skipped" };
  }

  // Load order with rooms
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, accommodation_id, check_in_date, check_out_date, guest_count, guest_name, guest_phone, guest_email, total_price, final_price, notes, room_type_id, meal_plan, owlting_unique_id, order_status")
    .eq("id", row.order_id)
    .maybeSingle();

  if (!order) {
    await finalizeFail(admin, row, baseLog, "order not found", true);
    return { id: row.id, outcome: "failed", reason: "order not found" };
  }

  // Build room stays from order_rooms; fall back to single (room_type_id, qty=1)
  const { data: orRooms } = await admin
    .from("order_rooms")
    .select("room_type_id, quantity, room_price")
    .eq("order_id", order.id);

  const stayInputs = (orRooms && orRooms.length > 0)
    ? orRooms.map((r: any) => ({
        room_type_id: r.room_type_id,
        quantity: r.quantity ?? 1,
        unit_amount: Math.round(Number(r.room_price ?? 0)),
      }))
    : (order.room_type_id ? [{
        room_type_id: order.room_type_id,
        quantity: 1,
        unit_amount: Math.round(Number(order.final_price ?? order.total_price ?? 0)),
      }] : []);

  if (stayInputs.length === 0) {
    await finalizeFail(admin, row, baseLog, "no rooms on order", true);
    return { id: row.id, outcome: "failed", reason: "no rooms" };
  }

  // Resolve numeric codes for room types
  const roomTypeIds = Array.from(new Set(stayInputs.map((s) => s.room_type_id).filter(Boolean)));
  const { data: rts } = await admin
    .from("room_types")
    .select("id, name, numeric_code")
    .in("id", roomTypeIds);
  const rtMap = new Map<string, { name: string; numeric_code: number | null }>(
    (rts ?? []).map((r: any) => [r.id, { name: r.name, numeric_code: r.numeric_code }]),
  );

  // Resolve a RatePlanCode: try package by meal_plan name on this acc; else fallback to lowest numeric_code package.
  const { data: pkgs } = await admin
    .from("accommodation_packages")
    .select("id, name, numeric_code")
    .eq("accommodation_id", order.accommodation_id)
    .order("numeric_code", { ascending: true });
  let ratePlan = (pkgs ?? []).find((p: any) => order.meal_plan && p.name === order.meal_plan)
              ?? (pkgs ?? [])[0]
              ?? null;
  if (!ratePlan || ratePlan.numeric_code == null) {
    await finalizeFail(admin, row, baseLog, "no rate plan numeric_code for accommodation", true);
    return { id: row.id, outcome: "failed", reason: "no rate plan" };
  }

  // Build OwlOrderInput
  const stays = [];
  for (const s of stayInputs) {
    const rt = s.room_type_id ? rtMap.get(s.room_type_id) : undefined;
    if (!rt || rt.numeric_code == null) {
      await finalizeFail(admin, row, baseLog, `room_type ${s.room_type_id} missing numeric_code`, true);
      return { id: row.id, outcome: "failed", reason: "no room_type code" };
    }
    stays.push({
      roomTypeCode: rt.numeric_code,
      ratePlanCode: ratePlan.numeric_code,
      roomTypeName: rt.name,
      ratePlanName: ratePlan.name,
      quantity: s.quantity,
      unitAmount: s.unit_amount,
      adults: Math.max(1, order.guest_count ?? 2),
    });
  }

  const owlOrder: OwlOrderInput = {
    order_number: order.order_number,
    check_in_date: order.check_in_date,
    check_out_date: order.check_out_date,
    guest_name: order.guest_name,
    guest_phone: order.guest_phone,
    guest_email: order.guest_email,
    total_amount: Math.round(Number(order.final_price ?? order.total_price ?? 0)),
    notes: order.notes ?? null,
    roomStays: stays,
  };
  const owlCfg: OwlConfig = { owlting_hotel_code: cfg.owlting_hotel_code };

  const uniqueId = order.owlting_unique_id ?? order.order_number;
  const xml = buildResNotifXml(owlOrder, owlCfg, {
    resStatus: row.res_status,
    echoToken: row.echo_token,
    uniqueId,
  }, { username: ctx.username || "(missing)", password: ctx.password || "(missing)" });

  const maskedXml = maskPasswordInXml(xml);

  // ============ DRYRUN ============
  if (MODE !== "live") {
    await admin.from("owlting_order_push_log").insert({
      ...baseLog,
      request_xml: maskedXml,
      response_xml: null,
      http_status: null,
      duration_ms: null,
      success: null,
      error_message: "dryrun — not sent",
    });
    await admin.from("owlting_order_push_queue").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: "dryrun",
    }).eq("id", row.id);
    await admin.from("orders").update({
      owlting_sync_state: {
        mode: "dryrun",
        last_action: row.res_status,
        last_echo_token: row.echo_token,
        at: new Date().toISOString(),
      },
    }).eq("id", order.id);
    return { id: row.id, outcome: "dryrun_logged" };
  }

  // ============ LIVE ============ (only when OWLTING_PUSH_MODE=live)
  if (!ctx.haveCreds) {
    await finalizeFail(admin, row, baseLog, "missing OWLTING_WS_USERNAME/PASSWORD", true);
    return { id: row.id, outcome: "failed", reason: "no creds" };
  }
  try {
    const { status, text, durationMs } = await sendToOwlting(cfg.cm_api_endpoint_url, xml);
    const ok = status >= 200 && status < 300 && isSuccessRs(text);
    const md5 = parseOwlNestMd5(text);
    await admin.from("owlting_order_push_log").insert({
      ...baseLog,
      request_xml: maskedXml,
      response_xml: text,
      http_status: status,
      duration_ms: durationMs,
      success: ok,
      owlnest_md5: md5,
      error_message: ok ? null : "non-success response",
    });
    if (ok) {
      await admin.from("owlting_order_push_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", row.id);
      await admin.from("accommodation_owlting_config").update({
        last_successful_sync_at: new Date().toISOString(),
      }).eq("accommodation_id", row.accommodation_id);
      await admin.from("orders").update({
        owlting_unique_id: uniqueId,
        owlting_sync_state: {
          mode: "live",
          last_action: row.res_status,
          last_echo_token: row.echo_token,
          owlnest_md5: md5,
          at: new Date().toISOString(),
        },
      }).eq("id", order.id);
      return { id: row.id, outcome: "sent" };
    }
    const { iso, failedFinal } = computeNextRetry(row.attempt_count + 1);
    await admin.from("owlting_order_push_queue").update({
      status: failedFinal ? "failed" : "pending",
      next_retry_at: iso,
      last_error: `http ${status}`,
    }).eq("id", row.id);
    return { id: row.id, outcome: failedFinal ? "failed" : "retry" };
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    await admin.from("owlting_order_push_log").insert({
      ...baseLog,
      request_xml: maskedXml,
      success: false,
      error_message: msg,
    });
    const { iso, failedFinal } = computeNextRetry(row.attempt_count + 1);
    await admin.from("owlting_order_push_queue").update({
      status: failedFinal ? "failed" : "pending",
      next_retry_at: iso,
      last_error: msg,
    }).eq("id", row.id);
    return { id: row.id, outcome: failedFinal ? "failed" : "retry", error: msg };
  }
}

async function finalizeFail(admin: any, row: QueueRow, baseLog: any, msg: string, final: boolean) {
  await admin.from("owlting_order_push_log").insert({
    ...baseLog, success: false, error_message: msg,
  });
  await admin.from("owlting_order_push_queue").update({
    status: final ? "failed" : "pending",
    last_error: msg,
  }).eq("id", row.id);
}
