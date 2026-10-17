// 小安 system prompt 的取材：知識庫／範例篩選、即時房況區塊、輸出參數
import { addDaysISO, type Stay } from "../_shared/roomCards.ts";
import { lowestPackagePricesForRooms, type PackagePriceResult } from "../_shared/packagePricing.ts";

// deno-lint-ignore no-explicit-any
type Sb = any;

export interface KnowledgeRow { category?: string; title: string; content: string; tags?: string[] | null; priority?: number | null }
export interface ExampleRow { scenario: string; user_message: string; ideal_response: string }

/** 中文 2-gram + 英數單字（≥2 字元） */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  for (const run of text.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  for (const w of text.toLowerCase().match(/[a-z0-9]{2,}/g) || []) out.add(w);
  return [...out];
}

/** 依最後一則使用者訊息比對 title／tags／content 前 200 字，取前 limit 筆；完全沒命中退回 priority 排序 */
export function selectKnowledge(rows: KnowledgeRow[], query: string, limit = 8): KnowledgeRow[] {
  const byPriority = [...rows].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const tokens = tokenize(query);
  if (!tokens.length) return byPriority.slice(0, limit);
  const scored = byPriority.map((k) => {
    const title = (k.title || "").toLowerCase();
    const tags = (k.tags || []).join(" ").toLowerCase();
    const body = (k.content || "").slice(0, 200).toLowerCase();
    let s = 0;
    for (const t of tokens) {
      if (title.includes(t)) s += 3;
      if (tags.includes(t)) s += 2;
      if (body.includes(t)) s += 1;
    }
    return { k, s };
  });
  const hit = scored.filter((x) => x.s > 0);
  if (!hit.length) return byPriority.slice(0, limit);
  return hit.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.k);
}

/** 只留 ideal_response ≤ maxLen 字的範例，最多 limit 筆（保持輸入順序） */
export function selectExamples(rows: ExampleRow[], limit = 6, maxLen = 120): ExampleRow[] {
  return rows.filter((e) => [...(e.ideal_response || "")].length <= maxLen).slice(0, limit);
}

/** 輸出長度／溫度；可用 LLM_MAX_TOKENS、LLM_TEMPERATURE 覆寫 */
export function chatGenParams(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): { max_tokens: number; temperature: number } {
  const mt = Number(env("LLM_MAX_TOKENS"));
  const tp = Number(env("LLM_TEMPERATURE"));
  return {
    max_tokens: env("LLM_MAX_TOKENS") && Number.isFinite(mt) && mt > 0 ? Math.floor(mt) : 400,
    temperature: env("LLM_TEMPERATURE") && Number.isFinite(tp) && tp >= 0 ? tp : 0.3,
  };
}

export interface RoomRow { id: string; name: string; capacity?: number | null }

export interface LiveAvailability {
  block: string;
  /** 卡片用：入住當晚價格（卡片顯示「/晚」，維持原行為） */
  cardPriceByRoom: Map<string, number>;
  cardPkgByRoom: Map<string, PackagePriceResult>;
  availByRoom: Map<string, number>;
}

const md = (iso: string) => iso.slice(5).replace("-", "/");

