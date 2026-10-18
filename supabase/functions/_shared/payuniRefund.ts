// PAYUNi W7 退款核心：trade/query → 取消授權（trade/cancel）／退款（trade/close CloseType=2）／ATM 轉匯退款（trade/offline/refund）。
// 規則：最後付款先退、每筆不超過 PAYUNi RemainAmt、超過 180 天改人工、退款列 MerTradeNo = 原交易 + "-R{n}"。
// 安全：帳戶資料只寫 refund_bank_accounts（service role），UID 只放進送出的 payload；任何 log 不含帳號、戶名、UID。
// deno-lint-ignore-file no-explicit-any
import type { PayuniCall, PayuniResult } from "./payuni.ts";
import { extractQueryResult } from "./payuniTrade.ts";

export interface RefundDeps {
  admin: any;
  callPayuni: (call: PayuniCall) => Promise<PayuniResult>;
  sendAlert: (subject: string, html: string) => Promise<unknown>;
  now?: () => number;
}

export type RefundSource = "admin" | "guest" | "member" | "system" | "payuni_backstage";
export const REFUND_MAX_AGE_DAYS = 180;
export const REFUND_STALE_DAYS = 7;
export const ACCOUNT_PURGE_DAYS = 30;
const DAY = 86_400_000;

// PAYUNi 狀態碼（依 PAYUNi 文件；Sandbox R-01／R-02 再核對）
export const CLOSE_STATUS = { APPLYING: "1", CLOSED: "2", CANCELLED: "3", PROCESSING: "7", NOT_APPLIED: "9" } as const;
export const REFUND_STATUS = { APPLYING: "1", DONE: "2", CANCELLED: "3", PROCESSING: "7", NOT_APPLIED: "9" } as const;

export interface BankAccountInput {
  bank_code: string;
  bank_sub_code?: string | null;
  account_no: string;
  holder_name: string;
  /** 身分證字號／統編：只送 PAYUNi，不落庫 */
  uid: string;
}

export type RefundAction =
  | { type: "cancel" }
  | { type: "close_refund" }
  | { type: "offline_refund" }
  | { type: "pending"; reason: string }
  | { type: "manual"; reason: string };

const ts = (now: number) => String(Math.floor(now / 1000));
const iso = (now: number) => new Date(now).toISOString();
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// ---------------- 純規則 ----------------

export function validateBankAccount(a: any): { ok: true; value: BankAccountInput } | { ok: false; error: string } {
  const v = {
    bank_code: String(a?.bank_code ?? "").trim(),
    bank_sub_code: a?.bank_sub_code ? String(a.bank_sub_code).trim() : null,
    account_no: String(a?.account_no ?? "").replace(/[\s-]/g, ""),
    holder_name: String(a?.holder_name ?? "").trim(),
    uid: String(a?.uid ?? "").trim().toUpperCase(),
  };
  if (!/^\d{3}$/.test(v.bank_code)) return { ok: false, error: "銀行代碼須為 3 碼數字" };
  if (v.bank_sub_code && !/^\d{4}$/.test(v.bank_sub_code)) return { ok: false, error: "分行代碼須為 4 碼數字" };
  if (!/^\d{6,16}$/.test(v.account_no)) return { ok: false, error: "帳號須為 6～16 碼數字" };
  if (v.holder_name.length < 1 || v.holder_name.length > 50) return { ok: false, error: "請填寫戶名" };
  if (!/^[A-Z][12]\d{8}$/.test(v.uid) && !/^\d{8}$/.test(v.uid)) return { ok: false, error: "身分證字號或統一編號格式不正確" };
  return { ok: true, value: v };
}

export const maskAccountNo = (no: string) => "*".repeat(Math.max(no.length - 4, 0)) + no.slice(-4);
export const maskHolderName = (name: string) => `${Array.from(name)[0] ?? ""}**`;

export function nextRefundMerTradeNo(parentMerTradeNo: string, existing: string[]): string {
  const prefix = `${parentMerTradeNo}-R`;
  let max = 0;
  for (const m of existing) {
    if (m.startsWith(prefix) && /^\d+$/.test(m.slice(prefix.length))) max = Math.max(max, Number(m.slice(prefix.length)));
  }
  return `${prefix}${max + 1}`;
}

const paidAt = (tx: any) => tx.notified_at ?? tx.created_at;

