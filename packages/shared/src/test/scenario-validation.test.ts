// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildRun, aggregateN1, aggregateN2, rate, formatRate, toCsv, CASE_SPECS,
  SCENARIO_VERSION, DATA_NATURE, N1_ATTRIBUTION_HOURS, N2_ATTRIBUTION_DAYS,
  type ScenarioVenue,
} from "@lakeze/shared/utils/scenarioSim";
import { loadRuns, saveRun, clearRuns, MAX_RUNS, STORE_KEY } from "@lakeze/shared/utils/scenarioRunStore";

const VENUES: ScenarioVenue[] = [
  { id: "v1", name: "情境館 A" },
  { id: "v2", name: "情境館 B" },
  { id: "v3", name: "情境館 C" },
  { id: "v4", name: "情境館 D" },
  { id: "v5", name: "情境館 E" },
];
const NOW = new Date("2026-06-01T02:00:00Z");

describe("情境模擬器：基本保證", () => {
  it("案例涵蓋正確歸因、未成交、不同旅客、不同館／品項、超時、取消、重複事件、零分母（N1 與 N2 各 8 案）", () => {
    const ids = CASE_SPECS.map((c) => c.caseId);
    expect(CASE_SPECS.filter((c) => c.track === "N1")).toHaveLength(8);
    expect(CASE_SPECS.filter((c) => c.track === "N2")).toHaveLength(8);
    for (const must of [
      "n1-attributed", "n1-no-order", "n1-other-traveler", "n1-cross-venue",
      "n1-timeout", "n1-cancelled", "n1-duplicate", "n1-zero-denominator",
      "n2-attributed", "n2-not-purchased", "n2-other-traveler", "n2-other-item",
      "n2-timeout", "n2-cancelled", "n2-duplicate", "n2-zero-denominator",
    ]) {
      expect(ids).toContain(must);
    }
  });

  it("0 分母回 null 並顯示「—」，不以 0 當分母", () => {
    expect(rate(3, 0)).toBeNull();
    expect(formatRate(null)).toBe("—");
    expect(rate(1, 2)).toBe(50);
    expect(formatRate(50)).toBe("50%");
  });

  it("5 家批次執行：每家 16 案，全部案例通過（正反案例皆由事件計算）", () => {
    const run = buildRun({ venues: VENUES, now: NOW, seed: 1 });
    expect(run.summary.caseTotal).toBe(VENUES.length * CASE_SPECS.length);
    expect(run.summary.caseTotal).toBe(80);
    const failed = run.cases.filter((c) => !c.passed);
    expect(failed.map((f) => `${f.venueName}/${f.caseId}`)).toEqual([]);
    expect(run.summary.casePassed).toBe(80);
    expect(run.summary.passRatePct).toBe(100);
  });

  it("測試通過率與模擬轉換率是分開的數字（不混用）", () => {
    const run = buildRun({ venues: [VENUES[0]], now: NOW, seed: 2 });
    // 每館 N1：7 筆 sent（零分母案為 skipped）、下單只有正確歸因與重複事件兩案成立
    expect(run.summary.sends).toBe(7);
    expect(run.summary.orders).toBe(2);
    expect(run.summary.simN1Cvr).toBe(rate(2, 7));
    expect(run.summary.passRatePct).toBe(100);
    expect(run.summary.passRatePct).not.toBe(run.summary.simN1Cvr);
  });

  it("模擬事件彙總的分子分母與案例預期一致（無硬編碼總計）", () => {
    const run = buildRun({ venues: [VENUES[0]], now: NOW, seed: 3 });
    const sumExpected = (track: "N1" | "N2", key: string) =>
      run.cases.filter((c) => c.track === track).reduce((s, c) => s + ((c.expected[key] as number) ?? 0), 0);
    expect(run.summary.sends).toBe(sumExpected("N1", "sends"));
    expect(run.summary.clicks).toBe(sumExpected("N1", "clicks"));
    expect(run.summary.orders).toBe(sumExpected("N1", "orders"));
    expect(run.summary.shown).toBe(sumExpected("N2", "shown"));
    expect(run.summary.purchasedQty).toBe(sumExpected("N2", "purchasedQty"));
  });
});

