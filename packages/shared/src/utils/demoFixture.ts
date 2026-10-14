/**
 * 簡報示範用的「合成事件 fixture 生成器」（純函式、隔離、可追溯）。
 *
 * 重點：
 *   - 這裡只產生事件；所有分子分母（發送、點擊、下房、推薦、成交數量）一律由 aggregateN1／aggregateN2
 *     從事件算出，**沒有硬寫百分比、沒有顯示層覆蓋**。
 *   - 不動原技術情境驗證（80 案）、不碰正式 RPC／資料表／金流／PMS，不發 Email／LINE。
 *   - 每個事件都帶 caseId 標籤，可在畫面「事件明細」逐筆追溯；負面樣本（超時、取消、他人、跨館、
 *     未推薦品項）全部保留在事件集合內，只是依歸因規則不計入分子。
 *   - LINE 人工發送（sendStatus='skipped'）獨立計算：不計入發送數，其點擊只進 skippedClicks。
 */
import {
  aggregateN1,
  aggregateN2,
  rate,
  toTaipeiIso,
  DATA_NATURE,
  SCENARIO_VERSION,
  N1_ATTRIBUTION_HOURS,
  N2_ATTRIBUTION_DAYS,
  type RunResult,
  type ScenarioVenue,
  type SimEvent,
} from "./scenarioSim";

export const DEMO_FIXTURE_VERSION = "demo-fixture-v1.2.0";

/** 簡報用量級（可追溯的合成事件數量，不是顯示用的百分比） */
export const DEMO_FIXTURE_SPEC = {
  /** 每館 sent 發送數（合計 1050） */
  n1SentSends: [200, 220, 240, 180, 210],
  /** 每館有效點擊（對應 sent 發送，去重） */
  n1Clicks: [44, 50, 53, 41, 47],
  /** 每館歸因成功訂單（合計 40 → 40/1050＝3.81%） */
  n1Orders: [8, 8, 9, 7, 8],
  /** 每館 LINE 人工發送（skipped，不計入發送數） */
  n1SkippedSends: [12, 14, 10, 9, 11],
  /** 每館 skipped 發送的點擊（只進 skippedClicks） */
  n1SkippedClicks: [5, 6, 4, 3, 5],
  /** 每館各品項推薦曝光（各館 24／23／24／22／23，合計 116） */
  n2ShownByVenue: [
    [7, 6, 6, 5],
    [7, 6, 5, 5],
    [7, 6, 6, 5],
    [6, 6, 5, 5],
    [7, 6, 5, 5],
  ],
  /** 每館各品項成交數量（各館 15／14／15／13／15，合計 72 → 72/116≈62.1%；各品項 ≤ 該品項曝光） */
  n2QtyByVenue: [
    [5, 4, 3, 3],
    [4, 4, 3, 3],
    [5, 4, 3, 3],
    [4, 4, 3, 2],
    [5, 4, 3, 3],
  ],
  /** 每館固定的負面樣本數（依規則不計入分子） */
  negatives: {
    n1OrderTimeout: 2,
    n1OrderCancelled: 1,
    n1OrderOtherTraveler: 1,
    n1OrderCrossVenue: 1,
    n2PurchaseTimeout: 1,
    n2PurchaseCancelled: 1,
    n2PurchaseOtherTraveler: 1,
    n2PurchaseOtherItem: 1,
  },
} as const;

