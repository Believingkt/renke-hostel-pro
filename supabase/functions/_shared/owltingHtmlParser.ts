// Phase 2 — OwlNest forward-email parser (TRIGGER-ONLY mode)
//
// 2026-05-29 policy change: 小洪確認資安政策禁止 OwlTing 在 email 內提供 PII。
// 本 parser 重新定位為「trigger」：只抽 OBE 編號、message_type、accommodation_name (property hint)。
// 其餘欄位（房型/日期/金額/住客/訂購人/電話/email）一律不抽，全部回 null。
// 後續真實資料由 OBE API client 用 OBE 編號到 OwlTing 拉訂單詳情取得。

export type ParsedConfidence = "trigger_only";
export type ParsedMessageType = "new_order" | "modified" | "cancelled" | "unknown";

export interface OwlTingParsedFields {
  message_type: ParsedMessageType;
  obe_number: string | null;
  accommodation_name: string | null;
  // 以下欄位永遠為 null — trigger-only 模式不抽 PII / 訂單細節
  channel_source: null;
  room_type_name: null;
  check_in_date: null;
  check_out_date: null;
  guest_count: null;
  total_amount: null;
  currency: null;
  guest_name: null;
  guest_phone: null;
  guest_email: null;
  pii_masked: false;
  addons: null;
  confidence: ParsedConfidence;
  warnings: string[];
  raw_matches: Record<string, string | null>;
}

const OBE_RE = /\b(OBE[A-Z0-9\-]{6,})\b/i;

export function detectMessageTypeFromBody(text: string): ParsedMessageType {
  if (/取消/.test(text)) return "cancelled";
  if (/修改|變更|更改/.test(text)) return "modified";
  if (/訂單成立|成立通知|新訂單|新訂房/.test(text)) return "new_order";
  return "unknown";
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  // message_type — subject first, body fallback
  let messageType: ParsedMessageType = "unknown";
  if (input.subject) {
    if (/取消|cancel/i.test(input.subject)) messageType = "cancelled";
    else if (/修改|變更|更改|modif/i.test(input.subject)) messageType = "modified";
    else if (/訂單成立|成立通知|新訂單|新訂房|新的訂單|new\s*(order|booking)/i.test(input.subject)) messageType = "new_order";
  }
  if (messageType === "unknown") {
    messageType = detectMessageTypeFromBody(flat);
    if (messageType === "unknown") warnings.push("message_type: undetermined from subject/body");
  }

  // OBE — body first, subject fallback
  const obeMatchBody = flat.match(OBE_RE);
  const obeMatchSubject = input.subject?.match(OBE_RE) ?? null;
  const obe = obeMatchBody?.[1]?.toUpperCase() ?? obeMatchSubject?.[1]?.toUpperCase() ?? null;
  if (!obe) warnings.push("obe_number: not found — cannot trigger OBE API lookup");

  // accommodation hint (subject "來自 X 的" pattern)
  const accSubjMatch = input.subject?.match(/來自\s*(.+?)\s*的/);
  const accommodation = accSubjMatch ? accSubjMatch[1].trim() : null;

  return {
    message_type: messageType,
    obe_number: obe,
    accommodation_name: accommodation,
    channel_source: null,
    room_type_name: null,
    check_in_date: null,
    check_out_date: null,
    guest_count: null,
    total_amount: null,
    currency: null,
    guest_name: null,
    guest_phone: null,
    guest_email: null,
    pii_masked: false,
    addons: null,
    confidence: "trigger_only",
    warnings,
    raw_matches: {
      obe_from_body: obeMatchBody?.[1] ?? null,
      obe_from_subject: obeMatchSubject?.[1] ?? null,
    },
  };
}