/** 依查詢結果決定這筆原交易的退款方式 */
export function decideRefundAction(
  tx: any, q: Record<string, string>, amount: number, remain: number, backSetUnCreditRefund: unknown, now: number,
): RefundAction {
  if (now - Date.parse(paidAt(tx)) > REFUND_MAX_AGE_DAYS * DAY) return { type: "manual", reason: `付款已超過 ${REFUND_MAX_AGE_DAYS} 天，PAYUNi 不受理自動退款，請人工退款` };
  const rs = String(q.RefundStatus ?? "");
  if (rs === REFUND_STATUS.APPLYING || rs === REFUND_STATUS.PROCESSING) return { type: "pending", reason: "PAYUNi 另有退款處理中" };
  if (Number(tx.payment_type) === 2) {
    return String(backSetUnCreditRefund ?? "") === "1"
      ? { type: "offline_refund" }
      : { type: "manual", reason: "商店未啟用 ATM 自動退款（BackSetUnCreditRefund），請人工退款" };
  }
  const cs = String(q.CloseStatus ?? "");
  if (cs === CLOSE_STATUS.CLOSED) return { type: "close_refund" };
  if (cs === CLOSE_STATUS.APPLYING || cs === CLOSE_STATUS.PROCESSING) return { type: "pending", reason: "請款處理中，請款完成後系統自動送出退款" };
  if (amount === remain) return { type: "cancel" };
  return { type: "pending", reason: "尚未請款，部分退款需待請款完成後由系統自動送出" };
}

/** 最後付款先退；每筆不超過可退餘額 */
export function allocateRefund(charges: Array<{ tx: any; remain: number }>, amount: number) {
  const sorted = [...charges].sort((a, b) => String(paidAt(b.tx)).localeCompare(String(paidAt(a.tx))));
  const parts: Array<{ tx: any; amount: number; remain: number }> = [];
  let left = amount;
  for (const c of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, c.remain));
    if (take > 0) parts.push({ tx: c.tx, amount: take, remain: c.remain });
    left -= take;
  }
  return { parts, unallocated: left };
}

export function refundTotals(charges: any[], refunds: any[]) {
  const sum = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const pendingRows = refunds.filter((r) => r.status === "pending");
  return {
    collected: sum(charges),
    refunded: sum(refunds.filter((r) => r.status === "paid")),
    pending: sum(pendingRows),
    manualPending: sum(pendingRows.filter((r) => r.raw_response?.action === "manual")),
    failed: sum(refunds.filter((r) => r.status === "failed" && !r.raw_response?.superseded)),
  };
}

export function buildRefundCall(action: "cancel" | "close_refund" | "offline_refund", tx: any, amount: number, now: number, acct?: BankAccountInput): PayuniCall {
  const base = { MerID: tx.mer_id, TradeNo: tx.provider_trade_no, Timestamp: ts(now) };
  if (action === "cancel") return { kind: "merchant", merId: tx.mer_id, path: "/api/trade/cancel", version: "1.0", payload: base };
  if (action === "close_refund") {
    return { kind: "merchant", merId: tx.mer_id, path: "/api/trade/close", version: "1.0", payload: { ...base, CloseType: 2, TradeAmt: amount } };
  }
  // ATM 轉匯退款欄位名稱待 Sandbox R-05 核對
  const payload: Record<string, string | number> = {
    ...base, TradeAmt: amount, BankCode: acct!.bank_code, BankAccount: acct!.account_no, AccountName: acct!.holder_name, UID: acct!.uid,
  };
  if (acct!.bank_sub_code) payload.BranchCode = acct!.bank_sub_code;
  return { kind: "merchant", merId: tx.mer_id, path: "/api/trade/offline/refund", version: "1.0", payload };
}

// ---------------- 讀取 ----------------

export async function loadPayuniTxs(admin: any, orderId: string) {
  const { data, error } = await admin.from("payment_transactions").select("*").eq("order_id", orderId).eq("provider", "payuni");
  if (error) throw new Error(`payment_transactions read failed: ${error.message}`);
  const all = data ?? [];
  return {
    charges: all.filter((t: any) => t.status === "paid" && t.kind !== "refund" && t.kind !== "cancel"),
    refunds: all.filter((t: any) => t.kind === "refund"),
  };
}

async function backSetUnCreditRefund(admin: any, accommodationId: string) {
  const { data } = await admin.from("accommodation_payuni_private").select("payuni_settings").eq("accommodation_id", accommodationId).maybeSingle();
  return data?.payuni_settings?.backSetting?.BackSetUnCreditRefund ?? null;
}

async function queryTrade(deps: RefundDeps, tx: any, now: number) {
  const r = await deps.callPayuni({
    kind: "merchant", merId: tx.mer_id, path: "/api/trade/query", version: "2.0",
    payload: { MerID: tx.mer_id, MerTradeNo: tx.mer_trade_no, Timestamp: ts(now) },
  });
  return r.ok ? extractQueryResult(r.data) : null;
}

/** 可退餘額 = min(PAYUNi RemainAmt, 原交易金額 − 本系統已完成／處理中的退款) */
function remainOf(tx: any, q: Record<string, string>, refunds: any[]) {
  const ours = refunds.filter((r) => r.parent_tx_id === tx.id && (r.status === "paid" || r.status === "pending"))
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const local = Number(tx.amount) - ours;
  const remote = q.RemainAmt != null && String(q.RemainAmt).trim() !== "" ? Number(q.RemainAmt) : Number(q.TradeAmt ?? tx.amount);
  return Math.max(0, Math.min(local, Number.isFinite(remote) ? remote : local));
}

