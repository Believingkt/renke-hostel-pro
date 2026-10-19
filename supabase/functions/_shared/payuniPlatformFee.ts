// PAYUNi W9 人客多平台費（多功能收付 /api/agent/agent_fee v1.0、/api/agent/agent_fee_query v1.0，代理商金鑰）
// 每月一批：draft（依月結頁算法，只計 PAYUNi 收款訂單）→ 財務核對／調整 → confirm → submit（逐館 agent_fee，冪等）
// → poll（agent_fee_query，FundDate 有值 → funded；全部 funded → settled）。失敗可轉 receivable；settled 後可做負向修正。
// deno-lint-ignore-file no-explicit-any
import { resolvePricingRule } from "../../../packages/shared/src/lib/ownerSettlement.ts";
import { buildExemptResolver } from "./ownerPricingRule.ts";
import { extractQueryResult } from "./payuniTrade.ts";
import type { PayuniTradeDeps } from "./payuniTradeHandlers.ts";
import { computeMonthlyPlatformFee, configFromSetting, monthOf, ORDER_COLS, ragicFee } from "./payuniPlatformFeeCalc.ts";

export const FEE_PATH = "/api/agent/agent_fee";
export const FEE_QUERY_PATH = "/api/agent/agent_fee_query";
export const NO_AGENT_MER_ID = "尚未設定人客多商店代號";
export const MAX_AMT = 9_999_999;
const PAY_KINDS = new Set(["full", "deposit", "final", "addon"]);
const PAID = new Set(["paid", "refunded", "partial_refunded"]);
/** 送出結果不明（可能已被 PAYUNi 受理）：不重送，交給 poll 用 agent_fee_query 確認 */
const UNKNOWN_SEND = new Set(["TIMEOUT", "NETWORK_ERROR", "INVALID_JSON", "HASH_MISMATCH", "DECRYPT_FAILED", "SENDING"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B = "payuni_platform_fee_batches";
const I = "payuni_platform_fee_items";

export type PlatformFeeDeps = PayuniTradeDeps & { agentMerId: string | null };
export interface FeeCaller {
  isService: boolean; isSuperAdmin: boolean; userId: string | null; label: string;
  canReadAcc: (accommodationId: string) => Promise<boolean>;
}
type Res = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const txt = (v: unknown) => { const s = v == null ? "" : String(v).trim(); return s || null; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const nowMs = (d: PayuniTradeDeps) => d.now?.() ?? Date.now();
const nowIso = (d: PayuniTradeDeps) => new Date(nowMs(d)).toISOString();
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const money = (n: number) => `NT$ ${Math.round(n).toLocaleString("en-US")}`;
const fail = (e: any, what: string) => { if (e) throw new Error(`${what}失敗：${e.message}`); };

/** 只能產生已結束的月份（台北時間） */
export function validPeriod(period: string, now: number): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const cur = new Date(now + 8 * 3_600_000).toISOString().slice(0, 7);
  return period < cur;
}
export const tradeNoFor = (period: string, seq: number) => `LKZ${period.replace("-", "")}${String(seq).padStart(4, "0")}`;
const validAmt = (v: unknown, min: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= MAX_AMT;

async function chunkedIn(admin: any, table: string, cols: string, col: string, ids: string[], extra?: (q: any) => any) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    let q = admin.from(table).select(cols).in(col, ids.slice(i, i + 200));
    if (extra) q = extra(q);
    const { data, error } = await q;
    fail(error, table);
    out.push(...(data ?? []));
  }
  return out;
}

/* ===================== 草稿計算 ===================== */

async function computeAcc(admin: any, acc: any, period: string, ctx: any) {
  const month = monthOf(period);
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: orders, error } = await admin.from("orders").select(ORDER_COLS).eq("accommodation_id", acc.id)
    .neq("order_status", "cancelled").lt("check_in_date", nextStr).gt("check_out_date", `${period}-01`);
  fail(error, "訂單查詢");
  const list = (orders ?? []) as any[];
  const oids = list.map((o) => o.id);
  const txs = await chunkedIn(admin, "payment_transactions", "order_id, provider, kind, status, amount", "order_id", oids);
  const paidBy = (provider: string) => {
    const m = new Map<string, number>();
    for (const t of txs) if (t.provider === provider && PAY_KINDS.has(t.kind) && PAID.has(t.status)) m.set(t.order_id, (m.get(t.order_id) ?? 0) + Number(t.amount || 0));
    return m;
  };
  const payuniPaid = paidBy("payuni");
  const tappayPaid = paidBy("tappay");
  const { data: rts } = await admin.from("room_types").select("id, capacity").eq("accommodation_id", acc.id);
  const capMap = Object.fromEntries((rts ?? []).filter((r: any) => Number(r.capacity) > 0).map((r: any) => [r.id, Number(r.capacity)]));
  const jpy = new Set((await chunkedIn(admin, "order_meta", "order_id", "order_id", oids, (q) => q.eq("display_currency", "JPY"))).map((r) => r.order_id));

  const config = configFromSetting(ctx.settings.get(`owner_settlement_config:${acc.id}`) ?? ctx.settings.get("owner_settlement_config") ?? null);
  const rule = await resolvePricingRule(admin, acc.id, month, config);
  const fee = computeMonthlyPlatformFee(list, config, rule, month, capMap);
  const payuniSet = new Set(oids.filter((id) => (payuniPaid.get(id) ?? 0) > 0));
  const byId = new Map(list.map((o) => [o.id, o]));
  const rows = fee.rows.filter((r) => payuniSet.has(r.order_id)).map((r) => {
    const o = byId.get(r.order_id);
    const pp = payuniPaid.get(r.order_id) ?? 0;
    return {
      ...r, revenue: r2(r.revenue), base: r2(r.base), commission: r2(r.commission), premium_share: r2(r.premium_share), fee: r2(r.fee),
      payuni_paid: pp, mixed_payment: (tappayPaid.get(r.order_id) ?? 0) > 0 || (Number(o?.paid_amount) || 0) > pp,
    };
  });
  const amount = Math.round(fee.rows.filter((r) => payuniSet.has(r.order_id)).reduce((s, r) => s + r.fee, 0));
  const base = r2(rows.reduce((s, r) => s + r.base, 0));
  const ragic = ragicFee(list, ctx.ragicRules.get(acc.id) ?? null, ctx.isExempt, jpy, month, payuniSet);

  const startTs = new Date(`${period}-01T00:00:00+08:00`).toISOString();
  const endTs = new Date(`${nextStr}T00:00:00+08:00`).toISOString();
  const { data: refundRows, error: rfErr } = await admin.from("payment_transactions").select("order_id, amount, created_at")
    .eq("accommodation_id", acc.id).eq("provider", "payuni").eq("kind", "refund").eq("status", "paid").gte("created_at", startTs).lt("created_at", endTs);
  fail(rfErr, "退款查詢");
  const rfIds = [...new Set((refundRows ?? []).map((r: any) => r.order_id))] as string[];
  const rfNo = new Map((await chunkedIn(admin, "orders", "id, order_number", "id", rfIds)).map((o) => [o.id, o.order_number]));

  return {
    amount, base, rate: rule.commission_rate,
    detail: {
      calc: {
        breakdown_type: fee.type, rate: rule.commission_rate, threshold: rule.commission_threshold, basis: "nightly", group_buy: "exclude",
        rule_source: rule.fromTable ? "owner_settlement_pricing_rules" : "system_settings",
      },
      orders: rows,
      non_payuni_orders: fee.rows.length - rows.length,
      month_fee_all_orders: Math.round(fee.total),
      refunds: (refundRows ?? []).map((r: any) => ({ order_id: r.order_id, order_number: rfNo.get(r.order_id) ?? null, amount: r.amount, at: r.created_at })),
      ragic: { amount: ragic.amount, month_total: ragic.month_total, has_setting: ragic.has_setting, diff: amount - ragic.amount },
      prior_unpaid: ctx.prior.get(acc.id) ?? [],
      adjustments: [],
    },
  };
}