describe("反案例：歸因規則必須擋掉不該計入的事件", () => {
  const run = buildRun({ venues: [VENUES[0]], now: NOW, seed: 4 });
  const caseOf = (id: string) => run.cases.find((c) => c.caseId === id)!;

  it.each([
    ["n1-no-order", "orders", 0],
    ["n1-other-traveler", "orders", 0],
    ["n1-cross-venue", "orders", 0],
    ["n1-timeout", "orders", 0],
    ["n1-cancelled", "orders", 0],
    ["n2-not-purchased", "purchasedQty", 0],
    ["n2-other-traveler", "purchasedQty", 0],
    ["n2-other-item", "purchasedQty", 0],
    ["n2-timeout", "purchasedQty", 0],
    ["n2-cancelled", "purchasedQty", 0],
  ])("%s 的 %s 實際值為 %i", (id, key, want) => {
    expect(caseOf(id as string).actual[key as string]).toBe(want);
    expect(caseOf(id as string).passed).toBe(true);
  });

  it("重複事件去重：N1 點擊與下單各計 1；N2 推薦與成交數量不重複累加", () => {
    expect(caseOf("n1-duplicate").actual).toMatchObject({ sends: 1, clicks: 1, orders: 1 });
    expect(caseOf("n2-duplicate").actual).toMatchObject({ shown: 1, purchasedQty: 2 });
  });

  it("零分母：N1 skipped 發送 → ctr/cvr 為 —；N2 無推薦 → cvr 為 —", () => {
    expect(caseOf("n1-zero-denominator").actual.sends).toBe(0);
    expect(caseOf("n1-zero-denominator").actual.ctr).toBeNull();
    expect(caseOf("n1-zero-denominator").actual.cvr).toBeNull();
    expect(caseOf("n2-zero-denominator").actual.shown).toBe(0);
    expect(caseOf("n2-zero-denominator").actual.cvr).toBeNull();
  });

  it("歸因視窗邊界：剛好在視窗內成立、超過 1 小時／1 日不成立", () => {
    const base = "2026-06-01T10:00:00+08:00";
    const n1 = aggregateN1([
      { id: "s", runId: "r", track: "N1", caseId: "c", venueId: "v", venueName: "情境館", travelerId: "SYN-1",
        type: "send", occurredAt: base, campaignId: "c1", campaignName: "c1", channel: "email", sendId: "S1", sendStatus: "sent" },
      { id: "o", runId: "r", track: "N1", caseId: "c", venueId: "v", venueName: "情境館", travelerId: "SYN-1",
        type: "order", occurredAt: "2026-06-04T10:00:00+08:00", utmContent: "S1", orderStatus: "confirmed" },
    ]);
    expect(N1_ATTRIBUTION_HOURS).toBe(72);
    expect(n1[0].orders).toBe(1);

    const n2 = aggregateN2([
      { id: "sh", runId: "r", track: "N2", caseId: "c", venueId: "v", venueName: "情境館", travelerId: "SYN-1",
        type: "shown", occurredAt: base, itemId: "I1", itemName: "品項" },
      { id: "p", runId: "r", track: "N2", caseId: "c", venueId: "v", venueName: "情境館", travelerId: "SYN-1",
        type: "purchased", occurredAt: "2026-06-08T10:00:00+08:00", itemId: "I1", itemName: "品項", qty: 1, orderStatus: "confirmed" },
    ]);
    expect(N2_ATTRIBUTION_DAYS).toBe(7);
    expect(n2[0].purchasedQty).toBe(1);
  });
});

describe("跨 run 不累加", () => {
  it("兩次 run 的統計完全相同，不互相加總；run ID 與事件 ID 皆隔離", () => {
    const a = buildRun({ venues: VENUES, now: NOW, seed: 10 });
    const b = buildRun({ venues: VENUES, now: new Date(NOW.getTime() + 3600_000), seed: 11 });
    expect(a.runId).not.toBe(b.runId);
    expect(b.summary.sends).toBe(a.summary.sends);
    expect(b.summary.orders).toBe(a.summary.orders);
    expect(b.summary.purchasedQty).toBe(a.summary.purchasedQty);
    expect(b.events.length).toBe(a.events.length);
    const overlap = new Set(a.events.map((e) => e.id));
    expect(b.events.some((e) => overlap.has(e.id))).toBe(false);
  });
});