export const DEMO_FIXTURE_CASE_LABEL: Record<string, string> = {
  "demo-n1-send": "N1 已發送（sent，計入發送數）",
  "demo-n1-click": "N1 有效點擊（對應 sent 發送，去重）",
  "demo-n1-order": "N1 歸因成功訂單（≤72h、未取消、同發送同旅客）",
  "demo-n1-order-timeout": "N1 超出 72h 的訂單（不計入）",
  "demo-n1-order-cancelled": "N1 已取消訂單（不計入）",
  "demo-n1-order-other-traveler": "N1 他人訂單（旅客不符，不計入）",
  "demo-n1-order-cross-venue": "N1 跨館訂單（館別不符，不計入）",
  "demo-n1-skipped-send": "N1 LINE 人工發送（skipped，不計入發送數）",
  "demo-n1-skipped-click": "N1 skipped 發送的點擊（只列 skipped 點擊）",
  "demo-n2-shown": "N2 推薦曝光（計入推薦總數）",
  "demo-n2-purchased": "N2 歸因成交（≤7 日、同旅客同品項）",
  "demo-n2-purchased-timeout": "N2 超出 7 日的加購（不計入）",
  "demo-n2-purchased-cancelled": "N2 已取消加購（不計入）",
  "demo-n2-purchased-other-traveler": "N2 他人加購（旅客不符，不計入）",
  "demo-n2-purchased-other-item": "N2 未曾推薦的品項加購（不計入）",
};

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const pick = (arr: readonly number[], i: number) => arr[i % arr.length];

export function fixtureItemId(itemIndex: number): string {
  return `DEMOITEM-${itemIndex}`;
}

/** 由 itemId 取回示範品項索引（fixture 事件專用） */
export function fixtureItemIndex(itemId: string): number | null {
  const m = /^DEMOITEM-(\d+)/.exec(itemId);
  return m ? Number(m[1]) : null;
}