async function draft(deps: PlatformFeeDeps, period: string, userId: string | null): Promise<Res> {
  const admin = deps.admin;
  const { data: exist } = await admin.from(B).select("id, status").eq("period", period).neq("status", "cancelled");
  if (exist?.length) return res(409, { error: "此月份已有批次，請先取消原批次" });
  const { data: accRows, error } = await admin.from("accommodation_info").select("id, name, payuni_mer_id").not("payuni_mer_id", "is", null);
  fail(error, "館別查詢");
  const accs = (accRows ?? []).filter((a: any) => txt(a.payuni_mer_id))
    .sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")) || a.id.localeCompare(b.id));
  const ids = accs.map((a: any) => a.id);
  const next = new Date(monthOf(period).getFullYear(), monthOf(period).getMonth() + 1, 1);
  const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: settings } = await admin.from("system_settings").select("setting_key, setting_value")
    .in("setting_key", ["owner_settlement_config", ...ids.map((id: string) => `owner_settlement_config:${id}`)]);
  const ruleRows = await chunkedIn(admin, "owner_settlement_pricing_rules", "accommodation_id, commission_rate, commission_threshold, effective_from", "accommodation_id", ids, (q) => q.lte("effective_from", nextStr));
  const ragicRules = new Map<string, { rate: number; threshold: number }>();
  for (const r of ruleRows.sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))) {
    if (!ragicRules.has(r.accommodation_id)) ragicRules.set(r.accommodation_id, { rate: Number(r.commission_rate) || 0, threshold: Number(r.commission_threshold) || 0 });
  }
  const openItems = await chunkedIn(admin, I, "batch_id, accommodation_id, amount, status, bal_type", "accommodation_id", ids, (q) => q.in("status", ["failed", "receivable"]));
  const periods = new Map((await chunkedIn(admin, B, "id, period, status", "id", [...new Set(openItems.map((i) => i.batch_id))])).map((b) => [b.id, b]));
  const prior = new Map<string, any[]>();
  for (const it of openItems) {
    const b = periods.get(it.batch_id);
    if (!b || b.status === "cancelled") continue;
    prior.set(it.accommodation_id, [...(prior.get(it.accommodation_id) ?? []), { period: b.period, amount: it.amount, status: it.status, bal_type: it.bal_type }]);
  }
  const ctx = { settings: new Map((settings ?? []).map((s: any) => [s.setting_key, s.setting_value])), ragicRules, isExempt: await buildExemptResolver(admin, ids), prior };

  const items: any[] = [];
  const zero: string[] = [];
  for (const [idx, acc] of accs.entries()) {
    const c = await computeAcc(admin, acc, period, ctx);
    if (c.amount <= 0) { zero.push(acc.name ?? acc.id); continue; }
    if (c.amount > MAX_AMT) throw new Error(`${acc.name} 金額超過 agent_fee 上限`);
    items.push({
      accommodation_id: acc.id, mer_id: acc.payuni_mer_id, base_amount: c.base, rate: c.rate, amount: c.amount,
      fee_type: 2, bal_type: 1, trade_no: tradeNoFor(period, idx + 1), detail: { ...c.detail, accommodation_name: acc.name ?? null }, status: "pending",
    });
  }
  const { data: batch, error: bErr } = await admin.from(B).insert({ period, status: "draft", created_by: userId }).select("id").single();
  if (bErr?.code === "23505") return res(409, { error: "此月份已有批次，請先取消原批次" });
  fail(bErr, "批次建立");
  if (items.length) {
    const { error: iErr } = await admin.from(I).insert(items.map((it) => ({ ...it, batch_id: batch.id })));
    fail(iErr, "明細建立");
  }
  return res(200, { ok: true, batch_id: batch.id, period, items: items.length, total: items.reduce((s, i) => s + i.amount, 0), zero_amount: zero });
}