// ---------------- 訂單同步 ----------------

export interface OrderSyncOpts { notes?: string[]; reason: string; actorLabel: string }

/** 以已完成退款列重算訂單退款欄位（refunded_amount 只算 status=paid 的退款列），經 update_order_with_context 寫入 */
export async function syncOrderRefund(deps: RefundDeps, orderId: string, opts: OrderSyncOpts) {
  const now = deps.now?.() ?? Date.now();
  const { data: order, error } = await deps.admin.from("orders").select("id, notes, payment_status, refund_status").eq("id", orderId).maybeSingle();
  if (error || !order) throw new Error(`order read failed: ${error?.message ?? "not found"}`);
  const { charges, refunds } = await loadPayuniTxs(deps.admin, orderId);
  const t = refundTotals(charges, refunds);
  const patch: Record<string, unknown> = {};
  const newPaid = Math.max(0, t.collected - t.refunded);
  if (t.refunded > 0 || refunds.length > 0) {
    patch.refunded_amount = t.refunded;
    patch.paid_amount = newPaid;
  }
  if (t.refunded > 0) {
    patch.payment_status = newPaid === 0 ? "refunded" : "partial_refunded";
    patch.refunded_at = iso(now);
  }
  patch.refund_status = t.failed > 0 ? "failed"
    : t.manualPending > 0 ? "pending_manual"
    : t.pending > 0 ? "pending"
    : t.refunded > 0 ? (newPaid === 0 ? "refunded" : "partial_refunded")
    : (order.refund_status ?? null);
  if (opts.notes?.length) {
    const stamp = iso(now);
    const lines = opts.notes.map((l) => `🔒 [${stamp}] ${l}`).join("\n");
    patch.notes = order.notes ? `${order.notes}\n${lines}` : lines;
  }
  const { error: upErr } = await deps.admin.rpc("update_order_with_context", {
    p_order_id: orderId, p_patch: patch, p_source: "payuni_refund", p_reason: opts.reason, p_actor_label: opts.actorLabel, p_actor_type: "system",
  });
  if (upErr) throw new Error(`order update failed: ${upErr.message}`);
  return t;
}

// ---------------- 執行退款 ----------------

export interface ExecuteInput {
  order: { id: string; order_number: string; accommodation_id: string };
  amount: number;
  source: RefundSource;
  actorLabel: string;
  bankAccount?: BankAccountInput | null;
  notes?: string[];
}

export interface PartResult { mer_trade_no: string; amount: number; action: RefundAction["type"]; status: "paid" | "pending" | "failed"; reason?: string | null }
export type ExecuteResult =
  | { ok: true; parts: PartResult[]; refundedNow: number; pendingAmount: number; manualAmount: number; failedAmount: number }
  | { ok: false; status: 400 | 409 | 502; error: string; needsBankAccount?: boolean };

const DUP_WINDOW_MS = DAY;

