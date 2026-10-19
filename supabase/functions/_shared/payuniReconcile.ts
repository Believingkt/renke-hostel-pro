// PAYUNi W6 每日對帳：唯讀比對 PAYUNi 交易查詢 v2.0 與本地 payment_transactions（含退款列），回填手續費、寫差異清單。
// 不自動改訂單金額；只有「PAYUNi 已付、本地未付」交給 applyPayuniTradeResult（冪等）補入帳。
// deno-lint-ignore-file no-explicit-any
import { applyPayuniTradeResult, extractQueryResult } from "./payuniTrade.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { ATM_REFUND_STATUS, CARD_REFUND_STATUS } from "./payuniRefund.ts";

export const RECONCILE_MAX_QUERIES = 1000;
export const RECONCILE_TIME_BUDGET_MS = 100_000;
export const RECONCILE_STALE_PENDING_MS = 60 * 60 * 1000;
/** 第 3 次排程（04:00）仍未查完也寄彙總，避免永遠不告警 */
export const RECONCILE_ALERT_AT_INVOCATION = 3;
/** 同一筆交易連續幾個台北日查詢失敗就改記 not_found */
export const RECONCILE_FAIL_DAYS_TO_NOT_FOUND = 3;
const FAIL_KEY = "reconcile_query_failures";
export type DiffType = "amount_mismatch" | "not_found" | "local_paid_remote_unpaid" | "refund_mismatch" | "status_fixed";
export const DIFF_LABEL: Record<DiffType, string> = {
  amount_mismatch: "金額不符", not_found: "PAYUNi 查無", local_paid_remote_unpaid: "本地已付、PAYUNi 未付",
  refund_mismatch: "退款不一致", status_fixed: "已自動補入帳",
};
const TAIPEI_OFFSET_MS = 8 * 3_600_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const num = (v: unknown) => (v == null || String(v).trim() === "" ? null : Number(v));

/** 前一個台北日曆日：run_date 與 UTC 區間 [start, end) */
export function previousTaipeiDay(now: number) {
  const t = now + TAIPEI_OFFSET_MS;
  const todayStartTaipei = t - (t % DAY);
  const start = todayStartTaipei - DAY - TAIPEI_OFFSET_MS;
  return { runDate: iso(todayStartTaipei - DAY).slice(0, 10), startIso: iso(start), endIso: iso(start + DAY) };
}

export interface Classified {
  kind: "matched" | "status_fixed" | "diffs";
  diffs: Array<{ type: DiffType; local: Record<string, unknown>; payuni: Record<string, unknown> }>;
  fee: number | null;
}

/**
 * 退款比對：信用卡查詢只回最後一筆退款，所以用「TradeAmt − RemainAmt」對「本地已完成退款列加總」；
 * PAYUNi 已退款但本地仍處理中（落在 已完成～已完成＋處理中 之間）視為 W7 sweep 尚未判定，不報差異。
 * 狀態：最新一筆處理中的退款列，PAYUNi 回報退款取消（信用卡 3／ATM 3）或轉匯失敗（ATM 2）→ 退款不一致。
 */
export function compareRefunds(tx: any, q: Record<string, string>, refunds: any[]) {
  const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const done = sum(refunds.filter((r) => r.status === "paid"));
  const pendingRows = refunds.filter((r) => r.status === "pending").sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const pending = sum(pendingRows);
  const latest = pendingRows[pendingRows.length - 1];
  const rs = String(q.RefundStatus ?? "");
  const isAtm = Number(tx.payment_type) === 2;
  const local = { refunded: done, pending, latest_pending_status: latest?.status ?? null, latest_pending_mer_trade_no: latest?.mer_trade_no ?? null };
  const payuni = { TradeAmt: num(q.TradeAmt), RemainAmt: num(q.RemainAmt), RefundStatus: q.RefundStatus ?? null, RefundType: q.RefundType ?? null };
  const remain = num(q.RemainAmt);
  let amountOk = true;
  if (remain != null && num(q.TradeAmt) != null) {
    const remoteRefunded = Number(q.TradeAmt) - remain;
    amountOk = remoteRefunded === done || (remoteRefunded > done && remoteRefunded <= done + pending);
  }
  const statusBad = !!latest && (isAtm
    ? rs === ATM_REFUND_STATUS.CANCELLED || rs === ATM_REFUND_STATUS.FAILED
    : rs === CARD_REFUND_STATUS.CANCELLED);
  return amountOk && !statusBad ? null : { local, payuni };
}

