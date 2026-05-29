// Phase 2 — OwlNest "forward HTML 訂單通知" parser (skeleton, confidence: low)
//
// Strategy: text-body regex as primary signal, fall back to HTML markers.
// Output is INTENTIONALLY staged for admin review (review_status = pending_review).
// DO NOT auto-create bookings from this parser — PII may be masked and OTA
// channel name may be missing until OwlTing fixes their template.

export type ParsedConfidence = "low" | "medium" | "high";
export type ParsedMessageType = "new_order" | "modified" | "cancelled" | "unknown";

export interface OwlTingParsedFields {
  message_type: ParsedMessageType;
  obe_number: string | null;
  channel_source: string | null;
  accommodation_name: string | null;
  room_type_name: string | null;
  check_in_date: string | null;   // YYYY-MM-DD
  check_out_date: string | null;  // YYYY-MM-DD
  guest_count: number | null;
  total_amount: number | null;
  currency: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  pii_masked: boolean;
  addons: Array<{ name: string; qty?: number; amount?: number }> | null;
  confidence: ParsedConfidence;
  warnings: string[];
  raw_matches: Record<string, string | null>;
}

const OBE_RE = /\b(OBE[A-Z0-9\-]{6,})\b/i;
const DATE_RE = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g;
const AMOUNT_RE = /(?:TWD|NT\$|NTD|\$)\s*([\d,]+(?:\.\d+)?)/i;
const PHONE_MASKED_RE = /[+\d]+\*{2,}[\d]+/;
const EMAIL_MASKED_RE = /[A-Za-z0-9_.+-]*\*{2,}@/;

function toIsoDate(y: string, m: string, d: string): string {
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pick the value that follows a label in the flattened text.
 * e.g. labelValue("旅客姓名", "...旅客姓名 王美麗 電話 ...") => "王美麗"
 */
function labelValue(text: string, label: string, stopLabels: string[] = []): string | null {
  const i = text.indexOf(label);
  if (i < 0) return null;
  const after = text.slice(i + label.length).replace(/^[：:\s]+/, "");
  // cut at next known label
  let end = after.length;
  for (const stop of stopLabels) {
    const j = after.indexOf(stop);
    if (j > 0 && j < end) end = j;
  }
  const v = after.slice(0, end).trim();
  return v.length ? v : null;
}

export function detectMessageTypeFromBody(text: string): ParsedMessageType {
  if (/取消/.test(text)) return "cancelled";
  if (/修改|變更|更改/.test(text)) return "modified";
  if (/訂單成立|新訂單|新訂房/.test(text)) return "new_order";
  return "unknown";
}

export function parseOwlNestForwardEmail(input: {
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
}): OwlTingParsedFields {
  const warnings: string[] = [];
  const text = (input.text_body ?? "").trim();
  const html = input.html_body ?? "";
  const flat = text || stripTags(html);

  // message_type — try subject first, fall back to body
  let messageType: ParsedMessageType = "unknown";
  if (input.subject) {
    if (/取消/.test(input.subject)) messageType = "cancelled";
    else if (/修改|變更|更改/.test(input.subject)) messageType = "modified";
    else if (/訂單成立|新訂單|新訂房/.test(input.subject)) messageType = "new_order";
  }
  if (messageType === "unknown") {
    messageType = detectMessageTypeFromBody(flat);
    if (messageType === "unknown") warnings.push("message_type: could not be determined from subject or body");
  }

  // OBE number — body first (more reliable than the subject when it's an OwlNest OBE-yyyymmdd-NNNN)
  const obeMatchBody = flat.match(OBE_RE);
  const obeMatchSubject = input.subject?.match(OBE_RE) ?? null;
  const obe = obeMatchBody?.[1]?.toUpperCase() ?? obeMatchSubject?.[1]?.toUpperCase() ?? null;
  if (!obe) warnings.push("obe_number: not found");

  // Dates — first two YYYY-MM-DD matches are check-in / check-out
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  const dateRe = new RegExp(DATE_RE.source, "g");
  while ((m = dateRe.exec(flat)) !== null) {
    dates.push(toIsoDate(m[1], m[2], m[3]));
    if (dates.length >= 4) break;
  }
  const checkIn = dates[0] ?? null;
  const checkOut = dates[1] ?? null;
  if (!checkIn || !checkOut) warnings.push("dates: check_in/check_out not both detected");

  // Amount
  const amountMatch = flat.match(AMOUNT_RE);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const currency = amountMatch ? (amountMatch[0].match(/TWD|NT\$|NTD|\$/i)?.[0] ?? null) : null;

  // Guest info via label heuristics
  const stopLabels = ["電話", "Email", "信箱", "手機", "備註", "特殊需求", "入住", "退房", "房型", "金額", "專案", "來源"];
  const guestName = labelValue(flat, "旅客姓名", stopLabels) ?? labelValue(flat, "訂購人", stopLabels);
  const guestPhone = labelValue(flat, "電話", stopLabels) ?? labelValue(flat, "手機", stopLabels);
  const guestEmail = labelValue(flat, "Email", stopLabels) ?? labelValue(flat, "信箱", stopLabels);

  const piiMasked =
    (guestPhone ? PHONE_MASKED_RE.test(guestPhone) : false) ||
    (guestEmail ? EMAIL_MASKED_RE.test(guestEmail) : false);
  if (piiMasked) warnings.push("pii: phone/email appear masked — cannot use for auto-booking");

  // Room type / channel / accommodation (best-effort)
  const roomType = labelValue(flat, "房型", ["數量", "專案", "金額", "入住"]);
  const channel = labelValue(flat, "來源", ["專案", "房型", "金額"]) ?? labelValue(flat, "通路", ["專案", "房型"]);
  const accommodation = labelValue(flat, "館別", ["房型", "入住"]) ?? labelValue(flat, "民宿", ["房型", "入住"]);

  if (channel && /unknown/i.test(channel)) warnings.push("channel_source: OwlTing returned 'unknown' placeholder");

  // Guest count
  const guestCountMatch = flat.match(/(\d+)\s*(?:位|人)/);
  const guestCount = guestCountMatch ? Number(guestCountMatch[1]) : null;

  // Add-ons — placeholder; need real samples (#5 in reply email) to do this properly
  const addons: OwlTingParsedFields["addons"] = null;

  // Confidence — always low until OwlTing fixes placeholders AND we have ≥5 real samples
  let confidence: ParsedConfidence = "low";
  const hasAll = obe && checkIn && checkOut && amount && guestName;
  if (hasAll && !piiMasked && messageType !== "unknown" && channel && !/unknown/i.test(channel)) {
    confidence = "medium";
  }

  return {
    message_type: messageType,
    obe_number: obe,
    channel_source: channel,
    accommodation_name: accommodation,
    room_type_name: roomType,
    check_in_date: checkIn,
    check_out_date: checkOut,
    guest_count: guestCount,
    total_amount: amount,
    currency,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: guestEmail,
    pii_masked: piiMasked,
    addons,
    confidence,
    warnings,
    raw_matches: {
      obe_from_body: obeMatchBody?.[1] ?? null,
      obe_from_subject: obeMatchSubject?.[1] ?? null,
      amount_raw: amountMatch?.[0] ?? null,
      dates_detected: dates.join(",") || null,
    },
  };
}
