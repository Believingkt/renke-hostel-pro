/**
 * 簡報示範（Presentation Demo）資料層：沿用 N1／N2 情境模擬引擎（scenarioSim），
 * 只把技術案例聚合成「可讀的活動／品項名稱」供期末簡報實機展示。
 *
 * 絕對界線：
 *   - 不讀寫任何正式行銷表、訂單、金流、庫存；不呼叫任何 RPC、不發 Email／LINE、不碰 PMS。
 *   - 數字一律由本次模擬事件彙總，名稱編輯只影響示範顯示，不會改動任何正式活動或品項。
 *   - 不得與正式 RPC 結果或其總計混用；亦與正式頁的 includeInternal 口徑無關。
 *   - 失敗／未成交／超時／取消等案例全部保留在聚合內，不得為了拉高比率而挑選結果。
 *   - 歸因視窗（N1 72h／N2 7 日）為模擬器參數，未經正式 RPC 比對。
 */
import {
  aggregateN1,
  aggregateN2,
  toTaipeiIso,
  CASE_SPECS,
  SCENARIO_VERSION,
  N1_ATTRIBUTION_HOURS,
  N2_ATTRIBUTION_DAYS,
  type RunResult,
  type ScenarioVenue,
  type SimEvent,
} from "./scenarioSim";
import { buildFixtureRunResult, fixtureItemIndex, DEMO_FIXTURE_VERSION } from "./demoFixture";

export const DEMO_PRESENTATION_VERSION = "demo-pres-v1.1.0";
export const DEMO_BANNER = "簡報示範｜模擬資料，非實際營運成果";
export const DEMO_ROW_NATURE = "簡報示範｜模擬資料";
/** 示範資料讓各館發送日相隔 1 天，日期篩選才會對模擬事件真正生效 */
export const DEMO_VENUE_DAY_STRIDE = 1;

export interface DemoNameConfig {
  n1CampaignName: string;
  /** 每館客群差異標籤（依勾選館別順序套用） */
  n1Segments: string[];
  n2CampaignName: string;
  /** 示範加購品項名稱（4 項，技術案例聚合至此） */
  n2ItemNames: string[];
}

export const DEFAULT_DEMO_NAMES: DemoNameConfig = {
  n1CampaignName: "秋季回訪旅客專屬住宿邀約",
  n1Segments: ["回訪旅客", "高消費客群", "家庭客群", "雙人輕旅", "久未入住喚回"],
  n2CampaignName: "住宿升級與餐食體驗推薦",
  n2ItemNames: ["房型升級", "手作早餐", "在地體驗行程", "住宿包套"],
};

/** N2 技術案例 → 示範品項索引（固定對照，正反案例都含在內） */
const N2_ITEM_INDEX: Record<string, number> = {
  "n2-attributed": 0,
  "n2-not-purchased": 0,
  "n2-other-traveler": 1,
  "n2-other-item": 1,
  "n2-timeout": 2,
  "n2-cancelled": 2,
  "n2-duplicate": 3,
  "n2-zero-denominator": 3,
};

export const CHANNEL_LABEL: Record<string, string> = { email: "Email", line_share: "LINE" };

export interface DemoRun {
  runId: string;
  generatedAt: string;
  demoVersion: string;
  scenarioVersion: string;
  /** fixture 生成器版本（簡報示範事件） */
  fixtureVersion?: string;
  venues: ScenarioVenue[];
  /** 各館示範發送日（Asia/Taipei，YYYY-MM-DD） */
  venueDates: Record<string, string>;
  engine: RunResult;
}

export interface DemoFilters {
  from: string;
  to: string;
  venueIds: string[];
  channel: string;
}

export interface DemoN1Row {
  key: string;
  venueId: string;
  venueName: string;
  campaignName: string;
  channel: string;
  channelLabel: string;
  sends: number;
  clicks: number;
  skippedClicks: number;
  orders: number;
}

