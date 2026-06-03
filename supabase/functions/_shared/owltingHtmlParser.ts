// Phase 2 — OwlNest forward-email parser (TRIGGER-ONLY mode)
//
// 2026-05-29 policy: 小洪確認資安政策禁止 OwlTing 在 email 內提供 PII。
// 本 parser 只抽 trigger 級欄位：obe_number / message_type / accommodation_name / channel_source。
// 其餘訂單細節（房型/日期/金額/住客/訂購人/電話/email）由後續 OBE API client 拉取。
//
// 2026-06-03 升級：
//  - accommodation_name 改從 body「(.+?) 您好」(支援 HTML / 轉寄信)
//  - channel_source 從主旨「^(?:Fwd:\s*)?(\S+)\s*訂單(成立|變更|取消)通知」抓 group 1

export type ParsedConfidence = "trigger_only";
export type ParsedMessageType = "new_order" | "modified" | "cancelled" | "unknown";

export interface OwlTingParsedFields {
  message_type: ParsedMessageType;
  obe_number: string | null;
  accommodation_name: string | null;
  channel_source: string | null;
  // 從 HTML 抓得到就帶出來預填，仍視為 trigger-level（無 PII）
  check_in_date: string | null;
  check_out_date: string | null;
  room_type_name: string | null;
  project_name: string | null;
  room_quantity: number | null;
  guest_count: number | null;
  adult_count: number | null;
  child_count: number | null;
  nights: number | null;
  total_amount: number | null;
  remaining_amount: number | null;
  currency: string | null;
  payment_status: string | null;
  // 以下永遠 null — trigger-only 不抽 PII
  guest_name: null;
  guest_phone: null;
  guest_email: null;
  pii_masked: false;
  addons: null;
  confidence: ParsedConfidence;
  warnings: string[];
  raw_matches: Record<string, string | number | null>;
}

const OBE_RE = /\b(OBE[A-Z0-9\-]{6,})\b/i;
// Capture text immediately before 「您好」, stopping at structural boundaries
// (`{`, `}`, `:`, `：`, newline) so 「To: 小紅旅館 (測試) 您好」→ 「小紅旅館 (測試)」、
// 「} 品雲岫海景渡假會館 您好」→ 「品雲岫海景渡假會館」。
const HELLO_RE = /([^{}:：\n\r]+?)\s*您好/;
// Channel source from subject. Forwarded 信會有「Fwd: 」前綴。
const CHANNEL_SUBJECT_RE = /(?:Fwd:\s*)?(\S+)\s*訂單(?:成立|變更|取消|修改)通知/i;

