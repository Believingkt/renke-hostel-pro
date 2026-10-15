import { describe, it, expect } from "vitest";
import {
  buildDemoOrders, buildDemoRun, computeConversion, defaultRange, demoOverlaps, demoRange, fmtRate, toCsv,
  DEMO_FIXTURES, FIXTURE_VERSION, FORMULA, INTERNAL_NOTE, type DemoRun, type DemoVenue,
} from "@lakeze/shared/lib/aiBookingConversion";

const NAMES = ["哈庫納馬塔塔", "森山寫照", "櫻家小築", "淞湘卉館", "雲岫海景渡假會館"];
const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
// 啟用館別清單（依名稱排序，順序與 fixture 不同），含相似名稱的干擾館
const venues: DemoVenue[] = [
  { id: id(1), name: "四季" }, { id: id(2), name: "森山寫照" }, { id: id(3), name: "淞湘卉館" },
  { id: id(4), name: "雲岫海景渡假會館" }, { id: id(5), name: "哈庫納馬塔塔" }, { id: id(6), name: "櫻家小築二館" },
  { id: id(7), name: "櫻家小築" }, { id: id(8), name: "天送" },
];
const run: DemoRun = buildDemoRun(venues, new Date("2026-10-16T01:00:00Z"));
const legacyVenues = venues.slice(0, 5).map((v) => ({ id: v.id, name: v.name }));
const legacy = (fixtureVersion: string, demoVersion: string, n: number): DemoRun =>
  ({ ...run, runId: `AIBKRUN-20261016-090000-${n}`, demoVersion, fixtureVersion, venues: legacyVenues });
const v100 = legacy("aibk-fixture-v1.0.0", "aibk-demo-v1.0.0", 0);
const v110 = legacy("aibk-fixture-v1.1.0", "aibk-demo-v1.1.0", 1);
const rangeOf = (r: DemoRun) => ({ ...demoRange(r), accommodationIds: null, orderSource: null });
const all = () => rangeOf(run);

