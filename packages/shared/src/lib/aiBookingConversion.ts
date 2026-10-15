// AI 訂房轉換分析：正式 RPC 回傳型別、Demo 確定性 fixture、與 RPC 同口徑的前端彙總、CSV。
// Demo 只由合成 run 描述（runId／版本／5 家公開館名）在前端重建，不含、不複製任何真實營運資料。

export const TARGET_RATE = 0.025;
export const MIN_VENUES = 5;
export const SCOPE_NOTE = "目前僅涵蓋可驗證的 AI 再行銷推播歸因；其他 AI 入口追蹤尚未涵蓋";
export const FORMULA = "AI 推薦之訂房數 ÷ 總訂房數（有效訂房：已確認／已入住／已退房）";
export const INTERNAL_NOTE = "內部／測試排除：再行銷發送排除 is_test=true（發送紀錄無內部欄位）；訂單無內部維度，僅以既有排除名單與訂單來源 test／test_data 排除，無法辨識全部內部訂單";
export const DEMO_LABEL = "Demo 測試資料，非實際營運成果";
export const DEMO_VERSION = "aibk-demo-v1.1.0";
export const FIXTURE_VERSION = "aibk-fixture-v1.1.0";
/** 各 fixture 版本的每館合成訂單數／AI 數（依 run.venues 順序）；舊版保留，舊 run 重建數值不變 */
export const DEMO_FIXTURES: Record<string, { orders: number[]; ai: number[] }> = {
  "aibk-fixture-v1.0.0": { orders: [200, 240, 180, 220, 160], ai: [6, 7, 4, 6, 5] },
  "aibk-fixture-v1.1.0": { orders: [7, 8, 6, 9, 5], ai: [1, 0, 0, 0, 0] },
};
const DEMO_SOURCES = ["website", "owlting", "manual", "hotelnabe"];
const DEMO_DAYS = 30;

export interface ConversionRow {
  accommodation_id: string;
  accommodation_name: string;
  effective_orders: number;
  ai_orders: number;
  attributed_orders: number;
  rate: number | null;
  meets_target: boolean;
}
export interface ConversionResult {
  rows: ConversionRow[];
  totals: { effective_orders: number; ai_orders: number; attributed_orders: number; rate: number | null; meets_target: boolean; attribution_coverage: number | null };
  selected_venues: number;
  venues_with_orders: number;
}
export interface Filters { from: string; to: string; accommodationIds: string[] | null; orderSource: string | null }
export interface DemoVenue { id: string; name: string }
export interface DemoRun { runId: string; generatedAt: string; demoVersion: string; fixtureVersion: string; dataNature: "synthetic_demo"; venues: DemoVenue[] }
export interface DemoOrder { id: string; accommodation_id: string; date: string; order_source: string; is_ai: boolean; has_attr: boolean }

const meets = (ai: number, eff: number) => eff > 0 && ai / eff >= TARGET_RATE;