/* ===================== 狀態操作 ===================== */

async function getRow(admin: any, table: string, id: unknown) {
  if (!/^[\w-]{1,64}$/.test(String(id ?? ""))) return null;
  const { data } = await admin.from(table).select("*").eq("id", String(id)).maybeSingle();
  return data;
}
/** 條件式更新（狀態符合才改），回傳是否改到 */
async function cas(admin: any, table: string, id: string, from: string[], patch: Record<string, unknown>) {
  const { data, error } = await admin.from(table).update(patch).eq("id", id).in("status", from).select("id").maybeSingle();
  fail(error, "更新");
  return !!data;
}
async function batchItems(admin: any, batchId: string) {
  const { data, error } = await admin.from(I).select("*").eq("batch_id", batchId);
  fail(error, "明細查詢");
  return (data ?? []) as any[];
}

/** 依明細重算批次狀態：有 failed → partial_failed；全部 funded → settled；否則 submitted */
function batchStatusOf(items: any[]) {
  const live = items.filter((i) => i.status !== "cancelled");
  if (live.some((i) => i.status === "failed")) return "partial_failed";
  if (live.length && live.every((i) => i.status === "funded")) return "settled";
  return "submitted";
}

async function adjust(deps: PlatformFeeDeps, body: any, caller: FeeCaller): Promise<Res> {
  const item = await getRow(deps.admin, I, body?.item_id);
  if (!item || item.bal_type !== 1) return res(404, { error: "找不到明細" });
  const batch = await getRow(deps.admin, B, item.batch_id);
  if (batch?.status !== "draft") return res(409, { error: "只有草稿可以調整金額" });
  const reason = txt(body?.reason);
  if (!reason) return res(400, { error: "請填寫調整原因" });
  if (!validAmt(body?.amount, 0)) return res(400, { error: `金額須為 0～${MAX_AMT} 的整數` });
  const adjustments = [...(item.detail?.adjustments ?? []), { from: item.amount, to: body.amount, reason, by: caller.label, at: nowIso(deps) }];
  const ok = await cas(deps.admin, I, item.id, ["pending", "cancelled"], {
    amount: body.amount, status: body.amount === 0 ? "cancelled" : "pending", detail: { ...item.detail, adjustments }, updated_at: nowIso(deps),
  });
  return ok ? res(200, { ok: true }) : res(409, { error: "明細狀態已變更" });
}

