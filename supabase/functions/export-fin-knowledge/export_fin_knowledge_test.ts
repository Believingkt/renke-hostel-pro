// export-fin-knowledge 測試：記憶體假 client，不連網。
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { marked } from "https://esm.sh/marked@12.0.2";
import { escapeBlock } from "./core.ts";
import { handleExport } from "./handler.ts";
import { TW_DEFAULT_CANCEL_LABELS } from "./platform.ts";

type Row = Record<string, any>;
function fakeClient(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const preds: ((r: Row) => boolean)[] = [];
    let range: [number, number] | null = null;
    const run = () => {
      let rows = (tables[table] || []).filter((r) => preds.every((p) => p(r)));
      if (range) rows = rows.slice(range[0], range[1] + 1);
      return rows;
    };
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => { preds.push((r) => r[c] === v); return b; },
      in: (c: string, vs: any[]) => { preds.push((r) => vs.includes(r[c])); return b; },
      order: () => b,
      range: (s: number, e: number) => { range = [s, e]; return b; },
      maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return b;
  };
  return { from };
}

const S = "5f764d55-ae11-4631-80fe-2e611853deae";
const E = "aaaaaaaa-0000-4000-8000-00000000000e"; // 空資料館
const OFF = "aaaaaaaa-0000-4000-8000-0000000000ff";
const RT12 = "57861c83-09ae-4366-9ad5-56c0d511bbf3", RT2 = "b415b602-7cca-4f35-829e-2b9cc0cd0bac";
const fixture = () => ({
  accommodation_info: [
    { id: S, name: "森山寫照", short_url_alias: "sensaninn", region_1: "宜蘭縣", region_2: "冬山鄉", address: "宜蘭縣冬山鄉某路 1 號", phone: "03-1234567", line_id: "@sensan", website_url: null,
      description: "森林裡的包區民宿。\n# 這行不是標題", check_in_notice: "<p>請於 22:00 前抵達。</p>", nearby_station: null, is_active: true,
      email: "owner-private@example.com", bank_account_info: "SECRET-BANK-123", show_room_facilities_whole: true, show_room_facilities_single: true },
    { id: E, name: "空資料館", short_url_alias: null, region_1: null, region_2: null, address: null, phone: null, line_id: null, website_url: null, description: "  ", check_in_notice: null, is_active: true },
    { id: OFF, name: "停用館", short_url_alias: "off", is_active: false },
  ],
  booking_settings: [{ id: "bs1", accommodation_id: S, check_in_time: "15:00:00", check_out_time: "11:00:00", cancellation_policy: "依定型化契約辦理。", pet_policy: "", other_notes: null, bank_account_info: "SECRET-BANK-123" }],
  room_types: [
    { id: RT12, accommodation_id: S, name: "12 人 (含以下) 包區", capacity: 12, size_sqm: 330.58, description: "四人房 3 間。", is_exclusive_package: true, base_price: 99999, display_order: 1 },
    { id: RT2, accommodation_id: S, name: "雙人房", capacity: 2, size_sqm: null, description: null, is_exclusive_package: false, base_price: 88888, display_order: 2 },
  ],
  accommodation_facilities: [
    { id: "f1", accommodation_id: S, facility_name: "烤肉區", room_scope: "whole", is_available: true },
    { id: "f2", accommodation_id: S, facility_name: "吹風機", room_scope: "single", is_available: true },
    { id: "f3", accommodation_id: S, facility_name: "已停用設施", room_scope: "single", is_available: false },
  ],
  room_amenities: [{ id: "a1", room_type_id: RT2, amenity_name: "舊設施" }],
  accommodation_packages: [
    { id: "p12", accommodation_id: S, name: "12人包區", subtitle: null, guest_count: 12, guest_count_max: null, guest_count_label: null, enabled: true,
      applicable_tiers: ["weekday", "friday_sunday", "weekend"], original_price: 47000, sale_price: 35250, tier_prices: { weekend: { sale: 43500, original: 58000 } },
      room_allocation: "四人房 3 間", includes: [{ text: "精緻早餐", available: "yes" }, { text: "晚餐", available: "optional", price_note: "每人 NT$800" }, { text: "", available: "yes" }],
      child_age_note: null, display_order: 1 },
    { id: "pOff", accommodation_id: S, name: "停用方案", guest_count: 6, enabled: false, sale_price: 1 },
  ],
  faqs: [
    { id: "q1", accommodation_id: S, question: "可以帶寵物嗎？", answer: "不行喔。", is_published: true, display_order: 1 },
    { id: "q2", accommodation_id: S, question: "草稿問題", answer: "未發布", is_published: false, display_order: 2 },
  ],
  ai_knowledge: [
    { id: "k1", accommodation_id: S, category: "policy", title: "退房", content: "11:00 前退房。", tags: ["退房"], priority: 5, is_active: true, created_by: "staff-uuid" },
    { id: "k2", accommodation_id: S, category: "location", title: "交通", content: "距羅東站 15 分鐘。", tags: [], priority: 9, is_active: true },
    { id: "k3", accommodation_id: S, category: "policy", title: "停用知識", content: "x", tags: [], priority: 99, is_active: false },
  ],
});

