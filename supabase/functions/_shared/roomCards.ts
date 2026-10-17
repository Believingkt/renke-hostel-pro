// 共用：AI 回覆的房型圖文卡片區塊（資料一律來自資料庫查詢結果，模型不得自行填寫）

export interface RoomCardPayload {
  room_type_id?: string;
  name: string;
  image_url?: string | null;
  price?: number | null;
  available?: number | null;
  check_in?: string | null;
  check_out?: string | null;
  features?: string | null;
  accommodation_name?: string | null;
  booking_url?: string | null;
  /** 選填：啟用方案售價時的原價（刪除線）與方案名 */
  original_price?: number | null;
  package_name?: string | null;
}

export function buildRoomCardsBlock(cards: RoomCardPayload[]): string {
  if (!cards.length) return "";
  return `\n\n[ROOM_CARDS]${JSON.stringify(cards)}[/ROOM_CARDS]`;
}

/** 只保留有效的 http(s) 圖片網址，其餘視為無圖 */
export function sanitizePhotoUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const u = url.trim();
  return /^https?:\/\/\S+$/.test(u) ? u : "";
}

/**
 * 組「人數・簡短特色」一行：
 * - 描述中若重複房型名稱（資料常見貼上重複），會先移除
 * - 重複片語去除，只留簡短特色
 */
export function buildFeatureLine(
  name: string,
  description: string | null | undefined,
  extras: (string | false | null | undefined)[] = [],
): string {
  const roomName = (name || "").trim();
  let desc = (description || "").replace(/\s+/g, " ").trim();
  if (roomName) {
    // 移除描述中所有房型名稱片段（含全形符號變體）
    desc = desc.split(roomName).join(" ");
  }
  // 去除重複片語（以標點切段後去重）
  const seen = new Set<string>();
  desc = desc
    .split(/[|｜,，、。\/]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    })
    .join("・");
  desc = desc.replace(/[\s・]+/g, "・").replace(/^[・\-—]+|[・\-—]+$/g, "").trim();

  const parts: string[] = [];
  for (const e of extras) if (e) parts.push(String(e));
  if (desc) parts.push(desc.slice(0, 24));

  const out = new Set<string>();
  for (const p of parts) if (p && p !== roomName) out.add(p);
  return Array.from(out).join("・");
}