describe("CSV 與畫面一致 + 標示不可隱藏", () => {
  const run = buildRun({ venues: [VENUES[0], VENUES[1]], now: NOW, seed: 20 });
  const csv = toCsv(run);
  const lines = csv.split("\n").filter(Boolean);

  it("每個畫面案例列都有一列 CSV，且預期／實際值一致", () => {
    expect(lines.length).toBe(1 + run.cases.length + 1); // header + cases + summary
    for (const c of run.cases) {
      const expectedText = Object.entries(c.expected).map(([k, v]) => `${k}=${v === null ? "—" : v}`).join("; ");
      const actualText = Object.entries(c.actual).map(([k, v]) => `${k}=${v === null ? "—" : v}`).join("; ");
      const hit = lines.find((l) => l.includes(c.travelerId));
      expect(hit).toBeTruthy();
      expect(hit!).toContain(expectedText);
      expect(hit!).toContain(actualText);
      expect(hit!).toContain(c.passed ? "通過" : "失敗");
    }
  });

  it("CSV 含資料性質、run ID、台北時區 ISO offset、情境館別、合成對象、事件、公式", () => {
    expect(csv).toContain(DATA_NATURE);
    expect(csv).toContain(SCENARIO_VERSION);
    expect(csv).toContain(run.runId);
    expect(csv).toMatch(/\+08:00/);
    expect(csv).toContain("情境館 A（情境）");
    expect(csv).toContain("SYN-");
    expect(csv).toContain("計算公式");
  });

  it("匯出不含任何正式 KPI 達標字樣，且標示無法移除", () => {
    expect(csv).not.toMatch(/達標|已達成|KPI 通過/);
    expect(lines.slice(1).every((l) => l.includes(DATA_NATURE))).toBe(true);
    expect(lines[0]).toContain("資料性質");
  });
});

describe("隔離 localStorage 儲存", () => {
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
    clearRuns();
    vi.unstubAllGlobals();
  });

  it("儲存與載入：新 run 置頂，最多保留 MAX_RUNS 筆", () => {
    for (let i = 0; i < MAX_RUNS + 3; i += 1) {
      saveRun(buildRun({ venues: [VENUES[0]], now: new Date(NOW.getTime() + i * 60_000), seed: 100 + i }));
    }
    const loaded = loadRuns();
    expect(loaded.mode).toBe("localStorage");
    expect(loaded.runs).toHaveLength(MAX_RUNS);
  });

  it("內容損壞時捨棄舊資料並標記 recovered，不丟出例外", () => {
    store.set(STORE_KEY, "{not-json");
    const loaded = loadRuns();
    expect(loaded.runs).toEqual([]);
    expect(loaded.recovered).toBe(true);
  });

  it("版本不符時捨棄舊資料", () => {
    store.set(STORE_KEY, JSON.stringify({ version: 999, runs: [{ runId: "x" }] }));
    const loaded = loadRuns();
    expect(loaded.runs).toEqual([]);
    expect(loaded.recovered).toBe(true);
  });

  it("localStorage 不可用時降級為記憶體模式", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    } as unknown as Storage);
    const saved = saveRun(buildRun({ venues: [VENUES[0]], now: NOW, seed: 7 }));
    expect(saved.mode).toBe("memory");
    expect(loadRuns().mode).toBe("memory");
  });
});

describe("頁面與入口：標示與隔離宣告不可隱藏", () => {
  const read = (p: string) => require("node:fs").readFileSync(require("node:path").resolve(__dirname, "../../../..", p), "utf8");

  it("情境頁固定顯示資料性質與隔離模擬器標示，且不預填結果", () => {
    const src = read("apps/booking/src/pages/admin/ScenarioValidation.tsx");
    expect(src).toContain("DATA_NATURE");
    expect(src).toContain("ISOLATION_LABEL");
    expect(src).toContain("尚未執行情境測試");
    expect(src).toContain("不預先填造執行結果");
    expect(src).toContain("非伺服器稽核紀錄");
    expect(src).toContain("不表示該業者已實際參測");
  });

  it("兩個正式分析頁新增情境驗證入口，原有口徑保留", () => {
    const rem = read("apps/booking/src/pages/admin/RemarketingAnalytics.tsx");
    const addon = read("apps/booking/src/pages/admin/AddonRecAnalytics.tsx");
    expect(rem).toContain("/hq/scenario-validation");
    expect(addon).toContain("/hq/scenario-validation");
    expect(rem).toContain("不回填、不模擬");
    expect(addon).toContain("不回填、不模擬");
    expect(rem).toContain("ai_metric_remarketing_breakdown");
    expect(addon).toContain("ai_metric_addon_breakdown");
  });

  it("路由掛在總部既有區塊，未擴大存取範圍", () => {
    const app = read("apps/booking/src/App.tsx");
    expect(app).toContain('path="/hq/scenario-validation"');
    expect(app).toContain('import("@/pages/admin/ScenarioValidation")');
  });
});
