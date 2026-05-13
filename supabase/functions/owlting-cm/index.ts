/**
 * owlting-cm — OwlTing Channel Manager SOAP Inbound Endpoint
 *
 * Single endpoint dispatching by SOAP root element:
 *   - OTA_HotelAvailRQ          -> Return AR ID (room types & rate plans)
 *   - OTA_HotelAvailNotifRQ     -> Update inventory / room lock / rate plan lock
 *   - OTA_HotelRateAmountNotifRQ-> Update rate plan prices
 *   - OTA_HotelResNotifRQ       -> Receive reservation (Commit / Modify / Cancel)
 *
 * WS-Security UsernameToken auth — single shared OwlTing service account
 * (owlting_service_accounts). Individual property credentials are no longer used.
 * HotelCode is still mapped to a property via owlting_credentials.hotel_code.
 *
 * Code mapping (numeric, auto-assigned, starting at 1001):
 *   HotelCode    = owlting_credentials.hotel_code
 *   RoomTypeCode = room_types.numeric_code           (e.g. "1001")
 *   RatePlanCode = pricing_templates.numeric_code    (e.g. "1001")
 *   InvTypeCode  = same as RoomTypeCode
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOAP_HEADERS = { "Content-Type": "text/xml; charset=utf-8" };
const OTA_NS = "http://www.opentravel.org/OTA/2003/05";

// ------------- helpers -------------
function nowIso(): string {
  return new Date().toISOString();
}

function xmlEscape(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Body>${body}</SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

function errorResponse(rootName: string, echoToken: string, message: string, status = 200): Response {
  const body = `<${rootName} xmlns="${OTA_NS}" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${xmlEscape(echoToken)}">
  <Errors><Error Type="13" Code="450">${xmlEscape(message)}</Error></Errors>
</${rootName}>`;
  return new Response(soapEnvelope(body), { status, headers: SOAP_HEADERS });
}

function successResponse(rootName: string, echoToken: string, extraInner = ""): Response {
  const body = `<${rootName} xmlns="${OTA_NS}" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${xmlEscape(echoToken)}">
  <Success/>${extraInner}
</${rootName}>`;
  return new Response(soapEnvelope(body), { status: 200, headers: SOAP_HEADERS });
}

// crude single-attr extractor; fine for known OTA structure
function attrAll(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`, "g");
  const out: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}
function attrFirst(xml: string, tag: string, attr: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]*)"`).exec(xml);
  return m ? m[1] : null;
}
function rootName(xml: string): string | null {
  const m = /<([A-Za-z_][\w:]*)\b/.exec(xml.replace(/<\?xml[^?]*\?>/, "").replace(/<!--[\s\S]*?-->/g, ""));
  // skip envelope: find first OTA_*
  const m2 = /<(OTA_\w+RQ)\b/.exec(xml);
  return m2 ? m2[1] : (m ? m[1] : null);
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractEcho(xml: string): string {
  return attrFirst(xml, "OTA_\\w+RQ", "EchoToken") ?? "";
}

// extract username/password from WS-Security
function extractWsse(xml: string): { username: string | null; password: string | null } {
  const u = /<wsse:Username(?:\s[^>]*)?>([\s\S]*?)<\/wsse:Username>/.exec(xml)
        ?? /<Username(?:\s[^>]*)?>([\s\S]*?)<\/Username>/.exec(xml);
  const p = /<wsse:Password(?:\s[^>]*)?>([\s\S]*?)<\/wsse:Password>/.exec(xml)
        ?? /<Password(?:\s[^>]*)?>([\s\S]*?)<\/Password>/.exec(xml);
  return { username: u ? u[1].trim() : null, password: p ? p[1].trim() : null };
}

// split repeated tags (greedy minimal)
function splitTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "g");
  return xml.match(re) ?? [];
}
// also self-closing
function splitTagsAny(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`, "g");
  return xml.match(re) ?? [];
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function genOrderNumber(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// resolve RoomTypeCode (numeric, e.g. "1001") -> room_types
async function resolveRoomType(supabase: any, accId: string, code: string): Promise<{ id: string; name: string } | null> {
  if (!code) return null;
  const num = parseInt(code, 10);
  if (!Number.isFinite(num)) return null;
  const { data } = await supabase
    .from("room_types")
    .select("id,name")
    .eq("accommodation_id", accId)
    .eq("numeric_code", num)
    .maybeSingle();
  return data ?? null;
}
async function resolveRatePlan(supabase: any, accId: string, code: string): Promise<{ id: string; template_name: string; room_type_id: string | null } | null> {
  if (!code) return null;
  const num = parseInt(code, 10);
  if (!Number.isFinite(num)) return null;
  const { data } = await supabase
    .from("pricing_templates")
    .select("id,template_name,room_type_id")
    .eq("accommodation_id", accId)
    .eq("numeric_code", num)
    .maybeSingle();
  return data ?? null;
}

async function logCm(
  supabase: any,
  direction: "inbound" | "outbound",
  apiMethod: string,
  hotelCode: string | null,
  accommodationId: string | null,
  echoToken: string,
  request: string,
  response: string,
  status: "success" | "error",
  errorMessage?: string,
) {
  try {
    await supabase.from("owlting_cm_logs").insert({
      direction, api_method: apiMethod, hotel_code: hotelCode,
      accommodation_id: accommodationId, echo_token: echoToken,
      request_payload: request.slice(0, 50000),
      response_payload: response.slice(0, 50000),
      status, error_message: errorMessage ?? null,
    });
  } catch (_) { /* ignore log failure */ }
}

