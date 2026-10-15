// fin-availability 測試：以記憶體假 client 模擬 PostgREST 篩選，不連網、不讀環境變數。
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAvailability } from "../_shared/availability.ts";
import { bookingUrl, parseFinQuery, sanitizeTerm } from "./core.ts";
import { handleFin, resetRateLimit } from "./handler.ts";

type Row = Record<string, any>;

// 解析 PostgREST 邏輯樹：or(...)/and(...) 可巢狀，葉節點為 col.ilike.%x%
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
function parseLogic(expr: string): (r: Row) => boolean {
  const m = expr.match(/^(and|or)\((.*)\)$/);
  if (m) {
    const kids = splitTop(m[2]).map(parseLogic);
    return m[1] === "and" ? (r) => kids.every((f) => f(r)) : (r) => kids.some((f) => f(r));
  }
  const [col, op, pat] = expr.split(".");
  if (op !== "ilike") throw new Error(`unsupported op ${op}`);
  const needle = pat.replace(/%/g, "").toLowerCase();
  return (r) => String(r[col] ?? "").toLowerCase().includes(needle);
}


function fakeClient(tables: Record<string, Row[]>) {
  const calls: string[] = [];
  const from = (table: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    let opts: any = {};
    let range: [number, number] | null = null;
    const b: any = {
      select: (_c: string, o?: any) => { opts = o || {}; return b; },
      eq: (c: string, v: any) => { preds.push((r) => r[c] === v); return b; },
      in: (c: string, vs: any[]) => { preds.push((r) => vs.includes(r[c])); return b; },
      gt: (c: string, v: any) => { preds.push((r) => r[c] > v); return b; },
      gte: (c: string, v: any) => { preds.push((r) => r[c] >= v); return b; },
      lte: (c: string, v: any) => { preds.push((r) => r[c] <= v); return b; },
      is: (c: string, v: any) => { preds.push((r) => (r[c] ?? null) === v); return b; },
      or: (expr: string) => { preds.push(parseLogic(`or(${expr})`)); return b; },
      order: () => b,
      range: (s: number, e: number) => { range = [s, e]; return b; },
      then: (res: any, rej: any) => {
        calls.push(table);
        let rows = (tables[table] || []).filter((r) => preds.every((p) => p(r)));
        const count = rows.length;
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return Promise.resolve({ data: opts.head ? null : rows, error: null, count }).then(res, rej);
      },
    };
    return b;
  };
  return { client: { from }, calls };
}

const A = "aaaaaaaa-0000-4000-8000-000000000001"; // 森山寫照（宜蘭）
const B = "aaaaaaaa-0000-4000-8000-000000000002"; // 海角（台東，無 alias）
const C = "aaaaaaaa-0000-4000-8000-000000000003"; // 停用
const D = "aaaaaaaa-0000-4000-8000-000000000004"; // 不在入口列表
const RT = { a4: "r-a4", a2: "r-a2", aClosed: "r-ac", b2: "r-b2", bNoPrice: "r-bn", c2: "r-c2", d2: "r-d2" };

