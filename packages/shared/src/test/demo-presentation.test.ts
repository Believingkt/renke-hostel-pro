// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildDemoRun, demoN1Rows, demoN2Rows, filterDemoEvents,
  DEFAULT_DEMO_NAMES, DEMO_N1_NOTES, DEMO_N2_NOTES, DEMO_PRESENTATION_VERSION,
  type DemoFilters, type DemoRun,
} from "@lakeze/shared/utils/demoPresentation";
import {
  DEMO_FIXTURE_SPEC, DEMO_FIXTURE_VERSION, buildFixtureEvents, fixtureBreakdown, fixtureItemIndex,
} from "@lakeze/shared/utils/demoFixture";
import { loadDemo, saveDemoRun, saveDemoNames, clearDemo, DEMO_STORE_KEY } from "@lakeze/shared/utils/demoRunStore";
import { SCENARIO_VERSION, aggregateN1, aggregateN2, rate } from "@lakeze/shared/utils/scenarioSim";

const VENUES = [
  { id: "v1", name: "示範館 A" },
  { id: "v2", name: "示範館 B" },
  { id: "v3", name: "示範館 C" },
  { id: "v4", name: "示範館 D" },
  { id: "v5", name: "示範館 E" },
];
// 台北時間 2026-06-10 10:00（+08:00）
const NOW = new Date("2026-06-10T02:00:00Z");
const ALL: DemoFilters = { from: "2026-05-01", to: "2026-06-30", venueIds: [], channel: "all" };

