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
 * HotelCode is mapped to a property via accommodation_owlting_config.owlting_hotel_code
 * (single source of truth — same row that the HQ「奧丁丁物業設定」UI manages).
 * Only properties with sync_enabled = true are accepted.
 *
 * Code mapping (numeric, auto-assigned, starting at 1001):
 *   HotelCode    = accommodation_owlting_config.owlting_hotel_code
 *   InvTypeCode  = same as RoomTypeCode
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { buildRatePlansForRoomType } from "./availrs_packages.ts";

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
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[buf[i] % alphabet.length];
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

// Bulk resolvers — single round-trip for many codes (avoids N+1 in
// OTA_HotelAvailNotifRQ / OTA_HotelRateAmountNotifRQ which can carry 17+ messages)
async function bulkResolveRoomTypes(
  supabase: any, accId: string, codes: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>();
  const nums = [...new Set(codes.map((c) => parseInt(c, 10)).filter(Number.isFinite))];
  if (nums.length === 0) return map;
  const { data } = await supabase
    .from("room_types")
    .select("id,name,numeric_code")
    .eq("accommodation_id", accId)
    .in("numeric_code", nums);
  for (const r of data ?? []) map.set(String(r.numeric_code), { id: r.id, name: r.name });
  return map;
}
async function bulkResolveRatePlans(
  supabase: any, accId: string, codes: string[],
): Promise<Map<string, { id: string; template_name: string; room_type_id: string | null }>> {
  const map = new Map<string, { id: string; template_name: string; room_type_id: string | null }>();
  const nums = [...new Set(codes.map((c) => parseInt(c, 10)).filter(Number.isFinite))];
  if (nums.length === 0) return map;
  const { data } = await supabase
    .from("pricing_templates")
    .select("id,template_name,room_type_id,numeric_code")
    .eq("accommodation_id", accId)
    .in("numeric_code", nums);
  for (const r of data ?? []) {
    map.set(String(r.numeric_code), { id: r.id, template_name: r.template_name, room_type_id: r.room_type_id });
  }
  return map;
}

// ---- Package-group inbound mapping helpers ----
// When OwlTing pushes against a canonical room_type (set up via
// owlting_room_type_groups), we map it back to the underlying member
// room_types so the price/inventory lands on the row our pricing engine reads.
export interface GroupContext {
  canonicalRoomTypeIds: Set<string>;        // every group's canonical room_type
  memberRoomTypeIdsByCanonical: Map<string, string[]>; // canonical -> member room_type ids
  memberRoomTypeIdByTemplate: Map<string, string>;     // template_id -> member room_type_id (within canonical's group)
}

