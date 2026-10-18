// PAYUNi W7：後台取消退款、會員取消、payuni-refund API 的核心邏輯（依賴注入，方便 mock 測試）。
// TapPay 訂單不會進入本檔；呼叫端以 isPayuniOrder 分流。
// deno-lint-ignore-file no-explicit-any
import { buildCancelOrderPatch } from "./patchBuilders.ts";
import { PAYUNI_ATM_METHOD, PAYUNI_PAYMENT_METHOD } from "./orderPaymentSuccess.ts";
import { quoteOrderRefund, resolveRefundAmount, type RefundQuote } from "./refundQuote.ts";
import {
  executePayuniRefund, loadPayuniTxs, maskAccountNo, refundTotals, resubmitBankAccount, validateBankAccount,
  type BankAccountInput, type ExecuteResult, type RefundDeps,
} from "./payuniRefund.ts";

export interface CancelDeps extends RefundDeps {
  sendCancelEmail: (body: Record<string, unknown>) => Promise<unknown>;
  push: (orderId: string, event: string, data: Record<string, unknown>) => Promise<unknown>;
  createManualReviewTask?: (params: Record<string, unknown>) => Promise<unknown>;
}
type Res = { status: number; body: Record<string, unknown> };
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });

const PAYUNI_METHODS = new Set([PAYUNI_PAYMENT_METHOD, PAYUNI_ATM_METHOD]);
export function isPayuniOrder(o: { payment_method?: string | null; deposit_payment_method?: string | null; balance_payment_method?: string | null }) {
  return [o.payment_method, o.deposit_payment_method, o.balance_payment_method].some((m) => !!m && PAYUNI_METHODS.has(m));
}

async function atmAutoEnabled(admin: any, accommodationId: string) {
  const { data } = await admin.from("accommodation_payuni_private").select("payuni_settings").eq("accommodation_id", accommodationId).maybeSingle();
  return String(data?.payuni_settings?.backSetting?.BackSetUnCreditRefund ?? "") === "1";
}

/** 退款試算＋是否需要 ATM 退款帳戶（最後付款先退的那幾筆含 ATM 且商店啟用自動轉匯） */
export async function payuniQuote(deps: RefundDeps, order: any, opts: { freeCancelDays?: number; amount?: number } = {}) {
  const { charges, refunds } = await loadPayuniTxs(deps.admin, order.id);
  const t = refundTotals(charges, refunds);
  const q = quoteOrderRefund({ order, collected: t.collected, refunded: t.refunded, freeCancelDays: opts.freeCancelDays });
  const atmAuto = await atmAutoEnabled(deps.admin, order.accommodation_id);
  const hasAtm = charges.some((c: any) => Number(c.payment_type) === 2);
  return { q, t, atmAuto, needsBankAccount: atmAuto && hasAtm, hasPending: refunds.some((r: any) => r.status === "pending") };
}

function parseAccount(raw: unknown): { ok: true; value: BankAccountInput | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  const v = validateBankAccount(raw);
  return v.ok ? { ok: true, value: v.value } : v;
}

const execError = (r: Extract<ExecuteResult, { ok: false }>) =>
  res(r.status, { success: false, message: r.error, ...(r.needsBankAccount ? { needsBankAccount: true } : {}) });

// ---------------- 後台取消（cancel-order-with-refund 的 PAYUNi 分支） ----------------