const totalsN1 = (run: DemoRun, f: DemoFilters = ALL) => {
  const rows = demoN1Rows(run, DEFAULT_DEMO_NAMES, f);
  return {
    rows: rows.length,
    sends: rows.reduce((s, r) => s + r.sends, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    skippedClicks: rows.reduce((s, r) => s + r.skippedClicks, 0),
    orders: rows.reduce((s, r) => s + r.orders, 0),
  };
};
const totalsN2 = (run: DemoRun, f: DemoFilters = ALL) => {
  const rows = demoN2Rows(run, DEFAULT_DEMO_NAMES, f);
  return {
    rows: rows.length,
    shown: rows.reduce((s, r) => s + r.shown, 0),
    purchasedQty: rows.reduce((s, r) => s + r.purchasedQty, 0),
  };
};

describe("簡報示範 fixture（v1.2.0）：量級由合成事件算出，不硬寫百分比", () => {
  const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 1 });

  it("run 帶 run ID、生成時間、示範版本、fixture 版本；不使用技術情境 80 案", () => {
    expect(run.runId.startsWith("DEMORUN-")).toBe(true);
    expect(run.generatedAt).toMatch(/\+08:00$/);
    expect(run.demoVersion).toBe(DEMO_PRESENTATION_VERSION);
    expect(DEMO_PRESENTATION_VERSION).toBe("demo-pres-v1.2.0");
    expect(run.fixtureVersion).toBe(DEMO_FIXTURE_VERSION);
    expect(run.scenarioVersion).toBe(SCENARIO_VERSION);
    expect(run.engine.cases).toHaveLength(0);
    expect(run.venues).toHaveLength(5);
  });

  it("N1 整體：發送 1050、下房 40 → 3.8%（合計分子／合計分母）", () => {
    const t = totalsN1(run);
    expect(t).toEqual({ rows: 10, sends: 1050, clicks: 235, skippedClicks: 23, orders: 40 });
    expect(rate(t.orders, t.sends)).toBe(3.8);
    expect(t.orders / t.sends).toBeCloseTo(0.038095, 6);
    expect(run.engine.summary.simN1Cvr).toBe(3.8);
    expect(run.engine.summary.simN1Ctr).toBe(22.4);
  });

  it("N2 整體：推薦 116、成交數量 72 → 62.1%", () => {
    const t = totalsN2(run);
    expect(t).toEqual({ rows: 20, shown: 116, purchasedQty: 72 });
    expect(rate(t.purchasedQty, t.shown)).toBe(62.1);
    expect(run.engine.summary.simN2Cvr).toBe(62.1);
  });

  it("各館分布符合 fixture 規格，且是自然分布（非每館相同）", () => {
    const n1 = demoN1Rows(run, DEFAULT_DEMO_NAMES, ALL).filter((r) => r.channel === "email");
    expect(n1.map((r) => r.sends)).toEqual([...DEMO_FIXTURE_SPEC.n1SentSends]);
    expect(n1.map((r) => r.orders)).toEqual([...DEMO_FIXTURE_SPEC.n1Orders]);
    expect(n1.map((r) => r.clicks)).toEqual([...DEMO_FIXTURE_SPEC.n1Clicks]);
    const n2 = demoN2Rows(run, DEFAULT_DEMO_NAMES, ALL);
    for (const [vi, venue] of VENUES.entries()) {
      const rows = n2.filter((r) => r.venueId === venue.id);
      expect(rows.map((r) => r.shown)).toEqual([...DEMO_FIXTURE_SPEC.n2ShownByVenue[vi]]);
      expect(rows.map((r) => r.purchasedQty)).toEqual([...DEMO_FIXTURE_SPEC.n2QtyByVenue[vi]]);
    }
  });

  it("LINE skipped 獨立計算：不進發送數、不進點擊率；點擊率不超過 100%", () => {
    const rows = demoN1Rows(run, DEFAULT_DEMO_NAMES, ALL);
    const line = rows.filter((r) => r.channel === "line_share");
    expect(line.map((r) => [r.sends, r.clicks, r.skippedClicks])).toEqual([
      [0, 0, 5], [0, 0, 6], [0, 0, 4], [0, 0, 3], [0, 0, 5],
    ]);
    for (const r of rows) expect(r.sends === 0 ? r.clicks : r.clicks / r.sends).toBeLessThanOrEqual(1);
  });

  it("負面樣本保留在事件集合內，但依歸因規則不計入分子", () => {
    const b = fixtureBreakdown(run.engine.events, "N1");
    const count = (id: string) => b.find((r) => r.caseId === id)?.count ?? 0;
    expect(count("demo-n1-order")).toBe(40);
    expect(count("demo-n1-order-timeout")).toBe(10);
    expect(count("demo-n1-order-cancelled")).toBe(5);
    expect(count("demo-n1-order-other-traveler")).toBe(5);
    expect(count("demo-n1-order-cross-venue")).toBe(5);
    expect(count("demo-n1-skipped-send")).toBe(56);
    // 負面樣本共 25 筆訂單事件，但歸因只有 40（＝demo-n1-order）
    expect(totalsN1(run).orders).toBe(40);

    const b2 = fixtureBreakdown(run.engine.events, "N2");
    const count2 = (id: string) => b2.find((r) => r.caseId === id)?.count ?? 0;
    expect(count2("demo-n2-shown")).toBe(116);
    expect(count2("demo-n2-purchased")).toBe(72);
    expect(count2("demo-n2-purchased-timeout")).toBe(5);
    expect(count2("demo-n2-purchased-cancelled")).toBe(5);
    expect(count2("demo-n2-purchased-other-traveler")).toBe(5);
    expect(count2("demo-n2-purchased-other-item")).toBe(5);
    // 20 筆負面加購事件（每筆 qty 2＝40 單位）全數未計入
    expect(totalsN2(run).purchasedQty).toBe(72);
  });

  it("移除負面樣本後分子不變（證明它們確實不在分子裡）", () => {
    const positiveOnly = run.engine.events.filter((e) => !e.caseId.includes("-timeout") && !e.caseId.includes("-cancelled")
      && !e.caseId.includes("-other-") && !e.caseId.includes("-cross-venue"));
    const n1 = aggregateN1(positiveOnly).reduce((s, r) => s + r.orders, 0);
    const n2 = aggregateN2(positiveOnly).reduce((s, r) => s + r.purchasedQty, 0);
    expect(n1).toBe(40);
    expect(n2).toBe(72);
  });

  it("主表仍用指定的兩個活動名稱，品項為 4 個名稱，不出現 fixture 技術 ID", () => {
    const n1 = demoN1Rows(run, DEFAULT_DEMO_NAMES, ALL);
    const n2 = demoN2Rows(run, DEFAULT_DEMO_NAMES, ALL);
    expect(n1.every((r) => r.campaignName.includes("秋季回訪旅客專屬住宿邀約"))).toBe(true);
    expect(n1.map((r) => r.campaignName).join("|")).not.toMatch(/DEMOCAMP|DEMOSEND|demo-n1/);
    expect(new Set(n2.map((r) => r.itemName))).toEqual(
      new Set(["房型升級", "手作早餐", "在地體驗行程", "住宿包套"]),
    );
    expect(n2.every((r) => r.campaignName === "住宿升級與餐食體驗推薦")).toBe(true);
    expect(n2.map((r) => r.itemName).join("|")).not.toMatch(/DEMOITEM|demo-n2/);
    expect(fixtureItemIndex("DEMOITEM-2")).toBe(2);
    expect(fixtureItemIndex("SIMITEM-n2-attributed")).toBeNull();
  });
});

