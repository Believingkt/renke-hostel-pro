// owlting-order-push
// Worker invoked every minute by pg_cron. Drains owlting_order_push_queue
// (status='pending', next_retry_at<=now()) up to 50 rows per run.
//
// SAFETY: defaults to dryrun. Set Supabase secret OWLTING_PUSH_MODE='live'
// to actually POST to OwlTing. In dryrun we ONLY assemble the XML and write
// it to owlting_order_push_log with the password masked — no fetch at all.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import {
  buildResNotifRq,
  resolveRatePlan,
  type OwlOrderInput,
  type OwlConfig,
  type ResStatus,
} from "./xml.ts";
import { buildMappingTables, mapOutboundStay } from "./group-mapping.ts";


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
  order_id: string | null;
  res_status: ResStatus;
  echo_token: string;
  status: string;
  attempt_count: number;
  order_snapshot: any | null;
}

// --- Single fetch wrapper: only place that talks to OwlTing externally.
// Auth is via IP allow-listing — 走共用 VPS 靜態 IP relay（68.178.175.73）。
// Relay 規格與 owlting-ari-push.fetchViaRelay 一致：
//   POST {STATIC_IP_PROXY_URL}/relay
//   Headers: X-Relay-Token, X-Target-Url, X-Target-Method,
//            目標 headers 以 X-Forward-Header-* 前綴帶過去
//   Body: 原始 request body（relay passthrough）
// 若 STATIC_IP_PROXY_URL 未設則回退直連（dev/測試用）。
async function sendToOwlting(
  endpoint: string,
  xml: string,
): Promise<{ status: number; text: string; durationMs: number }> {
  const t0 = Date.now();
  const targetHeaders: Record<string, string> = {
    "Content-Type": "application/xml; charset=utf-8",
    "Accept": "application/xml",
  };

  const proxyUrl = Deno.env.get("STATIC_IP_PROXY_URL");
  const proxyToken = Deno.env.get("STATIC_IP_PROXY_TOKEN");

  let resp: Response;
  if (!proxyUrl) {
    console.warn("[OwlTing Relay] STATIC_IP_PROXY_URL not set, using direct connection");
    resp = await fetch(endpoint, { method: "POST", headers: targetHeaders, body: xml });
  } else {
    const relayHeaders: Record<string, string> = {
      "X-Target-Url": endpoint,
      "X-Target-Method": "POST",
      "Content-Type": "application/octet-stream",
    };
    if (proxyToken) relayHeaders["X-Relay-Token"] = proxyToken;
    for (const [k, v] of Object.entries(targetHeaders)) {
      relayHeaders[`X-Forward-Header-${k}`] = v;
    }
    console.log(`[OwlTing Relay] POST via ${proxyUrl} → ${endpoint}`);
    resp = await fetch(`${proxyUrl}/relay`, {
      method: "POST",
      headers: relayHeaders,
      body: xml,
    });
  }

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

  // Auth is via IP allow-listing. Username/password secrets may still exist
  // but are intentionally NOT injected into the payload or headers.


  // 1) Claim queue rows
  const nowIso = new Date().toISOString();
  const { data: queue, error: qErr } = await admin
    .from("owlting_order_push_queue")
    .select("id, accommodation_id, order_id, res_status, echo_token, status, attempt_count, order_snapshot")
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
    const r = await processRow(admin, row);
    results.push(r);
  }

  return new Response(JSON.stringify({
    mode: MODE,
    processed: results.length,
    auth: "ip_whitelist",
    results,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

async function processRow(
  admin: any,
  row: QueueRow,
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

  // Load order with rooms. When the order row has been deleted (order_id is
  // now NULL due to ON DELETE SET NULL) we fall back to order_snapshot that the
  // BEFORE DELETE trigger captured — needed to send the Cancel push.
  let order: any = null;
  if (row.order_id) {
    const { data } = await admin
      .from("orders")
      .select("id, order_number, accommodation_id, check_in_date, check_out_date, guest_count, guest_name, guest_phone, guest_email, total_price, final_price, deposit_amount, payment_status, notes, room_type_id, package_id, meal_plan, owlting_unique_id, order_status")
      .eq("id", row.order_id)
      .maybeSingle();
    order = data;
  }
  let snapshotRooms: any[] | null = null;
  if (!order && row.order_snapshot) {
    const s = row.order_snapshot;
    order = {
      id: s.id,
      order_number: s.order_number,
      accommodation_id: s.accommodation_id,
      check_in_date: s.check_in_date,
      check_out_date: s.check_out_date,
      guest_count: s.guest_count,
      guest_name: s.guest_name,
      guest_phone: s.guest_phone,
      guest_email: s.guest_email,
      total_price: s.total_price,
      final_price: s.final_price,
      deposit_amount: s.deposit_amount,
      payment_status: s.payment_status,
      notes: s.notes,
      room_type_id: s.room_type_id,
      package_id: s.package_id,
      meal_plan: s.meal_plan,
      owlting_unique_id: s.owlting_unique_id,
      order_status: s.order_status ?? "cancelled",
    };
    snapshotRooms = Array.isArray(s.order_rooms) ? s.order_rooms : [];
  }

  if (!order) {
    await finalizeFail(admin, row, baseLog, "order not found", true);
    return { id: row.id, outcome: "failed", reason: "order not found" };
  }

  // Build room stays from order_rooms; fall back to snapshot rooms, then single (room_type_id, qty=1)
  let orRooms: any[] | null = snapshotRooms;
  if (!orRooms) {
    const { data } = await admin
      .from("order_rooms")
      .select("room_type_id, quantity, room_price")
      .eq("order_id", order.id);
    orRooms = data;
  }

  const rawStayInputs = (orRooms && orRooms.length > 0)
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

  // Plan A: allocate order.final_price across stays proportionally so that
  // sum(unitAmount * quantity) === final_price. Keeps OwlTing's displayed
  // 房款 / total consistent with the PMS actual收金額 (含折扣、加購已在 final_price 內).
  const finalTotal = Math.round(Number(order.final_price ?? order.total_price ?? 0));
  const origTotal = rawStayInputs.reduce((s, x) => s + x.unit_amount * x.quantity, 0);
  const stayInputs = rawStayInputs.map((s) => ({ ...s }));
  if (finalTotal >= 0 && origTotal > 0 && stayInputs.length > 0) {
    let allocated = 0;
    for (let i = 0; i < stayInputs.length; i++) {
      const s = stayInputs[i];
      const share = (s.unit_amount * s.quantity) / origTotal;
      const stayTotal = i === stayInputs.length - 1
        ? finalTotal - allocated
        : Math.round(finalTotal * share);
      allocated += stayTotal;
      s.unit_amount = Math.max(0, Math.round(stayTotal / Math.max(1, s.quantity)));
    }
    // Fix rounding remainder on the last stay so sum matches finalTotal exactly
    const check = stayInputs.reduce((sum, x) => sum + x.unit_amount * x.quantity, 0);
    const diff = finalTotal - check;
    if (diff !== 0) {
      const last = stayInputs[stayInputs.length - 1];
      last.unit_amount = Math.max(0, last.unit_amount + Math.round(diff / Math.max(1, last.quantity)));
    }
  }

  if (stayInputs.length === 0) {
    await finalizeFail(admin, row, baseLog, "no rooms on order", true);
    return { id: row.id, outcome: "failed", reason: "no rooms" };
  }

  // Per-room-type OwlTing sync exclusions (owlting_room_type_sync.sync_enabled=false).
  // Excluded room_types are stripped from the outbound push. If every stay is
  // excluded, the whole reservation is skipped (marked queue as 'skipped').
  const { data: excludedRows } = await admin
    .from("owlting_room_type_sync")
    .select("room_type_id")
    .eq("accommodation_id", order.accommodation_id)
    .eq("sync_enabled", false);
  const excludedRoomTypeIds = new Set<string>((excludedRows ?? []).map((r: any) => r.room_type_id));

  const filteredStayInputs = stayInputs.filter((s) => !excludedRoomTypeIds.has(s.room_type_id));
  if (filteredStayInputs.length === 0) {
    await admin.from("owlting_order_push_queue").update({
      status: "skipped",
      last_error: "all room types excluded from OwlTing sync",
    }).eq("id", row.id);
    await admin.from("owlting_order_push_log").insert({
      ...baseLog, success: false,
      error_message: "skipped: all room types excluded from OwlTing sync",
    });
    return { id: row.id, outcome: "skipped", reason: "all rooms excluded" };
  }

  // Resolve numeric codes for room types
  const roomTypeIds = Array.from(new Set(filteredStayInputs.map((s) => s.room_type_id).filter(Boolean)));

  const { data: rts } = await admin
    .from("room_types")
    .select("id, name, numeric_code")
    .in("id", roomTypeIds);
  const rtMap = new Map<string, { name: string; numeric_code: number | null }>(
    (rts ?? []).map((r: any) => [r.id, { name: r.name, numeric_code: r.numeric_code }]),
  );

  // Resolve fallback RatePlanCode from orders.package_id. May be null when
  // every stay is a group member (mapping below provides the correct
  // per-headcount rate plan from owlting_room_type_group_members).
  const { data: pkgs } = await admin
    .from("accommodation_packages")
    .select("id, name, numeric_code")
    .eq("accommodation_id", order.accommodation_id);
  const rp = resolveRatePlan(order.package_id, pkgs ?? []);
  const fallbackRpCode = rp.ok ? rp.code : null;
  const fallbackRpName = rp.ok ? rp.name : undefined;

  // Load owlting room-type group config (canonical + members) for this property.
  const { data: groupsRows } = await admin
    .from("owlting_room_type_groups")
    .select("id, canonical_room_type_id, canonical_name")
    .eq("accommodation_id", order.accommodation_id);
  const groupIds = (groupsRows ?? []).map((g: any) => g.id);
  const { data: memberRows } = groupIds.length
    ? await admin
        .from("owlting_room_type_group_members")
        .select("group_id, room_type_id, rate_plan_template_id, rate_plan_name, pricing_templates!owlting_room_type_group_members_rate_plan_template_id_fkey(numeric_code)")
        .in("group_id", groupIds)
    : { data: [] as any[] };
  const canonicalRtIds = (groupsRows ?? []).map((g: any) => g.canonical_room_type_id);
  const { data: canonicalRts } = canonicalRtIds.length
    ? await admin.from("room_types").select("id, numeric_code").in("id", canonicalRtIds)
    : { data: [] as any[] };
  const mappingTables = buildMappingTables(
    (groupsRows ?? []),
    (canonicalRts ?? []),
    (memberRows ?? []).map((m: any) => ({
      group_id: m.group_id,
      room_type_id: m.room_type_id,
      rate_plan_template_id: m.rate_plan_template_id,
      rate_plan_name: m.rate_plan_name,
      rate_plan_template_numeric_code: m.pricing_templates?.numeric_code ?? null,
    })),
  );

  // Build OwlOrderInput + mapping audit
  const stays = [];
  const mappingAudit: any[] = [];
  for (const s of filteredStayInputs) {
    const rt = s.room_type_id ? rtMap.get(s.room_type_id) : undefined;
    const mapped = mapOutboundStay(
      {
        room_type_id: s.room_type_id,
        original_room_type_code: rt?.numeric_code ?? null,
        fallback_rate_plan_code: fallbackRpCode,
        fallback_rate_plan_name: fallbackRpName,
        fallback_room_type_name: rt?.name,
      },
      mappingTables,
    );
    if ("error" in mapped) {
      await finalizeFail(admin, row, baseLog, mapped.error, true);
      return { id: row.id, outcome: "failed", reason: mapped.error };
    }
    stays.push({
      roomTypeCode: mapped.roomTypeCode,
      ratePlanCode: mapped.ratePlanCode,
      roomTypeName: mapped.roomTypeName,
      ratePlanName: mapped.ratePlanName,
      quantity: s.quantity,
      unitAmount: s.unit_amount,
      adults: Math.max(1, order.guest_count ?? 2),
    });
    mappingAudit.push({
      original: mapped.original,
      converted: mapped.converted,
      remapped: mapped.remapped,
    });
  }

  // Deposit / balance summary appended to Comments so it渲染在 OwlTing 訂單備註，
  // 但不改變 total_amount — 讓 OwlTing 端仍以「未結清」狀態顯示，避免收款結帳困擾。
  const depositAmt = Math.max(0, Math.round(Number(order.deposit_amount ?? 0)));
  const paidStatus = String(order.payment_status ?? "");
  const paidAmt = paidStatus === "paid" || paidStatus === "fully_paid"
    ? finalTotal
    : (paidStatus === "deposit_paid" ? depositAmt : 0);
  const balanceAmt = Math.max(0, finalTotal - paidAmt);
  const payLine = `[人客多收款狀態] 總額 ${finalTotal} / 已收 ${paidAmt}（${paidStatus || "unpaid"}） / 未收 ${balanceAmt}`;
  const combinedNotes = [order.notes?.trim() || null, payLine].filter(Boolean).join("\n");

  const owlOrder: OwlOrderInput = {
    order_number: order.order_number,
    check_in_date: order.check_in_date,
    check_out_date: order.check_out_date,
    guest_name: order.guest_name,
    guest_phone: order.guest_phone,
    guest_email: order.guest_email,
    total_amount: finalTotal,
    notes: combinedNotes,
    roomStays: stays,
  };
  const owlCfg: OwlConfig = { owlting_hotel_code: cfg.owlting_hotel_code };

  const uniqueId = order.owlting_unique_id ?? order.order_number;
  const xml = buildResNotifRq(owlOrder, owlCfg, {
    resStatus: row.res_status,
    echoToken: row.echo_token,
    uniqueId,
  });

  // ============ DRYRUN ============
  if (MODE !== "live") {
    await admin.from("owlting_order_push_log").insert({
      ...baseLog,
      request_xml: xml,
      response_xml: null,
      http_status: null,
      duration_ms: null,
      success: null,
      mapping_meta: { stays: mappingAudit },
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
  // Auth = IP allow-list; no credential check here.

  try {
    const { status, text, durationMs } = await sendToOwlting(cfg.cm_api_endpoint_url, xml);
    const ok = status >= 200 && status < 300 && isSuccessRs(text);
    const md5 = parseOwlNestMd5(text);
    await admin.from("owlting_order_push_log").insert({
      ...baseLog,
      request_xml: xml,
      response_xml: text,
      http_status: status,
      duration_ms: durationMs,
      success: ok,
      owlnest_md5: md5,
      mapping_meta: { stays: mappingAudit },
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
      request_xml: xml,
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