export async function handlePayuniAdminCancel(deps: CancelDeps, order: any, body: any, userEmail: string): Promise<Res> {
  const { q, t, atmAuto, needsBankAccount } = await payuniQuote(deps, order);
  const base = {
    quote: q.quote, policy: q.quote.policy, suggestedRefund: q.suggested, paidAmount: t.collected, alreadyRefunded: t.refunded,
    remainingRefundable: q.limit, requiresManualReview: q.quote.requiresManualReview,
    payuni: { provider: "payuni", atmAutoRefund: atmAuto, needsBankAccount, pendingRefund: t.pending },
  };
  if (body.mode === "quote") return res(200, { success: true, ...base });

  const action = body.refundAction;
  if (!["auto_refund", "mark_manual_refund", "no_refund"].includes(action)) return res(400, { success: false, message: "缺少必要參數" });
  const nowIso = new Date(deps.now?.() ?? Date.now()).toISOString();
  const auditPrefix = `🔒 [${nowIso}] ${userEmail} 取消訂單`;
  const actor = `取消退款（操作者 ${userEmail}）`;
  let refundAmount = q.suggested;
  let override = false;
  let overrideReason = "";
  if (action !== "no_refund") {
    if (action === "auto_refund" && q.quote.requiresManualReview && !Number.isFinite(Number(body.refundAmount))) {
      return res(400, { success: false, needsManualReview: true, quote: q.quote, message: "此訂單無法自動判定取消政策（歷史訂單），請人工確認退款金額後再送出。" });
    }
    const r = resolveRefundAmount({ role: "admin", requested: body.refundAmount, overrideReason: body.overrideReason, q });
    if (!r.ok) return res(400, { success: false, message: r.message, suggestedRefund: r.suggested, ...(r.requiresReason ? { requiresReason: true } : {}) });
    ({ amount: refundAmount, override, reason: overrideReason } = r);
  }
  const policyNote = `取消政策：${q.quote.policy}（${q.quote.policyReason}）／距入住 ${q.quote.daysBefore} 天／比例 ${q.quote.refundPercent}%／` +
    `已收 NT$${t.collected.toLocaleString()}／已退 NT$${t.refunded.toLocaleString()}／最高可退 NT$${q.limit.toLocaleString()}／` +
    `建議退款 NT$${q.suggested.toLocaleString()}／實際處理 NT$${refundAmount.toLocaleString()}` +
    (override ? `／⚠️ 人工調整（操作者 ${userEmail}，原因：${overrideReason}）` : "");

  let refunded = 0;
  let needManual = action === "mark_manual_refund" && refundAmount > 0;
  let resultNote = "";
  if (action === "auto_refund") {
    const acct = parseAccount(body.bankAccount);
    if (!acct.ok) return res(400, { success: false, message: acct.error });
    const r = await executePayuniRefund(deps, {
      order, amount: refundAmount, source: "admin", actorLabel: actor, bankAccount: acct.value, notes: [policyNote],
    });
    if (!r.ok) return execError(r);
    if (r.failedAmount === refundAmount) {
      return res(200, { success: false, message: `PAYUNi 退款失敗，訂單未取消：${r.parts.map((p) => p.reason).filter(Boolean).join("；")}`, parts: r.parts });
    }
    refunded = r.refundedNow + r.pendingAmount;
    needManual = r.manualAmount + r.failedAmount > 0;
    resultNote = `${auditPrefix}，PAYUNi 退款 NT$${refundAmount.toLocaleString()}（完成 NT$${r.refundedNow.toLocaleString()}／處理中 NT$${r.pendingAmount.toLocaleString()}／人工 NT$${r.manualAmount.toLocaleString()}／失敗 NT$${r.failedAmount.toLocaleString()}）`;
  } else if (action === "mark_manual_refund") {
    resultNote = `${auditPrefix}，需手動退款 NT$${refundAmount.toLocaleString()}（付款方式：${order.payment_method}）⚠️ 請聯絡客人退款`;
  } else {
    resultNote = `${auditPrefix}${t.collected - t.refunded > 0 ? `（保留已收 NT$${(t.collected - t.refunded).toLocaleString()}）` : ""}，未退款`;
  }

  const { data: fresh } = await deps.admin.from("orders").select("notes").eq("id", order.id).maybeSingle();
  const notes = `${fresh?.notes ?? ""}\n${resultNote}${action === "auto_refund" ? "" : `\n🔒 [${nowIso}] ${policyNote}`}`.replace(/^\n/, "");
  const patch = buildCancelOrderPatch({ nowIso, notes, refundAction: action === "auto_refund" ? "payuni" : action, refundSucceeded: false, paidAmount: t.collected, refundAmount, recTradeId: null });
  const { error } = await deps.admin.rpc("update_order_with_context", {
    p_order_id: order.id, p_patch: patch, p_source: "admin_cancel_refund",
    p_reason: `取消訂單：${action === "auto_refund" ? `PAYUNi 退款 NT$${refundAmount}` : action === "mark_manual_refund" ? `需手動退款 NT$${refundAmount}` : "未退款"}`,
    p_actor_label: actor, p_actor_type: "system",
  });
  if (error) return res(500, { success: false, message: action === "auto_refund" ? `已送出 PAYUNi 退款但訂單狀態更新失敗，請聯繫工程師（訂單 ${order.order_number}）` : "訂單更新失敗" });
  if (action === "mark_manual_refund" && refundAmount > 0) {
    await deps.admin.from("notifications").insert({
      accommodation_id: order.accommodation_id, order_id: order.id, type: "refund_failed", title: "PAYUNi 退款需人工處理",
      description: `訂單 ${order.order_number} 取消後應退 NT$${refundAmount.toLocaleString()}，後台標記手動退款，請至 PAYUNi 後台或以人工方式退款。`, is_read: false,
    });
  }
  await afterCancel(deps, order.id, { chargedFee: Math.max(0, t.collected - t.refunded - refunded), refunded, needManual, triggerSource: "admin_cancel" });
  return res(200, {
    success: true, refunded, suggestedRefund: q.suggested, manualOverride: override, quote: q.quote,
    message: action === "auto_refund" ? `已取消訂單並送出 PAYUNi 退款 NT$${refundAmount.toLocaleString()}${needManual ? "（部分需人工處理）" : ""}`
      : action === "mark_manual_refund" ? "已取消訂單，請手動退款給客人" : "已取消訂單",
  });
}