describe("篩選真正作用在模擬事件上", () => {
  const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 2 });

  it("各館示範發送日相隔 1 天", () => {
    expect(Object.values(run.venueDates)).toEqual([
      "2026-06-10", "2026-06-09", "2026-06-08", "2026-06-07", "2026-06-06",
    ]);
  });

  it("館別篩選：只勾 2 家 → 分子分母同步只剩該 2 家", () => {
    expect(totalsN1(run, { ...ALL, venueIds: ["v1", "v2"] }))
      .toEqual({ rows: 4, sends: 420, clicks: 94, skippedClicks: 11, orders: 16 });
    expect(totalsN2(run, { ...ALL, venueIds: ["v1", "v2"] }))
      .toEqual({ rows: 8, shown: 47, purchasedQty: 29 });
  });

  it("日期篩選：2026-06-09~06-10 只剩 2 家；區間外為 0 列", () => {
    const t = totalsN1(run, { ...ALL, from: "2026-06-09", to: "2026-06-10" });
    expect(t).toEqual({ rows: 4, sends: 420, clicks: 94, skippedClicks: 11, orders: 16 });
    expect(totalsN1(run, { ...ALL, from: "2026-01-01", to: "2026-01-02" }))
      .toEqual({ rows: 0, sends: 0, clicks: 0, skippedClicks: 0, orders: 0 });
    expect(totalsN2(run, { ...ALL, from: "2026-01-01", to: "2026-01-02" }).rows).toBe(0);
  });

  it("通路篩選：Email 只剩 sent；LINE 只剩 skipped 點擊", () => {
    expect(totalsN1(run, { ...ALL, channel: "email" }))
      .toEqual({ rows: 5, sends: 1050, clicks: 235, skippedClicks: 0, orders: 40 });
    expect(totalsN1(run, { ...ALL, channel: "line_share" }))
      .toEqual({ rows: 5, sends: 0, clicks: 0, skippedClicks: 23, orders: 0 });
  });

  it("篩選後事件集合確實變小（不是只改顯示文字）", () => {
    const all = filterDemoEvents(run, ALL).length;
    const one = filterDemoEvents(run, { ...ALL, venueIds: ["v1"] }).length;
    expect(one).toBeLessThan(all);
    expect(filterDemoEvents(run, { ...ALL, from: "2026-01-01", to: "2026-01-02" })).toHaveLength(0);
  });
});

describe("fixture 生成器本身", () => {
  it("事件 ID 唯一、皆帶同一 runId 與可追溯 caseId", () => {
    const events = buildFixtureEvents({ runId: "DEMORUN-TEST", venues: VENUES, now: NOW });
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    expect(events.every((e) => e.runId === "DEMORUN-TEST")).toBe(true);
    expect(events.every((e) => e.caseId.startsWith("demo-n1-") || e.caseId.startsWith("demo-n2-"))).toBe(true);
    const n1Agg = aggregateN1(events);
    expect(n1Agg.reduce((s, r) => s + r.sends, 0)).toBe(1050);
    expect(n1Agg.reduce((s, r) => s + r.orders, 0)).toBe(40);
  });

  it("少於 5 家館別時仍可生成（依序套用 fixture 量級）", () => {
    const events = buildFixtureEvents({ runId: "R", venues: VENUES.slice(0, 2), now: NOW });
    const agg = aggregateN1(events);
    expect(agg.reduce((s, r) => s + r.sends, 0)).toBe(420);
    expect(aggregateN2(events).reduce((s, r) => s + r.purchasedQty, 0)).toBe(29);
  });
});

