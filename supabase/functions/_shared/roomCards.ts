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

