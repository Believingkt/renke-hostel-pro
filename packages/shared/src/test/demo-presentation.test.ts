// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildDemoRun, demoN1Rows, demoN2Rows, filterDemoEvents,
  DEFAULT_DEMO_NAMES, DEMO_BANNER, DEMO_ROW_NATURE, DEMO_PRESENTATION_VERSION,
  type DemoFilters, type DemoRun,
} from "@lakeze/shared/utils/demoPresentation";
import { loadDemo, saveDemoRun, saveDemoNames, clearDemo, DEMO_STORE_KEY } from "@lakeze/shared/utils/demoRunStore";
import { SCENARIO_VERSION } from "@lakeze/shared/utils/scenarioSim";

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

describe("簡報示範資料：5 家館別與約定數字", () => {
  const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 1 });

  it("run 帶有 run ID、生成時間、示範版本與情境引擎版本，館別為 5 家", () => {
    expect(run.runId.startsWith("DEMORUN-")).toBe(true);
    expect(run.generatedAt).toMatch(/\+08:00$/);
    expect(run.demoVersion).toBe(DEMO_PRESENTATION_VERSION);
    expect(run.scenarioVersion).toBe(SCENARIO_VERSION);
    expect(run.venues).toHaveLength(5);
  });

  it("各館示範發送日相隔 1 天（日期篩選才有實際效果）", () => {
    expect(Object.values(run.venueDates)).toEqual([
      "2026-06-10", "2026-06-09", "2026-06-08", "2026-06-07", "2026-06-06",
    ]);
  });

  it("N1 總計：發送 35、有效點擊 35、skipped 點擊 5 另列、下房 10", () => {
    expect(totalsN1(run)).toEqual({ rows: 10, sends: 35, clicks: 35, skippedClicks: 5, orders: 10 });
  });

  it("N2 總計：推薦 35、成交數量 20（數量／推薦口徑，不截斷）", () => {
    expect(totalsN2(run)).toEqual({ rows: 20, shown: 35, purchasedQty: 20 });
  });

  it("點擊率回歸：skipped 點擊不進分子，任一列與總計都不超過 100%", () => {
    const rows = demoN1Rows(run, DEFAULT_DEMO_NAMES, ALL);
    for (const r of rows) expect(r.sends === 0 ? r.clicks : r.clicks / r.sends).toBeLessThanOrEqual(1);
    const t = totalsN1(run);
    expect(t.clicks / t.sends).toBeLessThanOrEqual(1);
    const lineRows = rows.filter((r) => r.channel === "line_share");
    expect(lineRows.map((r) => [r.sends, r.clicks, r.skippedClicks])).toEqual(
      VENUES.map(() => [0, 0, 1]),
    );
  });

  it("主表以同館同活動／品項聚合，用可讀名稱，不出現技術案例 ID", () => {
    const n1 = demoN1Rows(run, DEFAULT_DEMO_NAMES, ALL);
    const n2 = demoN2Rows(run, DEFAULT_DEMO_NAMES, ALL);
    expect(n1[0].campaignName).toContain("秋季回訪旅客專屬住宿邀約");
    expect(n1.map((r) => r.campaignName).join("|")).not.toMatch(/n1-|SIMCAMP/);
    expect(new Set(n2.map((r) => r.itemName))).toEqual(
      new Set(["房型升級", "手作早餐", "在地體驗行程", "住宿包套"]),
    );
    expect(n2.map((r) => r.itemName).join("|")).not.toMatch(/n2-|SIMITEM/);
    expect(n2.every((r) => r.campaignName === "住宿升級與餐食體驗推薦")).toBe(true);
    // 每館 4 個示範品項，各館皆有活動名稱帶客群差異
    expect(n1.filter((r) => r.venueId === "v1")).toHaveLength(2);
    expect(n2.filter((r) => r.venueId === "v1")).toHaveLength(4);
    expect(n1[0].campaignName).toMatch(/（.+）$/);
  });

  it("未成交／零成交案例沒有被丟掉（有推薦但成交 0 的列仍在）", () => {
    const n2 = demoN2Rows(run, DEFAULT_DEMO_NAMES, ALL).filter((r) => r.venueId === "v1");
    expect(n2.filter((r) => r.purchasedQty === 0 && r.shown > 0).length).toBeGreaterThan(0);
    expect(n2.reduce((s, r) => s + r.shown, 0)).toBe(7);
    expect(n2.reduce((s, r) => s + r.purchasedQty, 0)).toBe(4);
    // 技術案例明細仍保留（含反案例）
    expect(run.engine.cases.filter((c) => c.track === "N2")).toHaveLength(40);
  });
});