async function afterCancel(deps: CancelDeps, orderId: string, mail: Record<string, unknown>) {
  try { await deps.sendCancelEmail({ orderId, ...mail }); } catch (e) { console.error("[payuniCancel] email failed", e); }
  try { await deps.push(orderId, "order_cancelled", { amount: mail.refunded }); } catch (e) { console.error("[payuniCancel] push failed", e); }
}

// ---------------- 會員取消（member-order-manage 的 PAYUNi 分支） ----------------

export async function handlePayuniMemberCancel(
  deps: CancelDeps, order: any, body: any, ctx: { email: string; today: string; freeCancelDays: number },
): Promise<Res> {
  const { q, t, needsBankAccount } = await payuniQuote(deps, order, { freeCancelDays: ctx.freeCancelDays });
  if (body.action === "cancel_quote") {
    return res(200, { success: true, quote: q.quote, policy: q.quote.policy, freeCancelDays: ctx.freeCancelDays, payuni: { needsBankAccount: needsBankAccount && q.suggested > 0, refundAmount: q.suggested } });
  }
  if (order.check_in_date < ctx.today) return res(400, { success: false, message: "已過入住日無法線上取消，請直接聯繫住宿" });
  const stamp = new Date(deps.now?.() ?? Date.now()).toISOString().slice(0, 16).replace("T", " ");
  const lines = [
    `🔒 ${stamp} 會員於前台自行取消訂單（${ctx.email}）${body.reason ? `：${body.reason}` : ""}`,
    `🔒 取消政策（${q.quote.policy}／${q.quote.policyReason}）：距入住 ${q.quote.daysBefore} 天，退款比例 ${q.quote.refundPercent}%（${q.quote.label}）`,
  ];
  let refunded = 0;
  let needManual = false;
  if (q.limit > 0 && q.quote.requiresManualReview) {
    needManual = true;
    lines.push(`🔒 ${q.quote.label}（實收 NT$${t.collected.toLocaleString()}），已轉人工確認，未執行自動退款`);
    await deps.createManualReviewTask?.({
      orderId: order.id, accommodationId: order.accommodation_id, orderNumber: order.order_number,
      taskType: "cancellation_policy_unknown", reasonCode: "cancellation_policy_unknown", quoteSnapshot: { quote: q.quote },
    })?.catch((e: unknown) => console.error("[payuniCancel] manual review task failed", e));
  } else if (q.suggested > 0) {
    const acct = parseAccount(body.bankAccount);
    if (!acct.ok) return res(400, { success: false, message: acct.error });
    // 金額一律由後端依政策計算，忽略前端金額
    const amt = resolveRefundAmount({ role: "member", q });
    if (!amt.ok) return res(400, { success: false, message: amt.message });
    const r = await executePayuniRefund(deps, { order, amount: amt.amount, source: "member", actorLabel: ctx.email, bankAccount: acct.value });
    if (!r.ok) return execError(r);
    refunded = r.refundedNow + r.pendingAmount;
    needManual = r.manualAmount + r.failedAmount > 0;
    lines.push(`🔒 PAYUNi 退款 NT$${amt.amount.toLocaleString()}（完成 NT$${r.refundedNow.toLocaleString()}／處理中 NT$${r.pendingAmount.toLocaleString()}${needManual ? "／部分待人工處理" : ""}）`);
  } else {
    lines.push(q.limit > 0 ? "🔒 依取消政策不予退款" : "🔒 訂單尚未收款，取消不產生退款");
  }
  const { data: fresh } = await deps.admin.from("orders").select("notes").eq("id", order.id).maybeSingle();
  const { error } = await deps.admin.rpc("update_order_with_context", {
    p_order_id: order.id,
    p_patch: {
      order_status: "cancelled", cancelled_at: new Date(deps.now?.() ?? Date.now()).toISOString(),
      cancellation_fee_amount: q.quote.retainedAmount, cancellation_fee_percent: q.quote.feePercent,
      notes: fresh?.notes ? `${fresh.notes}\n${lines.join("\n")}` : lines.join("\n"),
      ...(needManual && refunded === 0 && q.limit > 0 ? { refund_status: "pending_manual" } : {}),
    },
    p_source: "member_self_cancel", p_reason: body.reason ?? null, p_actor_label: ctx.email, p_actor_type: "system",
  });
  if (error) return res(500, { success: false, message: error.message });
  const chargedFee = Math.min(t.collected, q.quote.retainedAmount);
  await afterCancel(deps, order.id, { reason: body.reason ?? null, chargedFee, refunded, needManual, triggerSource: "member_cancel" });
  return res(200, {
    success: true, quote: q.quote, chargedFee, refunded, needManual,
    message: needManual ? "訂單已取消，款項將由客服人員協助處理"
      : refunded > 0 ? `訂單已取消，退款 NT$${refunded.toLocaleString()} 處理中／已送出`
      : q.quote.feeAmount === 0 ? "訂單已取消，符合免費取消未扣款" : "訂單已取消",
  });
}

