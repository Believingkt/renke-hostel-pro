/**
 * N1／N2 情境驗證模擬器（純函式，隔離）
 *
 * 用途：以合成事件驗證「再行銷歸因（N1）」與「加購推薦歸因（N2）」的計算邏輯是否正確。
 * 這裡所有資料都是情境測試資料，非實際營運成果：
 *   - 不讀寫任何正式資料表、不呼叫任何 RPC、不發送 Email／LINE、不觸及金流或 PMS。
 *   - 事件只在按下「執行情境測試」時於瀏覽器記憶體產生，結果僅存於隔離 localStorage。
 *   - 分子分母一律由本次產生的事件計算，不硬編碼總計、不挑選結果。
 *
 * 未驗證範圍（本模擬器不涵蓋，不得視為端到端通過）：
 *   正式 SQL／RPC（ai_metric_remarketing_breakdown、ai_metric_addon_breakdown）、
 *   實際發送與寄達、付款與訂單寫入、OTA／PMS 串接、端到端串接。
 *   歸因視窗（N1 72h／N2 7 日）為本模擬器參數，未與正式 RPC 口徑逐項比對。
 */

export const SCENARIO_VERSION = "n1n2-sim-v1.0.1";
export const DATA_NATURE = "情境測試資料（非實際營運成果）";
export const ISOLATION_LABEL = "隔離模擬器驗證";
/** 口徑說明：v1.0.1 起點擊率分子只計 eligible sent 發送的去重點擊（舊版 v1.0.0 結果不相容，需重新執行） */
export const RATE_BASIS_NOTE =
  "點擊率＝eligible 點擊／sent 發送（同 run、同館、對應 sendStatus='sent'，每發送最多 1）；skipped 發送點擊另列，不計入任何比率";

/** N1 歸因視窗（本模擬器參數，未與正式 RPC 比對） */
export const N1_ATTRIBUTION_HOURS = 72;
/** N2 歸因視窗（本模擬器參數，未與正式 RPC 比對） */
export const N2_ATTRIBUTION_DAYS = 7;

export type Track = "N1" | "N2";

export interface ScenarioVenue {
  id: string;
  name: string;
}

export type SimEventType = "send" | "click" | "order" | "shown" | "purchased";

export interface SimEvent {
  id: string;
  runId: string;
  track: Track;
  caseId: string;
  venueId: string;
  venueName: string;
  travelerId: string;
  type: SimEventType;
  occurredAt: string;
  /** N1 */
  campaignId?: string;
  campaignName?: string;
  channel?: "email" | "line_share";
  sendId?: string | null;
  utmContent?: string | null;
  sendStatus?: "sent" | "skipped";
  clicked?: boolean;
  orderStatus?: "confirmed" | "cancelled";
  /** N2 */
  itemId?: string;
  itemName?: string;
  qty?: number;
}

export interface N1Aggregate {
  key: string;
  venueId: string;
  venueName: string;
  campaignId: string;
  campaignName: string;
  channel: string;
  sends: number;
  /** 以 sent 發送為分母的分子：同 run、同館、對應 sent 發送的去重點擊 */
  clicks: number;
  /** 對應 skipped 發送的去重點擊（明細／稽核用，不進入任何比率） */
  skippedClicks: number;
  /** 已匹配 sent／skipped 發送的總點擊（clicks + skippedClicks），不含其他未知事件 */
  rawClicks: number;
  orders: number;
}

export interface N2Aggregate {
  key: string;
  venueId: string;
  venueName: string;
  itemId: string;
  itemName: string;
  shown: number;
  purchasedQty: number;
}

export interface CaseResult {
  caseId: string;
  track: Track;
  title: string;
  venueId: string;
  venueName: string;
  travelerId: string;
  formula: string;
  expected: Record<string, number | null>;
  actual: Record<string, number | null>;
  passed: boolean;
  note: string;
}