// 入住 / 退房日期 — 支援多種寫法：
//   「入住日期 2026-08-22」「入住日期：2026/08/22」「入住日 2026.08.22」
//   「Check-in date: 2026-08-22」
// 日期格式接受 - / . 分隔，輸出統一 YYYY-MM-DD
const CHECK_IN_RE = /(?:入住日期|入住日|入住|Check[\s-]*in(?:\s*date)?)\s*[:：]?\s*(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/i;
const CHECK_OUT_RE = /(?:退房日期|退房日|退房|離店日期|離店日|Check[\s-]*out(?:\s*date)?)\s*[:：]?\s*(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/i;

function normalizeDate(y: string, m: string, d: string): string | null {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (!yy || !mm || !dd) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

function extractDate(flat: string, re: RegExp): string | null {
  const m = flat.match(re);
  if (!m) return null;
  return normalizeDate(m[1], m[2], m[3]);
}

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

function extractAccommodationFromHello(flat: string): string | null {
  const m = flat.match(HELLO_RE);
  if (!m) return null;
  const candidate = m[1].trim();
  // Reject empty / pure ascii noise like "To" / "From" / "Date"
  if (!candidate) return null;
  if (/^(to|from|date|subject|cc|bcc|re|fwd)$/i.test(candidate)) return null;
  // Reject overly long match (likely caught CSS / script residue)
  if (candidate.length > 50) return null;
  return candidate;
}

function extractChannelFromSubject(subject: string | null): string | null {
  if (!subject) return null;
  const m = subject.match(CHANNEL_SUBJECT_RE);
  if (!m) return null;
  const ch = m[1].trim();
  if (!ch || ch.length > 30) return null;
  return ch;
}

export function parseOwlNestForwardEmail(input: {
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
}): OwlTingParsedFields {
  const warnings: string[] = [];
  const text = (input.text_body ?? "").trim();
  const html = input.html_body ?? "";
  // 先用 text，沒有再退回 HTML（stripTags 會 collapse whitespace，方便 regex）
  const flatFromText = text ? text.replace(/\s+/g, " ").trim() : "";
  const flatFromHtml = stripTags(html);
  const flat = flatFromText || flatFromHtml;

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

  // accommodation_name — body「您好」pattern，回退主旨「來自 X 的」
  let accommodation = extractAccommodationFromHello(flat);
  if (!accommodation) {
    // fallback: stripped HTML (text body 可能截掉前半段)
    if (flat !== flatFromHtml && flatFromHtml) {
      accommodation = extractAccommodationFromHello(flatFromHtml);
    }
  }
  if (!accommodation && input.subject) {
    const subjMatch = input.subject.match(/來自\s*(.+?)\s*的/);
    if (subjMatch) accommodation = subjMatch[1].trim();
  }
  if (!accommodation) warnings.push("accommodation_name: not found");

  // channel_source — 從主旨
  const channel = extractChannelFromSubject(input.subject);
  if (!channel) warnings.push("channel_source: not found in subject");

  // 入住/退房日期
  // OwlTing email HTML 結構是「入住日期 退房日期 <date1> <date2>」，兩個 label 連在一起，
  // 兩個日期再連在一起 — 先用 pair 模式抓，再 fallback 到單一 label 模式。
  let checkIn: string | null = null;
  let checkOut: string | null = null;
  const PAIR_RE = /入住日期\s*退房日期\s*(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})\s+(\d{4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,2})/;
  const pairM = flatFromHtml.match(PAIR_RE) ?? flat.match(PAIR_RE);
  if (pairM) {
    checkIn = normalizeDate(pairM[1], pairM[2], pairM[3]);
    checkOut = normalizeDate(pairM[4], pairM[5], pairM[6]);
  }
  if (!checkIn) {
    checkIn = extractDate(flat, CHECK_IN_RE)
      ?? (flat !== flatFromHtml && flatFromHtml ? extractDate(flatFromHtml, CHECK_IN_RE) : null);
  }
  if (!checkOut) {
    checkOut = extractDate(flat, CHECK_OUT_RE)
      ?? (flat !== flatFromHtml && flatFromHtml ? extractDate(flatFromHtml, CHECK_OUT_RE) : null);
  }
  if (!checkIn) warnings.push("check_in_date: not found");
  if (!checkOut) warnings.push("check_out_date: not found");

  // 訂購內容區塊：「房型名稱 專案名稱 數量 <room> <project> <qty>」
  // 後接「人數」label。允許 project_name 含空白與符號。
  let roomTypeName: string | null = null;
  let projectName: string | null = null;
  let roomQuantity: number | null = null;
  {
    const re = /房型名稱\s+專案名稱\s+數量\s+(\S+)\s+(.+?)\s+(\d+)\s+(?:人數|入住天數|剩餘尾款|訂單款項|付款狀態|旅客)/;
    const m = flatFromHtml.match(re) ?? flat.match(re);
    if (m) {
      roomTypeName = m[1].trim() || null;
      projectName = m[2].trim() || null;
      const q = Number(m[3]);
      roomQuantity = Number.isFinite(q) && q > 0 ? q : null;
    }
  }

  // 人數：「人數 大人 2 人,小孩 2 人,嬰兒 0 人」→ 總人數 (大人+小孩)
  let guestCount: number | null = null;
  {
    const m = (flatFromHtml + " " + flat).match(/人數\s+大人\s*(\d+)\s*人[,，]?\s*小孩\s*(\d+)\s*人(?:[,，]?\s*嬰兒\s*(\d+)\s*人)?/);
    if (m) {
      const adults = Number(m[1]) || 0;
      const children = Number(m[2]) || 0;
      guestCount = adults + children;
    } else {
      const m2 = (flatFromHtml + " " + flat).match(/人數\s+(\d+)/);
      if (m2) guestCount = Number(m2[1]) || null;
    }
  }

  // 入住天數
  let nights: number | null = null;
  {
    const m = (flatFromHtml + " " + flat).match(/入住天數\s+(\d+)/);
    if (m) {
      const n = Number(m[1]);
      nights = Number.isFinite(n) && n > 0 ? n : null;
    }
  }

  // 剩餘尾款 / 訂單款項 / 付款狀態
  const parseAmount = (label: string): { currency: string | null; amount: number | null } => {
    const re = new RegExp(`${label}\\s+([A-Z]{3})?\\s*([\\d,]+(?:\\.\\d+)?)`);
    const m = (flatFromHtml + " " + flat).match(re);
    if (!m) return { currency: null, amount: null };
    const cur = m[1] ?? null;
    const amt = Number((m[2] ?? "").replace(/,/g, ""));
    return { currency: cur, amount: Number.isFinite(amt) ? amt : null };
  };
  const totalParsed = parseAmount("訂單款項");
  const remainParsed = parseAmount("剩餘尾款");
  const totalAmount = totalParsed.amount;
  const remainingAmount = remainParsed.amount;
  const currency = totalParsed.currency ?? remainParsed.currency;

  let paymentStatus: string | null = null;
  {
    const m = (flatFromHtml + " " + flat).match(/付款狀態\s+([^\s]{1,10})/);
    if (m) paymentStatus = m[1].trim() || null;
  }

  return {
    message_type: messageType,
    obe_number: obe,
    accommodation_name: accommodation,
    channel_source: channel,
    check_in_date: checkIn,
    check_out_date: checkOut,
    room_type_name: roomTypeName,
    project_name: projectName,
    room_quantity: roomQuantity,
    guest_count: guestCount,
    nights,
    total_amount: totalAmount,
    remaining_amount: remainingAmount,
    currency,
    payment_status: paymentStatus,
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
      accommodation_name: accommodation,
      channel_source: channel,
      check_in_date: checkIn,
      check_out_date: checkOut,
      room_type_name: roomTypeName,
      project_name: projectName,
      room_quantity: roomQuantity,
      guest_count: guestCount,
      nights,
      total_amount: totalAmount,
      remaining_amount: remainingAmount,
      currency,
      payment_status: paymentStatus,
    },
  };
}
