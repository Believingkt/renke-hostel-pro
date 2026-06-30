// hotelnabe-push-inventory
// Direction: 人客多 (PMS) → HotelNabe  (outbound ARI push)
// Endpoint: POST https://xml.hotelnabe.com.tw/pms/inventory
//
// Admin-only manual trigger. Default mode = dryrun (no real POST).
// Set HOTELNABE_PUSH_MODE=live to actually send.

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
const PUSH_MODE = (Deno.env.get("HOTELNABE_PUSH_MODE") ?? "dryrun").toLowerCase();
const HOTELNABE_BASE = Deno.env.get("HOTELNABE_BASE_URL") ?? "https://xml.hotelnabe.com.tw";
const ENDPOINT = `${HOTELNABE_BASE.replace(/\/+$/, "")}/pms/inventory`;

function jsonResp(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface RequestBody {
  accommodation_id: string;
  op_type: "booking_limit" | "close" | "open";
  inv_type_code: string;   // PMS room type numeric code, e.g. "1063"
  start: string;           // YYYY-MM-DD
  end: string;             // YYYY-MM-DD
  booking_limit?: number;  // for op_type="booking_limit"
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return jsonResp({ error: "Method Not Allowed" }, 405, cors);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResp({ error: "missing_auth" }, 401, cors);

  if (!INBOUND_ID || !INBOUND_PASSWORD || !PMS_ID) {
    return jsonResp(
      {
        error: "missing_secrets",
        detail: "Required: HOTELNABE_INBOUND_ID, HOTELNABE_INBOUND_PASSWORD, HOTELNABE_PMS_ID",
      },
      500,
      cors,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  if (authErr || !user) return jsonResp({ error: "invalid_session" }, 401, cors);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "invalid_json_body" }, 400, cors);
  }

  const { accommodation_id, op_type, inv_type_code, start, end, booking_limit } = body ?? {} as RequestBody;
  if (!accommodation_id) return jsonResp({ error: "accommodation_id_required" }, 400, cors);
  if (!["booking_limit", "close", "open"].includes(op_type)) {
    return jsonResp({ error: "invalid_op_type" }, 400, cors);
  }
  if (!inv_type_code) return jsonResp({ error: "inv_type_code_required" }, 400, cors);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return jsonResp({ error: "invalid_date_format", detail: "start/end must be YYYY-MM-DD" }, 400, cors);
  }
  if (op_type === "booking_limit") {
    if (booking_limit == null || !Number.isFinite(booking_limit) || booking_limit < 0) {
      return jsonResp({ error: "invalid_booking_limit" }, 400, cors);
    }
  }

  // Permission check — query user_roles directly (do NOT use user_has_role RPC).
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role, accommodation_id")
    .eq("user_id", user.id);
  if (roleErr) return jsonResp({ error: "role_query_failed", detail: roleErr.message }, 500, cors);
  const allowed = (roleRows ?? []).some((r: any) =>
    r.role === "super_admin" ||
    (r.role === "hotel_admin" && r.accommodation_id === accommodation_id)
  );
  if (!allowed) {
    return jsonResp(
      { error: "forbidden", detail: `caller=${user.id} has no super_admin or hotel_admin for ${accommodation_id}` },
      403,
      cors,
    );
  }

  // Look up HotelCode
  const { data: cfg, error: cfgErr } = await admin
    .from("accommodation_hotelnabe_config")
    .select("hotelnabe_hotel_code")
    .eq("accommodation_id", accommodation_id)
    .maybeSingle();
  if (cfgErr || !cfg?.hotelnabe_hotel_code) {
    return jsonResp({ error: "hotelnabe_hotel_code_not_configured" }, 400, cors);
  }
  const hotelCode = String(cfg.hotelnabe_hotel_code);

  // Build messages
  const messages: AvailMessage[] = op_type === "booking_limit"
    ? [{
        kind: "booking_limit",
        start, end,
        invTypeCode: inv_type_code,
        bookingLimit: Number(booking_limit),
      }]
    : [{
        kind: "restriction",
        start, end,
        invTypeCode: inv_type_code,
        ratePlanCode: "-1",
        status: op_type === "open" ? "Open" : "Close",
      }];

  const echoToken = `LK-${crypto.randomUUID()}`;
  const requestXml = buildHotelnabeAvailNotifRQ({
    echoToken,
    hotelCode,
    requestorId: INBOUND_ID,
    password: INBOUND_PASSWORD,
    pmsName: PMS_ID,
    messages,
  });
  const requestXmlMasked = maskPasswordInXml(requestXml);

  let httpStatus = 0;
  let responseXml = "";
  let networkErr: string | null = null;
  let success = false;
  let errorMessage: string | null = null;
  let summary: any = { mode: PUSH_MODE, op_type, inv_type_code, start, end, booking_limit: booking_limit ?? null };

  if (PUSH_MODE === "live") {
    try {
      const resp = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/xml; charset=utf-8", "Accept": "application/xml" },
        body: requestXml,
      });
      httpStatus = resp.status;
      responseXml = await resp.text();
    } catch (e) {
      networkErr = (e as Error).message;
    }

    if (!networkErr && responseXml) {
      try {
        const parsed = parseHotelnabeAvailNotifRS(responseXml);
        success = httpStatus >= 200 && httpStatus < 300 && parsed.errors.length === 0;
        summary.echo_token_match = parsed.echoToken === echoToken;
        summary.remote_errors = parsed.errors;
        summary.remote_warnings = parsed.warnings;
        if (!success) errorMessage = parsed.errors[0]?.message || `HTTP ${httpStatus}`;
      } catch (e) {
        errorMessage = `parse_failed: ${(e as Error).message}`;
      }
    } else if (networkErr) {
      errorMessage = networkErr;
    }
  } else {
    // dryrun
    success = true;
    summary.dryrun = true;
    summary.endpoint = ENDPOINT;
  }

  const { data: logRow } = await admin
    .from("hotelnabe_push_log")
    .insert({
      accommodation_id,
      hotel_code: hotelCode,
      mode: PUSH_MODE === "live" ? "live" : "dryrun",
      op_type,
      echo_token: echoToken,
      request_xml: requestXmlMasked,
      response_xml: responseXml || null,
      http_status: httpStatus || null,
      success,
      error_message: errorMessage,
      summary,
    })
    .select("id")
    .single();

  return jsonResp(
    {
      success,
      mode: PUSH_MODE === "live" ? "live" : "dryrun",
      log_id: logRow?.id ?? null,
      http_status: httpStatus,
      echo_token: echoToken,
      request_xml_preview: requestXmlMasked,
      response_xml: responseXml || null,
      summary,
      error: errorMessage,
    },
    200,
    cors,
  );
});