export interface RunResult {
  runId: string;
  executedAt: string;
  scenarioVersion: string;
  dataNature: string;
  venues: ScenarioVenue[];
  events: SimEvent[];
  n1: N1Aggregate[];
  n2: N2Aggregate[];
  cases: CaseResult[];
  summary: {
    caseTotal: number;
    casePassed: number;
    caseFailed: number;
    /** 測試通過率（與轉換率分開顯示） */
    passRatePct: number | null;
    /** 模擬 N1 轉換率＝模擬下單數／模擬發送數 */
    simN1Cvr: number | null;
    /** 模擬 N1 點擊率＝eligible 點擊／sent 發送（skipped 點擊不列入） */
    simN1Ctr: number | null;
    /** 模擬 N2 加購轉換率＝模擬成交數量／模擬推薦數 */
    simN2Cvr: number | null;
    sends: number;
    clicks: number;
    skippedClicks: number;
    rawClicks: number;
    orders: number;
    shown: number;
    purchasedQty: number;
  };
}

/** 分母為 0 回傳 null（畫面顯示「—」） */
export function rate(num: number, den: number): number | null {
  if (!Number.isFinite(den) || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

export function formatRate(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/** Asia/Taipei 固定 +08:00 的 ISO 字串 */
export function toTaipeiIso(input: Date): string {
  const ms = input.getTime() + 8 * 60 * 60 * 1000;
  return `${new Date(ms).toISOString().slice(0, 19)}+08:00`;
}

function shift(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3600 * 1000);
}

/** 合成旅客 ID（不複製任何真實個資） */
export function syntheticTravelerId(runId: string, venueIndex: number, caseId: string): string {
  return `SYN-${runId.slice(-6)}-V${venueIndex + 1}-${caseId.toUpperCase()}`;
}

export function makeRunId(now: Date, seed: number): string {
  const stamp = toTaipeiIso(now).replace(/[-:+]/g, "").replace("T", "-").slice(0, 15);
  return `SIMRUN-${stamp}-${String(seed % 10000).padStart(4, "0")}`;
}

interface CaseSpec {
  caseId: string;
  track: Track;
  title: string;
  formula: string;
  note: string;
  expected: Record<string, number | null>;
  build: (ctx: {
    runId: string;
    now: Date;
    venue: ScenarioVenue;
    venueIndex: number;
    travelerId: string;
    caseId: string;
  }) => SimEvent[];
}

function n1Base(ctx: Parameters<CaseSpec["build"]>[0], overrides: Partial<SimEvent> = {}): SimEvent {
  return {
    id: "",
    runId: ctx.runId,
    track: "N1",
    caseId: ctx.caseId,
    venueId: ctx.venue.id,
    venueName: ctx.venue.name,
    travelerId: ctx.travelerId,
    type: "send",
    occurredAt: toTaipeiIso(ctx.now),
    campaignId: `SIMCAMP-${ctx.caseId}`,
    campaignName: `情境活動 ${ctx.caseId}`,
    channel: "email",
    ...overrides,
  };
}

function n2Base(ctx: Parameters<CaseSpec["build"]>[0], overrides: Partial<SimEvent> = {}): SimEvent {
  return {
    id: "",
    runId: ctx.runId,
    track: "N2",
    caseId: ctx.caseId,
    venueId: ctx.venue.id,
    venueName: ctx.venue.name,
    travelerId: ctx.travelerId,
    type: "shown",
    occurredAt: toTaipeiIso(ctx.now),
    itemId: `SIMITEM-${ctx.caseId}`,
    itemName: `情境加購品項 ${ctx.caseId}`,
    ...overrides,
  };
}

export const CASE_SPECS: CaseSpec[] = [
  {
    caseId: "n1-attributed",
    track: "N1",
    title: "N1 正確歸因：發送→點擊→期限內下單",
    formula: "下單數＝同發送 ID、同館、未取消、發送後 ≤72h 的訂單（每發送最多 1 單）",
    note: "合成事件：1 發送 / 1 點擊 / 1 已確認訂單（+24h）",
    expected: { sends: 1, clicks: 1, orders: 1 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 2)) }),
        n1Base(ctx, {
          id: `${sendId}-o`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 24)),
        }),
      ];
    },
  },
  {
    caseId: "n1-no-order",
    track: "N1",
    title: "N1 未成交：有點擊但沒有訂單",
    formula: "同上；無符合訂單事件 → 下單數 0",
    note: "合成事件：1 發送 / 1 點擊 / 0 訂單",
    expected: { sends: 1, clicks: 1, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
      ];
    },
  },
  {
    caseId: "n1-other-traveler",
    track: "N1",
    title: "N1 不同旅客：訂單的 utm_content 非本次發送",
    formula: "訂單 utm_content 必須等於發送 ID；不同旅客的發送 ID 不同 → 不歸因",
    note: "合成事件：1 發送 / 1 點擊 / 1 訂單（utm_content 指向其他合成旅客的發送）",
    expected: { sends: 1, clicks: 1, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
        n1Base(ctx, {
          id: `${sendId}-o`,
          type: "order",
          sendId,
          travelerId: `${ctx.travelerId}-OTHER`,
          utmContent: `${sendId}-OTHER`,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 5)),
        }),
      ];
    },
  },
  {
    caseId: "n1-cross-venue",
    track: "N1",
    title: "N1 不同館：訂單成交館別與發送館別不同",
    formula: "歸因需同館（venueId 相同）→ 跨館訂單不計入",
    note: "合成事件：1 發送 / 1 點擊 / 1 訂單（館別為情境館別＋跨館標記）",
    expected: { sends: 1, clicks: 1, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
        n1Base(ctx, {
          id: `${sendId}-o`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "confirmed",
          venueId: `${ctx.venue.id}-SIM-OTHER`,
          venueName: `${ctx.venue.name}（情境・跨館）`,
          occurredAt: toTaipeiIso(shift(ctx.now, 6)),
        }),
      ];
    },
  },
  {
    caseId: "n1-timeout",
    track: "N1",
    title: "N1 超時：下單時間超過歸因視窗",
    formula: `訂單必須在發送後 ≤${N1_ATTRIBUTION_HOURS} 小時內`,
    note: `合成事件：1 發送 / 1 點擊 / 1 訂單（+${N1_ATTRIBUTION_HOURS + 1}h）`,
    expected: { sends: 1, clicks: 1, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
        n1Base(ctx, {
          id: `${sendId}-o`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, N1_ATTRIBUTION_HOURS + 1)),
        }),
      ];
    },
  },
  {
    caseId: "n1-cancelled",
    track: "N1",
    title: "N1 取消訂單：期限內下單但已取消",
    formula: "訂單狀態為 cancelled → 不計入下單數",
    note: "合成事件：1 發送 / 1 點擊 / 1 已取消訂單（+10h）",
    expected: { sends: 1, clicks: 1, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
        n1Base(ctx, {
          id: `${sendId}-o`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "cancelled",
          occurredAt: toTaipeiIso(shift(ctx.now, 10)),
        }),
      ];
    },
  },
  {
    caseId: "n1-duplicate",
    track: "N1",
    title: "N1 重複事件：重複點擊與重複訂單事件",
    formula: "同一發送 ID 的點擊只計 1、下單只計 1（事件去重）",
    note: "合成事件：1 發送 / 3 點擊（同一發送）/ 2 訂單（同一發送）",
    expected: { sends: 1, clicks: 1, orders: 1 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "sent" }),
        n1Base(ctx, { id: `${sendId}-c1`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 1)) }),
        n1Base(ctx, { id: `${sendId}-c2`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 2)) }),
        n1Base(ctx, { id: `${sendId}-c3`, type: "click", sendId, occurredAt: toTaipeiIso(shift(ctx.now, 3)) }),
        n1Base(ctx, {
          id: `${sendId}-o1`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 4)),
        }),
        n1Base(ctx, {
          id: `${sendId}-o2`,
          type: "order",
          sendId,
          utmContent: sendId,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 5)),
        }),
      ];
    },
  },
  {
    caseId: "n1-zero-denominator",
    track: "N1",
    title: "N1 零分母：LINE 人工發送（status=skipped）",
    formula:
      "發送數只計 status='sent'；skipped 發送的點擊列為 skippedClicks，不進入點擊率分子；分母 0 → 點擊率／轉換率顯示「—」",
    note: "合成事件：1 skipped 發送 / 1 點擊（對應 skipped 發送）/ 0 訂單",
    expected: { sends: 0, clicks: 0, skippedClicks: 1, ctr: null, cvr: null, orders: 0 },
    build: (ctx) => {
      const sendId = `SIMSEND-${ctx.caseId}`;
      return [
        n1Base(ctx, { id: `${sendId}-s`, type: "send", sendId, sendStatus: "skipped", channel: "line_share" }),
        n1Base(ctx, {
          id: `${sendId}-c`,
          type: "click",
          sendId,
          channel: "line_share",
          occurredAt: toTaipeiIso(shift(ctx.now, 1)),
        }),
      ];
    },
  },
  {
    caseId: "n2-attributed",
    track: "N2",
    title: "N2 正確歸因：推薦→期限內同館同品項加購",
    formula: `成交數量＝同旅客、同館、同品項、推薦後 ≤${N2_ATTRIBUTION_DAYS} 日的 qty 合計`,
    note: "合成事件：1 推薦 / 1 加購（qty 2，+48h）",
    expected: { shown: 1, purchasedQty: 2 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId }),
        n2Base(ctx, {
          id: `${itemId}-p`,
          type: "purchased",
          itemId,
          qty: 2,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 48)),
        }),
      ];
    },
  },
  {
    caseId: "n2-not-purchased",
    track: "N2",
    title: "N2 未成交：只有推薦曝光",
    formula: "無加購事件 → 成交數量 0；轉換率＝0／1＝0%",
    note: "合成事件：1 推薦 / 0 加購",
    expected: { shown: 1, purchasedQty: 0 },
    build: (ctx) => [n2Base(ctx, { id: `SIMITEM-${ctx.caseId}-s`, type: "shown" })],
  },
  {
    caseId: "n2-other-traveler",
    track: "N2",
    title: "N2 不同旅客：加購者非被推薦者",
    formula: "需同一合成旅客（個人層級歸因）→ 其他旅客加購不計入",
    note: "合成事件：1 推薦 / 1 加購（其他合成旅客）",
    expected: { shown: 1, purchasedQty: 0 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId }),
        n2Base(ctx, {
          id: `${itemId}-p`,
          type: "purchased",
          itemId,
          qty: 3,
          travelerId: `${ctx.travelerId}-OTHER`,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 12)),
        }),
      ];
    },
  },
  {
    caseId: "n2-other-item",
    track: "N2",
    title: "N2 不同品項／不同館：加購與推薦不同項",
    formula: "需同館同品項 → 不同品項或不同館的加購不計入",
    note: "合成事件：1 推薦 / 1 加購（不同品項）/ 1 加購（不同館同品項）",
    expected: { shown: 1, purchasedQty: 0 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId }),
        n2Base(ctx, {
          id: `${itemId}-p-item`,
          type: "purchased",
          itemId: `${itemId}-OTHER`,
          itemName: `情境加購品項 ${ctx.caseId}（其他）`,
          qty: 1,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 6)),
        }),
        n2Base(ctx, {
          id: `${itemId}-p-venue`,
          type: "purchased",
          itemId,
          qty: 1,
          orderStatus: "confirmed",
          venueId: `${ctx.venue.id}-SIM-OTHER`,
          venueName: `${ctx.venue.name}（情境・跨館）`,
          occurredAt: toTaipeiIso(shift(ctx.now, 7)),
        }),
      ];
    },
  },
  {
    caseId: "n2-timeout",
    track: "N2",
    title: "N2 超時：加購超過歸因視窗",
    formula: `加購需在推薦後 ≤${N2_ATTRIBUTION_DAYS} 日內`,
    note: `合成事件：1 推薦 / 1 加購（+${N2_ATTRIBUTION_DAYS * 24 + 1}h）`,
    expected: { shown: 1, purchasedQty: 0 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId }),
        n2Base(ctx, {
          id: `${itemId}-p`,
          type: "purchased",
          itemId,
          qty: 2,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, N2_ATTRIBUTION_DAYS * 24 + 1)),
        }),
      ];
    },
  },
  {
    caseId: "n2-cancelled",
    track: "N2",
    title: "N2 取消訂單：加購後訂單取消",
    formula: "加購所屬訂單取消 → 不計入成交數量",
    note: "合成事件：1 推薦 / 1 加購（qty 2，已取消）",
    expected: { shown: 1, purchasedQty: 0 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId }),
        n2Base(ctx, {
          id: `${itemId}-p`,
          type: "purchased",
          itemId,
          qty: 2,
          orderStatus: "cancelled",
          occurredAt: toTaipeiIso(shift(ctx.now, 24)),
        }),
      ];
    },
  },
  {
    caseId: "n2-duplicate",
    track: "N2",
    title: "N2 重複事件：重複推薦曝光與重複加購事件",
    formula: "推薦數依事件 ID 去重；重複傳入的同一加購事件 ID 只計一次",
    note: "合成事件：2 推薦（其中 1 筆重複 ID）/ 2 加購（其中 1 筆重複 ID，qty 2）",
    expected: { shown: 1, purchasedQty: 2 },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      const shownEvent = n2Base(ctx, { id: `${itemId}-s`, type: "shown", itemId });
      const purchasedEvent = n2Base(ctx, {
        id: `${itemId}-p`,
        type: "purchased",
        itemId,
        qty: 2,
        orderStatus: "confirmed",
        occurredAt: toTaipeiIso(shift(ctx.now, 10)),
      });
      return [shownEvent, { ...shownEvent }, purchasedEvent, { ...purchasedEvent }];
    },
  },
  {
    caseId: "n2-zero-denominator",
    track: "N2",
    title: "N2 零分母：有加購但沒有推薦曝光",
    formula: "推薦數 0 → 加購轉換率顯示「—」（不得以 0 當分母）",
    note: "合成事件：0 推薦 / 1 加購（qty 1）",
    expected: { shown: 0, purchasedQty: 0, cvr: null },
    build: (ctx) => {
      const itemId = `SIMITEM-${ctx.caseId}`;
      return [
        n2Base(ctx, {
          id: `${itemId}-p`,
          type: "purchased",
          itemId,
          qty: 1,
          orderStatus: "confirmed",
          occurredAt: toTaipeiIso(shift(ctx.now, 3)),
        }),
      ];
    },
  },
];