async function submit(deps: PlatformFeeDeps, body: any): Promise<Res> {
  if (!deps.agentMerId) return res(400, { error: NO_AGENT_MER_ID });
  const admin = deps.admin;
  const batch = await getRow(admin, B, body?.batch_id);
  if (!batch) return res(404, { error: "找不到批次" });
  const correction = ["settled", "submitted", "partial_failed"].includes(batch.status);
  if (batch.status !== "confirmed" && !correction) return res(409, { error: "批次需先確認才能送出" });
  if (!(await cas(admin, B, batch.id, [batch.status], { status: "submitting" }))) return res(409, { error: "批次正在送出中" });
  const out = { sent: 0, failed: 0, unknown: 0, total: 0 };
  let finalStatus = batch.status;
  let targeted = 0;
  try {
    const items = await batchItems(admin, batch.id);
    const targets = items.filter((i) => i.status === "pending" && i.api_status == null &&
      (correction ? i.bal_type === 2 && i.detail?.correction?.confirmed_at : i.bal_type === 1));
    targeted = targets.length;
    for (const t of targets) {
      const { data: claimed } = await admin.from(I).update({ api_status: "SENDING", updated_at: nowIso(deps) })
        .eq("id", t.id).eq("status", "pending").is("api_status", null).select("id").maybeSingle();
      if (!claimed) continue;
      let patch: Record<string, unknown>;
      try {
        const r = await deps.callPayuni({
          kind: "agent", path: FEE_PATH, version: "1.0",
          payload: { MerID: t.mer_id, TradeNo: t.trade_no, Amt: t.amount, FeeType: t.fee_type, BalType: t.bal_type, AgentMerID: deps.agentMerId },
        });
        patch = { status: r.ok ? "sent" : "failed", api_status: r.status, api_message: r.message ?? null };
        if (r.ok) { out.sent++; out.total += t.amount; } else if (UNKNOWN_SEND.has(r.status)) out.unknown++; else out.failed++;
      } catch (e) {
        patch = { status: "failed", api_status: "ERROR", api_message: e instanceof Error ? e.message : String(e) };
        out.failed++;
      }
      const { error } = await admin.from(I).update({ ...patch, updated_at: nowIso(deps) }).eq("id", t.id);
      fail(error, "明細更新");
    }
    finalStatus = targets.length ? batchStatusOf(await batchItems(admin, batch.id)) : batch.status;
  } finally {
    await admin.from(B).update({ status: finalStatus, ...(finalStatus !== batch.status ? { submitted_at: nowIso(deps) } : {}) }).eq("id", batch.id);
  }
  const failedAll = out.failed + out.unknown;
  if (targeted) await deps.sendAlert(
    `[PAYUNi] ${batch.period} 平台費${correction ? "修正" : ""}已送出：${out.sent} 館、${money(out.total)}，失敗 ${failedAll}`,
    `<p>期間 ${esc(batch.period)}：送出成功 ${out.sent} 館，總額 ${money(out.total)}；失敗 ${out.failed} 館、結果不明 ${out.unknown} 館（將由每日查詢確認）。</p><p>請至 HQ「PAYUNi 金流 → 平台費」查看。</p>`,
  ).catch(() => false);
  return res(200, { ok: true, status: finalStatus, ...out });
}