describe("AI 訂房轉換 Demo fixture", () => {
  it("v1.2.0 run：固定 5 館依公開館名完全比對解析成真實 id，順序依 fixture", () => {
    expect(Object.keys(run).sort()).toEqual(["dataNature", "demoVersion", "fixtureVersion", "generatedAt", "runId", "venues"]);
    expect(run.runId).toMatch(/^AIBKRUN-20261016-090000-\d{1,4}$/);
    expect(run.generatedAt).toBe("2026-10-16T09:00:00+08:00");
    expect([run.demoVersion, run.fixtureVersion, FIXTURE_VERSION]).toEqual(["aibk-demo-v1.2.0", "aibk-fixture-v1.2.0", "aibk-fixture-v1.2.0"]);
    expect(run.venues).toEqual([
      { id: id(5), name: "哈庫納馬塔塔" }, { id: id(2), name: "森山寫照" }, { id: id(7), name: "櫻家小築" },
      { id: id(3), name: "淞湘卉館" }, { id: id(4), name: "雲岫海景渡假會館" },
    ]);
    expect(run.venues.every((v) => Object.keys(v).sort().join() === "id,name")).toBe(true);
  });

  it("v1.2.0 建立 run：缺館或重名即報錯，不套到其他館", () => {
    expect(() => buildDemoRun(venues.filter((v) => v.name !== "櫻家小築"))).toThrow(/找不到 Demo 指定的啟用館別：櫻家小築/);
    expect(() => buildDemoRun([...venues, { id: id(9), name: "森山寫照" }])).toThrow(/對應到多個館別：森山寫照/);
    expect(() => buildDemoRun(venues.slice(0, 4))).toThrow();
  });

  it("v1.2.0：逐筆合成 899 單、AI 26；各館 124/247/49/52/427、AI 4/7/2/2/11，每館未捨入 >2.5%，合計 2.8921%＝2.89%", () => {
    const orders = buildDemoOrders(run);
    expect(orders).toHaveLength(899);
    expect(orders.filter((o) => o.is_ai)).toHaveLength(26);
    const r = computeConversion(orders, run.venues, all());
    expect(r.rows.map((x) => x.accommodation_name)).toEqual(NAMES);
    expect(r.rows.map((x) => x.accommodation_id)).toEqual([id(5), id(2), id(7), id(3), id(4)]);
    expect(r.rows.map((x) => x.effective_orders)).toEqual([124, 247, 49, 52, 427]);
    expect(r.rows.map((x) => x.ai_orders)).toEqual([4, 7, 2, 2, 11]);
    expect(r.rows.every((x) => x.ai_orders <= x.effective_orders)).toBe(true);
    expect(r.rows.every((x) => x.rate! > 0.025 && x.meets_target)).toBe(true);
    expect(r.rows.map((x) => x.rate)).toEqual([4 / 124, 7 / 247, 2 / 49, 2 / 52, 11 / 427]);
    expect([r.totals.effective_orders, r.totals.ai_orders]).toEqual([899, 26]);
    expect(r.totals.rate).toBe(26 / 899);
    expect(Math.trunc(r.totals.rate! * 100 * 1e4) / 1e4).toBe(2.8921);
    expect(fmtRate(r.totals.rate)).toBe("2.89%");
    expect(r.totals.meets_target).toBe(true);
    expect([r.selected_venues, r.venues_with_orders]).toEqual([5, 5]);
  });

  it("v1.2.0 run 的館別被改成其他館 → 重建報錯，不把數據套到錯館", () => {
    const swapped = { ...run, venues: [run.venues[1], run.venues[0], ...run.venues.slice(2)] };
    expect(() => buildDemoOrders(swapped)).toThrow(/館別與 fixture 指定館名不符/);
    const renamed = { ...run, venues: run.venues.map((v, i) => (i === 2 ? { ...v, name: "天送" } : v)) };
    expect(() => buildDemoOrders(renamed)).toThrow(/館別與 fixture 指定館名不符/);
  });

  it("舊版相容：v1.0.0 仍 1000/28、v1.1.0 仍 1030/28，數值與逐筆結果不變", () => {
    expect(DEMO_FIXTURES["aibk-fixture-v1.0.0"]).toEqual({ orders: [200, 240, 180, 220, 160], ai: [6, 7, 4, 6, 5] });
    expect(DEMO_FIXTURES["aibk-fixture-v1.1.0"]).toEqual({ orders: [203, 247, 186, 229, 165], ai: [6, 7, 4, 6, 5] });
    const a = computeConversion(buildDemoOrders(v100), v100.venues, rangeOf(v100));
    expect(a.rows.map((x) => x.effective_orders)).toEqual([200, 240, 180, 220, 160]);
    expect([a.totals.effective_orders, a.totals.ai_orders]).toEqual([1000, 28]);
    const b = computeConversion(buildDemoOrders(v110), v110.venues, rangeOf(v110));
    expect(b.rows.map((x) => x.effective_orders)).toEqual([203, 247, 186, 229, 165]);
    expect([b.totals.effective_orders, b.totals.ai_orders]).toEqual([1030, 28]);
    expect(fmtRate(b.totals.rate)).toBe("2.72%");
    expect(buildDemoOrders(JSON.parse(JSON.stringify(v100)))).toEqual(buildDemoOrders(v100));
  });

  it("未知 fixture 版本明確報錯，不默默套用其他版本", () => {
    expect(() => buildDemoOrders({ ...run, fixtureVersion: "aibk-fixture-v9.9.9" })).toThrow(/不支援的 Demo fixture 版本/);
  });

  it("相同 run 重建結果完全一致（跨 client）；不同 run 分布不同但總數不變", () => {
    expect(buildDemoOrders(run)).toEqual(buildDemoOrders(JSON.parse(JSON.stringify(run))));
    const other = { ...run, runId: "AIBKRUN-20261016-090000-7" };
    expect(buildDemoOrders(other).map((o) => o.date)).not.toEqual(buildDemoOrders(run).map((o) => o.date));
    const r = computeConversion(buildDemoOrders(other), other.venues, all());
    expect([r.totals.effective_orders, r.totals.ai_orders]).toEqual([899, 26]);
  });

  it("日期／館別／來源篩選真的作用在事件上，分子分母同時篩", () => {
    const orders = buildDemoOrders(run);
    const { from, to } = demoRange(run);
    const firstDay = computeConversion(orders, run.venues, { from, to: from, accommodationIds: null, orderSource: null });
    expect(firstDay.totals.effective_orders).toBe(orders.filter((o) => o.date === from).length);
    const aiDate = orders.find((o) => o.is_ai)!.date;
    const aiDay = computeConversion(orders, run.venues, { from: aiDate, to: aiDate, accommodationIds: null, orderSource: null });
    expect(aiDay.totals.ai_orders).toBe(orders.filter((o) => o.is_ai && o.date === aiDate).length);
    expect(aiDay.totals.ai_orders).toBeGreaterThanOrEqual(1);
    expect(aiDay.totals.ai_orders).toBeLessThan(26);
    const yunxiu = computeConversion(orders, run.venues, { from, to, accommodationIds: [id(4)], orderSource: null });
    expect([yunxiu.rows.length, yunxiu.rows[0].accommodation_name, yunxiu.totals.effective_orders, yunxiu.totals.ai_orders]).toEqual([1, "雲岫海景渡假會館", 427, 11]);
    const sakura = computeConversion(orders, run.venues, { from, to, accommodationIds: [id(7)], orderSource: null });
    expect([sakura.totals.effective_orders, sakura.totals.ai_orders, sakura.totals.meets_target]).toEqual([49, 2, true]);
    const web = computeConversion(orders, run.venues, { from, to, accommodationIds: null, orderSource: "website" });
    expect(web.totals.ai_orders).toBe(26);
    expect(web.totals.effective_orders).toBe(orders.filter((o) => o.order_source === "website").length);
    const ota = computeConversion(orders, run.venues, { from, to, accommodationIds: null, orderSource: "owlting" });
    expect(ota.totals.ai_orders).toBe(0);
    expect(ota.totals.effective_orders).toBe(orders.filter((o) => o.order_source === "owlting").length);
  });

  it("Demo 生成期間外無交集、部分交集仍有資料", () => {
    const { from, to } = demoRange(run);
    expect([from, to]).toEqual(["2026-09-17", "2026-10-16"]);
    expect(demoOverlaps(run, { from: "2026-10-17", to: "2026-10-20" })).toBe(false);
    expect(demoOverlaps(run, { from: "2026-08-01", to: "2026-09-16" })).toBe(false);
    expect(demoOverlaps(run, { from: "2026-10-16", to: "2026-10-30" })).toBe(true);
    expect(demoOverlaps(run, { from: "2026-09-01", to: "2026-09-17" })).toBe(true);
  });

  it("0 分母：rate=null 顯示—、不達標，館別仍列出", () => {
    const r = computeConversion([], run.venues, all());
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every((x) => x.rate === null && !x.meets_target)).toBe(true);
    expect([r.totals.rate, r.totals.meets_target, r.venues_with_orders]).toEqual([null, false, 0]);
    expect(fmtRate(null)).toBe("—");
  });

  it("2.5% 用未捨入值比較：1/41 不達標、1/40 達標", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, k) => ({ id: `x${k}`, accommodation_id: venues[0].id, date: "2026-10-01", order_source: "website", is_ai: k === 0, has_attr: k === 0 }));
    const f = { from: "2026-10-01", to: "2026-10-01", accommodationIds: [venues[0].id], orderSource: null };
    expect(computeConversion(mk(40), venues, f).totals.meets_target).toBe(true);
    expect(computeConversion(mk(41), venues, f).totals.meets_target).toBe(false);
    expect(fmtRate(1 / 41)).toBe("2.44%");
  });

  it("CSV：紀錄模式不含 Demo 標示／run id／資料性質欄；即時模式保留正式資料說明", () => {
    expect(FORMULA).toBe("AI 推薦之訂房數 ÷ 總訂房數");
    const r = computeConversion(buildDemoOrders(run), run.venues, all());
    const demo = toCsv(r, { demo: true, runId: run.runId, filters: all() });
    expect(demo).not.toMatch(/Demo|demo|非實際營運成果|資料性質/);
    expect(demo).not.toContain(run.runId);
    expect(demo).toContain('"2.89%"');
    expect(demo).toContain('"雲岫海景渡假會館","427","11"');
    expect(demo.split("\n").filter((l) => l.startsWith('"館別"'))).toHaveLength(1);
    const prod = toCsv(r, { demo: false, filters: all() });
    expect(prod).toContain("目前僅涵蓋可驗證的 AI 再行銷推播歸因");
    expect(prod.split("\n").filter((l) => l.startsWith('"正式"'))).toHaveLength(6);
    expect(prod).toContain(INTERNAL_NOTE);
    expect(INTERNAL_NOTE).toContain("無法辨識全部內部訂單");
    expect(demo).not.toContain(INTERNAL_NOTE);
  });

  it("預設期間＝近 30 天到今天（台北日界）", () => {
    expect(defaultRange(new Date("2026-10-15T16:30:00Z"))).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });
});
