// fin-availability 測試：以記憶體假 client 模擬 PostgREST 篩選，不連網、不讀環境變數。
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAvailability } from "../_shared/availability.ts";
import { bookingUrl, discountLabel, parseFinQuery, sanitizeTerm } from "./core.ts";
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
  const i1 = expr.indexOf("."), i2 = expr.indexOf(".", i1 + 1);
  const col = expr.slice(0, i1), op = expr.slice(i1 + 1, i2), val = expr.slice(i2 + 1);
  if (op === "eq") return (r) => String(r[col]) === val;
  if (op === "gt") return (r) => r[col] > val;
  if (op === "in") { const vs = val.replace(/^\(|\)$/g, "").split(","); return (r) => vs.includes(r[col]); }
  if (op !== "ilike") throw new Error(`unsupported op ${op}`);
  const needle = val.replace(/%/g, "").toLowerCase();
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
      neq: (c: string, v: any) => { preds.push((r) => r[c] !== v); return b; },
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
const D = "aaaaaaaa-0000-4000-8000-000000000004"; // 非首頁精選（show_on_portal=false）但啟用 → 仍可查
const RT = { a4: "r-a4", a2: "r-a2", aClosed: "r-ac", b2: "r-b2", bNoPrice: "r-bn", c2: "r-c2", d2: "r-d2" };

function fixture() {
  const rt = (id: string, acc: string, name: string, capacity: number | null, room_count: number): Row =>
    ({ id, accommodation_id: acc, name, capacity, room_count, display_order: 1, is_exclusive_package: false, is_bound_to_exclusive: false, bound_exclusive_ids: null, blocks_all_inventory: false, blocks_all_target_ids: null });
  const inv = (room_type_id: string, date: string, price: number | null, extra: Row = {}): Row =>
    ({ room_type_id, date, price, price_2_meals: null, price_3_meals: null, available_rooms: null, is_available: true, pricing_template_id: null, ...extra });
  const nights = ["2026-11-07", "2026-11-08"];
  return {
    accommodation_info: [
      { id: A, name: "森山寫照", region_1: "宜蘭縣", region_2: "冬山鄉", short_url_alias: "senshan", is_active: true, show_on_portal: true },
      { id: B, name: "海角", region_1: "台東縣", region_2: "東河鄉", short_url_alias: null, is_active: true, show_on_portal: true },
      { id: C, name: "停用館", region_1: "宜蘭縣", region_2: null, short_url_alias: "off", is_active: false, show_on_portal: true },
      { id: D, name: "非精選館", region_1: "宜蘭縣", region_2: null, short_url_alias: "hidden", is_active: true, show_on_portal: false },
    ],
    room_types: [
      rt(RT.a4, A, "四人包棟", 8, 1), rt(RT.a2, A, "雙人房", 2, 2), rt(RT.aClosed, A, "關房房型", 4, 1),
      rt(RT.b2, B, "海景雙人", null, 1), rt(RT.bNoPrice, B, "未定價房", 6, 1),
      rt(RT.c2, C, "停用房", 2, 1), rt(RT.d2, D, "非精選房", 2, 1),
    ],
    pricing_templates: [],
    public_holidays: [] as Row[],
    group_buy_payment_drafts: [] as Row[],
    accommodation_packages: [] as Row[],
    package_date_prices: [] as Row[],
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
  assertEquals(ok.body, { ok: true, accommodations: 3 }); // 只排除停用館；show_on_portal=false 仍算
});