// ============== Auth ==============
type AuthOverride = { accommodationId: string; hotelCode: string } | null;

async function authenticate(
  supabase: any,
  xml: string,
  hotelCode: string | null,
  override?: AuthOverride,
) {
  if (override) {
    if (hotelCode && override.hotelCode !== hotelCode) {
      return { ok: false, msg: `HotelCode ${hotelCode} does not match override` };
    }
    return { ok: true, accommodationId: override.accommodationId, hotelCode: override.hotelCode };
  }

  // 1. Validate WS-Security UsernameToken against the shared OwlTing service account
  const { username, password } = extractWsse(xml);
  if (!username || !password) return { ok: false, msg: "Missing WS-Security UsernameToken" };

  const { data: ok, error: rpcErr } = await supabase.rpc("verify_owlting_service_account", {
    p_username: username,
    p_password: password,
  });
  if (rpcErr || !ok) return { ok: false, msg: "Invalid service account credentials" };

  // 2. Resolve HotelCode -> accommodation_id (still per-property mapping)
  if (!hotelCode) return { ok: false, msg: "Missing HotelCode" };
  const { data: prop } = await supabase
    .from("owlting_credentials")
    .select("accommodation_id, hotel_code, is_active")
    .eq("hotel_code", hotelCode)
    .maybeSingle();
  if (!prop || !prop.is_active) return { ok: false, msg: `HotelCode ${hotelCode} not registered` };

  return { ok: true, accommodationId: prop.accommodation_id, hotelCode: prop.hotel_code };
}

// ============== Handlers ==============

async function handleAvailRQ(supabase: any, xml: string, echo: string, override?: AuthOverride): Promise<Response> {
  const hotelCode = attrFirst(xml, "HotelRef", "HotelCode");
  const auth = await authenticate(supabase, xml, hotelCode, override);
  if (!auth.ok) return errorResponse("OTA_HotelAvailRS", echo, auth.msg);

  const { data: rooms } = await supabase
    .from("room_types")
    .select("id,name,numeric_code")
    .eq("accommodation_id", auth.accommodationId)
    .order("display_order", { ascending: true });

  const { data: templates } = await supabase
    .from("pricing_templates")
    .select("id,template_name,room_type_id,numeric_code")
    .eq("accommodation_id", auth.accommodationId);

  const stays = (rooms ?? []).map((r: any) => {
    const plans = (templates ?? []).filter((t: any) => !t.room_type_id || t.room_type_id === r.id);
    const planXml = plans.map((p: any) =>
      `<RatePlan RatePlanCode="${p.numeric_code}"><RatePlanDescription Name="${xmlEscape(p.template_name)}"/></RatePlan>`,
    ).join("");
    return `<RoomStay>
      <RoomTypes><RoomType RoomTypeCode="${r.numeric_code}"><RoomDescription Name="${xmlEscape(r.name)}"/></RoomType></RoomTypes>
      <RatePlans>${planXml}</RatePlans>
    </RoomStay>`;
  }).join("");

  const body = `<OTA_HotelAvailRS xmlns="${OTA_NS}" Version="1.0" TimeStamp="${nowIso()}" EchoToken="${xmlEscape(echo)}">
    <Success/>
    <RoomStays>${stays}</RoomStays>
  </OTA_HotelAvailRS>`;
  const resp = soapEnvelope(body);
  await logCm(supabase, "inbound", "OTA_HotelAvailRQ", auth.hotelCode, auth.accommodationId, echo, xml, resp, "success");
  return new Response(resp, { headers: SOAP_HEADERS });
}