// ---------------- payuni-refund API ----------------

export interface RefundCaller {
  role: "admin" | "member";
  label: string;
  canAccess: (order: any) => Promise<boolean>;
}
const ORDER_COLS = "id, order_number, accommodation_id, member_id, guest_email, order_status, payment_status, paid_amount, refunded_amount, final_price, deposit_amount, check_in_date, order_source, payment_provider, payment_method, deposit_payment_method, balance_payment_method, room_charge_status, notes";

export async function handlePayuniRefundApi(deps: RefundDeps, body: any, caller: RefundCaller): Promise<Res> {
  const action = String(body?.action ?? "");
  const byId = typeof body?.order_id === "string" && body.order_id;
  const byNo = typeof body?.order_number === "string" && body.order_number;
  if (!byId && !byNo) return res(400, { error: "參數不正確" });
  const { data: order } = await deps.admin.from("orders").select(ORDER_COLS).eq(byId ? "id" : "order_number", byId || byNo).maybeSingle();
  if (!order || !(await caller.canAccess(order))) return res(404, { error: "找不到訂單" });
  if (!isPayuniOrder(order)) return res(400, { error: "此訂單不是 PAYUNi 付款" });

  if (action === "status") return res(200, { ok: true, ...(await refundStatus(deps, order, caller.role)) });
  if (action === "quote") {
    if (caller.role !== "admin") return res(403, { error: "Forbidden" });
    const { q, t, atmAuto, needsBankAccount, hasPending } = await payuniQuote(deps, order);
    return res(200, { ok: true, suggested: q.suggested, limit: q.limit, collected: t.collected, refunded: t.refunded, pending: t.pending, quote: q.quote, atmAutoRefund: atmAuto, needsBankAccount, hasPending });
  }
  if (action === "refund") {
    if (caller.role !== "admin") return res(403, { error: "Forbidden" });
    const { q } = await payuniQuote(deps, order);
    const amt = resolveRefundAmount({ role: "admin", requested: body.amount, overrideReason: body.reason, q });
    if (!amt.ok) return res(400, { error: amt.message, ...(amt.requiresReason ? { requiresReason: true } : {}), suggested: amt.suggested, limit: amt.limit });
    const acct = parseAccount(body.bank_account);
    if (!acct.ok) return res(400, { error: acct.error });
    const r = await executePayuniRefund(deps, {
      order, amount: amt.amount, source: "admin", actorLabel: caller.label, bankAccount: acct.value,
      notes: amt.override ? [`退款金額與建議（NT$${q.suggested.toLocaleString()}）不同，原因：${amt.reason}`] : [],
    });
    return r.ok ? res(200, { ...r }) : res(r.status, { error: r.error, ...(r.needsBankAccount ? { needsBankAccount: true } : {}) });
  }
  if (action === "resubmit_bank_account") {
    const acct = parseAccount(body.bank_account);
    if (!acct.ok || !acct.value) return res(400, { error: acct.ok ? "請填寫退款帳戶" : acct.error });
    const r = await resubmitBankAccount(deps, {
      order, refundMerTradeNo: String(body.refund_mer_trade_no ?? ""), bankAccount: acct.value,
      source: caller.role === "admin" ? "admin" : "member", actorLabel: caller.label,
    });
    return r.ok ? res(200, { ...r }) : res(r.status, { error: r.error });
  }
  return res(400, { error: "不支援的動作" });
}

