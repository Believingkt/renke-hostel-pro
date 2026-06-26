// HotelNabe → 人客多 inbound receiver
// verify_jwt = false (auth is in XML body)
// Default mode: dryrun (no orders upsert; only parse + log + RS)
//
// This module is INDEPENDENT from owlting-order-push.
// Do NOT import or share code with the sending side.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseHotelnabeResNotifRQ,
  buildHotelnabeResNotifRS,
  maskPasswordInXml,
  isOlderThan,
  type ParsedReservation,
  type RSErrorItem,
  type RSSuccessItem,
} from "./xml.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INBOUND_ID = Deno.env.get("HOTELNABE_INBOUND_ID") ?? "";
const INBOUND_PASSWORD = Deno.env.get("HOTELNABE_INBOUND_PASSWORD") ?? "";
const MODE = (Deno.env.get("HOTELNABE_INBOUND_MODE") ?? "dryrun").toLowerCase();

function xmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders, Allow: "POST" },
    });
  }

  const ctype = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ctype.includes("xml")) {
    const rs = buildHotelnabeResNotifRS({
      echoToken: null,
      errors: [{ type: "3", code: "450", message: `Unsupported Content-Type: ${ctype}` }],
    });
    return xmlResponse(rs, 200);
  }

  const rawXml = await req.text();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const env = parseHotelnabeResNotifRQ(rawXml);

  // Envelope-level parse failure
  if (env.rootError) {
    const rs = buildHotelnabeResNotifRS({
      echoToken: env.echoToken,
      errors: [env.rootError],
    });
    await writeLog(admin, {
      echo_token: env.echoToken,
      hotelnabe_hotel_code: null,
      hotelnabe_res_id: null,
      ota_code: null,
      ota_res_id: null,
      res_status: null,
      request_xml: maskPasswordInXml(rawXml),
      response_xml: rs,
      http_status: 200,
      success: false,
      error_message: env.rootError.message,
      mode: MODE,
      parsed_order_id: null,
    });
    return xmlResponse(rs, 200);
  }

  // Auth check — XML body credentials
  if (
    !INBOUND_ID || !INBOUND_PASSWORD ||
    env.posId !== INBOUND_ID || env.posPassword !== INBOUND_PASSWORD
  ) {
    const err: RSErrorItem = {
      type: "4",
      code: "497", // Authentication failed
      message: "Authentication failed",
    };
    const rs = buildHotelnabeResNotifRS({ echoToken: env.echoToken, errors: [err] });
    await writeLog(admin, {
      echo_token: env.echoToken,
      hotelnabe_hotel_code: null,
      hotelnabe_res_id: null,
      ota_code: null,
      ota_res_id: null,
      res_status: null,
      request_xml: maskPasswordInXml(rawXml),
      response_xml: rs,
      http_status: 200,
      success: false,
      error_message: "auth_failed",
      mode: MODE,
      parsed_order_id: null,
    });
    return xmlResponse(rs, 200);
  }

  // Per-reservation processing
  const failureErrors: RSErrorItem[] = [];
  const successes: RSSuccessItem[] = [];

  for (const r of env.reservations) {
    try {
      const result = await processReservation(admin, r, rawXml);
      if (result.ok) {
        successes.push({ recordId: r.recordId, uniqueId: result.uniqueId });
      } else {
        failureErrors.push({
          type: result.errorType,
          code: result.errorCode,
          message: result.errorMessage,
          recordId: r.recordId,
        });
      }
    } catch (e) {
      const msg = (e as Error).message ?? "unknown";
      failureErrors.push({
        type: "3",
        code: "450",
        message: `Internal error: ${msg}`,
        recordId: r.recordId,
      });
      await writeLog(admin, {
        echo_token: env.echoToken,
        hotelnabe_hotel_code: r.hotelCode,
        hotelnabe_res_id: r.hotelnabeResId,
        ota_code: r.otaCode,
        ota_res_id: r.otaResId,
        res_status: r.resStatus,
        request_xml: maskPasswordInXml(rawXml),
        response_xml: null,
        http_status: 200,
        success: false,
        error_message: msg,
        mode: MODE,
        parsed_order_id: null,
      });
    }
  }

  // Per spec: any failure in batch → entire batch returns Errors (only failed records).
  const rs = failureErrors.length
    ? buildHotelnabeResNotifRS({ echoToken: env.echoToken, errors: failureErrors })
    : buildHotelnabeResNotifRS({ echoToken: env.echoToken, successes });

  return xmlResponse(rs, 200);
});