export interface DemoN2Row {
  key: string;
  venueId: string;
  venueName: string;
  campaignName: string;
  itemName: string;
  shown: number;
  purchasedQty: number;
}

export function buildDemoRun(input: { venues: ScenarioVenue[]; now?: Date; seed?: number }): DemoRun {
  const now = input.now ?? new Date();
  const seed = input.seed ?? Math.floor(Math.random() * 10000);
  const stamp = toTaipeiIso(now).replace(/[-:+]/g, "").replace("T", "-").slice(0, 15);
  const runId = `DEMORUN-${stamp}-${seed}`;
  const engine = buildFixtureRunResult({
    runId,
    venues: input.venues,
    now,
    dayStride: DEMO_VENUE_DAY_STRIDE,
  });
  const venueDates: Record<string, string> = {};
  for (const v of input.venues) {
    const dates = engine.events
      .filter((e) => e.venueId === v.id && (e.type === "send" || e.type === "shown" || e.type === "purchased"))
      .map((e) => e.occurredAt.slice(0, 10))
      .sort();
    venueDates[v.id] = dates[0] ?? toTaipeiIso(now).slice(0, 10);
  }
  return {
    runId,
    generatedAt: engine.executedAt,
    demoVersion: DEMO_PRESENTATION_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    fixtureVersion: DEMO_FIXTURE_VERSION,
    venues: input.venues,
    venueDates,
    engine,
  };
}

/** 把衍生館別（跨館情境）歸回原館，供篩選判斷 */
function baseVenueOf(run: DemoRun, venueId: string): ScenarioVenue | null {
  return run.venues.find((v) => venueId === v.id || venueId.startsWith(`${v.id}-`)) ?? null;
}

/** 篩選真正作用在模擬事件上（館別、各館示範發送日、N1 通路） */
export function filterDemoEvents(run: DemoRun, f: DemoFilters): SimEvent[] {
  return run.engine.events.filter((e) => {
    const base = baseVenueOf(run, e.venueId);
    if (!base) return false;
    if (f.venueIds.length > 0 && !f.venueIds.includes(base.id)) return false;
    const day = run.venueDates[base.id];
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (e.track === "N1" && f.channel !== "all" && e.channel !== f.channel) return false;
    return true;
  });
}

function caseIdOf(id: string, track: "N1" | "N2"): string | null {
  const specs = CASE_SPECS.filter((s) => s.track === track).map((s) => s.caseId);
  // 長的先比，避免 n2-other-item／n2-other-traveler 互相誤判
  for (const caseId of [...specs].sort((a, b) => b.length - a.length)) {
    if (id.includes(caseId)) return caseId;
  }
  return null;
}

