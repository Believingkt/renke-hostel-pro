import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildLiveAvailability, chatGenParams, isLengthFinish, resolveGuests, selectExamples, selectKnowledge, synonymTargets, tokenize } from "./chatContext.ts";
import { toClaudeBody } from "../_shared/llm.ts";

// 假 Supabase：from(table) 回傳可串接、可 await 的查詢；rpc 依房型回傳每晚剩餘
// deno-lint-ignore no-explicit-any
export function fakeSb(tables: Record<string, any[]>, rpcAvail: Record<string, Record<string, number>>) {
  return {
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      const filters: ((r: any) => boolean)[] = [];
      // deno-lint-ignore no-explicit-any
      const q: any = {
        select: () => q,
        // deno-lint-ignore no-explicit-any
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
        // deno-lint-ignore no-explicit-any
        in: (c: string, vs: any[]) => (filters.push((r) => vs.includes(r[c])), q),
        is: (c: string, v: null) => (filters.push((r) => (r[c] ?? null) === v), q),
        // deno-lint-ignore no-explicit-any
        then: (res: any) => res({ data: (tables[table] || []).filter((r) => filters.every((f) => f(r))), error: null }),
      };
      return q;
    },
    // deno-lint-ignore no-explicit-any
    rpc: (_n: string, a: any) =>
      Promise.resolve({ data: a.p_dates.map((d: string) => ({ date: d, available_rooms: rpcAvail[a.p_room_type_id]?.[d] ?? 0, is_blocked: false })), error: null }),
  };
}

export const ROOMS = [
  { id: "r2", name: "雙人房", capacity: 2 },
  { id: "r4", name: "四人房", capacity: 4 },
  { id: "r6", name: "六人包棟", capacity: 6 },
];
export const TABLES = {
  room_inventory_pricing: [
    { room_type_id: "r2", date: "2026-12-01", price: 2000, pricing_template_id: null },
    { room_type_id: "r2", date: "2026-12-02", price: 2200, pricing_template_id: null },
    { room_type_id: "r2", date: "2026-12-24", price: 3000, pricing_template_id: null },
    { room_type_id: "r4", date: "2026-12-01", price: 3500, pricing_template_id: null },
    { room_type_id: "r4", date: "2026-12-02", price: 3500, pricing_template_id: null },
    { room_type_id: "r4", date: "2026-12-24", price: 5000, pricing_template_id: null },
  ],
  accommodation_packages: [
    { id: "p6", name: "包棟含早", accommodation_id: "acc", enabled: true, primary_room_type_id: "r6", sale_price: 8000, original_price: 9000, tier_prices: null, applicable_tiers: null, guest_count_max: 6 },
  ],
  public_holidays: [],
  package_date_prices: [{ package_id: "p6", date: "2026-12-02", sale_price: 7000, original_price: null }],
};
export const AVAIL = {
  r2: { "2026-12-01": 3, "2026-12-02": 1, "2026-12-24": 2 },
  r4: { "2026-12-01": 2, "2026-12-02": 0, "2026-12-24": 1 },
  r6: { "2026-12-01": 1, "2026-12-02": 1, "2026-12-24": 0 },
};

Deno.test("buildLiveAvailability：多晚總價、每晚最低價、任一晚 0 → 額滿、不符人數", async () => {
  const live = await buildLiveAvailability(fakeSb(TABLES, AVAIL), "acc", ROOMS,
    { checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, guests: 4 });
  assert(live.block.includes("入住 2026-12-01、退房 2026-12-03、共 2 晚、4 人"));
  assert(live.block.includes("- 雙人房（容納 2 人）（不符人數）：2晚總價 NT$4200 / 每晚最低價 12/01 NT$2000、12/02 NT$2200 / 剩 1 間"));
  assert(live.block.includes("- 四人房（容納 4 人）：2晚總價 NT$7000 / 每晚最低價 12/01 NT$3500、12/02 NT$3500 / 已額滿（0 間）"));
  assert(live.block.includes("- 六人包棟（容納 6 人）：2晚總價 NT$15000（方案：包棟含早） / 每晚最低價 12/01 NT$8000、12/02 NT$7000 / 剩 1 間"));
  assert(live.block.includes("表中『額滿』或『不符人數』的房型不得推薦可訂。"));
  assertEquals(live.cardPriceByRoom.get("r6"), 8000);
  assertEquals(live.cardPkgByRoom.get("r6")?.packageId, "p6");
  assertEquals(live.availByRoom.get("r4"), 0);
});