function dedupeById(events: SimEvent[]): SimEvent[] {
  const seen = new Set<string>();
  const out: SimEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

function hoursBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 3600000;
}

/** N1 彙總：分子分母全部由事件計算 */
export function aggregateN1(rawEvents: SimEvent[]): N1Aggregate[] {
  const events = dedupeById(rawEvents.filter((e) => e.track === "N1"));
  const sends = events.filter((e) => e.type === "send");
  const clicks = events.filter((e) => e.type === "click");
  const orders = events.filter((e) => e.type === "order");
  const map = new Map<string, N1Aggregate>();

  for (const send of sends) {
    const key = `${send.venueId}|${send.campaignId}|${send.channel}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        venueId: send.venueId,
        venueName: send.venueName,
        campaignId: send.campaignId ?? "",
        campaignName: send.campaignName ?? "",
        channel: send.channel ?? "email",
        sends: 0,
        clicks: 0,
        skippedClicks: 0,
        rawClicks: 0,
        orders: 0,
      });
    }
    const row = map.get(key)!;
    const isSent = send.sendStatus === "sent";
    if (isSent) row.sends += 1;

    // 點擊需與本次 run、同館、同一發送 ID 對應；每發送最多 1（事件去重）
    const clicked = clicks.some(
      (c) => c.runId === send.runId && c.sendId === send.sendId && c.venueId === send.venueId,
    );
    if (clicked) {
      if (isSent) row.clicks += 1;
      else row.skippedClicks += 1;
      row.rawClicks += 1;
    }

    const attributed = orders.some(
      (o) =>
        o.utmContent === send.sendId &&
        o.venueId === send.venueId &&
        o.travelerId === send.travelerId &&
        o.orderStatus === "confirmed" &&
        hoursBetween(send.occurredAt, o.occurredAt) >= 0 &&
        hoursBetween(send.occurredAt, o.occurredAt) <= N1_ATTRIBUTION_HOURS,
    );
    if (attributed) row.orders += 1;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** N2 彙總：分子分母全部由事件計算 */
export function aggregateN2(rawEvents: SimEvent[]): N2Aggregate[] {
  const events = dedupeById(rawEvents.filter((e) => e.track === "N2"));
  const shownEvents = events.filter((e) => e.type === "shown");
  const purchases = events.filter((e) => e.type === "purchased");
  const map = new Map<string, N2Aggregate>();

  const ensure = (e: SimEvent): N2Aggregate => {
    const key = `${e.venueId}|${e.itemId}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        venueId: e.venueId,
        venueName: e.venueName,
        itemId: e.itemId ?? "",
        itemName: e.itemName ?? "",
        shown: 0,
        purchasedQty: 0,
      });
    }
    return map.get(key)!;
  };

  for (const shown of shownEvents) {
    const row = ensure(shown);
    row.shown += 1;
    for (const p of purchases) {
      const sameTarget =
        p.itemId === shown.itemId && p.venueId === shown.venueId && p.travelerId === shown.travelerId;
      if (!sameTarget || p.orderStatus !== "confirmed") continue;
      const h = hoursBetween(shown.occurredAt, p.occurredAt);
      if (h < 0 || h > N2_ATTRIBUTION_DAYS * 24) continue;
      row.purchasedQty += p.qty ?? 0;
    }
  }
  // 有加購但無推薦曝光者仍需成列（零分母案例），推薦數維持 0
  for (const p of purchases) {
    const key = `${p.venueId}|${p.itemId}`;
    if (!map.has(key)) ensure(p);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function actualForCase(spec: CaseSpec, venue: ScenarioVenue, caseEvents: SimEvent[]): Record<string, number | null> {
  if (spec.track === "N1") {
    const rows = aggregateN1(caseEvents).filter((r) => r.venueId === venue.id);
    const sends = rows.reduce((s, r) => s + r.sends, 0);
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const orders = rows.reduce((s, r) => s + r.orders, 0);
    const out: Record<string, number | null> = { sends, clicks, orders };
    if ("skippedClicks" in spec.expected) out.skippedClicks = rows.reduce((s, r) => s + r.skippedClicks, 0);
    if ("rawClicks" in spec.expected) out.rawClicks = rows.reduce((s, r) => s + r.rawClicks, 0);
    if ("ctr" in spec.expected) out.ctr = rate(clicks, sends);
    if ("cvr" in spec.expected) out.cvr = rate(orders, sends);
    return out;
  }
  const rows = aggregateN2(caseEvents).filter((r) => r.venueId === venue.id);
  const shown = rows.reduce((s, r) => s + r.shown, 0);
  const purchasedQty = rows.reduce((s, r) => s + r.purchasedQty, 0);
  const out: Record<string, number | null> = { shown, purchasedQty };
  if ("cvr" in spec.expected) out.cvr = rate(purchasedQty, shown);
  return out;
}

/** 按下「執行情境測試」時呼叫；每次 run 完全獨立，不累加任何歷史 run */
export function buildRun(input: { venues: ScenarioVenue[]; now?: Date; seed?: number }): RunResult {
  const now = input.now ?? new Date();
  const runId = makeRunId(now, input.seed ?? Math.floor(Math.random() * 10000));
  const events: SimEvent[] = [];
  const cases: CaseResult[] = [];

  input.venues.forEach((venue, venueIndex) => {
    for (const spec of CASE_SPECS) {
      const travelerId = syntheticTravelerId(runId, venueIndex, spec.caseId);
      const built = spec
        .build({ runId, now, venue, venueIndex, travelerId, caseId: spec.caseId })
        .map((e) => ({ ...e, id: `${runId}|V${venueIndex + 1}|${e.id}` }));
      events.push(...built);

      const actual = actualForCase(spec, venue, built);
      const passed = Object.entries(spec.expected).every(([k, v]) => actual[k] === v);
      cases.push({
        caseId: spec.caseId,
        track: spec.track,
        title: spec.title,
        venueId: venue.id,
        venueName: venue.name,
        travelerId,
        formula: spec.formula,
        expected: spec.expected,
        actual,
        passed,
        note: spec.note,
      });
    }
  });

  const n1 = aggregateN1(events);
  const n2 = aggregateN2(events);
  const sends = n1.reduce((s, r) => s + r.sends, 0);
  const clicks = n1.reduce((s, r) => s + r.clicks, 0);
  const skippedClicks = n1.reduce((s, r) => s + r.skippedClicks, 0);
  const rawClicks = n1.reduce((s, r) => s + r.rawClicks, 0);
  const orders = n1.reduce((s, r) => s + r.orders, 0);
  const shown = n2.reduce((s, r) => s + r.shown, 0);
  const purchasedQty = n2.reduce((s, r) => s + r.purchasedQty, 0);
  const casePassed = cases.filter((c) => c.passed).length;

  return {
    runId,
    executedAt: toTaipeiIso(now),
    scenarioVersion: SCENARIO_VERSION,
    dataNature: DATA_NATURE,
    venues: input.venues,
    events,
    n1,
    n2,
    cases,
    summary: {
      caseTotal: cases.length,
      casePassed,
      caseFailed: cases.length - casePassed,
      passRatePct: rate(casePassed, cases.length),
      simN1Cvr: rate(orders, sends),
      simN1Ctr: rate(clicks, sends),
      simN2Cvr: rate(purchasedQty, shown),
      sends,
      clicks,
      skippedClicks,
      rawClicks,
      orders,
      shown,
      purchasedQty,
    },
  };
}

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function expectedText(map: Record<string, number | null>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v === null ? "—" : v}`)
    .join("; ");
}

/** CSV 內容與畫面明細同源（同一個 RunResult.cases），不得匯入正式資料 */
export function toCsv(run: RunResult): string {
  const header = [
    "資料性質",
    "隔離層級",
    "run ID",
    "執行時間(Asia/Taipei, ISO offset)",
    "情境版本",
    "情境館別",
    "軌道",
    "案例",
    "合成對象",
    "模擬事件",
    "計算公式",
    "預期結果",
    "實際結果",
    "判定",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const c of run.cases) {
    lines.push(
      [
        DATA_NATURE,
        ISOLATION_LABEL,
        run.runId,
        run.executedAt,
        run.scenarioVersion,
        `${c.venueName}（情境）`,
        c.track,
        c.title,
        c.travelerId,
        c.note,
        c.formula,
        expectedText(c.expected),
        expectedText(c.actual),
        c.passed ? "通過" : "失敗",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push("");
  lines.push(
    [
      DATA_NATURE,
      ISOLATION_LABEL,
      run.runId,
      run.executedAt,
      run.scenarioVersion,
      "（本次彙總）",
      "SUMMARY",
      "測試通過率與模擬轉換率分開呈現",
      "—",
      `sends=${run.summary.sends}; clicks(eligible)=${run.summary.clicks}; skippedClicks=${run.summary.skippedClicks}; rawClicks(sent+skipped)=${run.summary.rawClicks}; orders=${run.summary.orders}; shown=${run.summary.shown}; purchasedQty=${run.summary.purchasedQty}`,
      `測試通過率＝通過案例數／案例總數；${RATE_BASIS_NOTE}；模擬轉換率＝模擬事件分子／分母（0 分母為 —）；N1 ${N1_ATTRIBUTION_HOURS}h／N2 ${N2_ATTRIBUTION_DAYS} 日為本模擬器參數`,
      `通過案例=${run.summary.casePassed}/${run.summary.caseTotal}`,
      `測試通過率=${formatRate(run.summary.passRatePct)}; 模擬N1點擊率=${formatRate(run.summary.simN1Ctr)}; 模擬N1轉換率=${formatRate(run.summary.simN1Cvr)}; 模擬N2加購轉換率=${formatRate(run.summary.simN2Cvr)}`,
      run.summary.caseFailed === 0 ? "通過" : "失敗",
    ]
      .map(csvCell)
      .join(","),
  );
  return lines.join("\n");
}