export async function buildLiveAvailability(sb: Sb, accId: string, roomRows: RoomRow[], stay: Stay | null): Promise<LiveAvailability> {
  const cardPriceByRoom = new Map<string, number>();
  const cardPkgByRoom = new Map<string, PackagePriceResult>();
  const availByRoom = new Map<string, number>();
  if (!stay || !roomRows.length) {
    return {
      block: "\n\n## 房況查詢說明\n- 客人尚未提供明確入住日期時，不要說出任何具體當日價格或剩餘間數，請先詢問日期。",
      cardPriceByRoom, cardPkgByRoom, availByRoom,
    };
  }
  const { checkIn, checkOut, nights, guests } = stay;
  const dates = Array.from({ length: nights }, (_, i) => addDaysISO(checkIn, i));
  const ids = roomRows.map((r) => r.id);

  // 每晚房況庫存價（無方案房型用）＋關房
  const invPrice = new Map<string, Map<string, number>>();
  const closed = new Set<string>();
  const { data: inv } = await sb.from("room_inventory_pricing")
    .select("room_type_id, date, price, available_rooms, is_available")
    .in("room_type_id", ids).is("pricing_template_id", null).in("date", dates);
  for (const row of inv || []) {
    if (!invPrice.has(row.room_type_id)) invPrice.set(row.room_type_id, new Map());
    if (row.price > 0) invPrice.get(row.room_type_id)!.set(row.date, Number(row.price));
    if (row.is_available === false) closed.add(row.room_type_id);
  }
  for (const id of closed) availByRoom.set(id, 0);

  // 每晚剩餘：任一晚 0 → 額滿；取各晚最小值
  await Promise.all(roomRows.map(async (r) => {
    if (closed.has(r.id)) return;
    try {
      const { data } = await sb.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: r.id, p_dates: dates, p_accommodation_id: accId,
      });
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) return;
      let min = Infinity;
      for (const x of rows) {
        const n = x.is_blocked ? 0 : Number(x.available_rooms ?? 0);
        min = Math.min(min, Number.isFinite(n) ? n : 0);
      }
      availByRoom.set(r.id, min);
    } catch { /* 忽略庫存查詢失敗 */ }
  }));

  // 方案價：整段最低方案總價＋每晚最低方案價
  const [stayPkg, ...nightPkgs] = await Promise.all([
    lowestPackagePricesForRooms(sb, accId, ids, dates),
    ...dates.map((d) => lowestPackagePricesForRooms(sb, accId, ids, [d])),
  ]);

  const lines = roomRows.map((r) => {
    const perNight: (number | null)[] = dates.map((d, i) =>
      nightPkgs[i].get(r.id)?.saleTotal ?? (stayPkg.has(r.id) ? null : invPrice.get(r.id)?.get(d) ?? null));
    const firstPkg = nightPkgs[0].get(r.id);
    if (firstPkg) { cardPkgByRoom.set(r.id, firstPkg); cardPriceByRoom.set(r.id, firstPkg.saleTotal); }
    else if (perNight[0] != null) cardPriceByRoom.set(r.id, perNight[0]!);

    const total = stayPkg.get(r.id)?.saleTotal
      ?? (perNight.every((p) => p != null) ? perNight.reduce((s, p) => s + (p as number), 0) : null);
    const a = availByRoom.get(r.id);
    const avail = a === undefined ? "未知" : a > 0 ? `剩 ${a} 間` : "已額滿（0 間）";
    const nightTxt = perNight.map((p, i) => `${md(dates[i])} ${p != null ? `NT$${p}` : "未設定"}`).join("、");
    const misfit = guests != null && r.capacity != null && Number(r.capacity) < guests ? "（不符人數）" : "";
    return `- ${r.name}（容納 ${r.capacity ?? "?"} 人）${misfit}：${nights}晚總價 ${total != null ? `NT$${total}` : "未設定"} / 每晚最低價 ${nightTxt} / ${avail}`;
  });

  const head = `入住 ${checkIn}、退房 ${checkOut}、共 ${nights} 晚${guests != null ? `、${guests} 人` : ""}`;
  const block = `\n\n## 即時房況與價格（唯一依據，${head}）\n` + lines.join("\n") +
    `\n\n### 強制規則（不可違反）
- 文字敘述中的價格，只能引用上表「${nights}晚總價」或「每晚最低價」，不可使用起價／底價／自己記憶或推算的金額。
- 若上表顯示「已額滿（0 間）」，文字必須明說該房型此期間已額滿，並建議客人更換日期或改看其他有空房的房型；絕對不可說「幫您鎖定」「可直接訂購」「還有空房」。
- 表中『額滿』或『不符人數』的房型不得推薦可訂。
- 若「未知」或「未設定」，就不要提出具體數字，改請客人以訂房頁為準。
- 卡片與文字必須一致，兩者都以上表為準。`;
  return { block, cardPriceByRoom, cardPkgByRoom, availByRoom };
}