const KEY = "test-fin-key-0123456789";
const call = async (qs: string, opts: { key?: string | null; tables?: Record<string, Row[]> } = {}) => {
  const headers: Record<string, string> = {};
  if (opts.key !== null) headers["x-api-key"] = opts.key ?? KEY;
  const res = await handleExport(new Request(`https://x.test/export-fin-knowledge?${qs}`, { headers }),
    { client: fakeClient(opts.tables ?? fixture()), apiKey: KEY, now: new Date("2026-10-15T00:00:00Z") });
  return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
};

/** 以 marked 解析：回傳 [depth, text] 標題清單，並檢查每個標題後面都有內容（無空標題）、層級不跳級 */
function headingsOf(md: string): Array<[number, string]> {
  const tokens = marked.lexer(md);
  const hs: Array<[number, string]> = [];
  let prev = 0;
  tokens.forEach((t: any, i: number) => {
    if (t.type !== "heading") return;
    assert(t.depth <= prev + 1, `標題跳級：${t.text}`);
    prev = t.depth;
    const next = tokens.slice(i + 1).find((x: any) => x.type !== "space");
    assert(next && !(next.type === "heading" && next.depth <= t.depth), `空標題：${t.text}`);
    hs.push([t.depth, t.text]);
  });
  return hs;
}

Deno.test("1. 無 key／錯 key → 401；非 GET → 405；缺參數 → 400", async () => {
  assertEquals((await call("accommodation_id=platform", { key: null })).status, 401);
  assertEquals((await call("all=1", { key: "wrong" })).status, 401);
  assertEquals((await call("")).status, 400);
  const r = await handleExport(new Request("https://x.test/e", { method: "POST" }), { client: fakeClient({}), apiKey: KEY });
  assertEquals(r.status, 405);
});

Deno.test("找不到館（不存在、非 uuid、停用）→ 404 { error }", async () => {
  for (const id of ["aaaaaaaa-0000-4000-8000-000000000999", "not-a-uuid", OFF]) {
    const r = await call(`accommodation_id=${id}&format=md`);
    assertEquals(r.status, 404, id);
    assert(typeof JSON.parse(r.text).error === "string");
  }
});