/** 單筆原付款交易的比對（純函式；補入帳與寫入由呼叫端處理） */
export function classifyTrade(tx: any, q: Record<string, string>, refunds: any[]): Classified {
  const remotePaid = String(q.TradeStatus ?? "") === "1";
  const localPaid = tx.status === "paid";
  const local = { status: tx.status, amount: Number(tx.amount) };
  const payuni = { TradeStatus: q.TradeStatus ?? null, TradeAmt: num(q.TradeAmt), DataSource: q.DataSource ?? null };
  const amountDiff = remotePaid && num(q.TradeAmt) !== Number(tx.amount);
  if (!localPaid && remotePaid) {
    return { kind: "status_fixed", fee: null, diffs: amountDiff ? [{ type: "amount_mismatch", local, payuni }] : [] };
  }
  if (localPaid && !remotePaid) return { kind: "diffs", fee: null, diffs: [{ type: "local_paid_remote_unpaid", local, payuni }] };
  if (!localPaid) return { kind: "matched", fee: null, diffs: [] };
  if (amountDiff) return { kind: "diffs", fee: null, diffs: [{ type: "amount_mismatch", local, payuni }] };
  const r = compareRefunds(tx, q, refunds);
  if (r) return { kind: "diffs", fee: null, diffs: [{ type: "refund_mismatch", ...r }] };
  const fee = String(q.DataSource ?? "") === "A" ? num(q.TradeFee) : null;
  return { kind: "matched", fee: fee != null && Number.isFinite(fee) ? fee : null, diffs: [] };
}

// ---------------- 執行 ----------------

async function loadTargets(admin: any, now: number, range: { startIso: string; endIso: string }) {
  const byId = new Map<string, any>();
  const add = (rows: any[] | null) => (rows ?? []).forEach((r) => byId.set(r.id, r));
  const base = () => admin.from("payment_transactions").select("*").eq("provider", "payuni");
  add((await base().gte("created_at", range.startIso).lt("created_at", range.endIso)).data);
  add((await base().gte("updated_at", range.startIso).lt("updated_at", range.endIso)).data);
  add((await base().in("status", ["pending", "unknown"]).lt("created_at", iso(now - RECONCILE_STALE_PENDING_MS))).data);
  return [...byId.values()];
}

async function upsertDiff(admin: any, runId: string, tx: any, d: Classified["diffs"][number] | { type: "status_fixed"; local: any; payuni: any }, now: number) {
  const row = {
    run_id: runId, mer_trade_no: tx.mer_trade_no, order_id: tx.order_id, accommodation_id: tx.accommodation_id,
    diff_type: d.type, local_value: d.local, payuni_value: d.payuni, last_seen_at: iso(now),
  };
  if (d.type === "status_fixed") {
    await admin.from("payuni_reconcile_diffs").insert({ ...row, first_seen_at: iso(now), resolved_at: iso(now), resolved_by: "system", note: "對帳自動補入帳" });
    return;
  }
  const { data: open } = await admin.from("payuni_reconcile_diffs").select("id")
    .eq("mer_trade_no", tx.mer_trade_no).eq("diff_type", d.type).is("resolved_at", null).maybeSingle();
  if (open) {
    await admin.from("payuni_reconcile_diffs").update(row).eq("id", open.id);
    return;
  }
  const { error } = await admin.from("payuni_reconcile_diffs").insert({ ...row, first_seen_at: iso(now) });
  if (error?.code === "23505") {
    await admin.from("payuni_reconcile_diffs").update(row).eq("mer_trade_no", tx.mer_trade_no).eq("diff_type", d.type).is("resolved_at", null);
  } else if (error) throw new Error(`reconcile diff insert failed: ${error.message}`);
}

async function getOrCreateRun(admin: any, runDate: string, now: number) {
  const { data: found } = await admin.from("payuni_reconcile_runs").select("*").eq("run_date", runDate).maybeSingle();
  if (found) return found;
  const { data, error } = await admin.from("payuni_reconcile_runs").insert({ run_date: runDate, started_at: iso(now), updated_at: iso(now) }).select("*").single();
  if (error?.code === "23505") return (await admin.from("payuni_reconcile_runs").select("*").eq("run_date", runDate).maybeSingle()).data;
  if (error) throw new Error(`reconcile run insert failed: ${error.message}`);
  return data;
}

const prevDate = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - DAY).toISOString().slice(0, 10);

