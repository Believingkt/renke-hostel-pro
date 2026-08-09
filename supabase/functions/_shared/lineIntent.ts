/**
 * 小安（LINE 管家）意圖解析 — 從 portal-ai-chat 抽出的「最小必要」規則式解析。
 * 不改動 portal-ai-chat；此處僅供 line-webhook 使用。
 */

export type ButlerIntent =
  | "greeting"
  | "search_rooms"
  | "addon"
  | "favorites"
  | "checkout"
  | "unknown";

export interface ParsedIntent {
  intent: ButlerIntent;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guests?: number;
  keyword?: string; // 地區 / 館別關鍵字
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toISO(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 以「日期字串」為單位加減天數（固定用 UTC 錨點，避免伺服器時區造成 off-by-one） */
function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISO(d);
}

/** 解析日期：支援 2026-08-12 / 8/12 / 8月12日 / 今天 / 明天 / 後天 / 這週末 */
export function extractDates(text: string, today: string): { checkIn?: string; checkOut?: string; nights?: number } {
  const found: string[] = [];

  const isoMatches = text.match(/\d{4}-\d{1,2}-\d{1,2}/g) || [];
  for (const m of isoMatches) {
    const [y, mo, d] = m.split("-").map(Number);
    found.push(`${y}-${pad(mo)}-${pad(d)}`);
  }

  const mdMatches = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})/g) || [];
  for (const m of mdMatches) {
    const nums = m.match(/\d{1,2}/g)!;
    const mo = Number(nums[0]);
    const d = Number(nums[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    const year = Number(today.slice(0, 4));
    let iso = `${year}-${pad(mo)}-${pad(d)}`;
    if (iso < today) iso = `${year + 1}-${pad(mo)}-${pad(d)}`;
    found.push(iso);
  }

  if (/今天|今晚/.test(text)) found.push(today);
  if (/明天|明晚/.test(text)) found.push(addDays(today, 1));
  if (/後天/.test(text)) found.push(addDays(today, 2));
  if (/週末|周末|假日/.test(text)) {
    const d = new Date(`${today}T00:00:00Z`);
    const delta = (6 - d.getUTCDay() + 7) % 7; // 下一個週六
    found.push(addDays(today, delta));
  }

  const uniq = Array.from(new Set(found)).sort();
  if (uniq.length === 0) return {};

  const nightsMatch = text.match(/(\d{1,2})\s*(?:晚|夜|night)/i);
  const checkIn = uniq[0];
  let checkOut = uniq[1];
  if (!checkOut) {
    const n = nightsMatch ? Math.max(1, Math.min(14, Number(nightsMatch[1]))) : 1;
    checkOut = addDays(checkIn, n);
  }
  const nights = Math.max(
    1,
    Math.round(
      (new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86400000,
    ),
  );
  return { checkIn, checkOut, nights };
}

export function extractGuests(text: string): number | undefined {
  const m = text.match(/(\d{1,2})\s*(?:個?人|位|大人|pax)/i);
  if (m) {
    const n = Number(m[1]);
    if (n > 0 && n <= 40) return n;
  }
  const zh: Record<string, number> = { 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const zm = text.match(/([一二兩三四五六七八九十])\s*(?:個?人|位)/);
  if (zm) return zh[zm[1]];
  return undefined;
}

const ADDON_KEYWORDS = /票券|門票|加購|體驗|餐券|早餐|晚餐|燒烤|BBQ|下午茶|接送|導覽|活動|景點/i;
const FAVORITE_KEYWORDS = /收藏|我的行程|願望|口袋/;
const CHECKOUT_KEYWORDS = /結帳|付款|下訂|訂房確認|去結帳|買單/;
const GREETING_KEYWORDS = /^(hi|hello|你好|哈囉|嗨|安安|在嗎)/i;
const SEARCH_KEYWORDS = /房|訂|住|空房|入住|包棟|民宿|飯店|旅宿/;

export function parseIntent(text: string, today: string): ParsedIntent {
  const t = (text || "").trim();
  const dates = extractDates(t, today);
  const guests = extractGuests(t);

  let intent: ButlerIntent = "unknown";
  if (CHECKOUT_KEYWORDS.test(t)) intent = "checkout";
  else if (FAVORITE_KEYWORDS.test(t)) intent = "favorites";
  else if (ADDON_KEYWORDS.test(t)) intent = "addon";
  else if (SEARCH_KEYWORDS.test(t) || dates.checkIn || guests) intent = "search_rooms";
  else if (GREETING_KEYWORDS.test(t)) intent = "greeting";

  // 館別（常用簡稱）
  const venueAlias = matchVenueAlias(t);

  // 地區 / 館別關鍵字（去除日期人數雜訊後的中文詞）
  const cleaned = t
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, "")
    .replace(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/g, "")
    .replace(/(\d{1,2})\s*(?:個?人|位|晚|夜)/g, "")
    .trim();
  const keyword = cleaned.length >= 2 ? cleaned.slice(0, 20) : undefined;

  return {
    intent,
    ...dates,
    guests,
    keyword,
    venue: venueAlias?.canonical,
    venueLabel: venueAlias?.label,
  };
}

