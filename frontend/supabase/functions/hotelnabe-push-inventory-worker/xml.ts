// HotelNabe outbound "inventory" — OTA_HotelAvailNotifRQ builder + RS parser
// Direction: 人客多 (PMS) → HotelNabe
// Independent module; do NOT reuse owlting-* code.

// @ts-ignore esm.sh resolves fast-xml-parser for Deno
import { XMLParser, XMLBuilder } from "https://esm.sh/fast-xml-parser@4.4.1";

const NS = "http://www.opentravel.org/OTA/2003/05";

export type AvailMessage =
  | {
      kind: "booking_limit";
      start: string; // YYYY-MM-DD
      end: string;   // YYYY-MM-DD
      invTypeCode: string; // PMS room type numeric code, e.g. "1063"
      bookingLimit: number;
    }
  | {
      kind: "restriction";
      start: string;
      end: string;
      invTypeCode: string;
      ratePlanCode?: string; // default "-1" = all rate plans
      status: "Open" | "Close";
    };

export interface BuildAvailNotifRQInput {
  echoToken: string;
  hotelCode: string;
  requestorId: string;
  password: string;
  pmsName: string;
  messages: AvailMessage[];
  timeStamp?: string;
  version?: string;
}

/**
 * Build OTA_HotelAvailNotifRQ.
 *
 * IMPORTANT: BookingLimit message MUST NOT be mixed with restriction
 * (Open/Close) inside the same <AvailStatusMessage>. We always emit one
 * <AvailStatusMessage> per logical message.
 */
export function buildHotelnabeAvailNotifRQ(input: BuildAvailNotifRQInput): string {
  const ts = input.timeStamp ?? new Date().toISOString();
  const ver = input.version ?? "1.0";

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    suppressEmptyNode: true,
    format: false,
  });

  const availStatusMessages = input.messages.map((m) => {
    if (m.kind === "booking_limit") {
      return {
        "@_BookingLimit": String(m.bookingLimit),
        StatusApplicationControl: {
          "@_Start": m.start,
          "@_End": m.end,
          "@_InvTypeCode": m.invTypeCode,
        },
      };
    }
    // restriction
    return {
      StatusApplicationControl: {
        "@_Start": m.start,
        "@_End": m.end,
        "@_InvTypeCode": m.invTypeCode,
        "@_RatePlanCode": m.ratePlanCode ?? "-1",
      },
      RestrictionStatus: {
        "@_Status": m.status,
      },
    };
  });

  const doc = {
    OTA_HotelAvailNotifRQ: {
      "@_xmlns": NS,
      "@_EchoToken": input.echoToken,
      "@_Version": ver,
      "@_TimeStamp": ts,
      POS: {
        Source: {
          RequestorID: {
            "@_Type": "18",
            "@_ID": input.requestorId,
            "@_MessagePassword": input.password,
            "@_Name": input.pmsName,
          },
        },
      },
      AvailStatusMessages: {
        "@_HotelCode": input.hotelCode,
        AvailStatusMessage: availStatusMessages,
      },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8"?>` + builder.build(doc);
}

export interface ParsedAvailNotifRS {
  echoToken: string | null;
  success: boolean;
  errors: { type: string | null; code: string | null; message: string }[];
  warnings: { type: string | null; code: string | null; message: string }[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseAttributeValue: false,
  removeNSPrefix: true,
  isArray: (name) => ["Error", "Warning"].includes(name),
});

function asArr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseHotelnabeAvailNotifRS(xml: string): ParsedAvailNotifRS {
  const doc = parser.parse(xml);
  const rs = doc?.OTA_HotelAvailNotifRS;
  if (!rs) {
    return {
      echoToken: null,
      success: false,
      errors: [{ type: null, code: null, message: "Missing OTA_HotelAvailNotifRS root" }],
      warnings: [],
    };
  }
  const echoToken = rs["@_EchoToken"] ? String(rs["@_EchoToken"]) : null;
  const errors = asArr(rs?.Errors?.Error).map((e: any) => ({
    type: e?.["@_Type"] ? String(e["@_Type"]) : null,
    code: e?.["@_Code"] ? String(e["@_Code"]) : null,
    message: String(e?.["#text"] ?? e?.["@_ShortText"] ?? "").trim(),
  }));
  const warnings = asArr(rs?.Warnings?.Warning).map((e: any) => ({
    type: e?.["@_Type"] ? String(e["@_Type"]) : null,
    code: e?.["@_Code"] ? String(e["@_Code"]) : null,
    message: String(e?.["#text"] ?? e?.["@_ShortText"] ?? "").trim(),
  }));
  const success = rs.Success !== undefined && errors.length === 0;
  return { echoToken, success, errors, warnings };
}

/** Mask MessagePassword attribute in raw XML before persisting for audit. */
export function maskPasswordInXml(xml: string): string {
  return xml.replace(/(MessagePassword\s*=\s*")([^"]*)(")/gi, (_m, p1, _v, p3) => `${p1}***${p3}`);
}