describe("名稱編輯與重新執行", () => {
  const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 3 });

  it("改名稱只改標籤，數字完全不變", () => {
    const before = totalsN1(run);
    const names = { ...DEFAULT_DEMO_NAMES, n1CampaignName: "期末簡報・回訪邀約", n2ItemNames: ["A", "B", "C", "D"] };
    const after = demoN1Rows(run, names, ALL);
    expect(after[0].campaignName).toContain("期末簡報・回訪邀約");
    expect({
      rows: after.length,
      sends: after.reduce((s, r) => s + r.sends, 0),
      clicks: after.reduce((s, r) => s + r.clicks, 0),
      skippedClicks: after.reduce((s, r) => s + r.skippedClicks, 0),
      orders: after.reduce((s, r) => s + r.orders, 0),
    }).toEqual(before);
    const n2 = demoN2Rows(run, names, ALL);
    expect(new Set(n2.map((r) => r.itemName))).toEqual(new Set(["A", "B", "C", "D"]));
    expect(n2.reduce((s, r) => s + r.purchasedQty, 0)).toBe(72);
  });

  it("重新執行不累加：統計相同、run ID 與事件 ID 不重疊", () => {
    const again = buildDemoRun({ venues: VENUES, now: new Date(NOW.getTime() + 3600_000), seed: 4 });
    expect(again.runId).not.toBe(run.runId);
    expect(totalsN1(again)).toEqual(totalsN1(run));
    expect(totalsN2(again)).toEqual(totalsN2(run));
    const ids = new Set(run.engine.events.map((e) => e.id));
    expect(again.engine.events.some((e) => ids.has(e.id))).toBe(false);
  });
});

describe("示範資料隔離儲存與舊批次安全升級", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage);
  });
  afterEach(() => {
    clearDemo();
    vi.unstubAllGlobals();
  });

  it("第一次載入沒有示範資料（不預填），建立後兩頁共用同一 run", () => {
    expect(loadDemo().run).toBeNull();
    const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 5 });
    saveDemoRun(run);
    const loaded = loadDemo();
    expect(loaded.run?.runId).toBe(run.runId);
    expect(loaded.mode).toBe("localStorage");
    expect(loaded.run?.venues.map((v) => v.id)).toEqual(VENUES.map((v) => v.id));
    expect(totalsN1(loaded.run!)).toEqual(totalsN1(run));
    expect(totalsN2(loaded.run!).purchasedQty).toBe(72);
  });

  it("舊版（v1.0.0）批次：保留名稱設定、捨棄舊數據、回報版本不符", () => {
    store.set(DEMO_STORE_KEY, JSON.stringify({
      version: 1,
      demoVersion: "demo-pres-v1.0.0",
      run: { runId: "DEMORUN-20261014-021607-2899", generatedAt: "x", engine: { events: [] }, venues: VENUES },
      names: { ...DEFAULT_DEMO_NAMES, n1CampaignName: "舊的簡報名稱" },
    }));
    const loaded = loadDemo();
    expect(loaded.run).toBeNull();
    expect(loaded.recovered).toBe(true);
    expect(loaded.staleVersion).toBe("demo-pres-v1.0.0");
    expect(loaded.names.n1CampaignName).toBe("舊的簡報名稱");
    // 已改寫為新版空白狀態：再次載入仍沒有舊數據，名稱保留
    const again = loadDemo();
    expect(again.run).toBeNull();
    expect(again.names.n1CampaignName).toBe("舊的簡報名稱");
    expect(again.recovered).toBe(false);
  });

  it("內容損壞一律捨棄並要求重新建立", () => {
    store.set(DEMO_STORE_KEY, "{not-json");
    const loaded = loadDemo();
    expect(loaded.run).toBeNull();
    expect(loaded.recovered).toBe(true);
    expect(loaded.names).toEqual(DEFAULT_DEMO_NAMES);
  });

  it("名稱編輯持久化，且不影響已存 run 的數字", () => {
    saveDemoRun(buildDemoRun({ venues: VENUES, now: NOW, seed: 6 }));
    saveDemoNames({ ...DEFAULT_DEMO_NAMES, n1CampaignName: "簡報用名稱" });
    const loaded = loadDemo();
    expect(loaded.names.n1CampaignName).toBe("簡報用名稱");
    expect(totalsN1(loaded.run!).sends).toBe(1050);
  });

  it("localStorage 不可用時降級記憶體模式，不丟例外", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as unknown as Storage);
    const saved = saveDemoRun(buildDemoRun({ venues: VENUES, now: NOW, seed: 7 }));
    expect(saved.mode).toBe("memory");
    expect(loadDemo().mode).toBe("memory");
  });
});

