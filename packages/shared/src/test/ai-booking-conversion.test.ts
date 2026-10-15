import { describe, it, expect } from "vitest";
import {
  buildDemoOrders, buildDemoRun, computeConversion, defaultRange, demoOverlaps, demoRange, fmtRate, toCsv,
  DEMO_FIXTURES, DEMO_LABEL, FIXTURE_VERSION, INTERNAL_NOTE, type DemoRun,
} from "@lakeze/shared/lib/aiBookingConversion";

const names = ["哈庫納", "四季", "天送", "奧莉薇雅", "DAIDODO", "己館"];
const venues = names.map((n, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, name: n }));
const run: DemoRun = buildDemoRun(venues, new Date("2026-10-16T01:00:00Z"));
const legacyRun: DemoRun = { ...run, runId: "AIBKRUN-20261016-090000-0", demoVersion: "aibk-demo-v1.0.0", fixtureVersion: "aibk-fixture-v1.0.0" };
const all = () => ({ ...demoRange(run), accommodationIds: null, orderSource: null });

describe("AI 訂房轉換 Demo fixture", () => {
  it("run 只含合成描述與前 5 家公開館名（順序不變）、使用新版 fixture", () => {
    expect(Object.keys(run).sort()).toEqual(["dataNature", "demoVersion", "fixtureVersion", "generatedAt", "runId", "venues"]);
    expect(run.runId).toMatch(/^AIBKRUN-20261016-090000-\d{1,4}$/);
    expect(run.generatedAt).toBe("2026-10-16T09:00:00+08:00");
    expect([run.demoVersion, run.fixtureVersion]).toEqual(["aibk-demo-v1.1.0", "aibk-fixture-v1.1.0"]);
    expect(FIXTURE_VERSION).toBe("aibk-fixture-v1.1.0");
    expect(run.venues.map((v) => v.name)).toEqual(["哈庫納", "四季", "天送", "奧莉薇雅", "DAIDODO"]);
    expect(() => buildDemoRun(venues.slice(0, 4))).toThrow();
  });

  it("v1.1.0：逐筆合成訂單算出有效 203/247/186/229/165、AI 6/7/4/6/5，合計 28/1030=2.7184466%＝2.72%", () => {
    const orders = buildDemoOrders(run);
    expect(orders).toHaveLength(1030);
    expect(orders.filter((o) => o.is_ai)).toHaveLength(28);
    const r = computeConversion(orders, run.venues, all());
    expect(r.rows.map((x) => x.effective_orders)).toEqual([203, 247, 186, 229, 165]);
    expect(r.rows.map((x) => x.ai_orders)).toEqual([6, 7, 4, 6, 5]);
    expect(r.rows.every((x) => Number.isInteger(x.effective_orders) && x.effective_orders >= 100 && x.effective_orders % 10 !== 0)).toBe(true);
    expect(r.rows.every((x) => x.ai_orders >= 0 && x.ai_orders <= x.effective_orders)).toBe(true);
    expect([r.totals.effective_orders, r.totals.ai_orders]).toEqual([1030, 28]);
    expect(r.totals.rate).toBe(28 / 1030);
    expect(Math.trunc(r.totals.rate! * 100 * 1e7) / 1e7).toBe(2.7184466);
    expect(fmtRate(r.totals.rate)).toBe("2.72%");
    expect(r.totals.meets_target).toBe(true);
    expect(r.rows.map((x) => x.meets_target)).toEqual([true, true, false, true, true]);
    expect([r.selected_venues, r.venues_with_orders]).toEqual([5, 5]);
  });

  it("舊版 v1.0.0 run 重建數值不變：200/240/180/220/160、AI 6/7/4/6/5、28/1000", () => {
    expect(DEMO_FIXTURES["aibk-fixture-v1.0.0"]).toEqual({ orders: [200, 240, 180, 220, 160], ai: [6, 7, 4, 6, 5] });
    const orders = buildDemoOrders(legacyRun);
    const r = computeConversion(orders, legacyRun.venues, { ...demoRange(legacyRun), accommodationIds: null, orderSource: null });
    expect(r.rows.map((x) => x.effective_orders)).toEqual([200, 240, 180, 220, 160]);
    expect(r.rows.map((x) => x.ai_orders)).toEqual([6, 7, 4, 6, 5]);
    expect([r.totals.effective_orders, r.totals.ai_orders]).toEqual([1000, 28]);
    expect(r.totals.rate).toBeCloseTo(0.028, 10);
    expect(buildDemoOrders(JSON.parse(JSON.stringify(legacyRun)))).toEqual(orders);
  });

  it("未知 fixture 版本明確報錯，不默默套用其他版本", () => {
    expect(() => buildDemoOrders({ ...run, fixtureVersion: "aibk-fixture-v9.9.9" })).toThrow(/不支援的 Demo fixture 版本/);
  });

  it("相同 run 重建結果完全一致（跨 client）；不同 run 分布不同但總數不變", () => {
    expect(buildDemoOrders(run)).toEqual(buildDemoOrders(JSON.parse(JSON.stringify(run))));
    const other = { ...run, runId: "AIBKRUN-20261016-090000-7" };
    expect(buildDemoOrders(other).map((o) => o.date)).not.toEqual(buildDemoOrders(run).map((o) => o.date));
    const r = computeConversion(buildDemoOrders(other), other.venues, all());
    expect([r.totals.effective_orders, r.totals.ai_orders]).toEqual([1030, 28]);
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
    expect(aiDay.totals.ai_orders).toBeLessThan(28);
    expect(aiDay.totals.effective_orders).toBe(orders.filter((o) => o.date === aiDate).length);
    const hakuna = computeConversion(orders, run.venues, { from, to, accommodationIds: [run.venues[0].id], orderSource: null });
    expect([hakuna.rows.length, hakuna.totals.effective_orders, hakuna.totals.ai_orders]).toEqual([1, 203, 6]);
    const tensou = computeConversion(orders, run.venues, { from, to, accommodationIds: [run.venues[2].id], orderSource: null });
    expect([tensou.totals.effective_orders, tensou.totals.ai_orders, tensou.totals.meets_target]).toEqual([186, 4, false]);
    const web = computeConversion(orders, run.venues, { from, to, accommodationIds: null, orderSource: "website" });
    expect(web.totals.ai_orders).toBe(28);
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

  it("CSV 可識別資料性質；Demo 每列標 Demo 並帶 run id", () => {
    const r = computeConversion(buildDemoOrders(run), run.venues, all());
    const demo = toCsv(r, { demo: true, runId: run.runId, filters: all() });
    expect(demo).toContain(DEMO_LABEL);
    expect(demo).toContain(run.runId);
    expect(demo).toContain('"2.72%"');
    expect(demo.split("\n").filter((l) => l.startsWith('"Demo"'))).toHaveLength(6);
    const prod = toCsv(r, { demo: false, filters: all() });
    expect(prod).toContain("目前僅涵蓋可驗證的 AI 再行銷推播歸因");
    expect(prod).not.toContain(DEMO_LABEL);
    expect(prod).toContain(INTERNAL_NOTE);
    expect(INTERNAL_NOTE).toContain("無法辨識全部內部訂單");
    expect(demo).not.toContain(INTERNAL_NOTE);
  });

  it("預設期間＝近 30 天到今天（台北日界）", () => {
    expect(defaultRange(new Date("2026-10-15T16:30:00Z"))).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });
});