export async function executePayuniRefund(deps: RefundDeps, input: ExecuteInput): Promise<ExecuteResult> {
  const now = deps.now?.() ?? Date.now();
  const { charges, refunds } = await loadPayuniTxs(deps.admin, input.order.id);
  if (refunds.some((r: any) => r.status === "pending")) return { ok: false, status: 409, error: "此訂單已有退款處理中，請待完成後再操作" };
  const batches = new Map<string, number>();
  for (const r of refunds.filter((r: any) => r.status === "paid" && now - Date.parse(r.created_at) < DUP_WINDOW_MS)) {
    const k = r.raw_response?.batch_id ?? r.id;
    batches.set(k, (batches.get(k) ?? 0) + Number(r.amount));
  }
  if ([...batches.values()].includes(input.amount)) return { ok: false, status: 409, error: "相同金額的退款已完成，請勿重複送出" };
  const t = refundTotals(charges, refunds);
  if (input.amount <= 0 || input.amount > t.collected - t.refunded) {
    return { ok: false, status: 400, error: `退款金額不可超過可退金額 NT$${Math.max(0, t.collected - t.refunded).toLocaleString()}` };
  }

  const backSet = await backSetUnCreditRefund(deps.admin, input.order.accommodation_id);
  const queried: Array<{ tx: any; q: Record<string, string>; remain: number }> = [];
  for (const tx of charges) {
    const q = await queryTrade(deps, tx, now);
    if (!q) return { ok: false, status: 502, error: "PAYUNi 交易查詢失敗，未執行任何退款，請稍後再試" };
    queried.push({ tx, q, remain: remainOf(tx, q, refunds) });
  }
  const { parts, unallocated } = allocateRefund(queried, input.amount);
  if (unallocated > 0) return { ok: false, status: 400, error: `PAYUNi 剩餘可退金額不足（尚差 NT$${unallocated.toLocaleString()}）` };
  const plan = parts.map((p) => {
    const q = queried.find((x) => x.tx.id === p.tx.id)!.q;
    return { ...p, action: decideRefundAction(p.tx, q, p.amount, p.remain, backSet, now) };
  });
  if (plan.some((p) => p.action.type === "offline_refund") && !input.bankAccount) {
    return { ok: false, status: 400, error: "ATM 付款需填寫退款帳戶", needsBankAccount: true };
  }

  const batchId = crypto.randomUUID();
  const existingNos = refunds.map((r: any) => r.mer_trade_no);
  const results: PartResult[] = [];
  for (const p of plan) {
    const merTradeNo = nextRefundMerTradeNo(p.tx.mer_trade_no, existingNos);
    existingNos.push(merTradeNo);
    const reason = p.action.type === "pending" || p.action.type === "manual" ? p.action.reason : null;
    const { data: row, error } = await deps.admin.from("payment_transactions").insert({
      order_id: input.order.id, accommodation_id: input.order.accommodation_id, provider: "payuni", mer_id: p.tx.mer_id,
      mer_trade_no: merTradeNo, provider_trade_no: p.tx.provider_trade_no, kind: "refund", payment_type: p.tx.payment_type,
      amount: p.amount, status: "pending", parent_tx_id: p.tx.id, refund_source: input.source, refund_pending_reason: reason,
      raw_response: { batch_id: batchId, action: p.action.type }, created_at: iso(now), updated_at: iso(now),
    }).select("id").single();
    if (error) {
      if (error.code === "23505") return { ok: false, status: 409, error: "退款已送出，請勿重複操作" };
      throw new Error(`refund row insert failed: ${error.message}`);
    }
    const refundRow = { id: row.id, mer_trade_no: merTradeNo, amount: p.amount, raw_response: { batch_id: batchId, action: p.action.type } };
    results.push(await runRefundPart(deps, refundRow, p.tx, p.action, input.order, now, input.bankAccount ?? null));
  }

  const sum = (s: PartResult["status"], filter: (r: PartResult) => boolean = () => true) =>
    results.filter((r) => r.status === s && filter(r)).reduce((a, r) => a + r.amount, 0);
  const out = {
    ok: true as const, parts: results, refundedNow: sum("paid"),
    pendingAmount: sum("pending", (r) => r.action !== "manual"), manualAmount: sum("pending", (r) => r.action === "manual"), failedAmount: sum("failed"),
  };
  const desc = results.map((r) => `${r.mer_trade_no} NT$${r.amount.toLocaleString()} ${partLabel(r)}`).join("；");
  await syncOrderRefund(deps, input.order.id, {
    notes: [...(input.notes ?? []), `PAYUNi 退款 NT$${input.amount.toLocaleString()}（${input.actorLabel}）：${desc}`],
    reason: `PAYUNi 退款 NT$${input.amount}`, actorLabel: input.actorLabel,
  });
  if (out.failedAmount > 0 || out.manualAmount > 0) await notifyRefundIssue(deps, input.order, results);
  return out;
}

export function partLabel(r: PartResult) {
  const act = { cancel: "取消授權", close_refund: "信用卡退款", offline_refund: "ATM 轉匯退款", pending: "待送出", manual: "人工退款" }[r.action];
  const st = r.status === "paid" ? "完成" : r.status === "failed" ? "失敗" : "處理中";
  return `${act}${st}${r.reason ? `（${r.reason}）` : ""}`;
}

/** 對單筆退款列送出 PAYUNi 退款並更新該列；回傳結果（不更新訂單） */
export async function runRefundPart(
  deps: RefundDeps, row: { id: string; mer_trade_no: string; amount: number; raw_response: any },
  tx: any, action: RefundAction, order: { id: string }, now: number, acct: BankAccountInput | null,
): Promise<PartResult> {
  const base = { mer_trade_no: row.mer_trade_no, amount: row.amount, action: action.type } as const;
  if (action.type === "pending" || action.type === "manual") return { ...base, status: "pending", reason: action.reason };
  if (action.type === "offline_refund") {
    const { error } = await deps.admin.from("refund_bank_accounts").insert({
      order_id: order.id, refund_tx_id: row.id, bank_code: acct!.bank_code, bank_sub_code: acct!.bank_sub_code ?? null,
      account_no: acct!.account_no, holder_name: acct!.holder_name,
    });
    // 不帶 error.message：Postgres 錯誤訊息可能含整列內容（帳號、戶名）
    if (error) throw new Error(`refund_bank_accounts insert failed: ${error.code ?? "unknown"}`);
  }
  const r = await deps.callPayuni(buildRefundCall(action.type, tx, row.amount, now, acct ?? undefined));
  const raw = { ...row.raw_response, action: action.type, last_status: r.status, last_message: r.message ?? null, submitted_at: iso(now) };
  if (!r.ok) {
    const reason = `PAYUNi 回覆 ${r.status}${r.message ? `：${r.message}` : ""}`;
    await updateRefundRow(deps.admin, row.id, { status: "failed", refund_pending_reason: reason, raw_response: raw });
    return { ...base, status: "failed", reason };
  }
  if (action.type === "offline_refund") {
    // 轉匯結果由 payuni-trade-notify 回報
    await updateRefundRow(deps.admin, row.id, { refund_pending_reason: null, raw_response: { ...raw, awaiting_transfer: true } });
    return { ...base, status: "pending", reason: "等待 PAYUNi 轉匯結果" };
  }
  await updateRefundRow(deps.admin, row.id, { status: "paid", refund_pending_reason: null, notified_at: iso(now), raw_response: raw });
  return { ...base, status: "paid" };
}