/** 連續失敗日（以 run_date 計；同日只算一次；中斷就重算），最多留 3 天 */
export function nextFailureDates(prev: string[] | undefined, runDate: string) {
  const dates = prev ?? [];
  const last = dates[dates.length - 1];
  const next = last === runDate ? dates : last === prevDate(runDate) ? [...dates, runDate] : [runDate];
  return next.slice(-RECONCILE_FAIL_DAYS_TO_NOT_FOUND);
}

/** 合併更新 raw_response（重新讀取後只改 reconcile_query_failures，不覆蓋 W7 的 refunds[]、close_events[] 等鍵） */
async function mergeFailures(admin: any, txId: string, value: Record<string, unknown> | null, now: number) {
  const { data } = await admin.from("payment_transactions").select("raw_response").eq("id", txId).maybeSingle();
  const raw = { ...(data?.raw_response ?? {}) };
  if (value == null) {
    if (!(FAIL_KEY in raw)) return;
    delete raw[FAIL_KEY];
  } else raw[FAIL_KEY] = value;
  // 寫入 updated_at：讓下一個台北日的對帳區間再次涵蓋這筆，才能累計連續失敗日
  await admin.from("payment_transactions").update({ raw_response: raw, ...(value ? { updated_at: iso(now) } : {}) }).eq("id", txId);
}

export interface RunOpts { maxQueries?: number; budgetMs?: number; clock?: () => number }

