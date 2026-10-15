import { describe, it, expect } from "vitest";
import {
  buildDemoOrders, buildDemoRun, computeConversion, defaultRange, demoRange, fmtRate, toCsv, DEMO_LABEL, type DemoRun,
} from "@lakeze/shared/lib/aiBookingConversion";

const venues = ["甲", "乙", "丙", "丁", "戊", "己"].map((n, i) => ({ id: `0000000${i}-0000-4000-8000-000000000000`, name: `${n}館` }));
const run: DemoRun = buildDemoRun(venues, new Date("2026-10-16T01:00:00Z"));
const all = () => ({ ...demoRange(run), accommodationIds: null, orderSource: null });

describe("AI 訂房轉換 Demo fixture", () => {
  it("run 只含合成描述與前 5 家公開館名", () => {
    expect(Object.keys(run).sort()).toEqual(["dataNature", "demoVersion", "fixtureVersion", "generatedAt", "runId", "venues"]);
    expect(run.runId).toMatch(/^AIBKRUN-20261016-090000-\d{1,4}$/);
    expect(run.generatedAt).toBe("2026-10-16T09:00:00+08:00");
    expect(run.venues.map((v) => v.name)).toEqual(["甲館", "乙館", "丙館", "丁館", "戊館"]);
    expect(() => buildDemoRun(venues.slice(0, 4))).toThrow();
  });

  it("由合成訂單算出 200/240/180/220/160、AI 6/7/4/6/5，合計 28/1000=2.8%，丙館未達標", () => {
    const r = computeConversion(buildDemoOrders(run), run.venues, all());
    expect(r.rows.map((x) => x.effective_orders)).toEqual([200, 240, 180, 220, 160]);
    expect(r.rows.map((x) => x.ai_orders)).toEqual([6, 7, 4, 6, 5]);
    expect(r.totals.effective_orders).toBe(1000);
    expect(r.totals.ai_orders).toBe(28);
    expect(r.totals.rate).toBeCloseTo(0.028, 10);
    expect(r.totals.meets_target).toBe(true);
    expect(r.rows.map((x) => x.meets_target)).toEqual([true, true, false, true, true]);
    expect([r.selected_venues, r.venues_with_orders]).toEqual([5, 5]);
    expect(r.totals.attributed_orders).toBeGreaterThanOrEqual(28);
  });

  it("相同 run 重建結果完全一致（跨 client）；不同 run 分布不同但總數不變", () => {
    expect(buildDemoOrders(run)).toEqual(buildDemoOrders(JSON.parse(JSON.stringify(run))));
    const other = { ...run, runId: "AIBKRUN-20261016-090000-7" };
    expect(buildDemoOrders(other).map((o) => o.date)).not.toEqual(buildDemoOrders(run).map((o) => o.date));
    expect(computeConversion(buildDemoOrders(other), other.venues, all()).totals.effective_orders).toBe(1000);
  });

  it("日期／館別／來源篩選真的作用在事件上，分子分母同時篩", () => {
    const orders = buildDemoOrders(run);
    const { from, to } = demoRange(run);
    const firstWeek = computeConversion(orders, run.venues, { from, to: from.replace(/\d{2}$/, (d) => d), accommodationIds: null, orderSource: null });
    expect(firstWeek.totals.effective_orders).toBe(orders.filter((o) => o.date === from).length);
    const one = computeConversion(orders, run.venues, { from, to, accommodationIds: [run.venues[2].id], orderSource: null });
    expect([one.rows.length, one.totals.effective_orders, one.totals.ai_orders]).toEqual([1, 180, 4]);
    const ota = computeConversion(orders, run.venues, { from, to, accommodationIds: null, orderSource: "owlting" });
    expect(ota.totals.ai_orders).toBe(0);
    expect(ota.totals.effective_orders).toBe(orders.filter((o) => o.order_source === "owlting").length);
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
    expect(demo.split("\n").filter((l) => l.startsWith('"Demo"'))).toHaveLength(6);
    const prod = toCsv(r, { demo: false, filters: all() });
    expect(prod).toContain("目前僅涵蓋可驗證的 AI 再行銷推播歸因");
    expect(prod).not.toContain(DEMO_LABEL);
  });

  it("預設期間＝近 30 天到今天（台北日界）", () => {
    expect(defaultRange(new Date("2026-10-15T16:30:00Z"))).toEqual({ from: "2026-09-17", to: "2026-10-16" });
  });
});