async function updateRefundRow(admin: any, id: string, values: Record<string, unknown>) {
  const { error } = await admin.from("payment_transactions").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).neq("status", "paid");
  if (error) throw new Error(`refund row update failed: ${error.message}`);
}

async function notifyRefundIssue(deps: RefundDeps, order: { id: string; order_number: string; accommodation_id: string }, parts: PartResult[]) {
  const bad = parts.filter((p) => p.status === "failed" || p.action === "manual");
  const failed = bad.some((p) => p.status === "failed");
  const desc = `訂單 ${order.order_number}：${bad.map((p) => `${p.mer_trade_no} NT$${p.amount.toLocaleString()} ${partLabel(p)}`).join("；")}`;
  await deps.admin.from("notifications").insert({
    accommodation_id: order.accommodation_id, order_id: order.id, type: "refund_failed",
    title: failed ? "PAYUNi 退款失敗" : "PAYUNi 退款需人工處理", description: desc, is_read: false,
  });
  await deps.sendAlert(`[PAYUNi] ${failed ? "退款失敗" : "退款需人工處理"} ${order.order_number}`, `<p>${esc(desc)}</p>`)
    .catch((e) => console.error(`[payuniRefund] alert failed: ${e instanceof Error ? e.message : e}`));
}

// ---------------- 完成／失敗（Notify、sweep 共用） ----------------

async function orderOf(admin: any, orderId: string) {
  const { data } = await admin.from("orders").select("id, order_number, accommodation_id").eq("id", orderId).maybeSingle();
  return data;
}

export async function completeRefundRow(deps: RefundDeps, row: any, via: string) {
  const now = deps.now?.() ?? Date.now();
  const { data: claimed, error } = await deps.admin.from("payment_transactions")
    .update({ status: "paid", refund_pending_reason: null, notified_at: iso(now), updated_at: iso(now), raw_response: { ...(row.raw_response ?? {}), completed_via: via, awaiting_transfer: false } })
    .eq("id", row.id).neq("status", "paid").select("id").maybeSingle();
  if (error) throw new Error(`refund row update failed: ${error.message}`);
  if (!claimed) return false;
  await deps.admin.from("refund_bank_accounts").update({ purge_after: iso(now + ACCOUNT_PURGE_DAYS * DAY) }).eq("refund_tx_id", row.id);
  await syncOrderRefund(deps, row.order_id, {
    notes: [`PAYUNi 退款完成 ${row.mer_trade_no} NT$${Number(row.amount).toLocaleString()}（${via}）`],
    reason: `PAYUNi 退款完成 NT$${row.amount}`, actorLabel: "PAYUNi",
  });
  return true;
}

export async function failRefundRow(deps: RefundDeps, row: any, reason: string, via: string) {
  if (row.status === "paid" || row.status === "failed") return false;
  await updateRefundRow(deps.admin, row.id, { status: "failed", refund_pending_reason: reason, raw_response: { ...(row.raw_response ?? {}), failed_via: via, awaiting_transfer: false } });
  await syncOrderRefund(deps, row.order_id, {
    notes: [`PAYUNi 退款失敗 ${row.mer_trade_no} NT$${Number(row.amount).toLocaleString()}：${reason}${Number(row.payment_type) === 2 ? "（請旅客於會員中心補填退款帳戶，或由總部代填）" : ""}`],
    reason: `PAYUNi 退款失敗 NT$${row.amount}`, actorLabel: "PAYUNi",
  });
  const order = await orderOf(deps.admin, row.order_id);
  if (order) await notifyRefundIssue(deps, order, [{ mer_trade_no: row.mer_trade_no, amount: Number(row.amount), action: row.raw_response?.action ?? "offline_refund", status: "failed", reason }]);
  return true;
}

// ---------------- 補填 ATM 退款帳戶（轉匯失敗後） ----------------

