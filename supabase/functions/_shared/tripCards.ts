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
  /** 曝光編號：後端記 trip_rec_shown 時產生並寫入 metadata.rec_id，隨卡片帶給前端，供點擊/互動一一對應該次曝光 */
  rec_id?: string | null;
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

/** 由對話文字判斷情境，對應 trips.scenario（family/couple/friends/outdoor），無則 undefined */
export function detectTripScenario(text: string): string | undefined {
  const t = (text || "").toLowerCase();
  if (/(親子|帶小孩|小孩|小朋友|兒童|寶寶|kids|family|子連れ|家族)/.test(t)) return "family";
  if (/(情侶|兩人|二人|約會|蜜月|couple|honeymoon|カップル|デート)/.test(t)) return "couple";
  if (/(朋友|好友|包棟|包區|團體|一群|同事|friends|group|グループ)/.test(t)) return "friends";
  if (/(戶外|登山|步道|健行|爬山|單車|自行車|outdoor|hiking|trail|cycling|アウトドア)/.test(t)) return "outdoor";
  return undefined;
}

/** 從資料庫取得已發布行程，組成卡片（價格、景點數、封面照全部來自 DB）
 *  排序：scoped 時本館行程優先 → 情境(scenario)相符優先 → match_score desc → 以 seed 穩定打散（無 seed 則隨機）
 *  opts.accommodationId：只保留與該館同館或同 region_1 的行程（依 items 的 room/product 所屬館別判定），沒有就回空陣列 */
export async function fetchTripCards(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  opts: {
    personalized: boolean;
    limit?: number;
    accommodationId?: string | null;
    visibleAccommodationIds?: string[];
    scenario?: string;
    seed?: string;
  },
): Promise<TripCardPayload[]> {
  const limit = Math.max(1, Math.min(5, opts.limit ?? 3));
  const scoped = !!opts.accommodationId;
  const excludeHiddenOnly = opts.visibleAccommodationIds !== undefined;
  const needResolve = scoped || excludeHiddenOnly;
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, cover_url, match_score, items, total_price, scenario")
    .eq("status", "published")
    .order("match_score", { ascending: false, nullsFirst: false })
    .limit(40);

  if (error || !Array.isArray(data)) return [];

  let rows = data as Array<Record<string, unknown>>;
  const itemsOf = (t: Record<string, unknown>) =>
    Array.isArray(t.items) ? (t.items as Array<Record<string, unknown>>) : [];
  const accsByRow = new Map<Record<string, unknown>, string[]>();

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
    for (const t of rows) accsByRow.set(t, accsOf(t));

    if (scoped) {
      // 指定館別：只留同館或同 region_1 的行程
      const nearby = new Set(await nearbyAccommodationIds(supabase, opts.accommodationId!));
      rows = rows.filter((t) => (accsByRow.get(t) || []).some((a) => nearby.has(a)));
    } else {
      // 未指定館別：排除「room/product 館別全部屬隱藏館」的行程（有可見館別或無可解析館別者保留）
      const visible = new Set(opts.visibleAccommodationIds!);
      rows = rows.filter((t) => {
        const accs = accsByRow.get(t) || [];
        return accs.length === 0 || accs.some((a) => visible.has(a));
      });
    }
  }

  // 同分打散：有 seed → 以 seed+trip_id 穩定雜湊；無 seed → 每次呼叫隨機（讓同分行程輪流曝光）
  const hashUnit = (s: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return (h >>> 0) / 4294967296;
  };
  const tieOf = new Map<Record<string, unknown>, number>();
  for (const t of rows) tieOf.set(t, opts.seed ? hashUnit(`${opts.seed}:${String(t.id)}`) : Math.random());
  const wantScenario = (opts.scenario || "").trim();

  rows.sort((a, b) => {
    if (scoped) {
      const ao = (accsByRow.get(a) || []).includes(opts.accommodationId!) ? 0 : 1;
      const bo = (accsByRow.get(b) || []).includes(opts.accommodationId!) ? 0 : 1;
      if (ao !== bo) return ao - bo;
    }
    if (wantScenario) {
      const as = a.scenario === wantScenario ? 0 : 1;
      const bs = b.scenario === wantScenario ? 0 : 1;
      if (as !== bs) return as - bs;
    }
    const am = Number(a.match_score) || 0;
    const bm = Number(b.match_score) || 0;
    if (am !== bm) return bm - am;
    return (tieOf.get(a) ?? 0) - (tieOf.get(b) ?? 0);
  });
  rows = rows.slice(0, limit);

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