// ─── Reservation processing ─────────────────────────────────────────

interface ProcessOk { ok: true; uniqueId?: string }
interface ProcessFail { ok: false; errorType: string; errorCode: string; errorMessage: string }
type ProcessResult = ProcessOk | ProcessFail;

async function processReservation(
  admin: ReturnType<typeof createClient>,
  r: ParsedReservation,
  rawXml: string,
): Promise<ProcessResult> {
  // 1) HotelCode → accommodation_id
  if (!r.hotelCode) {
    await writeLog(admin, baseLog(r, rawXml, false, "missing hotel_code"));
    return { ok: false, errorType: "3", errorCode: "392", errorMessage: "Missing HotelCode" };
  }

  const { data: cfg, error: cfgErr } = await admin
    .from("accommodation_hotelnabe_config")
    .select("accommodation_id, inbound_enabled, hotelnabe_hotel_code")
    .eq("hotelnabe_hotel_code", r.hotelCode)
    .maybeSingle();

  if (cfgErr) {
    await writeLog(admin, baseLog(r, rawXml, false, `cfg query error: ${cfgErr.message}`));
    return { ok: false, errorType: "3", errorCode: "450", errorMessage: cfgErr.message };
  }
  if (!cfg) {
    await writeLog(admin, baseLog(r, rawXml, false, "hotel_code_not_mapped"));
    return {
      ok: false, errorType: "3", errorCode: "392",
      errorMessage: `HotelCode ${r.hotelCode} not mapped`,
    };
  }

  // 2) channel_manager + inbound_enabled gate
  const { data: acc } = await admin
    .from("accommodation_info")
    .select("id, channel_manager")
    .eq("id", cfg.accommodation_id)
    .maybeSingle();

  const channelOk = acc?.channel_manager === "hotelnabe";
  const enabled = !!cfg.inbound_enabled;
  const wouldPersist = channelOk && enabled;

  // 3) Room type lookup
  if (r.roomTypeCode == null) {
    await writeLog(admin, baseLog(r, rawXml, false, "missing_room_type_code", cfg.accommodation_id));
    return { ok: false, errorType: "3", errorCode: "402", errorMessage: "Missing RoomTypeCode" };
  }
  const { data: rt } = await admin
    .from("room_types")
    .select("id, name, numeric_code, accommodation_id")
    .eq("accommodation_id", cfg.accommodation_id)
    .eq("numeric_code", r.roomTypeCode)
    .maybeSingle();
  if (!rt) {
    await writeLog(admin, baseLog(
      r, rawXml, false,
      `room_type_not_found: ${r.roomTypeCode}`, cfg.accommodation_id,
    ));
    return {
      ok: false, errorType: "3", errorCode: "402",
      errorMessage: `RoomTypeCode ${r.roomTypeCode} not mapped`,
    };
  }

  // 4) Rate plan lookup (0 = none)
  let pkg: { id: string; numeric_code: number | null; name: string } | null = null;
  if (r.ratePlanCode != null && r.ratePlanCode !== 0) {
    const { data: pkgRow } = await admin
      .from("accommodation_packages")
      .select("id, numeric_code, name, accommodation_id")
      .eq("accommodation_id", cfg.accommodation_id)
      .eq("numeric_code", r.ratePlanCode)
      .maybeSingle();
    pkg = pkgRow ?? null;
    // Per spec: rate plan unknown is non-fatal? Spec says "對不到回 402" only for room type.
    // For rate plan, fall back silently (no package binding).
  }

  // 5) idempotency / staleness check
  if (r.hotelnabeResId) {
    const { data: existing } = await admin
      .from("orders")
      .select("id, hotelnabe_last_modify")
      .eq("hotelnabe_res_id", r.hotelnabeResId)
      .maybeSingle();
    if (
      existing && r.lastModifyDateTime &&
      isOlderThan(r.lastModifyDateTime, existing.hotelnabe_last_modify)
    ) {
      await writeLog(admin, baseLog(
        r, rawXml, true,
        "stale_skipped",
        cfg.accommodation_id, existing.id,
      ));
      return { ok: true, uniqueId: existing.id };
    }
  }

  // 6) Build payload (always, for log visibility), but in dryrun do NOT upsert.
  const payload = buildOrderPayload({
    reservation: r,
    accommodationId: cfg.accommodation_id,
    roomTypeId: rt.id,
    packageId: pkg?.id ?? null,
  });

  if (MODE !== "live" || !wouldPersist) {
    await writeLog(admin, {
      ...baseLog(
        r, rawXml, true,
        wouldPersist
          ? "dryrun_parsed_ok"
          : `skipped: channel_manager=${acc?.channel_manager ?? "n/a"} inbound_enabled=${enabled}`,
        cfg.accommodation_id,
      ),
      // surface intended payload for audit
      error_message: null,
    });
    return { ok: true };
  }

  // 7) Live mode — call upsert (not exercised in dryrun)
  const orderId = await upsertHotelnabeOrder(admin, payload);
  await writeLog(admin, baseLog(
    r, rawXml, true, "upserted", cfg.accommodation_id, orderId,
  ));
  return { ok: true, uniqueId: orderId ?? undefined };
}