export function demoN1Rows(run: DemoRun, names: DemoNameConfig, f: DemoFilters): DemoN1Row[] {
  const events = filterDemoEvents(run, f);
  const map = new Map<string, DemoN1Row>();
  for (const agg of aggregateN1(events)) {
    const venue = run.venues.find((v) => v.id === agg.venueId);
    if (!venue) continue; // 衍生館別不另成列（其分子分母已在歸因規則中被排除）
    const index = run.venues.findIndex((v) => v.id === venue.id);
    const key = `${venue.id}|${agg.channel}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        venueId: venue.id,
        venueName: venue.name,
        campaignName: demoCampaignName(names, venue.name, index),
        channel: agg.channel,
        channelLabel: CHANNEL_LABEL[agg.channel] ?? agg.channel,
        sends: 0,
        clicks: 0,
        skippedClicks: 0,
        orders: 0,
      });
    }
    const row = map.get(key)!;
    row.sends += agg.sends;
    row.clicks += agg.clicks;
    row.skippedClicks += agg.skippedClicks;
    row.orders += agg.orders;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function demoCampaignName(names: DemoNameConfig, venueName: string, venueIndex: number): string {
  const segment = names.n1Segments.length
    ? names.n1Segments[venueIndex % names.n1Segments.length]
    : "";
  return segment ? `${names.n1CampaignName}・${venueName}（${segment}）` : `${names.n1CampaignName}・${venueName}`;
}

export function demoN2Rows(run: DemoRun, names: DemoNameConfig, f: DemoFilters): DemoN2Row[] {
  const events = filterDemoEvents(run, f);
  const map = new Map<string, DemoN2Row>();
  for (const agg of aggregateN2(events)) {
    const venue = run.venues.find((v) => v.id === agg.venueId);
    if (!venue) continue;
    const caseId = caseIdOf(agg.itemId, "N2");
    const itemIndex = fixtureItemIndex(agg.itemId) ?? (caseId ? N2_ITEM_INDEX[caseId] ?? 0 : 0);
    const itemName = names.n2ItemNames[itemIndex % Math.max(names.n2ItemNames.length, 1)] ?? `示範品項 ${itemIndex + 1}`;
    const key = `${venue.id}|${itemIndex}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        venueId: venue.id,
        venueName: venue.name,
        campaignName: names.n2CampaignName,
        itemName,
        shown: 0,
        purchasedQty: 0,
      });
    }
    const row = map.get(key)!;
    row.itemName = itemName;
    row.shown += agg.shown;
    row.purchasedQty += agg.purchasedQty;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export const DEMO_N1_NOTES = [
  `${DEMO_BANNER}：以下每一列都是模擬事件彙總，不是實際營運成果，也不代表任何正式活動有這些成交。`,
  `數據來源：簡報示範合成事件 fixture（${DEMO_FIXTURE_VERSION}，前端純函式），未讀取 ai_metric_remarketing_breakdown 等正式 RPC，不與正式總計混用。`,
  "發送數只計 sendStatus='sent'；點擊數為同 run、同館、對應 sent 發送的去重點擊（每發送最多 1）；skipped 發送點擊另列，不進入點擊率。",
  `下房數＝同發送 ID、同館、未取消且發送後 ≤${N1_ATTRIBUTION_HOURS} 小時內的訂單（每發送最多 1 單）；分母 0 顯示「—」。`,
  "整體平均一律採「合計分子／合計分母」（非各館比率再平均）。",
  "活動名稱為示範用暫定名稱，可於本機編輯；館名為引用名稱（公開館級欄位），數據為模擬。",
  `歸因視窗（N1 ${N1_ATTRIBUTION_HOURS} 小時、N2 ${N2_ATTRIBUTION_DAYS} 日）為模擬器參數，未經正式 RPC 比對，不宣稱與正式口徑一致。`,
  "負面樣本（超時、取消、他人訂單、跨館、LINE 人工發送）全部保留在事件集合內，依規則不計入分子，未挑選結果。",
];

export const DEMO_N2_NOTES = [
  `${DEMO_BANNER}：以下每一列都是模擬事件彙總，不是實際營運成果，也不代表任何正式品項有這些成交。`,
  `數據來源：簡報示範合成事件 fixture（${DEMO_FIXTURE_VERSION}，前端純函式），未讀取 ai_metric_addon_breakdown 等正式 RPC，不與正式總計混用。`,
  `成交數量＝同旅客、同館、同品項且推薦後 ≤${N2_ATTRIBUTION_DAYS} 日內的 qty 合計；加購轉換率＝成交數量／推薦總數（數量口徑，可能超過 100%，不截斷）。`,
  "整體平均一律採「合計分子／合計分母」（非各館比率再平均）。",
  "品項名稱為示範用暫定名稱，可於本機編輯；館名為引用名稱（公開館級欄位），數據為模擬。",
  "負面樣本（超時、取消、他人加購、未曾推薦的品項）全部保留在事件集合內，依規則不計入分子，未挑選結果。",
  `歸因視窗（N2 ${N2_ATTRIBUTION_DAYS} 日）為模擬器參數，未經正式 RPC 比對。`,
];