Deno.test("2. 森山 format=md：text/markdown、標題層級正確、無空標題、含房型／方案／FAQ／知識庫", async () => {
  const r = await call(`accommodation_id=${S}&format=md`);
  assertEquals([r.status, r.type], [200, "text/markdown; charset=utf-8"]);
  const md = r.text;
  assert(md.startsWith("來源：人客多系統匯出 2026-10-15\n"));
  assert(md.trimEnd().endsWith("如需查即時房況與價格，請使用查房況工具（fin-availability）"));
  assertEquals(headingsOf(md), [
    [1, "森山寫照"], [2, "民宿介紹"], [2, "入住須知"], [2, "取消政策"],
    [2, "房型與方案"], [3, "房型"], [4, "12 人 (含以下) 包區"], [4, "雙人房"], [3, "入住方案"], [4, "12人包區"],
    [2, "常見問題"], [3, "Q：可以帶寵物嗎？"],
    [2, "知識庫"], [3, "交通與位置"], [4, "交通"], [3, "政策"], [4, "退房"],
  ]);
  for (const s of [
    "- 地區：宜蘭縣 冬山鄉", "- 入住時間：15:00 起", "- 退房時間：11:00 前", "- 電話：03-1234567", "- 訂房網址：https://booking.lakeze.com/sensaninn",
    "- 坪數：約 100 坪（330.58 平方公尺）", "- 設施：烤肉區", "- 設施：吹風機", "- 每晚價格：原價 NT$ 47,000／售價 NT$ 35,250（下列日型另計）",
    "  - 週六、國定假日：原價 NT$ 58,000／售價 NT$ 43,500", "  - 含｜精緻早餐", "  - 可加購｜晚餐（每人 NT$800）", "A：不行喔。", "標籤：退房", "\\# 這行不是標題",
    "## 入住須知\n\n請於 22:00 前抵達。\n",
  ]) assert(md.includes(s), s);
  assert(!/<\/?p>/.test(md));
  for (const s of ["寵物規定", "其他注意事項", "官網", "停用方案", "草稿問題", "停用知識", "已停用設施", "舊設施"]) assert(!md.includes(s), s);
});

Deno.test("5. 不含私密／內部欄位", async () => {
  const md = (await call(`accommodation_id=${S}&format=md`)).text + (await call("all=1")).text;
  for (const s of ["SECRET-BANK", "owner-private@example.com", "99999", "88888", "staff-uuid", KEY]) assert(!md.includes(s), s);
});

Deno.test("空資料館：只有標題、基本資訊與訂房網址，沒有任何空段落", async () => {
  const md = (await call(`accommodation_id=${E}`)).text;
  assertEquals(headingsOf(md), [[1, "空資料館"]]);
  assert(md.includes(`- 訂房網址：https://booking.lakeze.com/booking/villa/${E}`));
});

Deno.test("3. all=1：筆數 = is_active 館數、alias 不為空（無 alias 以 id 代替）", async () => {
  const r = await call("all=1");
  assertEquals(r.status, 200);
  const arr = JSON.parse(r.text);
  assertEquals(arr.length, 2);
  for (const x of arr) assert(x.alias && x.name && x.markdown.includes(`# ${x.name}`));
  assertEquals(arr.find((x: Row) => x.name === "空資料館").alias, E);
});

Deno.test("4. platform：含訂房流程、付款、取消政策（級距與前台 TW_DEFAULT_CANCEL_RULES 逐字相同）", async () => {
  const r = await call("accommodation_id=platform");
  assertEquals([r.status, r.type], [200, "text/markdown; charset=utf-8"]);
  const hs = headingsOf(r.text).map(([, t]) => t);
  for (const h of ["人客多是什麼", "如何訂房", "付款方式", "取消政策", "會員點數", "客服聯絡方式"]) assert(hs.includes(h), h);
  const src = await Deno.readTextFile(new URL("../../../packages/shared/src/lib/cancellation-policy.ts", import.meta.url));
  const labels = [...src.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
  assertEquals(labels, TW_DEFAULT_CANCEL_LABELS);
  for (const l of labels) assert(r.text.includes(`- ${l}`));
});

Deno.test("escapeBlock：行首 # 跳脫，其他內容不變", () => {
  assertEquals(escapeBlock("## 標題\n內文 #tag\n   # 縮排"), "\\## 標題\n內文 #tag\n   \\# 縮排");
});

Deno.test("後台富文字 HTML → 段落純文字（<p>、<br>、空段落、零寬字元、實體）", () => {
  assertEquals(
    escapeBlock("<p>1.前14日取消</p><p>2.前10日~13日<br>3.前7日</p><p></p><p>\u200b\u200bA&amp;B&nbsp;C &lt;x&gt;</p><p># 非標題</p>"),
    "1.前14日取消\n\n2.前10日~13日\n3.前7日\n\nA&B C &lt;x&gt;\n\n\\# 非標題",
  );
  assertEquals(escapeBlock("<ul><li>一</li><li>二</li></ul>"), "- 一\n\n- 二");
});