async function handleAvailNotifRQ(supabase: any, xml: string, echo: string, override?: AuthOverride): Promise<Response> {
  const hotelCode = attrFirst(xml, "AvailStatusMessages", "HotelCode");
  const auth = await authenticate(supabase, xml, hotelCode, override);
  if (!auth.ok) return errorResponse("OTA_HotelAvailNotifRS", echo, auth.msg);

  const messages = splitTags(xml, "AvailStatusMessage");
  for (const msg of messages) {
    const ctl = /<StatusApplicationControl\b[^>]*>/.exec(msg)?.[0] ?? "";
    const start = attrFirst(ctl, "StatusApplicationControl", "Start");
    const end = attrFirst(ctl, "StatusApplicationControl", "End");
    const invCode = attrFirst(ctl, "StatusApplicationControl", "InvTypeCode");
    const ratePlanCode = attrFirst(ctl, "StatusApplicationControl", "RatePlanCode");
    const bookingLimit = attrFirst(msg, "AvailStatusMessage", "BookingLimit");
    const restrictionStatus = attrFirst(msg, "RestrictionStatus", "Status"); // Open/Close

    if (!start || !end || !invCode) continue;
    const room = await resolveRoomType(supabase, auth.accommodationId!, invCode);
    if (!room) {
      const r = errorResponse("OTA_HotelAvailNotifRS", echo, `RoomType ${invCode} not found`);
      await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error", `RoomType ${invCode} not found`);
      return r;
    }

    const dates = dateRange(start, end);

    if (ratePlanCode) {
      // 方案鎖
      const plan = await resolveRatePlan(supabase, auth.accommodationId!, ratePlanCode);
      if (!plan) {
        const r = errorResponse("OTA_HotelAvailNotifRS", echo, `RatePlan ${ratePlanCode} not found`);
        await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error");
        return r;
      }
      if (restrictionStatus) {
        const isClosed = restrictionStatus.toLowerCase() === "close";
        const rows = dates.map((d) => ({ template_id: plan.id, date: d, is_closed: isClosed, updated_at: new Date().toISOString() }));
        await supabase.from("pricing_template_availability").upsert(rows);
      }
    } else {
      // 房間鎖 + 庫存
      for (const d of dates) {
        const patch: any = {};
        if (bookingLimit !== null) patch.available_rooms = parseInt(bookingLimit, 10);
        if (restrictionStatus) patch.is_available = restrictionStatus.toLowerCase() === "open";
        if (Object.keys(patch).length === 0) continue;
        // upsert (room_type_id, date) where pricing_template_id IS NULL
        const { data: existing } = await supabase
          .from("room_inventory_pricing")
          .select("id, price")
          .eq("room_type_id", room.id).eq("date", d)
          .is("pricing_template_id", null).maybeSingle();
        if (existing) {
          await supabase.from("room_inventory_pricing").update(patch).eq("id", existing.id);
        } else {
          // insert needs price NOT NULL — fall back to base_price
          const { data: rt } = await supabase.from("room_types").select("base_price").eq("id", room.id).single();
          await supabase.from("room_inventory_pricing").insert({
            room_type_id: room.id, date: d,
            price: rt?.base_price ?? 0,
            available_rooms: patch.available_rooms ?? 0,
            is_available: patch.is_available ?? true,
          });
        }
      }
    }
  }

  const resp = successResponse("OTA_HotelAvailNotifRS", echo);
  await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await resp.clone().text(), "success");
  return resp;
}