export function buildFixtureEvents(input: {
  runId: string;
  venues: ScenarioVenue[];
  now: Date;
  /** 各館事件相隔幾天（日期篩選才有實效） */
  dayStride?: number;
}): SimEvent[] {
  const { runId, venues, now } = input;
  const stride = input.dayStride ?? 1;
  const events: SimEvent[] = [];
  const spec = DEMO_FIXTURE_SPEC;

  venues.forEach((venue, vi) => {
    const base = now.getTime() - vi * stride * DAY;
    const at = (ms: number) => toTaipeiIso(new Date(base + ms));
    const campaignId = `DEMOCAMP-${venue.id}`;
    const push = (e: Omit<SimEvent, "runId" | "venueId" | "venueName" | "id"> & { id: string }) =>
      events.push({ ...e, id: `${runId}|V${vi + 1}|${e.id}`, runId, venueId: venue.id, venueName: venue.name });

    // ── N1：sent 發送 ─────────────────────────────────────────────
    const sends = pick(spec.n1SentSends, vi);
    const clicks = pick(spec.n1Clicks, vi);
    const orders = pick(spec.n1Orders, vi);
    for (let j = 0; j < sends; j += 1) {
      const sendId = `DEMOSEND-${venue.id}-${j}`;
      const travelerId = `SYN-N1-${vi + 1}-${j}`;
      push({
        id: `n1-send-${j}`, track: "N1", caseId: "demo-n1-send", travelerId, type: "send",
        occurredAt: at(j * 1000), campaignId, campaignName: campaignId, channel: "email",
        sendId, sendStatus: "sent",
      });
      if (j < clicks) {
        push({
          id: `n1-click-${j}`, track: "N1", caseId: "demo-n1-click", travelerId, type: "click",
          occurredAt: at(HOUR + j * 1000), campaignId, campaignName: campaignId, channel: "email", sendId,
        });
      }
      if (j < orders) {
        push({
          id: `n1-order-${j}`, track: "N1", caseId: "demo-n1-order", travelerId, type: "order",
          occurredAt: at(6 * HOUR + j * 1000), campaignId, campaignName: campaignId, channel: "email",
          utmContent: sendId, orderStatus: "confirmed",
        });
      }
    }

    // ── N1：負面樣本（留在事件集合，依規則不計入） ─────────────────
    const neg = spec.negatives;
    for (let k = 0; k < neg.n1OrderTimeout; k += 1) {
      const j = orders + k;
      push({
        id: `n1-order-timeout-${k}`, track: "N1", caseId: "demo-n1-order-timeout",
        travelerId: `SYN-N1-${vi + 1}-${j}`, type: "order",
        occurredAt: at((N1_ATTRIBUTION_HOURS + 28) * HOUR + k * 1000), campaignId, campaignName: campaignId,
        channel: "email", utmContent: `DEMOSEND-${venue.id}-${j}`, orderStatus: "confirmed",
      });
    }
    for (let k = 0; k < neg.n1OrderCancelled; k += 1) {
      const j = orders + neg.n1OrderTimeout + k;
      push({
        id: `n1-order-cancelled-${k}`, track: "N1", caseId: "demo-n1-order-cancelled",
        travelerId: `SYN-N1-${vi + 1}-${j}`, type: "order",
        occurredAt: at(8 * HOUR + k * 1000), campaignId, campaignName: campaignId, channel: "email",
        utmContent: `DEMOSEND-${venue.id}-${j}`, orderStatus: "cancelled",
      });
    }
    for (let k = 0; k < neg.n1OrderOtherTraveler; k += 1) {
      const j = orders + neg.n1OrderTimeout + neg.n1OrderCancelled + k;
      push({
        id: `n1-order-other-traveler-${k}`, track: "N1", caseId: "demo-n1-order-other-traveler",
        travelerId: `SYN-N1-${vi + 1}-${j}-OTHER`, type: "order",
        occurredAt: at(9 * HOUR + k * 1000), campaignId, campaignName: campaignId, channel: "email",
        utmContent: `DEMOSEND-${venue.id}-${j}`, orderStatus: "confirmed",
      });
    }
    for (let k = 0; k < neg.n1OrderCrossVenue; k += 1) {
      const j = orders + neg.n1OrderTimeout + neg.n1OrderCancelled + neg.n1OrderOtherTraveler + k;
      events.push({
        id: `${runId}|V${vi + 1}|n1-order-cross-venue-${k}`, runId, track: "N1",
        caseId: "demo-n1-order-cross-venue", venueId: `${venue.id}-SIM-OTHER`,
        venueName: `${venue.name}（跨館情境）`, travelerId: `SYN-N1-${vi + 1}-${j}`, type: "order",
        occurredAt: at(10 * HOUR + k * 1000), campaignId, campaignName: campaignId, channel: "email",
        utmContent: `DEMOSEND-${venue.id}-${j}`, orderStatus: "confirmed",
      });
    }

    // ── N1：LINE 人工發送（skipped）獨立計算 ──────────────────────
    const skippedSends = pick(spec.n1SkippedSends, vi);
    const skippedClicks = pick(spec.n1SkippedClicks, vi);
    for (let j = 0; j < skippedSends; j += 1) {
      const sendId = `DEMOLINE-${venue.id}-${j}`;
      const travelerId = `SYN-N1L-${vi + 1}-${j}`;
      push({
        id: `n1-skipped-send-${j}`, track: "N1", caseId: "demo-n1-skipped-send", travelerId, type: "send",
        occurredAt: at(2 * HOUR + j * 1000), campaignId, campaignName: campaignId, channel: "line_share",
        sendId, sendStatus: "skipped",
      });
      if (j < skippedClicks) {
        push({
          id: `n1-skipped-click-${j}`, track: "N1", caseId: "demo-n1-skipped-click", travelerId, type: "click",
          occurredAt: at(3 * HOUR + j * 1000), campaignId, campaignName: campaignId, channel: "line_share", sendId,
        });
      }
    }

    // ── N2：推薦曝光與歸因成交 ───────────────────────────────────
    const qtyByItem = spec.n2QtyByVenue[vi % spec.n2QtyByVenue.length];
    spec.n2ShownByVenue[vi % spec.n2ShownByVenue.length].forEach((shownCount, itemIndex) => {
      const itemId = fixtureItemId(itemIndex);
      const targetQty = qtyByItem[itemIndex] ?? 0;
      for (let j = 0; j < shownCount; j += 1) {
        const travelerId = `SYN-N2-${vi + 1}-${itemIndex}-${j}`;
        push({
          id: `n2-shown-${itemIndex}-${j}`, track: "N2", caseId: "demo-n2-shown", travelerId, type: "shown",
          occurredAt: at(2 * HOUR + itemIndex * 60_000 + j * 1000), itemId, itemName: itemId,
        });
        if (j < targetQty) {
          push({
            id: `n2-purchased-${itemIndex}-${j}`, track: "N2", caseId: "demo-n2-purchased", travelerId,
            type: "purchased", occurredAt: at(26 * HOUR + itemIndex * 60_000 + j * 1000),
            itemId, itemName: itemId, qty: 1, orderStatus: "confirmed",
          });
        }
      }
    });

    // ── N2：負面樣本 ─────────────────────────────────────────────
    const n2Neg: Array<[string, Partial<SimEvent>]> = [
      ["demo-n2-purchased-timeout", {
        travelerId: `SYN-N2-${vi + 1}-0-0`, itemId: fixtureItemId(0),
        occurredAt: at((N2_ATTRIBUTION_DAYS + 2) * DAY), orderStatus: "confirmed",
      }],
      ["demo-n2-purchased-cancelled", {
        travelerId: `SYN-N2-${vi + 1}-1-0`, itemId: fixtureItemId(1),
        occurredAt: at(30 * HOUR), orderStatus: "cancelled",
      }],
      ["demo-n2-purchased-other-traveler", {
        travelerId: `SYN-N2-${vi + 1}-2-0-OTHER`, itemId: fixtureItemId(2),
        occurredAt: at(31 * HOUR), orderStatus: "confirmed",
      }],
      ["demo-n2-purchased-other-item", {
        travelerId: `SYN-N2-${vi + 1}-3-0`, itemId: `${fixtureItemId(3)}-OTHER`,
        occurredAt: at(32 * HOUR), orderStatus: "confirmed",
      }],
    ];
    n2Neg.forEach(([caseId, patch], k) => {
      push({
        id: `${caseId}-${k}`, track: "N2", caseId, type: "purchased", qty: 2,
        travelerId: String(patch.travelerId), occurredAt: String(patch.occurredAt),
        itemId: patch.itemId, itemName: patch.itemId, orderStatus: patch.orderStatus,
      });
    });
  });

  return events;
}