export async function resubmitBankAccount(
  deps: RefundDeps, input: { order: { id: string; order_number: string; accommodation_id: string }; refundMerTradeNo: string; bankAccount: BankAccountInput; source: RefundSource; actorLabel: string },
): Promise<ExecuteResult> {
  const now = deps.now?.() ?? Date.now();
  const { charges, refunds } = await loadPayuniTxs(deps.admin, input.order.id);
  const failed = refunds.find((r: any) => r.mer_trade_no === input.refundMerTradeNo);
  if (!failed || failed.status !== "failed" || Number(failed.payment_type) !== 2 || failed.raw_response?.superseded) {
    return { ok: false, status: 409, error: "這筆退款目前不需要補填帳戶" };
  }
  if (refunds.some((r: any) => r.status === "pending")) return { ok: false, status: 409, error: "此訂單已有退款處理中，請待完成後再操作" };
  const parent = charges.find((c: any) => c.id === failed.parent_tx_id);
  if (!parent) return { ok: false, status: 409, error: "找不到原付款交易" };
  await maskAccountsWhere(deps.admin, { order_id: input.order.id });
  await deps.admin.from("payment_transactions").update({ raw_response: { ...(failed.raw_response ?? {}), superseded: true }, updated_at: iso(now) }).eq("id", failed.id);
  const merTradeNo = nextRefundMerTradeNo(parent.mer_trade_no, refunds.map((r: any) => r.mer_trade_no));
  const raw = { batch_id: failed.raw_response?.batch_id ?? crypto.randomUUID(), action: "offline_refund", retry_of: failed.mer_trade_no };
  const { data: row, error } = await deps.admin.from("payment_transactions").insert({
    order_id: input.order.id, accommodation_id: input.order.accommodation_id, provider: "payuni", mer_id: parent.mer_id,
    mer_trade_no: merTradeNo, provider_trade_no: parent.provider_trade_no, kind: "refund", payment_type: 2, amount: failed.amount,
    status: "pending", parent_tx_id: parent.id, refund_source: input.source, refund_pending_reason: null, raw_response: raw,
    created_at: iso(now), updated_at: iso(now),
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "退款已送出，請勿重複操作" };
    throw new Error(`refund row insert failed: ${error.message}`);
  }
  const part = await runRefundPart(deps, { id: row.id, mer_trade_no: merTradeNo, amount: Number(failed.amount), raw_response: raw }, parent, { type: "offline_refund" }, input.order, now, input.bankAccount);
  await syncOrderRefund(deps, input.order.id, {
    notes: [`補填退款帳戶並重新送出 ATM 轉匯退款 ${merTradeNo} NT$${Number(failed.amount).toLocaleString()}（${input.actorLabel}）：${partLabel(part)}`],
    reason: "PAYUNi ATM 退款補填帳戶", actorLabel: input.actorLabel,
  });
  return { ok: true, parts: [part], refundedNow: 0, pendingAmount: part.status === "pending" ? part.amount : 0, manualAmount: 0, failedAmount: part.status === "failed" ? part.amount : 0 };
}

/** 帳號只留末 4 碼、戶名只留第一個字＋**（與 migration 註解同一規則） */
export async function maskAccountsWhere(admin: any, where: { order_id?: string; purge_before?: string }) {
  let q = admin.from("refund_bank_accounts").select("id, account_no, holder_name").is("purged_at", null);
  if (where.order_id) q = q.eq("order_id", where.order_id);
  if (where.purge_before) q = q.lte("purge_after", where.purge_before);
  const { data } = await q;
  for (const a of data ?? []) {
    await admin.from("refund_bank_accounts").update({
      account_no: maskAccountNo(a.account_no), holder_name: maskHolderName(a.holder_name), purged_at: new Date().toISOString(),
    }).eq("id", a.id);
  }
  return (data ?? []).length;
}

// ---------------- Notify ----------------

/** payuni-trade-notify：ATM 轉匯退款結果。回傳 null = 不是退款 Notify（交回原付款流程） */
export async function handleRefundTradeNotify(deps: RefundDeps, tx: any, data: Record<string, string>): Promise<{ processed: boolean; error: string | null } | null> {
  const isRefundTx = tx.kind === "refund";
  const hasRefundFields = data.RefundStatus != null || data.RefundAmt != null;
  if (!isRefundTx && !(tx.status === "paid" && hasRefundFields)) return null;
  const { data: rows } = await deps.admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("kind", "refund")
    .eq(isRefundTx ? "id" : "parent_tx_id", tx.id);
  const amt = data.RefundAmt != null ? Number(data.RefundAmt) : null;
  const row = (rows ?? []).filter((r: any) => r.status === "pending" && (amt == null || Number(r.amount) === amt))
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)))[0];
  if (!row) return { processed: true, error: "NO_PENDING_REFUND" };
  const rs = String(data.RefundStatus ?? "");
  if (rs === REFUND_STATUS.DONE && String(data.Status ?? "SUCCESS") === "SUCCESS") {
    await completeRefundRow(deps, row, "trade-notify");
    return { processed: true, error: null };
  }
  if (rs === REFUND_STATUS.CANCELLED || (data.Status != null && data.Status !== "SUCCESS")) {
    await failRefundRow(deps, row, `ATM 轉匯失敗${data.Message ? `：${data.Message}` : ""}`, "trade-notify");
    return { processed: true, error: null };
  }
  return { processed: true, error: null };
}