Deno.test("buildLiveAvailability：guests 為 null 時省略人數；無日期回詢問說明", async () => {
  const live = await buildLiveAvailability(fakeSb(TABLES, AVAIL), "acc", ROOMS,
    { checkIn: "2026-12-24", checkOut: "2026-12-25", nights: 1, guests: null });
  assert(live.block.includes("入住 2026-12-24、退房 2026-12-25、共 1 晚）"));
  assert(!live.block.includes("不符人數）："));
  const none = await buildLiveAvailability(fakeSb(TABLES, AVAIL), "acc", ROOMS, null);
  assert(none.block.includes("請先詢問日期"));
});

Deno.test("buildLiveAvailability：有一晚缺價 → 總價未設定", async () => {
  const live = await buildLiveAvailability(fakeSb(TABLES, AVAIL), "acc", ROOMS,
    { checkIn: "2026-12-02", checkOut: "2026-12-04", nights: 2, guests: null });
  assert(live.block.includes("- 雙人房（容納 2 人）：2晚總價 未設定 / 每晚最低價 12/02 NT$2200、12/03 未設定"));
});

Deno.test("tokenize：中文 2-gram + 英數", () => {
  assertEquals(tokenize("帶狗 ok"), ["帶狗", "ok"]);
  assertEquals(tokenize("可以帶狗嗎"), ["可以", "以帶", "帶狗", "狗嗎"]);
});

const K = Array.from({ length: 20 }, (_, i) => ({ title: `一般資訊${i}`, content: "內容", tags: [], priority: i }));
Deno.test("selectKnowledge：命中優先，最多 8 筆", () => {
  const rows = [...K, { title: "寵物規定", content: "可帶小型犬", tags: ["寵物", "帶狗"], priority: 0 }];
  const out = selectKnowledge(rows, "可以帶狗嗎", 8);
  assertEquals(out[0].title, "寵物規定");
  assert(out.length <= 8);
});
Deno.test("selectKnowledge：完全沒命中 → priority 前 8", () => {
  const out = selectKnowledge(K, "xyz嗚嗚", 8);
  assertEquals(out.map((k) => k.priority), [19, 18, 17, 16, 15, 14, 13, 12]);
});
Deno.test("selectKnowledge：content 只比對前 200 字", () => {
  const rows = [{ title: "A", content: "x".repeat(200) + "帶狗", tags: [], priority: 9 }, { title: "B", content: "帶狗", tags: [], priority: 1 }];
  assertEquals(selectKnowledge(rows, "帶狗", 8).map((k) => k.title), ["B"]);
});

Deno.test("selectExamples：ideal_response ≤120 字、最多 6 筆", () => {
  const ex = Array.from({ length: 10 }, (_, i) => ({ scenario: `s${i}`, user_message: "u", ideal_response: i === 0 ? "長".repeat(121) : "短" }));
  const out = selectExamples(ex, 6, 120);
  assertEquals(out.length, 6);
  assertEquals(out[0].scenario, "s1");
  assertEquals(selectExamples([{ scenario: "x", user_message: "u", ideal_response: "長".repeat(120) }]).length, 1);
});

Deno.test("chatGenParams：預設 2048 / 0.3，可用環境變數覆寫", () => {
  assertEquals(chatGenParams(() => undefined), { max_tokens: 2048, temperature: 0.3 });
  const env: Record<string, string> = { LLM_MAX_TOKENS: "600", LLM_TEMPERATURE: "0.7" };
  assertEquals(chatGenParams((k) => env[k]), { max_tokens: 600, temperature: 0.7 });
  assertEquals(chatGenParams((k) => ({ LLM_MAX_TOKENS: "abc" } as Record<string, string>)[k]).max_tokens, 2048);
});