describe("篩選真正作用在模擬事件上", () => {
  const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 2 });

  it("館別篩選：只勾 2 家 → 分子分母同步變為 2 家的量", () => {
    const t = totalsN1(run, { ...ALL, venueIds: ["v1", "v2"] });
    expect(t).toEqual({ rows: 4, sends: 14, clicks: 14, skippedClicks: 2, orders: 4 });
    expect(totalsN2(run, { ...ALL, venueIds: ["v1", "v2"] })).toEqual({ rows: 8, shown: 14, purchasedQty: 8 });
  });

  it("日期篩選：只取 2026-06-09~2026-06-10 → 只剩 2 家", () => {
    const t = totalsN1(run, { ...ALL, from: "2026-06-09", to: "2026-06-10" });
    expect(t.rows).toBe(4);
    expect(t.sends).toBe(14);
    const none = totalsN1(run, { ...ALL, from: "2026-01-01", to: "2026-01-02" });
    expect(none).toEqual({ rows: 0, sends: 0, clicks: 0, skippedClicks: 0, orders: 0 });
    expect(totalsN2(run, { ...ALL, from: "2026-01-01", to: "2026-01-02" }).rows).toBe(0);
  });

  it("通路篩選：Email 只剩 sent 發送；LINE 只剩 skipped 點擊", () => {
    expect(totalsN1(run, { ...ALL, channel: "email" })).toEqual({ rows: 5, sends: 35, clicks: 35, skippedClicks: 0, orders: 10 });
    expect(totalsN1(run, { ...ALL, channel: "line_share" })).toEqual({ rows: 5, sends: 0, clicks: 0, skippedClicks: 5, orders: 0 });
  });

  it("篩選後的事件集合確實變小（不是只改顯示文字）", () => {
    const all = filterDemoEvents(run, ALL).length;
    const narrowed = filterDemoEvents(run, { ...ALL, venueIds: ["v1"] }).length;
    expect(narrowed).toBeLessThan(all);
    expect(narrowed * 5).toBe(all);
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
    expect(n2.reduce((s, r) => s + r.purchasedQty, 0)).toBe(20);
  });

  it("重新執行不累加：新 run 的統計與前一次相同，run ID 與事件 ID 不重疊", () => {
    const again = buildDemoRun({ venues: VENUES, now: new Date(NOW.getTime() + 3600_000), seed: 4 });
    expect(again.runId).not.toBe(run.runId);
    expect(totalsN1(again, { ...ALL, to: "2026-07-31" })).toEqual(totalsN1(run));
    expect(totalsN2(again, { ...ALL, to: "2026-07-31" })).toEqual(totalsN2(run));
    const overlap = new Set(run.engine.events.map((e) => e.id));
    expect(again.engine.events.some((e) => overlap.has(e.id))).toBe(false);
  });
});

describe("示範資料隔離儲存（版本化，不同 origin 各自獨立）", () => {
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

  it("第一次載入沒有示範資料（不預填結果），建立後可讀回同一 run", () => {
    expect(loadDemo().run).toBeNull();
    const run = buildDemoRun({ venues: VENUES, now: NOW, seed: 5 });
    saveDemoRun(run);
    const loaded = loadDemo();
    expect(loaded.run?.runId).toBe(run.runId);
    expect(loaded.mode).toBe("localStorage");
    // 兩頁共用同一 key → 另一頁讀到同一 run 與同一組 5 家館別
    expect(loaded.run?.venues.map((v) => v.id)).toEqual(VENUES.map((v) => v.id));
    expect(totalsN1(loaded.run!)).toEqual(totalsN1(run));
  });

  it("名稱編輯持久化，且不影響已存 run 的數字", () => {
    saveDemoRun(buildDemoRun({ venues: VENUES, now: NOW, seed: 6 }));
    saveDemoNames({ ...DEFAULT_DEMO_NAMES, n1CampaignName: "簡報用名稱" });
    const loaded = loadDemo();
    expect(loaded.names.n1CampaignName).toBe("簡報用名稱");
    expect(totalsN1(loaded.run!).sends).toBe(35);
  });

  it("版本不符或內容損壞一律捨棄並要求重新建立", () => {
    store.set(DEMO_STORE_KEY, JSON.stringify({ version: 1, demoVersion: "demo-pres-v0.0.1", run: { runId: "x" }, names: null }));
    let loaded = loadDemo();
    expect(loaded.run).toBeNull();
    expect(loaded.recovered).toBe(true);
    store.set(DEMO_STORE_KEY, "{not-json");
    loaded = loadDemo();
    expect(loaded.run).toBeNull();
    expect(loaded.recovered).toBe(true);
    expect(loaded.names).toEqual(DEFAULT_DEMO_NAMES);
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

describe("示範標示與正式路徑不混用（原始碼檢查）", () => {
  const read = (p: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../../../..", p), "utf8");
  const rem = read("apps/booking/src/pages/admin/RemarketingAnalytics.tsx");
  const addon = read("apps/booking/src/pages/admin/AddonRecAnalytics.tsx");
  const table = read("apps/booking/src/components/headquarters/MetricBreakdownTable.tsx");

  it("兩頁都有正式／示範切換，預設正式，示範模式不呼叫正式 RPC", () => {
    for (const src of [rem, addon]) {
      expect(src).toContain("AnalyticsModeToggle");
      expect(src).toContain("if (!demoMode) void load();");
      expect(src).toContain("showIncludeInternal={false}");
      expect(src).toContain("rowNature={DEMO_ROW_NATURE}");
    }
    expect(read("apps/booking/src/components/headquarters/DemoPresentationPanel.tsx"))
      .toContain('useState<AnalyticsMode>("live")');
  });

  it("示範 CSV 檔名與每列標示皆帶示範字樣", () => {
    expect(rem).toContain("DEMO_簡報示範_模擬資料_remarketing-analytics");
    expect(addon).toContain("DEMO_簡報示範_模擬資料_addon-rec-analytics");
    expect(DEMO_ROW_NATURE).toBe("簡報示範｜模擬資料");
    expect(DEMO_BANNER).toBe("簡報示範｜模擬資料，非實際營運成果");
    expect(table).toContain('{ key: "__nature", label: "資料性質"');
    expect(table).toContain('if (rowNature && c.key === "__nature") return rowNature;');
  });

  it("正式資料路徑未變：RPC 名稱、口徑說明、含內部上線測試切換仍在正式模式", () => {
    expect(rem).toContain("ai_metric_remarketing_breakdown");
    expect(addon).toContain("ai_metric_addon_breakdown");
    expect(rem).toContain("不回填、不模擬");
    expect(addon).toContain("不回填、不模擬");
    expect(rem).toContain('csvFileName="remarketing-analytics"');
    expect(addon).toContain('csvFileName="addon-rec-analytics"');
  });
});