/** 台北日期 YYYY-MM-DD */
export function taipeiDate(d: Date): string {
  return new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 預設近 30 天到今天（台北） */
export function defaultRange(now = new Date()): { from: string; to: string } {
  const to = taipeiDate(now);
  return { from: addDays(to, -29), to };
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function buildDemoRun(venues: DemoVenue[], now = new Date()): DemoRun {
  if (venues.length < 5) throw new Error("需要至少 5 家啟用館別才能建立 Demo");
  const tp = new Date(now.getTime() + 8 * 3600_000).toISOString();
  const stamp = `${tp.slice(0, 10).replace(/-/g, "")}-${tp.slice(11, 19).replace(/:/g, "")}`;
  return {
    runId: `AIBKRUN-${stamp}-${now.getUTCMilliseconds() % 1000}`,
    generatedAt: `${tp.slice(0, 19)}+08:00`,
    demoVersion: DEMO_VERSION, fixtureVersion: FIXTURE_VERSION, dataNature: "synthetic_demo",
    venues: venues.slice(0, 5).map((v) => ({ id: v.id, name: v.name })),
  };
}

/** Demo 期間：generatedAt 的台北日往前 30 天 */
export function demoRange(run: DemoRun): { from: string; to: string } {
  const to = run.generatedAt.slice(0, 10);
  return { from: addDays(to, -(DEMO_DAYS - 1)), to };
}

/** 篩選期間是否與 Demo 生成期間有交集 */
export function demoOverlaps(run: DemoRun, f: { from: string; to: string }): boolean {
  const r = demoRange(run);
  return f.from <= r.to && f.to >= r.from;
}

/** 由 run 確定性重建合成訂單（同 run 任何 client 結果相同） */
export function buildDemoOrders(run: DemoRun): DemoOrder[] {
  const { from } = demoRange(run);
  const fx = DEMO_FIXTURES[run.fixtureVersion];
  if (!fx) throw new Error(`不支援的 Demo fixture 版本：${run.fixtureVersion}`);
  const out: DemoOrder[] = [];
  run.venues.forEach((v, i) => {
    const n = fx.orders[i] ?? 0;
    const ai = fx.ai[i] ?? 0;
    for (let k = 0; k < n; k++) {
      const h = fnv(`${run.runId}|${run.fixtureVersion}|${i}|${k}`);
      const isAi = k < ai;
      out.push({
        id: `demo-${i}-${k}`,
        accommodation_id: v.id,
        date: addDays(from, h % DEMO_DAYS),
        order_source: isAi ? "website" : DEMO_SOURCES[(h >>> 8) % DEMO_SOURCES.length],
        is_ai: isAi,
        has_attr: isAi || (h >>> 16) % 5 === 0,
      });
    }
  });
  return out;
}

/** 與正式 RPC 同口徑：列出所有被選館（含 0 訂單）、合計加權、0 分母 rate=null 不達標 */
export function computeConversion(orders: DemoOrder[], venues: DemoVenue[], f: Filters): ConversionResult {
  const selected = venues.filter((v) => !f.accommodationIds || f.accommodationIds.includes(v.id));
  const inScope = orders.filter((o) => o.date >= f.from && o.date <= f.to && (!f.orderSource || o.order_source === f.orderSource));
  const rows = selected.map((v) => {
    const os = inScope.filter((o) => o.accommodation_id === v.id);
    const eff = os.length, ai = os.filter((o) => o.is_ai).length, attr = os.filter((o) => o.has_attr).length;
    return { accommodation_id: v.id, accommodation_name: v.name, effective_orders: eff, ai_orders: ai, attributed_orders: attr, rate: eff ? ai / eff : null, meets_target: meets(ai, eff) };
  });
  const eff = rows.reduce((s, r) => s + r.effective_orders, 0);
  const ai = rows.reduce((s, r) => s + r.ai_orders, 0);
  const attr = rows.reduce((s, r) => s + r.attributed_orders, 0);
  return {
    rows,
    totals: { effective_orders: eff, ai_orders: ai, attributed_orders: attr, rate: eff ? ai / eff : null, meets_target: meets(ai, eff), attribution_coverage: eff ? attr / eff : null },
    selected_venues: rows.length,
    venues_with_orders: rows.filter((r) => r.effective_orders > 0).length,
  };
}

export const fmtRate = (r: number | null | undefined) => (r == null ? "—" : `${(r * 100).toFixed(2)}%`);

export function toCsv(result: ConversionResult, meta: { demo: boolean; runId?: string; filters: Filters }): string {
  const nature = meta.demo ? DEMO_LABEL : `正式資料（${SCOPE_NOTE}）`;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["資料性質", nature],
    ...(meta.demo ? [["Demo run", meta.runId ?? ""]] : []),
    ["公式", FORMULA],
    ...(meta.demo ? [] : [["內部／測試排除", INTERNAL_NOTE]]),
    ["期間（台北）", `${meta.filters.from}～${meta.filters.to}`],
    ["訂單來源", meta.filters.orderSource ?? "全部"],
    [],
    ["資料性質", "館別", "有效訂房數", "AI 推薦訂房數", "AI 訂房轉換率", "達標（≥2.5%）", "有歸因紀錄訂房數"],
    ...result.rows.map((r) => [meta.demo ? "Demo" : "正式", r.accommodation_name, r.effective_orders, r.ai_orders, fmtRate(r.rate), r.effective_orders ? (r.meets_target ? "是" : "否") : "—", r.attributed_orders]),
    [meta.demo ? "Demo" : "正式", "合計（加權）", result.totals.effective_orders, result.totals.ai_orders, fmtRate(result.totals.rate), result.totals.effective_orders ? (result.totals.meets_target ? "是" : "否") : "—", result.totals.attributed_orders],
  ];
  return "\uFEFF" + lines.map((l) => l.map(esc).join(",")).join("\n");
}