/** payuni-agent-notify：信用卡退款／取消授權事件（含業主在 PAYUNi 後台自行退款）。不自動取消訂單。 */
export async function handleRefundAgentNotify(deps: RefundDeps, type: string, data: Record<string, string>, accName: string): Promise<{ processed: boolean; error: string | null }> {
  const now = deps.now?.() ?? Date.now();
  let q = deps.admin.from("payment_transactions").select("*").eq("provider", "payuni");
  q = data.TradeNo ? q.eq("provider_trade_no", data.TradeNo) : q.eq("mer_trade_no", String(data.MerTradeNo ?? ""));
  const { data: txs } = await q;
  const parent = (txs ?? []).find((t: any) => t.kind !== "refund" && t.kind !== "cancel");
  if (!parent) return { processed: false, error: "UNKNOWN_TRADE" };
  const { data: rowsRaw } = await deps.admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("kind", "refund").eq("parent_tx_id", parent.id);
  const rows = rowsRaw ?? [];
  const amt = Number(data.RefundAmt ?? data.CloseAmt ?? data.TradeAmt ?? (type === "Cancel" ? parent.amount : NaN));
  if (!Number.isFinite(amt) || amt <= 0) return { processed: false, error: "MISSING_AMOUNT" };

  if (type === "CancelRefund") {
    const row = rows.filter((r: any) => r.status === "paid" && Number(r.amount) === amt).sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    if (!row) return { processed: true, error: "NO_MATCHING_REFUND" };
    await deps.admin.from("payment_transactions").update({ status: "cancelled", updated_at: iso(now), raw_response: { ...(row.raw_response ?? {}), cancelled_via: "agent-notify" } }).eq("id", row.id);
    await syncOrderRefund(deps, parent.order_id, { notes: [`PAYUNi 通知退款已取消 ${row.mer_trade_no} NT$${amt.toLocaleString()}`], reason: "PAYUNi 退款取消", actorLabel: "PAYUNi" });
    await backstageAlert(deps, parent, accName, `PAYUNi 通知退款已取消 NT$${amt.toLocaleString()}（${row.mer_trade_no}），請確認款項`);
    return { processed: true, error: null };
  }

  const pending = rows.filter((r: any) => r.status === "pending" && Number(r.amount) === amt)[0];
  if (pending) {
    await completeRefundRow(deps, pending, `agent-notify ${type}`);
    return { processed: true, error: null };
  }
  const recent = rows.find((r: any) => r.status === "paid" && Number(r.amount) === amt && r.raw_response?.agent_execute_time === (data.ExecuteTime ?? null));
  if (recent || rows.some((r: any) => r.status === "paid" && Number(r.amount) === amt && r.refund_source !== "payuni_backstage" && now - Date.parse(r.updated_at ?? r.created_at) < DAY)) {
    return { processed: true, error: null };
  }
  // 業主在 PAYUNi 後台自行退款：補登退款列＋訂單備註＋通知＋告警，不取消訂單
  const merTradeNo = nextRefundMerTradeNo(parent.mer_trade_no, rows.map((r: any) => r.mer_trade_no));
  const { error } = await deps.admin.from("payment_transactions").insert({
    order_id: parent.order_id, accommodation_id: parent.accommodation_id, provider: "payuni", mer_id: parent.mer_id,
    mer_trade_no: merTradeNo, provider_trade_no: parent.provider_trade_no, kind: "refund", payment_type: parent.payment_type,
    amount: amt, status: "paid", parent_tx_id: parent.id, refund_source: "payuni_backstage", notified_at: iso(now),
    raw_response: { action: type === "Cancel" ? "cancel" : "close_refund", agent_notify_type: type, agent_execute_time: data.ExecuteTime ?? null },
    created_at: iso(now), updated_at: iso(now),
  });
  if (error && error.code !== "23505") throw new Error(`backstage refund insert failed: ${error.message}`);
  if (error) return { processed: true, error: null };
  await syncOrderRefund(deps, parent.order_id, {
    notes: [`PAYUNi 後台退款補登 ${merTradeNo} NT$${amt.toLocaleString()}（${type}，由 PAYUNi 通知；訂單狀態未變更）`],
    reason: "PAYUNi 後台退款補登", actorLabel: "PAYUNi",
  });
  const order = await orderOf(deps.admin, parent.order_id);
  const msg = `訂單 ${order?.order_number ?? ""} 在 PAYUNi 後台被退款 NT$${amt.toLocaleString()}（原交易 ${parent.mer_trade_no}），系統已補登退款紀錄，訂單未自動取消，請確認是否需要取消訂單。`;
  await deps.admin.from("notifications").insert({ accommodation_id: parent.accommodation_id, order_id: parent.order_id, type: "payment", title: "PAYUNi 後台退款", description: msg, is_read: false });
  await backstageAlert(deps, parent, accName, msg);
  return { processed: true, error: null };
}