async function handleRateAmountNotifRQ(supabase: any, xml: string, echo: string, override?: AuthOverride): Promise<Response> {
  const hotelCode = attrFirst(xml, "RateAmountMessages", "HotelCode");
  const auth = await authenticate(supabase, xml, hotelCode, override);
  if (!auth.ok) return errorResponse("OTA_HotelRateAmountNotifRS", echo, auth.msg);

  const messages = splitTags(xml, "RateAmountMessage");
  for (const msg of messages) {
    const ctl = /<StatusApplicationControl\b[^>]*\/>|<StatusApplicationControl\b[^>]*>/.exec(msg)?.[0] ?? "";
    const invCode = attrFirst(ctl, "StatusApplicationControl", "InvTypeCode");
    const ratePlanCode = attrFirst(ctl, "StatusApplicationControl", "RatePlanCode");
    if (!invCode) continue;

    const room = await resolveRoomType(supabase, auth.accommodationId!, invCode);
    if (!room) {
      const r = errorResponse("OTA_HotelRateAmountNotifRS", echo, `RoomType ${invCode} not found`);
      await logCm(supabase, "inbound", "OTA_HotelRateAmountNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error");
      return r;
    }
    const plan = ratePlanCode ? await resolveRatePlan(supabase, auth.accommodationId!, ratePlanCode) : null;

    const rates = splitTagsAny(msg, "Rate");
    for (const rt of rates) {
      const start = attrFirst(rt, "Rate", "Start");
      const end = attrFirst(rt, "Rate", "End");
      const amount = attrFirst(rt, "BaseByGuestAmt", "AmountAfterTax");
      if (!start || !end || amount === null) continue;
      const price = Math.round(parseFloat(amount));
      const dates = dateRange(start, end);

      for (const d of dates) {
        const matchTemplateId = plan?.id ?? null;
        const query = supabase.from("room_inventory_pricing")
          .select("id")
          .eq("room_type_id", room.id).eq("date", d);
        const { data: existing } = matchTemplateId
          ? await query.eq("pricing_template_id", matchTemplateId).maybeSingle()
          : await query.is("pricing_template_id", null).maybeSingle();

        if (existing) {
          await supabase.from("room_inventory_pricing").update({ price }).eq("id", existing.id);
        } else {
          await supabase.from("room_inventory_pricing").insert({
            room_type_id: room.id, date: d, price,
            pricing_template_id: matchTemplateId,
            available_rooms: 0, is_available: true,
          });
        }
      }
    }
  }

  const resp = successResponse("OTA_HotelRateAmountNotifRS", echo);
  await logCm(supabase, "inbound", "OTA_HotelRateAmountNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await resp.clone().text(), "success");
  return resp;
}

async function handleResNotifRQ(supabase: any, xml: string, echo: string, override?: AuthOverride): Promise<Response> {
  const resStatus = attrFirst(xml, "OTA_HotelResNotifRQ", "ResStatus") ?? "Commit"; // Commit / Modify / Cancel
  const hotelCode = attrFirst(xml, "BasicPropertyInfo", "HotelCode");
  const auth = await authenticate(supabase, xml, hotelCode, override);
  if (!auth.ok) return errorResponse("OTA_HotelResNotifRS", echo, auth.msg);

  const reservations = splitTags(xml, "HotelReservation");
  if (reservations.length === 0) return errorResponse("OTA_HotelResNotifRS", echo, "No HotelReservation found");

  const successItems: string[] = [];
  for (const r of reservations) {
    // 訂單編號 (UniqueID @ID,排除 BasicPropertyInfo)
    const uniqueId = attrFirst(r, "UniqueID", "ID") ?? "";
    const otaName = (/<CompanyName>([\s\S]*?)<\/CompanyName>/.exec(r)?.[1] ?? "").trim();
    const roomStay = splitTags(r, "RoomStay")[0] ?? "";
    const roomRate = /<RoomRate\b[^>]*>/.exec(roomStay)?.[0] ?? "";
    const roomTypeCode = attrFirst(roomRate, "RoomRate", "RoomTypeCode") ?? attrFirst(roomStay, "RoomType", "RoomTypeCode");
    const ratePlanCode = attrFirst(roomRate, "RoomRate", "RatePlanCode");
    const numUnits = parseInt(attrFirst(roomRate, "RoomRate", "NumberOfUnits") ?? "1", 10);
    const checkIn = attrFirst(roomStay, "TimeSpan", "Start");
    const checkOut = attrFirst(roomStay, "TimeSpan", "End");
    const totalAmount = parseFloat(
      attrFirst(roomStay, "Total", "AmountAfterTax")
      ?? (/<ResGlobalInfo>[\s\S]*?<Total\b[^>]*AmountAfterTax="([^"]+)"/.exec(r)?.[1] ?? "0"),
    );

    // 客人計數
    const adults = (() => {
      const counts = splitTagsAny(roomStay, "GuestCount");
      let n = 0;
      for (const c of counts) {
        const code = attrFirst(c, "GuestCount", "AgeQualifyingCode");
        const cnt = parseInt(attrFirst(c, "GuestCount", "Count") ?? "0", 10);
        if (code === "10") n += cnt;
      }
      return n || 2;
    })();

    // 訂購人
    const purchaserGiven = (/<ResGlobalInfo>[\s\S]*?<GivenName>([\s\S]*?)<\/GivenName>/.exec(r)?.[1] ?? "").trim();
    const purchaserSur = (/<ResGlobalInfo>[\s\S]*?<Surname>([\s\S]*?)<\/Surname>/.exec(r)?.[1] ?? "").trim();
    const purchaserPhone = attrFirst(/<ResGlobalInfo>[\s\S]*?<Telephone\b[^>]*>/.exec(r)?.[0] ?? "", "Telephone", "PhoneNumber") ?? "";
    const purchaserEmail = (/<ResGlobalInfo>[\s\S]*?<Email>([\s\S]*?)<\/Email>/.exec(r)?.[1] ?? "").trim();

    // 特殊需求
    const requests = attrAll(roomStay, "SpecialRequest", "Name").join("; ");

    // ----- handle by ResStatus -----
    if (resStatus === "Cancel") {
      await supabase.from("orders")
        .update({ order_status: "cancelled" })
        .eq("owlting_reservation_id", uniqueId);
      successItems.push(uniqueIdItem(uniqueId, ""));
      continue;
    }

    // resolve room type
    const room = roomTypeCode ? await resolveRoomType(supabase, auth.accommodationId!, roomTypeCode) : null;
    if (!room || !checkIn || !checkOut) {
      const r2 = errorResponse("OTA_HotelResNotifRS", echo, `Invalid room or dates for reservation ${uniqueId}`);
      await logCm(supabase, "inbound", "OTA_HotelResNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r2.clone().text(), "error");
      return r2;
    }

    if (resStatus === "Modify") {
      const { data: existing } = await supabase.from("orders")
        .select("id, order_number")
        .eq("owlting_reservation_id", uniqueId).maybeSingle();
      if (existing) {
        await supabase.from("orders").update({
          room_type_id: room.id,
          check_in_date: checkIn, check_out_date: checkOut,
          guest_count: adults,
          total_price: Math.round(totalAmount),
          final_price: Math.round(totalAmount),
          guest_name: `${purchaserSur}${purchaserGiven}`.trim() || "OwlTing Guest",
          guest_phone: purchaserPhone || "0000000000",
          guest_email: purchaserEmail || null,
          notes: requests || null,
          ota_channel: otaName || null,
        }).eq("id", existing.id);
        successItems.push(uniqueIdItem(uniqueId, existing.order_number));
        continue;
      }
      // fallthrough -> insert as new
    }

    // Commit (or Modify-as-new)
    // 重複檢查
    const { data: dup } = await supabase.from("orders")
      .select("id, order_number")
      .eq("owlting_reservation_id", uniqueId).maybeSingle();
    if (dup) {
      successItems.push(uniqueIdItem(uniqueId, dup.order_number));
      continue;
    }

    const orderNumber = genOrderNumber();
    const { data: ins, error: insErr } = await supabase.from("orders").insert({
      order_number: orderNumber,
      accommodation_id: auth.accommodationId,
      room_type_id: room.id,
      check_in_date: checkIn,
      check_out_date: checkOut,
      guest_count: adults,
      guest_name: `${purchaserSur}${purchaserGiven}`.trim() || "OwlTing Guest",
      guest_phone: purchaserPhone || "0000000000",
      guest_email: purchaserEmail || null,
      total_price: Math.round(totalAmount),
      final_price: Math.round(totalAmount),
      payment_status: "paid",
      paid_amount: Math.round(totalAmount),
      order_status: "pending",
      order_source: "owlting",
      ota_channel: otaName || null,
      owlting_reservation_id: uniqueId,
      notes: requests || null,
    }).select("id, order_number").single();

    if (insErr) {
      const r2 = errorResponse("OTA_HotelResNotifRS", echo, `Failed to create order: ${insErr.message}`);
      await logCm(supabase, "inbound", "OTA_HotelResNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r2.clone().text(), "error", insErr.message);
      return r2;
    }
    successItems.push(uniqueIdItem(uniqueId, ins!.order_number));

    // multi-room (NumberOfUnits > 1) — write order_rooms
    if (numUnits > 1) {
      try {
        await supabase.from("order_rooms").insert({
          order_id: ins!.id, room_type_id: room.id, quantity: numUnits,
        });
      } catch (_) { /* ignore if table differs */ }
    }
  }

  const inner = `<HotelReservations>${successItems.join("")}</HotelReservations>`;
  const resp = successResponse("OTA_HotelResNotifRS", echo, inner);
  await logCm(supabase, "inbound", "OTA_HotelResNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await resp.clone().text(), "success");
  return resp;
}

function uniqueIdItem(otaUniqueId: string, ourOrderNumber: string): string {
  return `<HotelReservation>
    <UniqueID Type="14" ID="${xmlEscape(otaUniqueId)}"/>
    <ResGlobalInfo>
      <HotelReservationIDs>
        <HotelReservationID ResID_Type="14" ResID_Value="${xmlEscape(ourOrderNumber)}"/>
      </HotelReservationIDs>
    </ResGlobalInfo>
  </HotelReservation>`;
}

// ============== Server ==============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: SOAP_HEADERS });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: SOAP_HEADERS });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  let xml = "";
  try {
    xml = await req.text();
  } catch {
    return errorResponse("OTA_GenericRS", "", "Invalid request body", 400);
  }

  // Self-test bypass: caller (owlting-cm-self-test) provides service-role key
  // + accommodation_id + hotel_code, and we skip WS-Security validation.
  let override: AuthOverride = null;
  const selfTestKey = req.headers.get("x-self-test-key");
  const selfTestAcc = req.headers.get("x-self-test-acc");
  const selfTestHotel = req.headers.get("x-self-test-hotel");
  if (selfTestKey && selfTestKey === supabaseServiceKey && selfTestAcc && selfTestHotel) {
    override = { accommodationId: selfTestAcc, hotelCode: selfTestHotel };
  }

  const root = rootName(xml);
  const echo = extractEcho(xml);

  try {
    switch (root) {
      case "OTA_HotelAvailRQ":           return await handleAvailRQ(supabase, xml, echo, override);
      case "OTA_HotelAvailNotifRQ":      return await handleAvailNotifRQ(supabase, xml, echo, override);
      case "OTA_HotelRateAmountNotifRQ": return await handleRateAmountNotifRQ(supabase, xml, echo, override);
      case "OTA_HotelResNotifRQ":        return await handleResNotifRQ(supabase, xml, echo, override);
      default:
        return errorResponse("OTA_GenericRS", echo, `Unsupported root element: ${root ?? "unknown"}`, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[owlting-cm] error:", e);
    await logCm(supabase, "inbound", root ?? "unknown", null, null, echo, xml, msg, "error", msg);
    return errorResponse((root ?? "OTA_GenericRS").replace("RQ", "RS"), echo, `Server error: ${msg}`, 500);
  }
});