/** 從文字中抓出日期（支援 2026-07-12、7/12、7月12日），回傳 YYYY-MM-DD（過去日期自動 +1 年） */
export function extractDate(text: string, todayISO: string): string | null {
  const iso = text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}-${String(Number(iso[3])).padStart(2, "0")}`;
  }
  const md = text.match(/(\d{1,2})\s*[\/\-月]\s*(\d{1,2})/);
  if (md) {
    const mo = Number(md[1]);
    const d = Number(md[2]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    let year = Number(todayISO.slice(0, 4));
    const candidate = `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (candidate < todayISO) year += 1;
    return `${year}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 中文數字（一～九十九、兩）轉阿拉伯數字；無法轉換的片段原樣保留 */
export function normalizeCnNumerals(text: string): string {
  return text.replace(/[零〇一二兩两三四五六七八九十]+/g, (m) => {
    if (m.includes("十")) {
      const [a, b, ...more] = m.split("十");
      if (more.length || a.length > 1 || b.length > 1) return m;
      return String((a ? CN_DIGIT[a] : 1) * 10 + (b ? CN_DIGIT[b] : 0));
    }
    return m.split("").map((c) => CN_DIGIT[c]).join("");
  });
}

/** 人數：「4人」「4位」「四個人」「兩大一小」「2大2小」；「四人房」不算 */
export function extractGuests(text: string): number | null {
  const t = normalizeCnNumerals(text);
  const ak = t.match(/(?<![\/月\-\d])(\d{1,2})\s*大(?:人)?(?![床房])\s*(?:(\d{1,2})\s*小(?:孩|朋友)?)?/);
  if (ak) return Number(ak[1]) + (ak[2] ? Number(ak[2]) : 0);
  const p = t.match(/(?<![\/月\-\d])(\d{1,2})\s*(?:個人|个人|人|位)(?!房)/);
  return p && Number(p[1]) > 0 ? Number(p[1]) : null;
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

function validISO(y: number, m: number, d: number): string | null {
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}

const STAY_DATE_RE = /(20\d{2})-(\d{1,2})-(\d{1,2})|(\d{1,2})\s*[\/月\-]\s*(\d{1,2})\s*[日號号]?/;

export interface Stay { checkIn: string; checkOut: string; nights: number; guests: number | null }

/** 入住區間＋人數；只有一個日期時住 1 晚；過去日期推到明年（沿用 extractDate） */
export function extractStay(text: string, today: string): Stay | null {
  const t = normalizeCnNumerals(text);
  const first = t.match(STAY_DATE_RE);
  if (!first || first.index === undefined) return null;
  const checkIn = extractDate(first[0], today);
  if (!checkIn) return null;
  const guests = extractGuests(t);
  const rest = t.slice(first.index + first[0].length);
  const [y, m, d] = checkIn.split("-").map(Number);
  let checkOut: string | null = null;

  const second = rest.match(STAY_DATE_RE);
  const dayOnly = rest.match(/^\s*(?:入住)?\s*(?:到|至|~|～|-|－|—)\s*(\d{1,2})\s*[日號号]?(?!\s*[\/月晚夜人位大小])/)
    || rest.match(/(\d{1,2})\s*[日號号]\s*退房/);
  const nightsM = rest.match(/(\d{1,2})\s*[晚夜]/);
  if (second) {
    const mo = Number(second[2] ?? second[4]);
    const dd = Number(second[3] ?? second[5]);
    const yr = second[1] ? Number(second[1]) : y;
    checkOut = validISO(yr, mo, dd);
    if (checkOut && checkOut <= checkIn && !second[1]) checkOut = validISO(yr + 1, mo, dd);
  } else if (dayOnly) {
    const dd = Number(dayOnly[1]);
    checkOut = dd > d ? validISO(y, m, dd) : (m === 12 ? validISO(y + 1, 1, dd) : validISO(y, m + 1, dd));
  } else if (nightsM) {
    checkOut = addDaysISO(checkIn, Number(nightsM[1]));
  }

  let nights = checkOut ? diffDays(checkIn, checkOut) : 0;
  if (!checkOut || nights < 1 || nights > 30) {
    checkOut = addDaysISO(checkIn, 1);
    nights = 1;
  }
  return { checkIn, checkOut, nights, guests };
}

export const ROOM_CARD_PROMPT_RULE = `
## 房型圖文卡片規則
- 當你在回覆中「查詢房況」或「推薦具體房型」時，請在文字中完整寫出房型名稱（需與房型清單完全一致），系統會自動在回覆後方附上該房型的圖文卡片（照片、價格、剩餘間數、訂房按鈕）。
- 一般閒聊、政策問答、交通問路等不涉及具體房型的情境，不要提及房型名稱清單。
- 你自己「不可」輸出 [ROOM_CARDS] 區塊，也不可自行編造照片網址、價格或剩餘間數；這些資料由系統以資料庫實際查詢結果補上。

## 文字與卡片一致性（最高優先）
- 文字敘述中的「價格」與「剩餘間數／可否訂購」只能引用系統提供的當日查詢結果（即時房況與價格／工具查詢結果），不可使用起價、底價、記憶值或自行推算。
- 剩餘 0 間（已額滿）時，文字必須明說該房型當日已額滿，並建議更換日期或改看其他有空房的房型；不可說「幫您鎖定」「可直接訂購」「還有空房」。
- 若查詢結果沒有價格或房況資料，就不要講具體數字，請客人以訂房頁為準。
`;