export async function runReconcile(deps: PayuniTradeDeps, opts: RunOpts = {}) {
  const now = deps.now?.() ?? Date.now();
  const clock = opts.clock ?? (() => Date.now());
  const t0 = clock();
  const maxQueries = opts.maxQueries ?? RECONCILE_MAX_QUERIES;
  const budget = opts.budgetMs ?? RECONCILE_TIME_BUDGET_MS;
  const range = previousTaipeiDay(now);
  const run = await getOrCreateRun(deps.admin, range.runDate, now);
  if (run.completed) return { ok: true, runDate: range.runDate, skipped: "already_completed" };

  const checked = new Set<string>(run.checked_tx_ids ?? []);
  const prev = (k: string) => Number(run[k] ?? 0);
  const targets = (await loadTargets(deps.admin, now, range)).filter((t) => !checked.has(t.id));
  // 退款列歸到原交易：查原交易（用原交易的 TradeNo）
  const groups = new Map<string, { tx: any | null; viaRefund: boolean; memberIds: string[] }>();
  for (const t of targets) {
    const key = t.kind === "refund" ? t.parent_tx_id : t.id;
    if (!key) { checked.add(t.id); continue; }
    const g = groups.get(key) ?? { tx: null, viaRefund: true, memberIds: [] };
    g.memberIds.push(t.id);
    if (t.kind !== "refund") { g.tx = t; g.viaRefund = false; }
    groups.set(key, g);
  }
  const missingParents = [...groups.entries()].filter(([, g]) => !g.tx).map(([id]) => id);
  if (missingParents.length) {
    const { data } = await deps.admin.from("payment_transactions").select("*").in("id", missingParents);
    for (const p of data ?? []) groups.get(p.id)!.tx = p;
  }

  const c = { queried: 0, matched: 0, processing: 0, status_fixed: 0, query_errors: 0 };
  const diffCounts: Record<string, number> = { ...(run.diff_counts ?? {}) };
  const failing: Array<{ mer_trade_no: string; message: string }> = [];
  let stopped: string | null = null;
  let remaining = 0;
  const persist = async (extra: Record<string, unknown> = {}) => {
    await deps.admin.from("payuni_reconcile_runs").update({
      queried: prev("queried") + c.queried, matched: prev("matched") + c.matched, processing: prev("processing") + c.processing,
      status_fixed: prev("status_fixed") + c.status_fixed, query_errors: prev("query_errors") + c.query_errors,
      diff_counts: diffCounts, checked_tx_ids: [...checked], updated_at: iso(deps.now?.() ?? Date.now()), ...extra,
    }).eq("id", run.id);
  };

  const ordered = [...groups.entries()].sort(([, a], [, b]) => String(a.tx?.created_at ?? "").localeCompare(String(b.tx?.created_at ?? "")));
  for (const [parentId, g] of ordered) {
    if (!g.tx) { g.memberIds.forEach((id) => checked.add(id)); continue; }
    if (c.queried >= maxQueries || clock() - t0 >= budget) {
      stopped = c.queried >= maxQueries ? `已達單次 ${maxQueries} 筆上限` : `已達單次 ${Math.round(budget / 1000)} 秒上限`;
      remaining++;
      continue;
    }
    const tx = g.tx;
    const payload: Record<string, string> = g.viaRefund && tx.provider_trade_no
      ? { MerID: tx.mer_id, TradeNo: tx.provider_trade_no, Timestamp: String(Math.floor(now / 1000)) }
      : { MerID: tx.mer_id, MerTradeNo: tx.mer_trade_no, Timestamp: String(Math.floor(now / 1000)) };
    c.queried++;
    try {
      const r = await deps.callPayuni({ kind: "merchant", merId: tx.mer_id, path: "/api/trade/query", version: "2.0", payload });
      const q = r.ok ? extractQueryResult(r.data) : null;
      const markDone = () => { checked.add(parentId); g.memberIds.forEach((id) => checked.add(id)); };
      if (!q) {
        if (r.ok || /查無|not\s*found/i.test(String(r.message ?? ""))) {
          await upsertDiff(deps.admin, run.id, tx, { type: "not_found", local: { status: tx.status, amount: Number(tx.amount) }, payuni: { Status: r.status, Message: r.message ?? null } }, now);
          diffCounts.not_found = (diffCounts.not_found ?? 0) + 1;
          markDone();
        } else {
          const message = `${r.status}${r.message ? `：${r.message}` : ""}`.slice(0, 50);
          if (await recordQueryFailure(deps.admin, run.id, tx, range.runDate, message, now)) {
            diffCounts.not_found = (diffCounts.not_found ?? 0) + 1;
            markDone();
          } else {
            c.query_errors++;
            remaining++;
            failing.push({ mer_trade_no: tx.mer_trade_no, message });
          }
        }
        continue;
      }
      if (tx.raw_response?.[FAIL_KEY]) await mergeFailures(deps.admin, tx.id, null, now);
      if (String(q.DataSource ?? "") === "B") { c.processing++; markDone(); continue; }
      const { data: refunds } = await deps.admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("kind", "refund").eq("parent_tx_id", tx.id);
      const res = classifyTrade(tx, q, refunds ?? []);
      if (res.kind === "status_fixed") {
        await applyPayuniTradeResult(deps, tx, q);
        await upsertDiff(deps.admin, run.id, tx, { type: "status_fixed", local: { status: tx.status, amount: Number(tx.amount) }, payuni: { TradeStatus: q.TradeStatus, TradeAmt: num(q.TradeAmt) } }, now);
        c.status_fixed++;
      } else if (res.kind === "matched") {
        c.matched++;
        if (res.fee != null && Number(tx.provider_fee ?? NaN) !== res.fee) {
          await deps.admin.from("payment_transactions").update({ provider_fee: res.fee }).eq("id", tx.id);
        }
      }
      for (const d of res.diffs) {
        await upsertDiff(deps.admin, run.id, tx, d, now);
        diffCounts[d.type] = (diffCounts[d.type] ?? 0) + 1;
      }
      markDone();
    } catch (e) {
      console.error(`[payuni-reconcile] ${tx.mer_trade_no} failed: ${e instanceof Error ? e.message : e}`);
      c.query_errors++;
      remaining++;
      failing.push({ mer_trade_no: tx.mer_trade_no, message: "系統處理例外" });
    }
    if (c.queried % 25 === 0) await persist();
  }

  const completed = remaining === 0;
  const invocations = Number(run.invocations ?? 0) + 1;
  const note = completed ? null : `未查完：剩 ${remaining} 筆${stopped ? `（${stopped}）` : "（查詢失敗，下次重試）"}`;
  await persist({ completed, invocations, note, ...(completed ? { finished_at: iso(deps.now?.() ?? Date.now()) } : {}) });

  let alerted = false;
  if (!run.alert_sent_at && (completed || invocations >= RECONCILE_ALERT_AT_INVOCATION)) {
    alerted = await sendSummary(deps, run.id, range.runDate, prev("status_fixed") + c.status_fixed, note, failing);
  }
  return { ok: true, runDate: range.runDate, completed, remaining, ...c, diffCounts, alerted, failing };
}