describe("紀錄檢視的中性文案與即時路徑不混用（原始碼檢查）", () => {
  const read = (p: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../../../..", p), "utf8");
  const rem = read("apps/booking/src/pages/admin/RemarketingAnalytics.tsx");
  const addon = read("apps/booking/src/pages/admin/AddonRecAnalytics.tsx");
  const panel = read("apps/booking/src/components/headquarters/DemoPresentationPanel.tsx");

  it("兩頁都有即時／紀錄切換，預設即時，紀錄模式不呼叫即時 RPC", () => {
    for (const src of [rem, addon]) {
      expect(src).toContain("AnalyticsModeToggle");
      expect(src).toContain('if (demo.mode === "live") void load();');
      expect(src).toContain("showIncludeInternal={false}");
      expect(src).toContain("staleVersion={demo.staleVersion}");
    }
    expect(panel).toContain('useState<AnalyticsMode>("live")');
    expect(panel).toContain("demo-stale-version-alert");
    expect(panel).toContain("即時");
    expect(panel).toContain("紀錄");
  });

  it("兩頁的紀錄檢視與面板已無「簡報示範／模擬」字樣，CSV 檔名為中性", () => {
    expect(panel).not.toMatch(/簡報示範|模擬/);
    expect(panel).toContain("建立展示資料集");
    expect(panel).toContain("重新產生資料集");
    expect(rem).toContain('csvFileName="remarketing-analytics-record"');
    expect(addon).toContain('csvFileName="addon-rec-analytics-record"');
    for (const src of [rem, addon]) {
      expect(src).not.toContain("DEMO_簡報示範_模擬資料");
      // 只有「共用 Demo」模式使用 SharedDemoBanner；紀錄檢視不得有舊 DemoBanner
      expect(src).not.toMatch(/(?<!Shared)DemoBanner/);
      expect(src).not.toContain("rowNature");
      expect(src).not.toContain("csvNature");
      expect(src).not.toContain("簡報示範");
    }
    // 口徑說明本身也不再出現「模擬／示範」
    expect([...DEMO_N1_NOTES, ...DEMO_N2_NOTES].join("｜")).not.toMatch(/簡報示範|模擬/);
  });

  it("紀錄檢視的資料集面板與口徑說明目前隱藏（旗標集中控管，之後可開回）", () => {
    expect(panel).toContain("export const SHOW_DEMO_CONTROL_PANEL = false;");
    expect(panel).toContain("export const SHOW_DEMO_SCOPE_NOTES = false;");
    for (const src of [rem, addon]) {
      expect(src).toContain("{SHOW_DEMO_CONTROL_PANEL && <DemoControlPanel");
      expect(src).toMatch(/scopeNotes=\{SHOW_DEMO_SCOPE_NOTES \? DEMO_N[12]_NOTES : \[\]\}/);
    }
  });

  it("即時資料路徑未變：RPC 名稱、既有口徑說明與含內部上線測試切換仍在即時模式", () => {
    expect(rem).toContain("ai_metric_remarketing_breakdown");
    expect(addon).toContain("ai_metric_addon_breakdown");
    expect(rem).toContain("不回填、不模擬");
    expect(addon).toContain("不回填、不模擬");
    expect(rem).toContain('csvFileName="remarketing-analytics"');
    expect(addon).toContain('csvFileName="addon-rec-analytics"');
  });
});
