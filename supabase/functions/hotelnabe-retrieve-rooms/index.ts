// hotelnabe-retrieve-rooms
// Direction: 人客多 (PMS) → HotelNabe  (outbound, read-only)
// Endpoint: POST https://xml.hotelnabe.com.tw/pms/retrieveRoomOnly
//
// Admin-only manual trigger. Pulls HotelNabe room-type mapping for an accommodation
// and produces a comparison report against our `room_types.numeric_code`.
//
// Body: { "accommodation_id": "<uuid>" }
// Auth: caller must be super_admin or hotel_admin for that accommodation.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  buildHotelnabeAvailRQ,
  parseHotelnabeAvailRS,
  buildMappingReport,
  maskPasswordInXml,
} from "./xml.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_ID = Deno.env.get("HOTELNABE_INBOUND_ID") ?? "";
const INBOUND_PASSWORD = Deno.env.get("HOTELNABE_INBOUND_PASSWORD") ?? "";
const PMS_ID = Deno.env.get("HOTELNABE_PMS_ID") ?? "";

const HOTELNABE_BASE = Deno.env.get("HOTELNABE_BASE_URL") ?? "https://xml.hotelnabe.com.tw";
const ENDPOINT = `${HOTELNABE_BASE.replace(/\/+$/, "")}/pms/retrieveRoomOnly`;

function jsonResp(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return jsonResp({ error: "Method Not Allowed" }, 405, cors);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return jsonResp({ error: "missing_auth" }, 401, cors);

  if (!INBOUND_ID || !INBOUND_PASSWORD || !PMS_ID) {
    return jsonResp(
      {
        error: "missing_secrets",
        detail: "Required secrets: HOTELNABE_INBOUND_ID, HOTELNABE_INBOUND_PASSWORD, HOTELNABE_PMS_ID",
      },
      500,
      cors,
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify caller identity
  const { data: { user }, error: authErr } = await admin.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  if (authErr || !user) return jsonResp({ error: "invalid_session" }, 401, cors);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResp({ error: "invalid_json_body" }, 400, cors);
  }
  const accommodationId: string | undefined = body?.accommodation_id;
  if (!accommodationId) {
    return jsonResp({ error: "accommodation_id_required" }, 400, cors);
  }

  // Role check — query user_roles directly via service role
  // (do NOT use user_has_role RPC: it reads auth.uid() which is null under service_role)
  const { data: roleRows, error: roleErr } = await admin
    .from("user_roles")
    .select("role, accommodation_id")
    .eq("user_id", user.id);
  if (roleErr) {
    return jsonResp({ error: "role_query_failed", detail: roleErr.message }, 500, cors);
  }
  const allowed = (roleRows ?? []).some((r: any) =>
    r.role === "super_admin" ||
    (r.role === "hotel_admin" && r.accommodation_id === accommodationId)
  );
  if (!allowed) {
    return jsonResp(
      { error: "forbidden", detail: `caller=${user.id} has no super_admin or hotel_admin for ${accommodationId}` },
      403,
      cors,
    );
  }

  // Look up HotelNabe HotelCode + our room types
  const { data: cfg, error: cfgErr } = await admin
    .from("accommodation_hotelnabe_config")
    .select("hotelnabe_hotel_code")
    .eq("accommodation_id", accommodationId)
    .maybeSingle();
  if (cfgErr || !cfg?.hotelnabe_hotel_code) {
    return jsonResp({ error: "hotelnabe_hotel_code_not_configured" }, 400, cors);
  }
  const hotelCode = String(cfg.hotelnabe_hotel_code);

  const { data: ourRooms, error: roomsErr } = await admin
    .from("room_types")
    .select("id, name, numeric_code")
    .eq("accommodation_id", accommodationId);
  if (roomsErr) return jsonResp({ error: "room_types_query_failed", detail: roomsErr.message }, 500, cors);

  // Build outbound RQ
  const echoToken = `LK-${crypto.randomUUID()}`;
  const requestXml = buildHotelnabeAvailRQ({
    echoToken,
    hotelCode,
    requestorId: INBOUND_ID,
    password: INBOUND_PASSWORD,
    pmsName: PMS_ID,
  });
  const requestXmlMasked = maskPasswordInXml(requestXml);

  // Call HotelNabe
  let httpStatus = 0;
  let responseXml = "";
  let networkErr: string | null = null;
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

  // Parse RS + build report (if we got XML back)
  let report: unknown = null;
  let success = false;
  let errorMessage: string | null = networkErr;
  let echoTokenMatch = false;

  if (!networkErr && responseXml) {
    try {
      const parsed = parseHotelnabeAvailRS(responseXml);
      echoTokenMatch = parsed.echoToken === echoToken;
      const mapping = buildMappingReport(
        parsed.rooms,
        (ourRooms ?? []).map(r => ({
          id: String(r.id),
          name: String(r.name ?? ""),
          numeric_code: r.numeric_code != null ? Number(r.numeric_code) : null,
        })),
      );
      report = {
        echo_token_sent: echoToken,
        echo_token_received: parsed.echoToken,
        echo_token_match: echoTokenMatch,
        remote_errors: parsed.errors,
        mapping,
      };
      success = httpStatus >= 200 && httpStatus < 300 && parsed.errors.length === 0;
      if (!success && !errorMessage) {
        errorMessage = parsed.errors[0]?.message || `HTTP ${httpStatus}`;
      }
    } catch (e) {
      errorMessage = `parse_failed: ${(e as Error).message}`;
    }
  }

  // Persist log
  const { data: logRow } = await admin
    .from("hotelnabe_retrieve_log")
    .insert({
      accommodation_id: accommodationId,
      hotel_code: hotelCode,
      echo_token: echoToken,
      request_xml: requestXmlMasked,
      response_xml: responseXml || null,
      http_status: httpStatus || null,
      report,
      success,
      error_message: errorMessage,
    })
    .select("id")
    .single();

  return jsonResp(
    {
      success,
      log_id: logRow?.id ?? null,
      http_status: httpStatus,
      echo_token: echoToken,
      report,
      error: errorMessage,
    },
    success ? 200 : 200, // always 200; payload carries success flag for UI/CLI
    cors,
  );
});