export async function poll(deps: PlatformFeeDeps, batchId?: string | null) {
  const admin = deps.admin;
  let q = admin.from(I).select("*").in("status", ["sent", "failed"]);
  if (batchId) q = q.eq("batch_id", batchId);
  const { data, error } = await q;
  fail(error, "明細查詢");
  const targets = (data ?? []).filter((i: any) => i.status === "sent" || UNKNOWN_SEND.has(i.api_status));
  const out = { checked: 0, funded: 0, confirmed_sent: 0, errors: 0, settled: [] as string[] };
  const touched = new Set<string>();
  for (const it of targets) {
    out.checked++;
    const r = await deps.callPayuni({ kind: "agent", path: FEE_QUERY_PATH, version: "1.0", payload: { MerID: it.mer_id, TradeNo: it.trade_no, Amt: it.amount } });
    if (!r.ok) { out.errors++; continue; }
    const d = extractQueryResult(r.data) ?? r.data ?? {};
    const fund = /^\d{4}-\d{2}-\d{2}/.exec(String(d.FundDate ?? ""))?.[0];
    let patch: Record<string, unknown> | null = null;
    if (fund && fund !== "0000-00-00") {
      patch = { status: "funded", fund_date: fund, payuni_fee: Number.isFinite(Number(d.Fee)) && txt(d.Fee) ? Math.round(Number(d.Fee)) : null };
      out.funded++;
    } else if (it.status === "failed" && txt(d.TradeDate)) {
      patch = { status: "sent", api_message: "查詢確認已受理" };
      out.confirmed_sent++;
    }
    if (patch) {
      await admin.from(I).update({ ...patch, updated_at: nowIso(deps) }).eq("id", it.id);
      touched.add(it.batch_id);
    }
  }
  for (const id of touched) {
    const items = await batchItems(admin, id);
    const st = batchStatusOf(items);
    if (!(await cas(admin, B, id, ["submitted", "partial_failed"], { status: st }))) continue;
    if (st !== "settled") continue;
    const batch = await getRow(admin, B, id);
    out.settled.push(batch.period);
    const live = items.filter((i) => i.status !== "cancelled");
    await deps.sendAlert(
      `[PAYUNi] ${batch.period} 平台費已全部撥款：${live.length} 筆、${money(live.reduce((s, i) => s + (i.bal_type === 1 ? i.amount : -i.amount), 0))}`,
      `<p>期間 ${esc(batch.period)} 平台費已全部撥款（${live.length} 筆，PAYUNi 服務費合計 ${money(live.reduce((s, i) => s + (i.payuni_fee ?? 0), 0))}）。</p>`,
    ).catch(() => false);
  }
  return out;
}