function fixture() {
  const rt = (id: string, acc: string, name: string, capacity: number | null, room_count: number) =>
    ({ id, accommodation_id: acc, name, capacity, room_count, display_order: 1, is_exclusive_package: false, is_bound_to_exclusive: false, bound_exclusive_ids: null, blocks_all_inventory: false, blocks_all_target_ids: null });
  const inv = (room_type_id: string, date: string, price: number | null, extra: Row = {}) =>
    ({ room_type_id, date, price, price_2_meals: null, price_3_meals: null, available_rooms: null, is_available: true, pricing_template_id: null, ...extra });
  const nights = ["2026-11-07", "2026-11-08"];
  return {
    accommodation_info: [
      { id: A, name: "森山寫照", region_1: "宜蘭縣", region_2: "冬山鄉", short_url_alias: "senshan", is_active: true, show_on_portal: true },
      { id: B, name: "海角", region_1: "台東縣", region_2: "東河鄉", short_url_alias: null, is_active: true, show_on_portal: true },
      { id: C, name: "停用館", region_1: "宜蘭縣", region_2: null, short_url_alias: "off", is_active: false, show_on_portal: true },
      { id: D, name: "隱藏館", region_1: "宜蘭縣", region_2: null, short_url_alias: "hidden", is_active: true, show_on_portal: false },
    ],
    room_types: [
      rt(RT.a4, A, "四人包棟", 8, 1), rt(RT.a2, A, "雙人房", 2, 2), rt(RT.aClosed, A, "關房房型", 4, 1),
      rt(RT.b2, B, "海景雙人", null, 1), rt(RT.bNoPrice, B, "未定價房", 6, 1),
      rt(RT.c2, C, "停用房", 2, 1), rt(RT.d2, D, "隱藏房", 2, 1),
    ],
    pricing_templates: [],
    public_holidays: [],
    room_inventory_pricing: [
      ...nights.map((d) => inv(RT.a4, d, 12800)),
      ...nights.map((d) => inv(RT.a2, d, 3000 + (d === "2026-11-08" ? 500 : 0))),
      inv(RT.aClosed, "2026-11-07", 4000), inv(RT.aClosed, "2026-11-08", 4000, { is_available: false }), // 11/8 手動關房
      ...nights.map((d) => inv(RT.b2, d, 2500)),
      inv(RT.bNoPrice, "2026-11-07", 5000), inv(RT.bNoPrice, "2026-11-08", null),
      ...nights.map((d) => inv(RT.c2, d, 1000)), ...nights.map((d) => inv(RT.d2, d, 1000)),
    ],
    // 雙人房 2 間，11/7–11/8 已有 1 間 confirmed
    orders: [
      { id: "o1", accommodation_id: A, room_type_id: RT.a2, check_in_date: "2026-11-07", check_out_date: "2026-11-08", order_status: "confirmed", lock_whole_building: false },
      { id: "o2", accommodation_id: A, room_type_id: RT.a2, check_in_date: "2026-11-01", check_out_date: "2026-11-03", order_status: "confirmed", lock_whole_building: false },
      { id: "o3", accommodation_id: A, room_type_id: RT.a2, check_in_date: "2026-11-07", check_out_date: "2026-11-09", order_status: "cancelled", lock_whole_building: false },
    ],
    order_rooms: [{ id: "or1", order_id: "o1", room_type_id: RT.a2, quantity: 1 }],
  };
}

const KEY = "test-fin-key-0123456789";
const call = async (qs: string, opts: { key?: string | null; apiKey?: string; tables?: Record<string, Row[]> } = {}) => {
  const { client } = fakeClient(opts.tables ?? fixture());
  const headers: Record<string, string> = {};
  if (opts.key !== null) headers["x-api-key"] = opts.key ?? KEY;
  const res = await handleFin(new Request(`https://x.test/fin-availability?${qs}`, { headers }), { client, apiKey: "apiKey" in opts ? opts.apiKey : KEY });
  return { status: res.status, body: await res.json(), headers: res.headers };
};

Deno.test("1. 認證：無 key／錯 key → 401；缺 env → 500；正確 key + ping=1 → 200 ok 與啟用館數", async () => {
  resetRateLimit();
  assertEquals((await call("ping=1", { key: null })).status, 401);
  assertEquals((await call("ping=1", { key: "wrong" })).status, 401);
  assertEquals((await call("ping=1", { key: KEY + "x" })).status, 401);
  const miss = await call("ping=1", { apiKey: undefined });
  assertEquals(miss.status, 500);
  assert(typeof miss.body.error === "string");
  const ok = await call("ping=1");
  assertEquals(ok.status, 200);
  assertEquals(ok.body, { ok: true, accommodations: 2 }); // 停用與不在入口列表的館不算
});

Deno.test("2. 全館 2 夜：200、扁平欄位、每筆有 booking_url、total_price 為數字或 null、依價格升冪", async () => {
  resetRateLimit();
  const r = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2");
  assertEquals(r.status, 200);
  assertEquals([r.body.check_in, r.body.check_out, r.body.nights, r.body.guests, r.body.currency], ["2026-11-07", "2026-11-09", 2, 2, "TWD"]);
  const names = r.body.results.map((x: Row) => x.room_type_name);
  assertEquals(names, ["海景雙人", "雙人房", "四人包棟", "未定價房"]);
  for (const x of r.body.results) {
    assert(x.booking_url.startsWith("https://booking.lakeze.com/"));
    assert(x.total_price === null || typeof x.total_price === "number");
    assertEquals(x.available, true);
    assert(!("days" in x));
  }
  const four = r.body.results.find((x: Row) => x.room_type_id === RT.a4);
  assertEquals([four.total_price, four.avg_nightly_price, four.capacity, four.region], [25600, 12800, 8, "宜蘭縣 冬山鄉"]);
  assertEquals(four.booking_url, "https://booking.lakeze.com/senshan?checkIn=2026-11-07&checkOut=2026-11-09&adults=2");
  const noAlias = r.body.results.find((x: Row) => x.room_type_id === RT.b2);
  assertEquals(noAlias.booking_url, `https://booking.lakeze.com/booking/villa/${B}?checkIn=2026-11-07&checkOut=2026-11-09&adults=2`);
  assertEquals(noAlias.capacity, null); // capacity null 視為符合
  const np = r.body.results.find((x: Row) => x.room_type_id === RT.bNoPrice);
  assertEquals([np.total_price, np.avg_nightly_price, np.price_note], [null, null, "請洽客服"]);
  assertEquals(r.body.message, "共 4 間可訂");
  assert(!names.includes("停用房") && !names.includes("隱藏房"));
});