/** 以 fixture 事件組出 RunResult（n1／n2／summary 全由事件算出；無技術案例） */
export function buildFixtureRunResult(input: {
  runId: string;
  venues: ScenarioVenue[];
  now: Date;
  dayStride?: number;
}): RunResult {
  const events = buildFixtureEvents(input);
  const n1 = aggregateN1(events);
  const n2 = aggregateN2(events);
  const sends = n1.reduce((s, r) => s + r.sends, 0);
  const clicks = n1.reduce((s, r) => s + r.clicks, 0);
  const skippedClicks = n1.reduce((s, r) => s + r.skippedClicks, 0);
  const rawClicks = n1.reduce((s, r) => s + r.rawClicks, 0);
  const orders = n1.reduce((s, r) => s + r.orders, 0);
  const shown = n2.reduce((s, r) => s + r.shown, 0);
  const purchasedQty = n2.reduce((s, r) => s + r.purchasedQty, 0);
  return {
    runId: input.runId,
    executedAt: toTaipeiIso(input.now),
    scenarioVersion: SCENARIO_VERSION,
    dataNature: DATA_NATURE,
    venues: input.venues,
    events,
    n1,
    n2,
    cases: [],
    summary: {
      caseTotal: 0, casePassed: 0, caseFailed: 0, passRatePct: null,
      simN1Cvr: rate(orders, sends),
      simN1Ctr: rate(clicks, sends),
      simN2Cvr: rate(purchasedQty, shown),
      sends, clicks, skippedClicks, rawClicks, orders, shown, purchasedQty,
    },
  };
}

export interface FixtureBreakdownRow {
  caseId: string;
  label: string;
  count: number;
}

/** 事件明細（可追溯）：依 caseId 統計件數，負面樣本一併列出 */
export function fixtureBreakdown(events: SimEvent[], track?: "N1" | "N2"): FixtureBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (track && e.track !== track) continue;
    counts.set(e.caseId, (counts.get(e.caseId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([caseId, count]) => ({ caseId, label: DEMO_FIXTURE_CASE_LABEL[caseId] ?? caseId, count }))
    .sort((a, b) => a.caseId.localeCompare(b.caseId));
}
