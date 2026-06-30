// HotelNabe → 人客多 inbound XML parser & response builder
// Independent module — DO NOT reuse owlting-order-push code.
// Targets OTA_HotelResNotifRQ V1.0.2 from HotelNabe.

// @ts-ignore - esm.sh resolves bundled fast-xml-parser for Deno (no node_modules needed)
import { XMLParser, XMLBuilder } from "https://esm.sh/fast-xml-parser@4.4.1";

export type ResStatus = "Book" | "Modify" | "Cancel";

export interface ParsedGuestCount {
  ageQualifyingCode: string; // "10" adult, "8" child
  count: number;
}

export interface ParsedReservation {
  recordId: string;                   // for batch error reporting (1-based as string)
  // IDs
  hotelnabeResId: string | null;      // HotelReservationIDs / ResID_Source=Hotelnabe
  otaResId: string | null;            // OTA-side reservation id (other ResID_Source)
  otaCode: string | null;             // Profile/CompanyName/@Code
  // Status & timestamps
  resStatus: ResStatus | null;
  createDateTime: string | null;
  lastModifyDateTime: string | null;
  // Property
  hotelCode: string | null;
  // Stay
  checkIn: string | null;             // YYYY-MM-DD
  checkOut: string | null;
  roomTypeCode: number | null;        // from nabe:PMS@RoomTypeCode
  ratePlanCode: number | null;        // from nabe:PMS@RatePlanCode (0 = none)
  guestCounts: ParsedGuestCount[];
  adults: number;
  children: number;
  // Pricing
  currency: string | null;
  amountAfterTax: number | null;      // already adjusted by DecimalPlaces
  decimalPlaces: number;
  taxAmount: number | null;
  // Guests / Profile (all null-safe)
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  // Payment guarantee (DepositPayments / GuaranteePayment / @GuaranteeType)
  // Common values: "PrePay" (OTA pre-collected), "None" (pay at property), null (missing)
  guaranteeType: string | null;
  // Errors collected during parsing (mapped to OTA error codes)
  errors: ParseError[];
}

export interface ParseError {
  type: string; // OTA Error @Type
  code: string; // OTA Error @Code
  message: string;
  recordId?: string;
}