// ─── Order payload + upsert (scaffold — NOT called in dryrun) ───────

interface BuildPayloadInput {
  reservation: ParsedReservation;
  accommodationId: string;
  roomTypeId: string;
  packageId: string | null;
}

export function buildOrderPayload(input: BuildPayloadInput) {
  const r = input.reservation;
  const status = r.resStatus === "Cancel" ? "cancelled" : "confirmed";
  return {
    order_source: "hotelnabe" as const,
    hotelnabe_res_id: r.hotelnabeResId,
    hotelnabe_last_modify: r.lastModifyDateTime,
    hotelnabe_sync_state: {
      ota_code: r.otaCode,
      ota_res_id: r.otaResId,
      res_status: r.resStatus,
      currency: r.currency,
      tax_amount: r.taxAmount,
    },
    accommodation_id: input.accommodationId,
    room_type_id: input.roomTypeId,
    package_id: input.packageId,
    check_in_date: r.checkIn,
    check_out_date: r.checkOut,
    guests: r.adults + r.children,
    adults: r.adults,
    children: r.children,
    final_price: r.amountAfterTax,
    customer_name: r.guestName,
    customer_phone: r.guestPhone,
    customer_email: r.guestEmail,
    status,
  };
}

/**
 * Idempotent upsert by hotelnabe_res_id.
 * STUB — kept for live mode wiring in a later step.
 */
export async function upsertHotelnabeOrder(
  _admin: ReturnType<typeof createClient>,
  _payload: ReturnType<typeof buildOrderPayload>,
): Promise<string | null> {
  // Intentionally not implemented in this step.
  // Live wiring will: upsert into public.orders on hotelnabe_res_id with order_source='hotelnabe',
  // skip if existing.hotelnabe_last_modify is newer.
  throw new Error("upsertHotelnabeOrder not implemented in dryrun step");
}

// ─── Logging ────────────────────────────────────────────────────────

type LogRow = {
  echo_token: string | null;
  hotelnabe_hotel_code: string | null;
  hotelnabe_res_id: string | null;
  ota_code: string | null;
  ota_res_id: string | null;
  res_status: string | null;
  request_xml: string | null;
  response_xml: string | null;
  http_status: number | null;
  success: boolean | null;
  error_message: string | null;
  mode: string | null;
  parsed_order_id: string | null;
};

function baseLog(
  r: ParsedReservation,
  rawXml: string,
  success: boolean,
  message: string | null,
  _accommodationId?: string,
  parsedOrderId: string | null = null,
): LogRow {
  return {
    echo_token: null, // filled by writeLog if we add envelope later
    hotelnabe_hotel_code: r.hotelCode,
    hotelnabe_res_id: r.hotelnabeResId,
    ota_code: r.otaCode,
    ota_res_id: r.otaResId,
    res_status: r.resStatus,
    request_xml: maskPasswordInXml(rawXml),
    response_xml: null,
    http_status: 200,
    success,
    error_message: message,
    mode: MODE,
    parsed_order_id: parsedOrderId,
  };
}

async function writeLog(
  admin: ReturnType<typeof createClient>,
  row: LogRow,
): Promise<void> {
  try {
    await admin.from("hotelnabe_order_inbound_log").insert(row);
  } catch (e) {
    console.error("[hotelnabe-receiver] log insert failed:", (e as Error).message);
  }
}
