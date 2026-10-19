// PAYUNi W8 撥款明細同步（/api/trade/grant_query v1.0，代理商金鑰＋IsPlatForm=1）：各館某日撥款明細 upsert 到 payuni_grant_records。
// 不做撥款指示（GrantExport）。某館失敗 → 記錄並繼續；整體有失敗／對不到／筆數變少 → paymentAlert 一封。
// deno-lint-ignore-file no-explicit-any
import { extractPageInfo, extractQueryResults } from "./payuniTrade.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { previousTaipeiDay } from "./payuniReconcile.ts";

export const GRANT_PATH = "/api/trade/grant_query";
export const GRANT_PAGE_SIZE = 500;
export const GRANT_MAX_PAGES = 200;
export const GRANT_MAX_DAYS = 30;
const DAY = 86_400_000;
const TAIPEI_OFFSET_MS = 8 * 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export type MatchStatus = "matched" | "unmatched" | "no_order";
export interface GrantCaller { isService: boolean; isSuperAdmin: boolean; label: string }
type Res = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s || null; };
const int = (v: unknown) => {
  const s = txt(v);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** YYYY-MM-DD／YYYY/MM/DD／YYYYMMDD（可帶時間）→ YYYY-MM-DD；其他格式回 null（原文仍在 raw） */
export function normalizeDate(v: unknown): string | null {
  const m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/.exec(txt(v) ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const taipeiToday = (now: number) => { const t = now + TAIPEI_OFFSET_MS; return new Date(t - (t % DAY)).toISOString().slice(0, 10); };

/** 只能查今天往前 30 天內（台北日） */
export function validGrantDate(date: string, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return false;
  const today = taipeiToday(now);
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - GRANT_MAX_DAYS * DAY).toISOString().slice(0, 10);
  return date >= earliest && date <= today;
}

/** 出帳：Type 原文含「出」，或入帳金額為負（待 Sandbox 確認 Type 實際值） */
export const isOutflow = (row: Record<string, string>) => /出/.test(row.Type ?? "") || (int(row.FundsAmt) ?? 0) < 0;

type Item = { seq: number; row: Record<string, string> };

async function fetchAllPages(deps: PayuniTradeDeps, merId: string, date: string): Promise<Item[]> {
  const items: Item[] = [];
  let page = 1;
  let total = 1;
  while (page <= total) {
    if (page > GRANT_MAX_PAGES) throw new Error(`超過 ${GRANT_MAX_PAGES} 頁上限`);
    const r = await deps.callPayuni({ path: GRANT_PATH, version: "1.0", kind: "merchant", merId, payload: { MerID: merId, QueryDate: date, Page: page } });
    if (!r.ok) throw new Error(`第 ${page} 頁查詢失敗：${r.status}${r.message ? ` ${r.message}` : ""}`);
    extractQueryResults(r.data).forEach((row, i) => items.push({ seq: (page - 1) * GRANT_PAGE_SIZE + i, row }));
    total = extractPageInfo(r.data).total ?? 1;
    page++;
  }
  return items;
}

/** 先比對完全相同的 mer_trade_no；找不到且為退款編號（XXX-R1）時退回原付款交易 */
async function loadTxMap(admin: any, items: Item[]) {
  const wanted = new Set<string>();
  for (const { row } of items) {
    const m = txt(row.MerTradeNo);
    if (!m) continue;
    wanted.add(m);
    const parent = /^(.+)-R\d+$/.exec(m)?.[1];
    if (parent) wanted.add(parent);
  }
  const map = new Map<string, { id: string; order_id: string | null }>();
  const list = [...wanted];
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await admin.from("payment_transactions").select("id, order_id, mer_trade_no")
      .eq("provider", "payuni").in("mer_trade_no", list.slice(i, i + 200));
    if (error) throw new Error(`payment_transactions 查詢失敗：${error.message}`);
    for (const t of data ?? []) map.set(t.mer_trade_no, { id: t.id, order_id: t.order_id ?? null });
  }
  return map;
}

export function matchTx(row: Record<string, string>, txMap: Map<string, { id: string; order_id: string | null }>) {
  const m = txt(row.MerTradeNo);
  if (!m) return { status: (isOutflow(row) ? "no_order" : "unmatched") as MatchStatus, tx: null };
  const tx = txMap.get(m) ?? txMap.get(/^(.+)-R\d+$/.exec(m)?.[1] ?? "") ?? null;
  return { status: (tx ? "matched" : "unmatched") as MatchStatus, tx };
}

export function buildRecord(acc: { id: string; payuni_mer_id: string }, date: string, item: Item, txMap: Map<string, any>, syncedAt: string) {
  const r = item.row;
  const { status, tx } = matchTx(r, txMap);
  return {
    accommodation_id: acc.id, mer_id: acc.payuni_mer_id, query_date: date, row_seq: item.seq,
    trade_date: normalizeDate(r.TradeDate), mer_trade_no: txt(r.MerTradeNo), trade_no: txt(r.TradeNo),
    payment_type: txt(r.PaymentType), bank_channel: txt(r.BankChannel), payment_date: txt(r.PaymentDate), payment_info: txt(r.PaymentInfo),
    execute_amt: int(r.ExecuteAmt), fee: int(r.Fee), action: txt(r.Action), funds_amt: int(r.FundsAmt), type: txt(r.Type),
    match_status: status, payment_tx_id: tx?.id ?? null, order_id: tx?.order_id ?? null, raw: r, synced_at: syncedAt,
  };
}

export interface AccResult {
  accommodation_id: string; name: string | null; ok: boolean; fetched: number; unmatched: number; no_order: number;
  error?: string; shrink?: { previous_rows: number; fetched: number };
}

async function syncAccommodation(deps: PayuniTradeDeps, acc: any, date: string, syncedAt: string): Promise<AccResult> {
  const base = { accommodation_id: acc.id, name: acc.name ?? null, fetched: 0, unmatched: 0, no_order: 0 };
  try {
    const items = await fetchAllPages(deps, acc.payuni_mer_id, date);
    const txMap = await loadTxMap(deps.admin, items);
    const rows = items.map((it) => buildRecord(acc, date, it, txMap, syncedAt));
    const { data: extra, error: exErr } = await deps.admin.from("payuni_grant_records").select("row_seq")
      .eq("mer_id", acc.payuni_mer_id).eq("query_date", date).gte("row_seq", rows.length);
    if (exErr) throw new Error(`既有筆數查詢失敗：${exErr.message}`);
    for (let i = 0; i < rows.length; i += GRANT_PAGE_SIZE) {
      const { error } = await deps.admin.from("payuni_grant_records").upsert(rows.slice(i, i + GRANT_PAGE_SIZE), { onConflict: "mer_id,query_date,row_seq" });
      if (error) throw new Error(`寫入失敗：${error.message}`);
    }
    const out: AccResult = {
      ...base, ok: true, fetched: rows.length,
      unmatched: rows.filter((r) => r.match_status === "unmatched").length,
      no_order: rows.filter((r) => r.match_status === "no_order").length,
    };
    if (extra?.length) out.shrink = { previous_rows: rows.length + extra.length, fetched: rows.length };
    return out;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[payuni-grant-sync] acc=${acc.id} date=${date} ${error}`);
    return { ...base, ok: false, error };
  }
}

async function sendSummaryAlert(deps: PayuniTradeDeps, date: string, results: AccResult[]) {
  const failed = results.filter((r) => !r.ok);
  const unmatched = results.reduce((a, r) => a + r.unmatched, 0);
  const shrink = results.filter((r) => r.shrink);
  if (!failed.length && !unmatched && !shrink.length) return null;
  const line = (r: AccResult, s: string) => `<li>${esc(r.name ?? r.accommodation_id)}：${esc(s)}</li>`;
  const html = `<p>PAYUNi ${esc(date)} 撥款明細同步結果，請至 HQ「PAYUNi 金流 → 撥款」查看。</p>` +
    (failed.length ? `<p>查詢失敗 ${failed.length} 館（可於 HQ 補跑該日）：</p><ul>${failed.map((r) => line(r, r.error ?? "")).join("")}</ul>` : "") +
    (unmatched ? `<p>對不到交易 ${unmatched} 筆：</p><ul>${results.filter((r) => r.unmatched).map((r) => line(r, `${r.unmatched} 筆`)).join("")}</ul>` : "") +
    (shrink.length ? `<p>重跑筆數比資料庫少（未刪除舊資料）：</p><ul>${shrink.map((r) => line(r, `資料庫 ${r.shrink!.previous_rows} 筆，本次 ${r.shrink!.fetched} 筆`)).join("")}</ul>` : "");
  const parts = [failed.length && `失敗 ${failed.length} 館`, unmatched && `對不到 ${unmatched} 筆`, shrink.length && `筆數變少 ${shrink.length} 館`].filter(Boolean).join("、");
  return await deps.sendAlert(`[PAYUNi] ${date} 撥款同步：${parts}`, html).then((v) => v !== false).catch(() => false);
}

export async function runGrantSync(deps: PayuniTradeDeps, date: string, accommodationId?: string | null) {
  const syncedAt = new Date(deps.now?.() ?? Date.now()).toISOString();
  let q = deps.admin.from("accommodation_info").select("id, name, payuni_mer_id").not("payuni_mer_id", "is", null);
  if (accommodationId) q = q.eq("id", accommodationId);
  const { data, error } = await q;
  if (error) throw new Error(`館別查詢失敗：${error.message}`);
  const accs = (data ?? []).filter((a: any) => txt(a.payuni_mer_id));
  const results: AccResult[] = [];
  for (const acc of accs) results.push(await syncAccommodation(deps, acc, date, syncedAt));
  const alertSent = await sendSummaryAlert(deps, date, results);
  return {
    ok: true, date, accommodations: results.length,
    failed: results.filter((r) => !r.ok).length,
    fetched: results.reduce((a, r) => a + r.fetched, 0),
    unmatched: results.reduce((a, r) => a + r.unmatched, 0),
    no_order: results.reduce((a, r) => a + r.no_order, 0),
    shrink: results.filter((r) => r.shrink).map((r) => ({ accommodation_id: r.accommodation_id, ...r.shrink })),
    alert_sent: alertSent, results,
  };
}

/** action:"run"：service role／PAYUNI_SWEEP_SECRET（預設昨天）或 super_admin（需指定日期）；可帶 accommodation_id */
export async function handleGrantSync(deps: PayuniTradeDeps, body: any, caller: GrantCaller): Promise<Res> {
  if (String(body?.action ?? "run") !== "run") return res(400, { error: "不支援的動作" });
  if (!caller.isService && !caller.isSuperAdmin) return res(403, { error: "Forbidden" });
  const now = deps.now?.() ?? Date.now();
  const date = body?.date != null ? String(body.date) : caller.isService ? previousTaipeiDay(now).runDate : "";
  if (!validGrantDate(date, now)) return res(400, { error: `日期只能是今天往前 ${GRANT_MAX_DAYS} 天內（YYYY-MM-DD）` });
  const accId = body?.accommodation_id != null ? String(body.accommodation_id) : null;
  if (accId && !UUID.test(accId)) return res(400, { error: "參數不正確" });
  const out = await runGrantSync(deps, date, accId);
  if (accId && out.accommodations === 0) return res(404, { error: "此館尚未綁定 PAYUNi 商店" });
  console.log(`[payuni-grant-sync] by=${caller.label} date=${date} accs=${out.accommodations} failed=${out.failed} fetched=${out.fetched} unmatched=${out.unmatched}`);
  return res(200, out);
}