/** 記錄查詢失敗；連續 3 個台北日都失敗 → 改記 not_found 差異並回 true */
async function recordQueryFailure(admin: any, runId: string, tx: any, runDate: string, message: string, now: number) {
  const dates = nextFailureDates(tx.raw_response?.[FAIL_KEY]?.dates, runDate);
  await mergeFailures(admin, tx.id, { dates, last_message: message }, now);
  if (dates.length < RECONCILE_FAIL_DAYS_TO_NOT_FOUND) return false;
  await upsertDiff(admin, runId, tx, {
    type: "not_found", local: { status: tx.status, amount: Number(tx.amount), failed_dates: dates },
    payuni: { Message: message, reason: `連續 ${RECONCILE_FAIL_DAYS_TO_NOT_FOUND} 天查詢失敗` },
  }, now);
  return true;
}

async function sendSummary(
  deps: PayuniTradeDeps, runId: string, runDate: string, statusFixed: number, note: string | null,
  failing: Array<{ mer_trade_no: string; message: string }>,
) {
  const { data: diffs } = await deps.admin.from("payuni_reconcile_diffs").select("mer_trade_no, order_id, accommodation_id, diff_type")
    .eq("run_id", runId).is("resolved_at", null);
  if (!diffs?.length && !failing.length) return false;
  const list: any[] = diffs ?? [];
  const failLines = failing.length
    ? `<p>查詢失敗 ${failing.length} 筆（下次排程重試；連續 ${RECONCILE_FAIL_DAYS_TO_NOT_FOUND} 天失敗改記 PAYUNi 查無）：</p><ul>${failing.map((f) => `<li>${esc(f.mer_trade_no)}：${esc(f.message.slice(0, 50))}</li>`).join("")}</ul>`
    : "";
  const accIds = [...new Set(list.map((d: any) => d.accommodation_id).filter(Boolean))];
  const orderIds = [...new Set(list.map((d: any) => d.order_id).filter(Boolean))];
  const { data: accs } = accIds.length ? await deps.admin.from("accommodation_info").select("id, name").in("id", accIds) : { data: [] };
  const { data: orders } = orderIds.length ? await deps.admin.from("orders").select("id, order_number").in("id", orderIds) : { data: [] };
  const name = (id: string) => (accs ?? []).find((a: any) => a.id === id)?.name ?? "";
  const ono = (id: string) => (orders ?? []).find((o: any) => o.id === id)?.order_number ?? "";
  const rows = list.map((d: any) => `<tr><td>${esc(name(d.accommodation_id))}</td><td>${esc(ono(d.order_id))}</td><td>${esc(d.mer_trade_no)}</td><td>${esc(DIFF_LABEL[d.diff_type as DiffType] ?? d.diff_type)}</td></tr>`).join("");
  const html = `<p>PAYUNi ${esc(runDate)} 對帳有 ${list.length} 筆未解決差異，請至 HQ「PAYUNi 金流 → 對帳」處理。</p>` +
    `<table border="1" cellpadding="4" cellspacing="0"><tr><th>館名</th><th>訂單號</th><th>商店訂單編號</th><th>類型</th></tr>${rows}</table>` +
    (note ? `<p>${esc(note)}</p>` : "") + (statusFixed > 0 ? `<p>自動補入帳 ${statusFixed} 筆（代表有 Notify 漏接，請追查）</p>` : "") + failLines;
  const sent = await deps.sendAlert(`[PAYUNi] ${runDate} 對帳差異 ${list.length} 筆${failing.length ? `、查詢失敗 ${failing.length} 筆` : ""}`, html).catch(() => false);
  if (sent !== false) await deps.admin.from("payuni_reconcile_runs").update({ alert_sent_at: new Date(deps.now?.() ?? Date.now()).toISOString() }).eq("id", runId);
  return sent !== false;
}

// ---------------- API（list／resolve／fees） ----------------

export interface ReconcileCaller {
  isService: boolean;
  isSuperAdmin: boolean;
  label: string;
  isAccommodationAdmin: (id: string) => Promise<boolean>;
}
type Res = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleReconcile(deps: PayuniTradeDeps, body: any, caller: ReconcileCaller, opts: RunOpts = {}): Promise<Res> {
  const action = String(body?.action ?? "run");
  if (action === "run") {
    if (!caller.isService) return res(403, { error: "Forbidden" });
    return res(200, await runReconcile(deps, opts));
  }
  if (action === "fees") return await feesAction(deps, body, caller);
  if (!caller.isSuperAdmin) return res(403, { error: "Forbidden" });
  if (action === "list") return await listAction(deps, body);
  if (action === "resolve") {
    const note = String(body?.note ?? "").trim();
    const diffId = String(body?.diff_id ?? "");
    if (!diffId || diffId.length > 64) return res(400, { error: "參數不正確" });
    if (note.length < 2) return res(400, { error: "請填寫處理備註" });
    const now = new Date(deps.now?.() ?? Date.now()).toISOString();
    const { data } = await deps.admin.from("payuni_reconcile_diffs").update({ resolved_at: now, resolved_by: caller.label, note })
      .eq("id", diffId).is("resolved_at", null).select("id").maybeSingle();
    return data ? res(200, { ok: true }) : res(404, { error: "差異不存在或已處理" });
  }
  return res(400, { error: "不支援的動作" });
}