async function receivable(deps: PlatformFeeDeps, body: any, caller: FeeCaller): Promise<Res> {
  const item = await getRow(deps.admin, I, body?.item_id);
  if (!item) return res(404, { error: "找不到明細" });
  if (item.status !== "failed" || UNKNOWN_SEND.has(item.api_status)) return res(409, { error: "只有確定失敗的明細可以轉應收" });
  const detail = { ...item.detail, receivable: { by: caller.label, at: nowIso(deps), note: txt(body?.note) } };
  if (!(await cas(deps.admin, I, item.id, ["failed"], { status: "receivable", detail, updated_at: nowIso(deps) }))) return res(409, { error: "明細狀態已變更" });
  const batch = await getRow(deps.admin, B, item.batch_id);
  const name = item.detail?.accommodation_name ?? item.accommodation_id;
  await deps.sendAlert(
    `[PAYUNi] ${batch?.period} 平台費轉應收：${name} ${money(item.amount)}`,
    `<p>${esc(name)} ${esc(batch?.period)} 平台費 ${money(item.amount)} 扣款失敗（${esc(item.api_status)} ${esc(item.api_message ?? "")}），已轉應收，請人工向民宿收款。</p>`,
  ).catch(() => false);
  return res(200, { ok: true });
}

async function correction(deps: PlatformFeeDeps, body: any, caller: FeeCaller): Promise<Res> {
  const batch = await getRow(deps.admin, B, body?.batch_id);
  if (batch?.status !== "settled") return res(409, { error: "只有已撥款完成的批次可以做負向修正" });
  const reason = txt(body?.reason);
  if (!reason) return res(400, { error: "請填寫修正原因" });
  if (!validAmt(body?.amount, 1)) return res(400, { error: `金額須為 1～${MAX_AMT} 的整數` });
  const base = (await batchItems(deps.admin, batch.id)).find((i) => i.accommodation_id === body?.accommodation_id && i.bal_type === 1 && i.status === "funded");
  if (!base) return res(404, { error: "此館在本批次沒有已撥款的扣款" });
  if (body.amount > base.amount) return res(400, { error: "修正金額不可超過原扣款" });
  const { error } = await deps.admin.from(I).insert({
    batch_id: batch.id, accommodation_id: base.accommodation_id, mer_id: base.mer_id, base_amount: 0, rate: 0, amount: body.amount,
    fee_type: 3, bal_type: 2, trade_no: `${base.trade_no}N`, status: "pending",
    detail: { accommodation_name: base.detail?.accommodation_name ?? null, correction: { reason, created_by: caller.label, created_at: nowIso(deps) } },
  });
  if (error?.code === "23505") return res(409, { error: "此館在本批次已有負向修正" });
  fail(error, "修正建立");
  return res(200, { ok: true });
}

