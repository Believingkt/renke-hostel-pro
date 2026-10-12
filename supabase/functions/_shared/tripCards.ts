// 共用：AI 回覆的主題行程圖文卡片區塊
// 與房型卡 [ROOM_CARDS] 同風格；資料一律取自資料庫 trips 表實際查詢結果，模型不得自行編造。
import { nearbyAccommodationIds } from "./tripNearby.ts";

/** 館別小安：周邊無上架行程時注入，文字須照實說、不可列舉行程 */
export const TRIP_NONE_NEARBY_NOTE = `

## 本館周邊行程查詢結果
- 本館與同區域目前尚無上架的主題行程，請照實告知客人「周邊行程建置中」，可簡短詢問偏好以便日後推薦；不可列舉具體行程名稱、套裝或他區行程，系統也不會附上行程卡片。`;

export interface TripCardPayload {
  trip_id: string;
  /** 多語 jsonb（{zh, ja, en}）原樣帶出，前端依當前語系取值 */
  title: unknown;
  cover_image_url: string;
  /** 只有在有個人化情境時才給，否則 null（前端不顯示匹配度徽章） */
  match_score: number | null;
  spot_count: number;
  /** 行程天數，前端依語系轉成「二日 / 2日間 / 2 days」 */
  days: number;
  total_price: number;
  trip_url: string;
}

export function buildTripCardsBlock(cards: TripCardPayload[]): string {
  if (!cards.length) return "";
  return `\n\n[TRIP_CARDS]${JSON.stringify(cards)}[/TRIP_CARDS]`;
}

function validUrl(url: unknown): string {
  if (typeof url !== "string") return "";
  const u = url.trim();
  return /^https?:\/\/\S+$/.test(u) ? u : "";
}

/** 客人是否在問行程／景點／怎麼玩／要求排行程 */
export function detectTripIntent(text: string): boolean {
  const t = (text || "").toLowerCase();
  return /(行程|景點|怎麼玩|玩什麼|有什麼好玩|排個?行程|安排.*(天|日|行程)|一日遊|二日遊|兩天一夜|三天兩夜|周邊景點|附近景點|觀光|旅遊路線|itinerary|things to do|what to do|sightseeing|attraction|plan (a |my )?trip|プラン|観光|見どころ)/i
    .test(t);
}

/** 是否有個人化情境（人數／預算／目的／同行對象）→ 才顯示匹配度 */
export function hasPersonalContext(text: string): boolean {
  const t = text || "";
  return /(\d+\s*(人|位|大人|小孩|名)|預算|budget|親子|帶小孩|小朋友|情侶|蜜月|好友|朋友|家族|家庭|團體|包棟|長輩|寵物|couple|family|kids|friends|honeymoon)/i
    .test(t);
}

/** 從資料庫取得已發布行程，組成卡片（價格、景點數、封面照全部來自 DB）
 *  opts.accommodationId：只保留與該館同館或同 region_1 的行程（依 items 的 room/product 所屬館別判定），沒有就回空陣列 */
export async function fetchTripCards(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: { personalized: boolean; limit?: number; accommodationId?: string | null; visibleAccommodationIds?: string[] },
): Promise<TripCardPayload[]> {
  const limit = Math.max(1, Math.min(5, opts.limit ?? 3));
  const scoped = !!opts.accommodationId;
  const excludeHiddenOnly = opts.visibleAccommodationIds !== undefined;
  const needResolve = scoped || excludeHiddenOnly;
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, cover_url, match_score, items, total_price")
    .eq("status", "published")
    .order("match_score", { ascending: false, nullsFirst: false })
    .limit(needResolve ? 40 : limit);

  if (error || !Array.isArray(data)) return [];

  let rows = data as Array<Record<string, unknown>>;
  const itemsOf = (t: Record<string, unknown>) =>
    Array.isArray(t.items) ? (t.items as Array<Record<string, unknown>>) : [];
  if (needResolve) {
    const productIds = new Set<string>();
    const roomIds = new Set<string>();
    for (const t of rows) {
      for (const i of itemsOf(t)) {
        if (typeof i.ref_id !== "string") continue;
        if (i.ref_type === "product") productIds.add(i.ref_id);
        else if (i.ref_type === "room") roomIds.add(i.ref_id);
      }
    }
    const [prod, room] = await Promise.all([
      productIds.size
        ? supabase.from("trip_products").select("id, accommodation_id").in("id", [...productIds])
        : Promise.resolve({ data: [] }),
      roomIds.size
        ? supabase.from("room_types").select("id, accommodation_id").in("id", [...roomIds])
        : Promise.resolve({ data: [] }),
    ]);
    const accOfRef = new Map<string, string | null>();
    for (const r of prod.data || []) accOfRef.set(`product:${r.id}`, r.accommodation_id ?? null);
    for (const r of room.data || []) accOfRef.set(`room:${r.id}`, r.accommodation_id ?? null);
    const accsOf = (t: Record<string, unknown>): string[] =>
      itemsOf(t)
        .map((i) => accOfRef.get(`${i.ref_type}:${i.ref_id}`))
        .filter((a): a is string => !!a);

    if (scoped) {
      // 指定館別：只留同館或同 region_1 的行程
      const nearby = new Set(await nearbyAccommodationIds(supabase, opts.accommodationId!));
      rows = rows.filter((t) => accsOf(t).some((a) => nearby.has(a)));
    } else {
      // 未指定館別：排除「room/product 館別全部屬隱藏館」的行程（有可見館別或無可解析館別者保留）
      const visible = new Set(opts.visibleAccommodationIds!);
      rows = rows.filter((t) => {
        const accs = accsOf(t);
        return accs.length === 0 || accs.some((a) => visible.has(a));
      });
    }
    rows = rows.slice(0, limit);
  }

  return rows.map((t: Record<string, unknown>) => {
    const items = itemsOf(t);
    const spotCount = items.filter((i) => i.ref_type !== "room").length;
    const days = items.reduce((max, i) => Math.max(max, Number(i.day) || 1), 1);
    return {
      trip_id: String(t.id),
      title: t.title,
      cover_image_url: validUrl(t.cover_url),
      match_score: opts.personalized && t.match_score != null ? Number(t.match_score) : null,
      spot_count: spotCount,
      days,
      total_price: Number(t.total_price) || 0,
      trip_url: `/trips/${t.id}`,
    } satisfies TripCardPayload;
  });
}

export const TRIP_CARD_PROMPT_RULE = `
## 主題行程卡片規則
- 當客人詢問「行程／景點／怎麼玩／幫我排行程」，或說明同行對象與情境（親子、情侶、好友、包棟）想要玩法建議時，請用一段簡短文字說明推薦方向即可；系統會在文字後方自動附上資料庫中的主題行程卡片（封面照、精選景點數、行程總價、查看完整行程按鈕）。
- 你自己「不可」輸出 [TRIP_CARDS] 或 [ROOM_CARDS] 區塊，也不可自行編造行程名稱、景點數、行程價格或照片網址。
- 問房況／房型時走房型卡規則；一般閒聊（天氣、設施、退訂政策）兩種卡片都不需要，也不要提行程清單。
- 同一則回覆不要同時硬塞房型與行程兩種主題，聚焦客人真正問的那一件事。
`;