Deno.test("Claude 路徑：toClaudeBody 刪 temperature 但保留 max_tokens 2048", () => {
  const out = toClaudeBody({ model: "google/x", stream: true, messages: [], ...chatGenParams(() => undefined) });
  assertEquals(out.max_tokens, 2048);
  assertEquals("temperature" in out, false);
});

const ST = { checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, guests: null };
Deno.test("resolveGuests：本輪沒人數 → 沿用上一則使用者訊息", () => {
  assertEquals(resolveGuests(ST, ["12/1 到 12/3 有房嗎", "我們四個人"])?.guests, 4);
});
Deno.test("resolveGuests：只往回看一則", () => {
  assertEquals(resolveGuests(ST, ["12/1 到 12/3 有房嗎", "好", "我們四個人"])?.guests, null);
});
Deno.test("resolveGuests：本輪有人數優先；區間已解析到的不覆蓋", () => {
  assertEquals(resolveGuests(ST, ["那改 2 位", "我們四個人"])?.guests, 2);
  assertEquals(resolveGuests({ ...ST, guests: 3 }, ["", "我們四個人"])?.guests, 3);
  assertEquals(resolveGuests(null, ["4人"]), null);
});

const KB = [
  ...K,
  { title: "入住退房時間", content: "15:00 入住、11:00 退房。", tags: ["入住", "退房"], priority: 0 },
  { title: "停車資訊", content: "館前可停 3 台車。", tags: ["停車"], priority: 0 },
  { title: "寵物政策", content: "可攜帶 10 公斤以下犬貓。", tags: ["寵物"], priority: 0 },
  { title: "早餐", content: "07:30 供應。", tags: ["早餐"], priority: 0 },
];
Deno.test("同義詞：狗→寵物、車位→停車、check in→入住", () => {
  assertEquals(synonymTargets("可以帶狗嗎"), ["寵物"]);
  assertEquals(synonymTargets("有車位嗎"), ["停車"]);
  assertEquals(synonymTargets("幾點 Check  In"), ["入住"]);
  assertEquals(synonymTargets("你好"), []);
});
Deno.test("可以帶狗嗎 → 寵物政策排第一", () => {
  assertEquals(selectKnowledge(KB, "可以帶狗嗎", 8)[0].title, "寵物政策");
});
Deno.test("有車位嗎 → 停車資訊排第一", () => {
  assertEquals(selectKnowledge(KB, "有車位嗎", 8)[0].title, "停車資訊");
});
Deno.test("幾點 check in → 入住退房時間排第一", () => {
  assertEquals(selectKnowledge(KB, "幾點 check in", 8)[0].title, "入住退房時間");
});
Deno.test("單字 tag 全文命中也算", () => {
  const rows = [...K, { title: "毛孩須知", content: "x", tags: ["狗"], priority: 0 }];
  assertEquals(selectKnowledge(rows, "狗可以進房嗎", 8)[0].title, "毛孩須知");
});
Deno.test("無關問題（你好）→ 退回 priority 前 8", () => {
  assertEquals(selectKnowledge(KB, "你好", 8).map((k) => k.priority), [19, 18, 17, 16, 15, 14, 13, 12]);
});
Deno.test("0 分不收：命中時只回有分數的", () => {
  assertEquals(selectKnowledge(KB, "有車位嗎", 8).map((k) => k.title), ["停車資訊"]);
});

Deno.test("isLengthFinish：length／MAX_TOKENS 視為截斷，stop／null 不算", () => {
  assertEquals(isLengthFinish("length"), true);
  assertEquals(isLengthFinish("MAX_TOKENS"), true);
  assertEquals(isLengthFinish("stop"), false);
  assertEquals(isLengthFinish(null), false);
});