async function backstageAlert(deps: RefundDeps, parent: any, accName: string, msg: string) {
  await deps.sendAlert(`[PAYUNi] ${accName} 退款通知 ${parent.mer_trade_no}`, `<p>${esc(msg)}</p>`)
    .catch((e) => console.error(`[payuniRefund] alert failed: ${e instanceof Error ? e.message : e}`));
}

// ---------------- sweep ----------------

/** payuni-trade-query sweep：重送暫緩的退款、處理中逾 7 天告警（每筆一次）、帳戶到期遮罩 */
export async function sweepRefunds(deps: RefundDeps, now: number) {
  const { data: rows } = await deps.admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("kind", "refund").eq("status", "pending");
  const retried: string[] = [];
  const staleAlerted: string[] = [];
  for (const row of rows ?? []) {
    const action = row.raw_response?.action;
    if (action === "pending") {
      try {
        const { data: parent } = await deps.admin.from("payment_transactions").select("*").eq("id", row.parent_tx_id).maybeSingle();
        const q = parent ? await queryTrade(deps, parent, now) : null;
        if (parent && q) {
          const { data: sibs } = await deps.admin.from("payment_transactions").select("*").eq("provider", "payuni").eq("kind", "refund").eq("parent_tx_id", parent.id);
          const others = (sibs ?? []).filter((s: any) => s.id !== row.id);
          const remain = remainOf(parent, q, others);
          const next = Number(row.amount) > remain
            ? { type: "manual" as const, reason: `PAYUNi 剩餘可退 NT$${remain}，不足退款金額，請人工處理` }
            : decideRefundAction(parent, q, Number(row.amount), remain, await backSetUnCreditRefund(deps.admin, parent.accommodation_id), now);
          if (next.type === "cancel" || next.type === "close_refund" || next.type === "manual") {
            const part = await (next.type === "manual"
              ? deps.admin.from("payment_transactions").update({ refund_pending_reason: next.reason, raw_response: { ...row.raw_response, action: "manual" }, updated_at: iso(now) }).eq("id", row.id).then(() => ({ status: "pending" }))
              : runRefundPart(deps, row, parent, next, { id: row.order_id }, now, null));
            if (part.status === "paid") {
              await syncOrderRefund(deps, row.order_id, { notes: [`PAYUNi 暫緩退款已送出 ${row.mer_trade_no} NT$${Number(row.amount).toLocaleString()}`], reason: "PAYUNi 退款（sweep 重送）", actorLabel: "PAYUNi" });
            } else if (part.status === "failed") {
              await failRefundRow(deps, row, (part as PartResult).reason ?? "PAYUNi 退款失敗", "sweep");
            } else {
              await syncOrderRefund(deps, row.order_id, { reason: "PAYUNi 退款轉人工", actorLabel: "PAYUNi" });
            }
            retried.push(row.mer_trade_no);
            continue;
          }
        }
      } catch (e) {
        console.error(`[payuni-sweep] refund retry ${row.mer_trade_no} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (now - Date.parse(row.created_at) > REFUND_STALE_DAYS * DAY && !row.raw_response?.stale_alerted) {
      try {
        const sent = await deps.sendAlert(`[PAYUNi] 退款處理中逾 ${REFUND_STALE_DAYS} 天 ${row.mer_trade_no}`,
          `<p>退款 ${esc(row.mer_trade_no)}（NT$${row.amount}）建立超過 ${REFUND_STALE_DAYS} 天仍未完成：${esc(row.refund_pending_reason ?? "等待 PAYUNi 結果")}。請至付款稽核頁或 PAYUNi 後台確認。</p>`);
        if (sent === false) continue;
        await deps.admin.from("payment_transactions").update({ raw_response: { ...(row.raw_response ?? {}), stale_alerted: true }, updated_at: iso(now) }).eq("id", row.id);
        staleAlerted.push(row.mer_trade_no);
      } catch (e) {
        console.error(`[payuni-sweep] refund stale alert ${row.mer_trade_no} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  const masked = await maskAccountsWhere(deps.admin, { purge_before: iso(now) });
  return { refundRetried: retried, refundStaleAlerted: staleAlerted, accountsMasked: masked };
}