async function listAction(deps: PayuniTradeDeps, body: any): Promise<Res> {
  const now = deps.now?.() ?? Date.now();
  const since = previousTaipeiDay(now - 29 * DAY).runDate;
  const { data: runs } = await deps.admin.from("payuni_reconcile_runs")
    .select("id, run_date, completed, invocations, queried, matched, processing, status_fixed, query_errors, diff_counts, note, finished_at, alert_sent_at")
    .gte("run_date", since);
  let q = deps.admin.from("payuni_reconcile_diffs").select("*").is("resolved_at", null);
  if (body?.accommodation_id) q = q.eq("accommodation_id", String(body.accommodation_id));
  if (body?.diff_type) q = q.eq("diff_type", String(body.diff_type));
  const { data: diffs } = await q;
  const list = (diffs ?? []).filter((d: any) => d.diff_type !== "status_fixed");
  const accIds = [...new Set(list.map((d: any) => d.accommodation_id).filter(Boolean))];
  const orderIds = [...new Set(list.map((d: any) => d.order_id).filter(Boolean))];
  const { data: accs } = accIds.length ? await deps.admin.from("accommodation_info").select("id, name").in("id", accIds) : { data: [] };
  const { data: orders } = orderIds.length ? await deps.admin.from("orders").select("id, order_number").in("id", orderIds) : { data: [] };
  return res(200, {
    ok: true,
    runs: (runs ?? []).sort((a: any, b: any) => String(b.run_date).localeCompare(String(a.run_date))),
    diffs: list
      .sort((a: any, b: any) => String(b.last_seen_at).localeCompare(String(a.last_seen_at)))
      .map((d: any) => ({
        ...d,
        accommodation_name: (accs ?? []).find((a: any) => a.id === d.accommodation_id)?.name ?? null,
        order_number: (orders ?? []).find((o: any) => o.id === d.order_id)?.order_number ?? null,
      })),
  });
}

/** 各訂單 PAYUNi 已收／已退／手續費；fee=null 代表還有已付款交易未回填（待對帳） */
async function feesAction(deps: PayuniTradeDeps, body: any, caller: ReconcileCaller): Promise<Res> {
  const ids = Array.isArray(body?.order_ids) ? [...new Set(body.order_ids.map(String))].filter((s) => UUID.test(s as string)) as string[] : [];
  if (!ids.length || ids.length > 500) return res(400, { error: "參數不正確" });
  const { data: orders } = await deps.admin.from("orders").select("id, accommodation_id").in("id", ids);
  const allowed: string[] = [];
  const cache = new Map<string, boolean>();
  for (const o of orders ?? []) {
    if (!cache.has(o.accommodation_id)) cache.set(o.accommodation_id, caller.isSuperAdmin || (await caller.isAccommodationAdmin(o.accommodation_id)));
    if (cache.get(o.accommodation_id)) allowed.push(o.id);
  }
  if (!allowed.length) return res(200, { ok: true, fees: {} });
  const { data: txs } = await deps.admin.from("payment_transactions").select("order_id, kind, status, amount, provider_fee")
    .eq("provider", "payuni").in("order_id", allowed);
  const fees: Record<string, { collected: number; refunded: number; fee: number | null }> = {};
  for (const id of allowed) {
    const rows = (txs ?? []).filter((t: any) => t.order_id === id && t.status === "paid");
    const charges = rows.filter((t: any) => t.kind !== "refund" && t.kind !== "cancel");
    if (!charges.length) continue;
    fees[id] = {
      collected: charges.reduce((a: number, t: any) => a + Number(t.amount), 0),
      refunded: rows.filter((t: any) => t.kind === "refund").reduce((a: number, t: any) => a + Number(t.amount), 0),
      fee: charges.every((t: any) => t.provider_fee != null) ? charges.reduce((a: number, t: any) => a + Number(t.provider_fee), 0) : null,
    };
  }
  return res(200, { ok: true, fees });
}