Deno.test("3. 手動關房：關房那晚所屬房型不在 results，unavailable_count +1", async () => {
  resetRateLimit();
  const r = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2");
  assert(!r.body.results.some((x: Row) => x.room_type_id === RT.aClosed));
  assertEquals(r.body.unavailable_count, 1);
  const t = fixture();
  t.room_inventory_pricing = t.room_inventory_pricing.map((i) => i.room_type_id === RT.aClosed ? { ...i, is_available: true } : i);
  const open = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2", { tables: t });
  assert(open.body.results.some((x: Row) => x.room_type_id === RT.aClosed));
  assertEquals(open.body.unavailable_count, 0);
});

Deno.test("4. confirmed 訂單扣房：雙人房 2 間被訂 1 間 → remaining 1；取消單與期間外訂單不扣", async () => {
  resetRateLimit();
  const r = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2");
  assertEquals(r.body.results.find((x: Row) => x.room_type_id === RT.a2).remaining, 1);
  const r2 = await call("check_in=2026-11-08&check_out=2026-11-09&guests=2");
  assertEquals(r2.body.results.find((x: Row) => x.room_type_id === RT.a2).remaining, 2);
  const t = fixture();
  t.order_rooms = [{ id: "or1", order_id: "o1", room_type_id: RT.a2, quantity: 2 }];
  const full = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2", { tables: t });
  assert(!full.body.results.some((x: Row) => x.room_type_id === RT.a2));
  assertEquals(full.body.unavailable_count, 2);
});

Deno.test("5. 輸入驗證：退房 ≤ 入住、超過 14 晚、日期格式錯、guests 非整數 → 400 繁中錯誤", async () => {
  resetRateLimit();
  for (const qs of [
    "check_in=2026-11-09&check_out=2026-11-09", "check_in=2026-11-09&check_out=2026-11-07",
    "check_in=2026-11-01&check_out=2026-11-16", "check_in=2026/11/07&check_out=2026-11-09",
    "check_in=2026-11-07&check_out=2026-13-01", "check_in=2026-11-07", "check_in=2026-11-07&check_out=2026-11-09&guests=abc",
    "check_in=2026-11-07&check_out=2026-11-09&guests=0",
  ]) {
    const r = await call(qs);
    assertEquals(r.status, 400, qs);
    assert(/[\u4e00-\u9fff]/.test(r.body.error), qs);
  }
  assertEquals((await call("check_in=2026-11-01&check_out=2026-11-15")).status, 200); // 剛好 14 晚
});

Deno.test("6. region／accommodation 部分比對；guests 篩 capacity", async () => {
  resetRateLimit();
  const yilan = await call(`check_in=2026-11-07&check_out=2026-11-09&region=${encodeURIComponent("宜蘭")}`);
  assert(yilan.body.results.length > 0 && yilan.body.results.every((x: Row) => x.accommodation_id === A));
  const dongshan = await call(`check_in=2026-11-07&check_out=2026-11-09&region=${encodeURIComponent("冬山")}`);
  assert(dongshan.body.results.every((x: Row) => x.accommodation_id === A));
  const sen = await call(`check_in=2026-11-07&check_out=2026-11-09&accommodation=${encodeURIComponent("森山")}`);
  assert(sen.body.results.every((x: Row) => x.accommodation_name === "森山寫照"));
  const alias = await call("check_in=2026-11-07&check_out=2026-11-09&accommodation=SENSHAN");
  assert(alias.body.results.length > 0 && alias.body.results.every((x: Row) => x.accommodation_id === A));
  const both = await call(`check_in=2026-11-07&check_out=2026-11-09&region=${encodeURIComponent("宜蘭")}&accommodation=${encodeURIComponent("森山")}`);
  assert(both.body.results.length > 0 && both.body.results.every((x: Row) => x.accommodation_id === A));
  const mismatch = await call(`check_in=2026-11-07&check_out=2026-11-09&region=${encodeURIComponent("宜蘭")}&accommodation=${encodeURIComponent("海角")}`);
  assertEquals(mismatch.body.results, []); // region 與 accommodation 為 AND
  const none = await call(`check_in=2026-11-07&check_out=2026-11-09&region=${encodeURIComponent("花蓮")}`);
  assertEquals([none.status, none.body.results, none.body.unavailable_count, none.body.message], [200, [], 0, "這段日期沒有符合的房型"]);
  const six = await call("check_in=2026-11-07&check_out=2026-11-09&guests=6");
  assertEquals(six.body.results.map((x: Row) => x.room_type_name).sort(), ["四人包棟", "未定價房", "海景雙人"].sort());
  assertEquals(six.body.guests, 6);
});