async function confirmCorrection(deps: PlatformFeeDeps, body: any, caller: FeeCaller): Promise<Res> {
  const item = await getRow(deps.admin, I, body?.item_id);
  if (!item || item.bal_type !== 2 || item.status !== "pending") return res(404, { error: "找不到待確認的負向修正" });
  if (item.detail?.correction?.confirmed_at) return res(409, { error: "已確認" });
  const detail = { ...item.detail, correction: { ...item.detail.correction, confirmed_by: caller.label, confirmed_at: nowIso(deps) } };
  return (await cas(deps.admin, I, item.id, ["pending"], { detail, updated_at: nowIso(deps) })) ? res(200, { ok: true }) : res(409, { error: "明細狀態已變更" });
}

async function myItems(deps: PlatformFeeDeps, accId: string): Promise<Res> {
  const { data, error } = await deps.admin.from(I).select("*").eq("accommodation_id", accId).neq("status", "cancelled");
  fail(error, "明細查詢");
  const batches = new Map((await chunkedIn(deps.admin, B, "id, period, status", "id", [...new Set((data ?? []).map((i: any) => i.batch_id))] as string[])).map((b) => [b.id, b]));
  const items = (data ?? []).filter((i: any) => !["draft", "cancelled"].includes(batches.get(i.batch_id)?.status ?? "draft")).map((i: any) => ({
    id: i.id, period: batches.get(i.batch_id).period, amount: i.amount, bal_type: i.bal_type, status: i.status, fund_date: i.fund_date,
    orders: (i.detail?.orders ?? []).map((o: any) => ({ order_id: o.order_id, order_number: o.order_number, check_in_date: o.check_in_date, check_out_date: o.check_out_date, revenue: o.revenue, fee: o.fee })),
  })).sort((a: any, b: any) => b.period.localeCompare(a.period) || a.bal_type - b.bal_type);
  return res(200, { ok: true, items });
}

/* ===================== 入口 ===================== */

export async function handlePlatformFee(deps: PlatformFeeDeps, body: any, caller: FeeCaller): Promise<Res> {
  const action = String(body?.action ?? "");
  if (action === "my_items") {
    const accId = String(body?.accommodation_id ?? "");
    if (!UUID.test(accId)) return res(400, { error: "參數不正確" });
    if (!caller.isSuperAdmin && !(await caller.canReadAcc(accId))) return res(403, { error: "Forbidden" });
    return await myItems(deps, accId);
  }
  if (action === "poll") {
    if (!caller.isService && !caller.isSuperAdmin) return res(403, { error: "Forbidden" });
    return res(200, { ok: true, ...(await poll(deps, txt(body?.batch_id))) });
  }
  if (!caller.isSuperAdmin) return res(403, { error: "Forbidden" });
  switch (action) {
    case "draft": {
      const period = String(body?.period ?? "");
      if (!validPeriod(period, nowMs(deps))) return res(400, { error: "月份格式不正確或尚未結束（YYYY-MM）" });
      return await draft(deps, period, caller.userId);
    }
    case "adjust": return await adjust(deps, body, caller);
    case "confirm": {
      const b = await getRow(deps.admin, B, body?.batch_id);
      if (!b) return res(404, { error: "找不到批次" });
      return (await cas(deps.admin, B, b.id, ["draft"], { status: "confirmed", confirmed_by: caller.userId, confirmed_at: nowIso(deps) }))
        ? res(200, { ok: true }) : res(409, { error: "只有草稿可以確認" });
    }
    case "cancel": {
      const b = await getRow(deps.admin, B, body?.batch_id);
      if (!b) return res(404, { error: "找不到批次" });
      if (!(await cas(deps.admin, B, b.id, ["draft", "confirmed"], { status: "cancelled" }))) return res(409, { error: "已送出的批次不可取消" });
      await deps.admin.from(I).update({ status: "cancelled", updated_at: nowIso(deps) }).eq("batch_id", b.id);
      return res(200, { ok: true });
    }
    case "submit": return await submit(deps, body);
    case "receivable": return await receivable(deps, body, caller);
    case "correction": return await correction(deps, body, caller);
    case "confirm_correction": return await confirmCorrection(deps, body, caller);
    default: return res(400, { error: "不支援的動作" });
  }
}