export interface ParsedEnvelope {
  echoToken: string | null;
  version: string | null;
  posId: string | null;
  posPassword: string | null;
  reservations: ParsedReservation[];
  rootError: ParseError | null; // fatal envelope-level
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseAttributeValue: false,
  removeNSPrefix: false, // keep nabe: prefixes for clarity
  isArray: (name) => {
    // Force these to always be arrays for predictable access
    return [
      "HotelReservation",
      "UniqueID",
      "RoomStay",
      "RoomType",
      "RoomRate",
      "GuestCount",
      "ResGuest",
      "Tax",
      "CompanyName",
      "Source",
    ].includes(name);
  },
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  format: false,
  suppressEmptyNode: true,
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function safeStr(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function safeInt(v: any): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function safeFloat(v: any): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse the inbound OTA_HotelResNotifRQ envelope.
 * Returns a structured envelope + per-reservation parse errors (do not throw).
 */
export function parseHotelnabeResNotifRQ(xml: string): ParsedEnvelope {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    return {
      echoToken: null,
      version: null,
      posId: null,
      posPassword: null,
      reservations: [],
      rootError: {
        type: "3",
        code: "450", // Unable to process
        message: `XML parse failed: ${(e as Error).message}`,
      },
    };
  }

  const rq = doc?.OTA_HotelResNotifRQ;
  if (!rq) {
    return {
      echoToken: null,
      version: null,
      posId: null,
      posPassword: null,
      reservations: [],
      rootError: {
        type: "3",
        code: "450",
        message: "Missing OTA_HotelResNotifRQ root element",
      },
    };
  }

  const echoToken = safeStr(rq["@_EchoToken"]);
  const version = safeStr(rq["@_Version"]);

  // POS / Source / RequestorID → @ID / @MessagePassword
  let posId: string | null = null;
  let posPassword: string | null = null;
  const sources = asArray(rq?.POS?.Source);
  for (const src of sources) {
    const req = src?.RequestorID;
    if (req) {
      posId = safeStr(req["@_ID"]) ?? posId;
      posPassword = safeStr(req["@_MessagePassword"]) ?? posPassword;
      if (posId) break;
    }
  }

  const reservations: ParsedReservation[] = [];
  const hotelReservations = asArray(rq?.HotelReservations?.HotelReservation);
  hotelReservations.forEach((hr: any, idx: number) => {
    reservations.push(parseSingleReservation(hr, String(idx + 1)));
  });

  return {
    echoToken,
    version,
    posId,
    posPassword,
    reservations,
    rootError: null,
  };
}

function parseSingleReservation(hr: any, recordId: string): ParsedReservation {
  const errors: ParseError[] = [];

  const resStatusRaw = safeStr(hr?.["@_ResStatus"]);
  const resStatus: ResStatus | null =
    resStatusRaw === "Book" || resStatusRaw === "Modify" || resStatusRaw === "Cancel"
      ? resStatusRaw
      : null;
  const createDateTime = safeStr(hr?.["@_CreateDateTime"]);
  const lastModifyDateTime = safeStr(hr?.["@_LastModifyDateTime"]);

  // HotelReservationIDs (also handle ResGlobalInfo path used by HotelNabe production)
  let hotelnabeResId: string | null = null;
  let otaResId: string | null = null;
  const ids = asArray(hr?.UniqueID)
    .concat(asArray(hr?.HotelReservationIDs?.HotelReservationID))
    .concat(asArray(hr?.ResGlobalInfo?.HotelReservationIDs?.HotelReservationID));
  for (const id of ids) {
    const src = safeStr(id?.["@_ResID_Source"]) ?? safeStr(id?.["@_Source"]);
    const val = safeStr(id?.["@_ResID_Value"]) ?? safeStr(id?.["@_ID"]);
    if (!val) continue;
    if (src && src.toLowerCase() === "hotelnabe") {
      hotelnabeResId = val;
    } else {
      // first non-hotelnabe id wins
      if (!otaResId) otaResId = val;
    }
  }

  // RoomStay (V1.0.2: single RoomStay typical; take first)
  const roomStay = asArray(hr?.RoomStays?.RoomStay)[0] ?? null;

  // Property — HotelNabe production places BasicPropertyInfo under ResGlobalInfo;
  // keep RoomStay path as fallback for spec-style payloads.
  const hotelCode =
    safeStr(hr?.ResGlobalInfo?.BasicPropertyInfo?.["@_HotelCode"]) ??
    safeStr(roomStay?.BasicPropertyInfo?.["@_HotelCode"]);

  // Room type via nabe:PMS@RoomTypeCode
  const roomTypeNode = asArray(roomStay?.RoomTypes?.RoomType)[0] ?? null;
  const roomPms = roomTypeNode?.TPA_Extensions?.["nabe:PMS"]
    ?? roomTypeNode?.TPA_Extensions?.PMS
    ?? null;
  const roomTypeCode = safeInt(roomPms?.["@_RoomTypeCode"]);

  // Rate plan via nabe:RoomRate/nabe:PMS@RatePlanCode
  // HotelNabe production wraps nabe:RoomRate inside RoomRates/TPA_Extensions,
  // not directly under RoomRates. Try both shapes.
  const roomRatesNode = roomStay?.RoomRates ?? null;
  const nabeRoomRate = roomRatesNode?.["nabe:RoomRate"]
    ?? roomRatesNode?.TPA_Extensions?.["nabe:RoomRate"]
    ?? roomRatesNode?.RoomRate
    ?? null;
  const rrFirst = Array.isArray(nabeRoomRate) ? nabeRoomRate[0] : nabeRoomRate;
  const ratePms = rrFirst?.["nabe:PMS"]
    ?? rrFirst?.TPA_Extensions?.["nabe:PMS"]
    ?? rrFirst?.TPA_Extensions?.PMS
    ?? null;
  const ratePlanCode = safeInt(ratePms?.["@_RatePlanCode"]);

  // TimeSpan
  const timeSpan = roomStay?.TimeSpan ?? rrFirst?.TimeSpan ?? null;
  const checkIn = safeStr(timeSpan?.["@_Start"]);
  const checkOut = safeStr(timeSpan?.["@_End"]);

  // Guest counts
  const gcNodes = asArray(roomStay?.GuestCounts?.GuestCount);
  const guestCounts: ParsedGuestCount[] = gcNodes.map((g: any) => ({
    ageQualifyingCode: safeStr(g?.["@_AgeQualifyingCode"]) ?? "",
    count: safeInt(g?.["@_Count"]) ?? 0,
  }));
  const adults = guestCounts.filter(g => g.ageQualifyingCode === "10")
    .reduce((s, g) => s + g.count, 0);
  const children = guestCounts.filter(g => g.ageQualifyingCode === "8")
    .reduce((s, g) => s + g.count, 0);

  // Total / pricing
  const total = roomStay?.Total ?? rrFirst?.Total ?? hr?.ResGlobalInfo?.Total ?? null;
  const currency = safeStr(total?.["@_CurrencyCode"]);
  const decimalPlaces = safeInt(total?.["@_DecimalPlaces"]) ?? 0;
  const rawAmount = safeFloat(total?.["@_AmountAfterTax"]);
  const amountAfterTax = rawAmount != null
    ? rawAmount / Math.pow(10, decimalPlaces)
    : null;

  // Taxes: sum first occurrence if present
  const taxNodes = asArray(total?.Taxes?.Tax);
  let taxAmount: number | null = null;
  if (taxNodes.length) {
    let acc = 0;
    let any = false;
    for (const t of taxNodes) {
      const v = safeFloat(t?.["@_Amount"]);
      if (v != null) { acc += v; any = true; }
    }
    if (any) taxAmount = acc / Math.pow(10, decimalPlaces);
  }

  // ResGuest / Profile (null-safe)
  // HotelNabe production: ResGuest/Profiles/Profile (no ProfileInfo wrapper).
  // Spec: ResGuest/Profiles/ProfileInfo/Profile. Try both, with ResGlobalInfo fallback.
  const resGuest = asArray(hr?.ResGuests?.ResGuest)[0] ?? null;
  const profile = resGuest?.Profiles?.ProfileInfo?.Profile
    ?? resGuest?.Profiles?.Profile
    ?? hr?.Profiles?.ProfileInfo?.Profile
    ?? hr?.ResGlobalInfo?.Profiles?.ProfileInfo?.Profile
    ?? null;
  const customer = profile?.Customer ?? null;
  const personName = customer?.PersonName ?? null;
  const givenName = safeStr(personName?.GivenName);
  const surname = safeStr(personName?.Surname);
  const guestName = [surname, givenName].filter(Boolean).join("") || null;
  const telephone = customer?.Telephone ?? null;
  const guestPhone = safeStr(telephone?.["@_PhoneNumber"]);
  const email = customer?.Email;
  const guestEmail = safeStr(typeof email === "object" ? email?.["#text"] : email);

  // ota_code via CompanyName/@Code — HotelNabe production puts the OTA channel under
  // HotelReservation/POS/Source/BookingChannel/CompanyName. Older spec puts it under
  // Profile/CompanyInfo/CompanyName. Try both.
  const hrSources = asArray(hr?.POS?.Source);
  let bookingChannelCode: string | null = null;
  for (const src of hrSources) {
    const cn = src?.BookingChannel?.CompanyName;
    const first = Array.isArray(cn) ? cn[0] : cn;
    const code = safeStr(first?.["@_Code"]);
    if (code) { bookingChannelCode = code; break; }
  }
  const companyName = profile?.CompanyInfo?.CompanyName
    ?? asArray(hr?.ResGlobalInfo?.Profiles?.ProfileInfo?.Profile?.CompanyInfo?.CompanyName)[0]
    ?? null;
  const otaCode = bookingChannelCode ?? safeStr(
    (Array.isArray(companyName) ? companyName[0] : companyName)?.["@_Code"],
  );

  return {
    recordId,
    hotelnabeResId,
    otaResId,
    otaCode,
    resStatus,
    createDateTime,
    lastModifyDateTime,
    hotelCode,
    checkIn,
    checkOut,
    roomTypeCode,
    ratePlanCode,
    guestCounts,
    adults,
    children,
    currency,
    amountAfterTax,
    decimalPlaces,
    taxAmount,
    guestName,
    guestPhone,
    guestEmail,
    errors,
  };
}

// ─── Response builders ──────────────────────────────────────────────

export interface RSSuccessItem {
  recordId?: string;          // optional; not always required
  uniqueId?: string;          // our internal order id (Type=14)
}

export interface RSErrorItem extends ParseError {
  recordId?: string;
}

export interface BuildRSOptions {
  echoToken: string | null;
  version?: string;
  // Either success xor errors. If errors non-empty, treated as failure response.
  successes?: RSSuccessItem[];
  errors?: RSErrorItem[];
}

export function buildHotelnabeResNotifRS(opts: BuildRSOptions): string {
  const root: any = {
    OTA_HotelResNotifRS: {
      "@_xmlns": "http://www.opentravel.org/OTA/2003/05",
      "@_Version": opts.version ?? "1.0",
      "@_TimeStamp": new Date().toISOString(),
    },
  };
  if (opts.echoToken) root.OTA_HotelResNotifRS["@_EchoToken"] = opts.echoToken;

  const hasErrors = opts.errors && opts.errors.length > 0;
  if (hasErrors) {
    root.OTA_HotelResNotifRS.Errors = {
      Error: opts.errors!.map((e) => ({
        "@_Type": e.type,
        "@_Code": e.code,
        ...(e.recordId ? { "@_RecordID": e.recordId } : {}),
        "#text": e.message,
      })),
    };
  } else {
    root.OTA_HotelResNotifRS.Success = {};
    if (opts.successes && opts.successes.length) {
      // Per OTA spec, HotelReservations may be returned with UniqueID per record.
      root.OTA_HotelResNotifRS.HotelReservations = {
        HotelReservation: opts.successes.map((s) => ({
          ...(s.recordId ? { "@_RecordID": s.recordId } : {}),
          ...(s.uniqueId
            ? {
                UniqueID: {
                  "@_Type": "14",
                  "@_ID": s.uniqueId,
                  "@_ID_Context": "Lakeze",
                },
              }
            : {}),
        })),
      };
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` + builder.build(root);
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Mask MessagePassword in raw XML before persisting for audit.
 */
export function maskPasswordInXml(xml: string): string {
  return xml.replace(
    /(MessagePassword\s*=\s*")([^"]*)(")/gi,
    (_m, p1, _pwd, p3) => `${p1}***${p3}`,
  );
}

/**
 * Compare two ISO/loose datetime strings. Returns true if `a` is strictly older than `b`.
 * Treats unparseable / null as "not older" (so callers won't skip on null).
 */
export function isOlderThan(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return ta < tb;
}
