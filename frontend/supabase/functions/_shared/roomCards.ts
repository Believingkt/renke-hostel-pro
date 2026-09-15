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