async function refundStatus(deps: RefundDeps, order: any, role: "admin" | "member") {
  const { charges, refunds } = await loadPayuniTxs(deps.admin, order.id);
  const ids = refunds.map((r: any) => r.id);
  const { data: accts } = ids.length
    ? await deps.admin.from("refund_bank_accounts").select("refund_tx_id, bank_code, account_no, holder_name, purged_at").in("refund_tx_id", ids)
    : { data: [] };
  const rows = refunds
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((r: any) => {
      const a = (accts ?? []).find((x: any) => x.refund_tx_id === r.id);
      return {
        mer_trade_no: r.mer_trade_no, amount: r.amount, status: r.status, action: r.raw_response?.action ?? null,
        reason: r.refund_pending_reason ?? null, source: r.refund_source ?? null, created_at: r.created_at,
        can_resubmit: r.status === "failed" && Number(r.payment_type) === 2 && !r.raw_response?.superseded,
        ...(role === "admin" ? { parent_mer_trade_no: charges.find((c: any) => c.id === r.parent_tx_id)?.mer_trade_no ?? null } : {}),
        bank: a ? { bank_code: a.bank_code, account_masked: maskAccountNo(String(a.account_no)), holder_masked: `${Array.from(String(a.holder_name))[0] ?? ""}**` } : null,
      };
    });
  const t = refundTotals(charges, refunds);
  return { collected: t.collected, refunded: t.refunded, pending: t.pending, rows };
}