Deno.test("8. 與 all-availability 同源：remaining＝各晚最小、total＝各晚 price 加總（同一 buildAvailability）", async () => {
  resetRateLimit();
  const t = fixture();
  const r = await call("check_in=2026-11-07&check_out=2026-11-09&guests=1", { tables: t });
  const ref = buildAvailability({
    from: "2026-11-07", to: "2026-11-08",
    roomTypes: t.room_types.filter((x) => x.accommodation_id === A) as any,
    inventory: t.room_inventory_pricing.filter((i) => [RT.a4, RT.a2, RT.aClosed].includes(i.room_type_id)) as any,
    orders: t.orders.filter((o) => o.order_status === "confirmed") as any,
    orderRooms: t.order_rooms as any, templates: [], holidays: [],
  });
  for (const rt of ref) {
    const days = rt.days;
    const row = r.body.results.find((x: Row) => x.room_type_id === rt.room_type_id);
    if (!days.every((d) => d.is_available && d.remaining > 0)) { assertEquals(row, undefined); continue; }
    assertEquals(row.remaining, Math.min(...days.map((d) => d.remaining)));
    assertEquals(row.total_price, days.reduce((s, d) => s + (d.price ?? 0), 0));
  }
});

Deno.test("限制：最多 10 筆、message 以全部可訂數計；rate limit 每分鐘 60 次；CORS 允許 x-api-key、OPTIONS 204", async () => {
  resetRateLimit();
  const t = fixture();
  for (let i = 0; i < 12; i++) {
    t.room_types.push({ ...t.room_types[0], id: `r-x${i}`, name: `加房${i}`, capacity: 2, room_count: 1 });
    for (const d of ["2026-11-07", "2026-11-08"]) t.room_inventory_pricing.push({ ...t.room_inventory_pricing[0], room_type_id: `r-x${i}`, date: d, price: 100 + i });
  }
  const r = await call("check_in=2026-11-07&check_out=2026-11-09", { tables: t });
  assertEquals(r.body.results.length, 10);
  assertEquals(r.body.message, "共 16 間可訂");
  assertEquals(r.body.results[0].total_price, 200);
  resetRateLimit();
  for (let i = 0; i < 60; i++) assertEquals((await call("ping=1")).status, 200);
  const limited = await call("ping=1");
  assertEquals(limited.status, 429);
  resetRateLimit();
  const opt = await handleFin(new Request("https://x.test/fin-availability", { method: "OPTIONS" }), { client: fakeClient({}).client, apiKey: KEY });
  assert(opt.headers.get("Access-Control-Allow-Headers")!.includes("x-api-key"));
  assertEquals(opt.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  assertEquals((await handleFin(new Request("https://x.test/f", { method: "POST" }), { client: fakeClient({}).client, apiKey: KEY })).status, 405);
});

Deno.test("core：sanitizeTerm 移除 PostgREST 語法字元；lastNight 為退房前一晚；alias 編碼", () => {
  assertEquals(sanitizeTerm("宜蘭,name.eq.x)"), "宜蘭 name eq x");
  assertEquals(sanitizeTerm("%%"), null);
  const p = parseFinQuery(new URLSearchParams("check_in=2026-12-31&check_out=2027-01-02"));
  assert(p.ok && p.q.lastNight === "2027-01-01" && p.q.nights === 2 && p.q.guests === 2);
  assertEquals(bookingUrl({ id: "x", short_url_alias: "a b" }, { checkIn: "2026-01-01", checkOut: "2026-01-02", guests: 3 }),
    "https://booking.lakeze.com/a%20b?checkIn=2026-01-01&checkOut=2026-01-02&adults=3");
});

Deno.test("分頁：館別超過 1000 列（PostgREST 單頁上限）仍能取到第 2 頁的館", async () => {
  resetRateLimit();
  const t = fixture();
  const dummies = Array.from({ length: 1100 }, (_, i) => ({ id: `dummy-${i}`, name: `空館${i}`, region_1: null, region_2: null, short_url_alias: null, is_active: true, show_on_portal: true }));
  (t as Record<string, Row[]>).accommodation_info = [...dummies, ...t.accommodation_info];
  const r = await call("check_in=2026-11-07&check_out=2026-11-09", { tables: t });
  assertEquals(r.body.message, "共 4 間可訂");
  assertEquals((await call("ping=1", { tables: t })).body.accommodations, 1102);
});