Deno.test("2. 全館 2 夜：200、扁平欄位、每筆有 booking_url、total_price 為數字或 null、依價格升冪", async () => {
  resetRateLimit();
  const r = await call("check_in=2026-11-07&check_out=2026-11-09&guests=2");
  assertEquals(r.status, 200);
  assertEquals([r.body.check_in, r.body.check_out, r.body.nights, r.body.guests, r.body.currency], ["2026-11-07", "2026-11-09", 2, 2, "TWD"]);
  const names = r.body.results.map((x: Row) => x.room_type_name);
  assertEquals(names, ["非精選房", "海景雙人", "雙人房", "四人包棟", "未定價房"]);
  for (const x of r.body.results) {
    assert(x.booking_url.startsWith("https://booking.lakeze.com/"));
    assert(x.total_price === null || typeof x.total_price === "number");
    assertEquals(x.available, true);
    assertEquals(x.plan_name, null); // 無方案的館
    assertEquals(x.list_price, x.total_price);
    assert(!("discount_label" in x));
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
  assertEquals(r.body.message, "共 5 間可訂");
  assert(!names.includes("停用房"));
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
  assert(yilan.body.results.some((x: Row) => x.accommodation_id === D)); // 非首頁精選也查得到
  assert(yilan.body.results.length > 0 && yilan.body.results.every((x: Row) => [A, D].includes(x.accommodation_id)));
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
  assertEquals(r.body.message, "共 17 間可訂");
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
  assertEquals(r.body.message, "共 5 間可訂");
  assertEquals((await call("ping=1", { tables: t })).body.accommodations, 1103);
});

// ── 方案（accommodation_packages）計價與可訂判斷 ──
const S = "aaaaaaaa-0000-4000-8000-0000000000s1"; // 包區館
const SRT = { p12: "r-s12", p14: "r-s14", dbl: "r-sdbl" };
function pkgFixture() {
  const t = fixture();
  t.accommodation_info.push({ id: S, name: "包區館", region_1: "宜蘭縣", region_2: null, short_url_alias: "pkg", is_active: true, show_on_portal: false });
  const ex = (id: string, name: string, capacity: number) => ({ ...t.room_types[0], id, accommodation_id: S, name, capacity, room_count: 1, is_exclusive_package: true, is_bound_to_exclusive: true, bound_exclusive_ids: [] });
  t.room_types.push(ex(SRT.p12, "12 人包區", 12), ex(SRT.p14, "14 人包區", 14), { ...t.room_types[0], id: SRT.dbl, accommodation_id: S, name: "雙人房", capacity: 2 });
  for (const d of ["2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]) {
    for (const id of [SRT.p12, SRT.p14]) t.room_inventory_pricing.push({ ...t.room_inventory_pricing[0], room_type_id: id, date: d, price: 51700, available_rooms: 1 });
    t.room_inventory_pricing.push({ ...t.room_inventory_pricing[0], room_type_id: SRT.dbl, date: d, price: 6000, available_rooms: 1 });
  }
  const pkg = (id: string, name: string, guest: number, rt: string, extra: Row = {}) => ({
    id, accommodation_id: S, name, guest_count: guest, guest_count_max: null, enabled: true, display_order: guest,
    applicable_tiers: ["weekday", "friday_sunday", "weekend"], primary_room_type_id: rt, room_type_ids: [rt],
    original_price: 47000, sale_price: 35250, tier_prices: { weekend: { sale: 43500, original: 58000 } }, excluded_date_ranges: [], ...extra,
  });
  t.accommodation_packages = [
    pkg("pk12", "12人包區", 12, SRT.p12),
    pkg("pk14", "14人包區", 14, SRT.p14, { original_price: 54000, sale_price: 40500, tier_prices: { weekend: { sale: 49500, original: 66000 } } }),
    pkg("pkOff", "停用方案", 6, SRT.p12, { enabled: false }),
  ];
  return t;
}
const sq = (ci: string, co: string, extra = "") => `check_in=${ci}&check_out=${co}&accommodation=${encodeURIComponent("包區館")}${extra}`;

Deno.test("方案館：以方案為單位、折後實付價與人客多優惠標籤（平日 47000 → 35250）", async () => {
  resetRateLimit();
  const r = await call(sq("2026-12-01", "2026-12-02"), { tables: pkgFixture() });
  assertEquals(r.body.results.map((x: Row) => x.plan_name), ["12人包區", "14人包區"]); // 停用方案、未綁方案的雙人房不列
  const p12 = r.body.results[0];
  assertEquals([p12.list_price, p12.discount_label, p12.total_price, p12.avg_nightly_price, p12.room_type_name, p12.capacity],
    [47000, "人客多優惠 -25%", 35250, 35250, "12 人包區", 12]);
  assertEquals(r.body.unavailable_count, 0);
});

Deno.test("方案館：跨週六＋週日逐晚取 tier 價（58000+47000 → 43500+35250）；國定假日視為 weekend", async () => {
  resetRateLimit();
  const r = await call(sq("2026-11-28", "2026-11-30"), { tables: pkgFixture() });
  const p12 = r.body.results.find((x: Row) => x.plan_name === "12人包區");
  assertEquals([p12.list_price, p12.total_price, p12.avg_nightly_price, p12.discount_label], [105000, 78750, 39375, "人客多優惠 -25%"]);
  const t = pkgFixture();
  t.public_holidays.push({ id: "h1", accommodation_id: S, holiday_date: "2026-12-01", holiday_type: "holiday" });
  const h = await call(sq("2026-12-01", "2026-12-02"), { tables: t });
  assertEquals(h.body.results[0].total_price, 43500);
  t.public_holidays[0].holiday_type = "work_on_weekend"; // 補班日不算假日
  assertEquals((await call(sq("2026-12-01", "2026-12-02"), { tables: t })).body.results[0].total_price, 35250);
});

Deno.test("方案館：單日指定價優先、單日關閉／不適用區間／入住日 tier 不適用 → 不列出並計入 unavailable", async () => {
  resetRateLimit();
  const t = pkgFixture();
  t.package_date_prices.push({ id: "d1", accommodation_id: S, package_id: "pk12", date: "2026-12-01", sale_price: 30000, original_price: null, is_available: null });
  const ov = await call(sq("2026-12-01", "2026-12-02"), { tables: t });
  assertEquals([ov.body.results[0].total_price, ov.body.results[0].list_price, ov.body.results[0].discount_label], [30000, 30000, undefined]);

  const off = pkgFixture();
  off.package_date_prices.push({ id: "d2", accommodation_id: S, package_id: "pk12", date: "2026-11-29", sale_price: null, original_price: null, is_available: false });
  const o = await call(sq("2026-11-28", "2026-11-30"), { tables: off });
  assertEquals([o.body.results.map((x: Row) => x.plan_name), o.body.unavailable_count], [["14人包區"], 1]);

  const exc = pkgFixture();
  exc.accommodation_packages[0].excluded_date_ranges = [{ start: "2026-11-29", end: "2026-11-29" }];
  assertEquals((await call(sq("2026-11-28", "2026-11-30"), { tables: exc })).body.unavailable_count, 1);

  const tier = pkgFixture();
  tier.accommodation_packages[0].applicable_tiers = ["weekday"];
  const tw = await call(sq("2026-11-28", "2026-11-29"), { tables: tier }); // 週六入住
  assertEquals([tw.body.results.map((x: Row) => x.plan_name), tw.body.unavailable_count], [["14人包區"], 1]);
  assertEquals((await call(sq("2026-12-01", "2026-12-02"), { tables: tier })).body.results.length, 2); // 平日入住可訂
});

Deno.test("方案館：包區被訂走 → 其他包區互斥鎖住（對齊 RPC，訂單狀態 cancelled 以外都算）", async () => {
  resetRateLimit();
  const t = pkgFixture();
  (t.orders as Row[]).push({ id: "so1", accommodation_id: S, room_type_id: SRT.p14, check_in_date: "2026-11-28", check_out_date: "2026-11-29", order_status: "checked_out", lock_whole_building: false });
  const r = await call(sq("2026-11-28", "2026-11-30"), { tables: t });
  assertEquals([r.body.results, r.body.unavailable_count, r.body.message], [[], 2, "這段日期沒有符合的房型"]);
  (t.orders as Row[])[t.orders.length - 1].order_status = "cancelled";
  assertEquals((await call(sq("2026-11-28", "2026-11-30"), { tables: t })).body.results.length, 2);
});

Deno.test("團購信用卡付款保留：付款中未過期、已付款待建單會扣房；已過期、已轉單不扣", async () => {
  resetRateLimit();
  const future = new Date(Date.now() + 3600_000).toISOString();
  const past = new Date(Date.now() - 3600_000).toISOString();
  const draft = (id: string, extra: Row) => ({ id, accommodation_id: A, room_type_id: RT.a2, check_in_date: "2026-11-07", check_out_date: "2026-11-09", room_quantity: 1, converted_order_id: null, status: "pending", expires_at: future, ...extra });
  const remain = async (drafts: Row[]) => {
    const t = fixture();
    t.group_buy_payment_drafts = drafts;
    return (await call("check_in=2026-11-07&check_out=2026-11-09&guests=2", { tables: t })).body.results.find((x: Row) => x.room_type_id === RT.a2)?.remaining;
  };
  assertEquals(await remain([]), 1); // 基準：2 間被 o1 訂 1 間
  assertEquals(await remain([draft("g1", {})]), undefined); // 付款中 → 再扣 1 → 0 間不可訂
  assertEquals(await remain([draft("g2", { status: "paid", expires_at: past })]), undefined);
  assertEquals(await remain([draft("g3", { expires_at: past })]), 1);
  assertEquals(await remain([draft("g4", { converted_order_id: "o9" })]), 1);
  assertEquals(await remain([draft("g5", { status: "failed" })]), 1);
});

Deno.test("core：discountLabel 與前台 calcDiscountPercent 相同四捨五入；無折扣省略", () => {
  assertEquals(discountLabel(47000, 35250), "人客多優惠 -25%");
  assertEquals(discountLabel(30900, 17000), "人客多優惠 -45%");
  assertEquals(discountLabel(100, 100), undefined);
  assertEquals(discountLabel(null, 100), undefined);
});