export async function loadGroupContext(supabase: any, accommodationId: string): Promise<GroupContext> {
  const ctx: GroupContext = {
    canonicalRoomTypeIds: new Set(),
    memberRoomTypeIdsByCanonical: new Map(),
    memberRoomTypeIdByTemplate: new Map(),
  };
  const { data: groups } = await supabase
    .from("owlting_room_type_groups")
    .select("id, canonical_room_type_id")
    .eq("accommodation_id", accommodationId);
  if (!groups || groups.length === 0) return ctx;
  const groupIds = groups.map((g: any) => g.id);
  const canonicalByGroup = new Map<string, string>(groups.map((g: any) => [g.id, g.canonical_room_type_id]));
  for (const g of groups) ctx.canonicalRoomTypeIds.add(g.canonical_room_type_id);
  const { data: members } = await supabase
    .from("owlting_room_type_group_members")
    .select("group_id, room_type_id, rate_plan_template_id")
    .in("group_id", groupIds);
  for (const m of members ?? []) {
    const canonical = canonicalByGroup.get(m.group_id);
    if (!canonical) continue;
    const arr = ctx.memberRoomTypeIdsByCanonical.get(canonical) ?? [];
    arr.push(m.room_type_id);
    ctx.memberRoomTypeIdsByCanonical.set(canonical, arr);
    ctx.memberRoomTypeIdByTemplate.set(m.rate_plan_template_id, m.room_type_id);
  }
  return ctx;
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

  // 2. Resolve HotelCode -> accommodation_id
  // Single source of truth: accommodation_owlting_config.owlting_hotel_code (sync_enabled = true)
  if (!hotelCode) return { ok: false, msg: "Missing HotelCode" };
  const { data: prop } = await supabase
    .from("accommodation_owlting_config")
    .select("accommodation_id, owlting_hotel_code, sync_enabled")
    .eq("owlting_hotel_code", hotelCode)
    .maybeSingle();
  if (!prop || !prop.sync_enabled) return { ok: false, msg: `HotelCode ${hotelCode} not registered` };

  return { ok: true, accommodationId: prop.accommodation_id, hotelCode: prop.owlting_hotel_code };
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
    .select("id,template_name,room_type_id,numeric_code,default_package_id")
    .eq("accommodation_id", auth.accommodationId);

  // Non-grouped RatePlan source: UNION of (a) accommodation_packages containing
  // this room_type in room_type_ids and (b) pricing_templates.default_package_id
  // → accommodation_packages. Deduped by package.id. RatePlanCode is ALWAYS the
  // resolved packages.numeric_code (aligned with owlting-order-push).
  const { data: pkgs } = await supabase
    .from("accommodation_packages")
    .select("id,name,numeric_code,room_type_ids,enabled,display_order")
    .eq("accommodation_id", auth.accommodationId);

  // Per-room-type OwlTing sync exclusions (sync_enabled = false).
  // Excluded room_types must NOT appear in AvailRS (no RoomStay, no RatePlan).
  const excludedRoomTypeIds = await loadExcludedRoomTypeIds(supabase, auth.accommodationId!);

  // ----- Package-group consolidation -----
  // Load owlting room-type group config (if any). When a group exists,
  // its member room_types are collapsed into 1 <RoomStay> with the
  // canonical RoomTypeCode/Name; RatePlans are taken from each member's
  // mapped pricing_template. Non-grouped room_types behave exactly as before.
  const { data: groups } = await supabase
    .from("owlting_room_type_groups")
    .select("id,canonical_room_type_id,canonical_name,display_order")
    .eq("accommodation_id", auth.accommodationId)
    .order("display_order", { ascending: true });

  const groupIds = (groups ?? []).map((g: any) => g.id);
  const { data: members } = groupIds.length
    ? await supabase
        .from("owlting_room_type_group_members")
        .select("group_id,room_type_id,rate_plan_template_id,rate_plan_name,display_order")
        .in("group_id", groupIds)
        .order("display_order", { ascending: true })
    : { data: [] as any[] };

  const roomById = new Map<string, any>((rooms ?? []).map((r: any) => [r.id, r]));
  const tplById = new Map<string, any>((templates ?? []).map((t: any) => [t.id, t]));

  // member room_type_id -> group_id (these room_types are hidden as individual RoomStays)
  const memberRoomToGroup = new Map<string, string>();
  // group_id -> array of { template, rate_plan_name }
  const groupPlans = new Map<string, Array<{ tpl: any; name: string }>>();
  for (const m of (members ?? []) as any[]) {
    memberRoomToGroup.set(m.room_type_id, m.group_id);
    const tpl = tplById.get(m.rate_plan_template_id);
    if (!tpl) continue; // skip if template missing
    const arr = groupPlans.get(m.group_id) ?? [];
    arr.push({ tpl, name: m.rate_plan_name });
    groupPlans.set(m.group_id, arr);
  }


  const emittedGroupIds = new Set<string>();
  const stayParts: string[] = [];

  for (const r of (rooms ?? []) as any[]) {
    const groupId = memberRoomToGroup.get(r.id);
    if (groupId) {
      // Emit canonical RoomStay once per group
      if (emittedGroupIds.has(groupId)) continue;
      const g = (groups ?? []).find((x: any) => x.id === groupId);
      if (!g) continue;
      const canonical = roomById.get(g.canonical_room_type_id);
      if (!canonical) continue;
      const plans = groupPlans.get(groupId) ?? [];
      const planXml = plans.map(({ tpl, name }) =>
        `<RatePlan RatePlanCode="${tpl.numeric_code}"><RatePlanDescription Name="${xmlEscape(name)}"/></RatePlan>`,
      ).join("");
      stayParts.push(`<RoomStay>
      <RoomTypes><RoomType RoomTypeCode="${canonical.numeric_code}"><RoomDescription Name="${xmlEscape(g.canonical_name)}"/></RoomType></RoomTypes>
      <RatePlans>${planXml}</RatePlans>
    </RoomStay>`);
      emittedGroupIds.add(groupId);
      continue;
    }

    // Non-grouped room_type: RatePlans = union of (a) packages + (b) templates
    // resolved via default_package_id. RatePlanCode = packages.numeric_code.
    const plans = buildRatePlansForRoomType(r.id, (pkgs ?? []) as any, (templates ?? []) as any);
    const planXml = plans.map((p) =>
      `<RatePlan RatePlanCode="${p.code}"><RatePlanDescription Name="${xmlEscape(p.name)}"/></RatePlan>`,
    ).join("");
    stayParts.push(`<RoomStay>
      <RoomTypes><RoomType RoomTypeCode="${r.numeric_code}"><RoomDescription Name="${xmlEscape(r.name)}"/></RoomType></RoomTypes>
      <RatePlans>${planXml}</RatePlans>
    </RoomStay>`);
  }

  const stays = stayParts.join("");

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

  // ----- Pre-parse: collect distinct codes for one-shot lookup (no N+1) -----
  type Parsed = {
    start: string; end: string; invCode: string;
    ratePlanCode: string | null;
    bookingLimit: string | null; restrictionStatus: string | null;
  };
  const parsed: Parsed[] = [];
  for (const msg of messages) {
    const ctl = /<StatusApplicationControl\b[^>]*>/.exec(msg)?.[0] ?? "";
    const start = attrFirst(ctl, "StatusApplicationControl", "Start");
    const end = attrFirst(ctl, "StatusApplicationControl", "End");
    const invCode = attrFirst(ctl, "StatusApplicationControl", "InvTypeCode");
    if (!start || !end || !invCode) continue;
    parsed.push({
      start, end, invCode,
      ratePlanCode: attrFirst(ctl, "StatusApplicationControl", "RatePlanCode"),
      bookingLimit: attrFirst(msg, "AvailStatusMessage", "BookingLimit"),
      restrictionStatus: attrFirst(msg, "RestrictionStatus", "Status"),
    });
  }

  const roomMap = await bulkResolveRoomTypes(
    supabase, auth.accommodationId!, parsed.map((p) => p.invCode),
  );
  const planMap = await bulkResolveRatePlans(
    supabase, auth.accommodationId!,
    parsed.map((p) => p.ratePlanCode).filter((c): c is string => !!c),
  );

  // Package-group context: lets canonical-room avail pushes fan out to
  // every member room_type ("sell-one, close-all").
  const groupCtx = await loadGroupContext(supabase, auth.accommodationId!);

  // Batch buffers.
  // IMPORTANT: rows MUST NOT carry a `price` field — availability push must
  // not overwrite prices. The RPC only updates fields explicitly present.
  const templateAvailRows: { template_id: string; date: string; is_closed: boolean; updated_at: string }[] = [];
  const inventoryRows: {
    room_type_id: string; date: string;
    pricing_template_id: null;
    available_rooms?: number; is_available?: boolean;
  }[] = [];

  for (const p of parsed) {
    const room = roomMap.get(p.invCode);
    if (!room) {
      const r = errorResponse("OTA_HotelAvailNotifRS", echo, `RoomType ${p.invCode} not found`);
      await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error", `RoomType ${p.invCode} not found`);
      return r;
    }
    const dates = dateRange(p.start, p.end);

    if (p.ratePlanCode) {
      const plan = planMap.get(p.ratePlanCode);
      if (!plan) {
        const r = errorResponse("OTA_HotelAvailNotifRS", echo, `RatePlan ${p.ratePlanCode} not found`);
        await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error");
        return r;
      }
      if (p.restrictionStatus) {
        const isClosed = p.restrictionStatus.toLowerCase() === "close";
        for (const d of dates) {
          templateAvailRows.push({ template_id: plan.id, date: d, is_closed: isClosed, updated_at: new Date().toISOString() });
        }
      }
    } else {
      const patch: { available_rooms?: number; is_available?: boolean } = {};
      if (p.bookingLimit !== null) patch.available_rooms = parseInt(p.bookingLimit, 10);
      if (p.restrictionStatus) patch.is_available = p.restrictionStatus.toLowerCase() === "open";
      if (Object.keys(patch).length === 0) continue;
      // Fan-out: if room is a group canonical, write to every member room_type
      // (= sell-one-close-all). Otherwise write to the room itself.
      const memberIds = groupCtx.memberRoomTypeIdsByCanonical.get(room.id);
      const targetRoomIds = memberIds && memberIds.length > 0 ? memberIds : [room.id];
      for (const d of dates) {
        for (const rid of targetRoomIds) {
          inventoryRows.push({ room_type_id: rid, date: d, pricing_template_id: null, ...patch });
        }
      }
    }
  }

  // Single round-trip per target table
  if (templateAvailRows.length > 0) {
    await supabase.from("pricing_template_availability").upsert(templateAvailRows);
  }
  if (inventoryRows.length > 0) {
    const { error: upErr } = await supabase.rpc("bulk_upsert_room_inventory_pricing", { p_rows: inventoryRows });
    if (upErr) {
      const r = errorResponse("OTA_HotelAvailNotifRS", echo, `Inventory update failed: ${upErr.message}`);
      await logCm(supabase, "inbound", "OTA_HotelAvailNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error", upErr.message);
      return r;
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

  // ----- Pre-parse: collect distinct codes for one-shot lookup -----
  type Parsed = {
    invCode: string; ratePlanCode: string | null;
    rates: { start: string; end: string; price: number }[];
  };
  const parsed: Parsed[] = [];
  for (const msg of messages) {
    const ctl = /<StatusApplicationControl\b[^>]*\/>|<StatusApplicationControl\b[^>]*>/.exec(msg)?.[0] ?? "";
    const invCode = attrFirst(ctl, "StatusApplicationControl", "InvTypeCode");
    if (!invCode) continue;
    const ratePlanCode = attrFirst(ctl, "StatusApplicationControl", "RatePlanCode");
    const rateBlocks = splitTagsAny(msg, "Rate");
    const rates: { start: string; end: string; price: number }[] = [];
    for (const rt of rateBlocks) {
      const start = attrFirst(rt, "Rate", "Start");
      const end = attrFirst(rt, "Rate", "End");
      const amount = attrFirst(rt, "BaseByGuestAmt", "AmountAfterTax");
      if (!start || !end || amount === null) continue;
      rates.push({ start, end, price: Math.round(parseFloat(amount)) });
    }
    parsed.push({ invCode, ratePlanCode, rates });
  }

  const roomMap = await bulkResolveRoomTypes(
    supabase, auth.accommodationId!, parsed.map((p) => p.invCode),
  );
  const planMap = await bulkResolveRatePlans(
    supabase, auth.accommodationId!,
    parsed.map((p) => p.ratePlanCode).filter((c): c is string => !!c),
  );

  // Package-group context: maps OwlTing's (canonical room + member rateplan)
  // pushback to the underlying member room_type so the price lands on the
  // row our pricing engine reads.
  const groupCtx = await loadGroupContext(supabase, auth.accommodationId!);

  // IMPORTANT: rows MUST carry only `price` — never `available_rooms` /
  // `is_available`. Price push must not initialise/overwrite inventory.
  // When the RPC inserts a brand-new template-specific row, it leaves
  // available_rooms / is_available as NULL (column is now nullable),
  // so price-only writes never make the day look sold-out.
  const inventoryRows: { room_type_id: string; date: string; pricing_template_id: string | null; price: number }[] = [];
  for (const p of parsed) {
    const room = roomMap.get(p.invCode);
    if (!room) {
      const r = errorResponse("OTA_HotelRateAmountNotifRS", echo, `RoomType ${p.invCode} not found`);
      await logCm(supabase, "inbound", "OTA_HotelRateAmountNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error");
      return r;
    }
    const plan = p.ratePlanCode ? planMap.get(p.ratePlanCode) : null;
    const matchTemplateId = plan?.id ?? null;

    // If OwlTing pushed against a canonical room + a member rate-plan template,
    // rewrite room_type to the member room_type (price belongs to the member's
    // (room_type, template) row, not canonical). Falls back to the room as-is
    // when no such mapping exists.
    let targetRoomId = room.id;
    if (matchTemplateId && groupCtx.canonicalRoomTypeIds.has(room.id)) {
      const memberRoom = groupCtx.memberRoomTypeIdByTemplate.get(matchTemplateId);
      if (memberRoom) targetRoomId = memberRoom;
    }

    for (const rt of p.rates) {
      for (const d of dateRange(rt.start, rt.end)) {
        inventoryRows.push({ room_type_id: targetRoomId, date: d, pricing_template_id: matchTemplateId, price: rt.price });
      }
    }
  }

  if (inventoryRows.length > 0) {
    const { error: upErr } = await supabase.rpc("bulk_upsert_room_inventory_pricing", { p_rows: inventoryRows });
    if (upErr) {
      const r = errorResponse("OTA_HotelRateAmountNotifRS", echo, `Rate update failed: ${upErr.message}`);
      await logCm(supabase, "inbound", "OTA_HotelRateAmountNotifRQ", auth.hotelCode!, auth.accommodationId!, echo, xml, await r.clone().text(), "error", upErr.message);
      return r;
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
    // CompanyName: new XML places it under <POS>/<Source>/<BookingChannel>; legacy placed it inside <HotelReservation>
    const otaName = (
      /<CompanyName\b[^>]*>([\s\S]*?)<\/CompanyName>/.exec(r)?.[1]
      ?? /<CompanyName\b[^>]*>([\s\S]*?)<\/CompanyName>/.exec(xml)?.[1]
      ?? ""
    ).trim();
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

    // 訂購人 — 新格式放在 <ResGuests>/<ResGuest>/<Profiles>/<ProfileInfo>/<Profile>/<Customer>
    // 優先使用 PrimaryIndicator="true" 的 ResGuest，否則用第一個；若都找不到，回退到 <ResGlobalInfo>
    const resGuests = splitTags(r, "ResGuest");
    const primaryGuest =
      resGuests.find((g) => /PrimaryIndicator\s*=\s*"true"/i.test(g.slice(0, 200))) ??
      resGuests[0] ?? "";
    const fromGuest = (re: RegExp) => (re.exec(primaryGuest)?.[1] ?? "").trim();
    const fromGlobal = (re: RegExp) => (re.exec(/<ResGlobalInfo>[\s\S]*?<\/ResGlobalInfo>/.exec(r)?.[0] ?? "")?.[1] ?? "").trim();
    const purchaserGiven =
      fromGuest(/<GivenName>([\s\S]*?)<\/GivenName>/) ||
      fromGlobal(/<GivenName>([\s\S]*?)<\/GivenName>/);
    const purchaserSur =
      fromGuest(/<Surname>([\s\S]*?)<\/Surname>/) ||
      fromGlobal(/<Surname>([\s\S]*?)<\/Surname>/);
    const purchaserPhone =
      attrFirst(/<Telephone\b[^>]*\/?>/.exec(primaryGuest)?.[0] ?? "", "Telephone", "PhoneNumber") ||
      attrFirst(/<ResGlobalInfo>[\s\S]*?<Telephone\b[^>]*\/?>/.exec(r)?.[0] ?? "", "Telephone", "PhoneNumber") ||
      "";
    const purchaserEmail =
      fromGuest(/<Email>([\s\S]*?)<\/Email>/) ||
      fromGlobal(/<Email>([\s\S]*?)<\/Email>/);

    // 特殊需求：相容 SpecialRequest 與 <Comments>/<Comment>/<Text>
    const specialReqs = attrAll(roomStay, "SpecialRequest", "Name");
    const commentTexts = Array.from(
      (/<ResGlobalInfo>[\s\S]*?<\/ResGlobalInfo>/.exec(r)?.[0] ?? "").matchAll(
        /<Text>([\s\S]*?)<\/Text>/g,
      ),
    ).map((m) => m[1].trim()).filter(Boolean);
    const requests = [...specialReqs, ...commentTexts].filter(Boolean).join("; ");

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
