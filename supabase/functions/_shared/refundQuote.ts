// 金流商無關的退款試算與上限（W7）。TapPay 既有流程不呼叫本檔；PAYUNi 退款一律走這裡。
// 後台：上限 = 已收 − 已退，與政策建議不同時必填原因；會員／旅客：金額一律 = 政策建議（忽略前端金額）。
import { type CancellationQuote, type PolicyOrderShape, quoteCancellation, taipeiToday } from "./cancellationPolicy.ts";

/** PAYUNi 付款方式對應到取消政策既有的卡／ATM 分類，讓同條件的 TapPay／PAYUNi 訂單算出同一個金額 */
const POLICY_METHOD_EQUIV: Record<string, string> = { credit_card_payuni: "credit_card", atm_payuni: "atm" };

export function policyOrderShape<T extends PolicyOrderShape>(order: T): T {
  const map = (m?: string | null) => (m && POLICY_METHOD_EQUIV[m]) || m;
  return {
    ...order,
    payment_method: map(order.payment_method),
    deposit_payment_method: map(order.deposit_payment_method),
    balance_payment_method: map(order.balance_payment_method),
  };
}

export interface RefundQuoteInput {
  order: PolicyOrderShape & { check_in_date: string };
  /** 已收（已完成的付款交易加總） */
  collected: number;
  /** 已退（已完成的退款列加總） */
  refunded: number;
  freeCancelDays?: number;
  today?: string;
}

export interface RefundQuote {
  quote: CancellationQuote;
  suggested: number;
  limit: number;
  collected: number;
  refunded: number;
}

export function quoteOrderRefund(input: RefundQuoteInput): RefundQuote {
  const collected = Math.max(0, Math.round(Number(input.collected) || 0));
  const refunded = Math.max(0, Math.round(Number(input.refunded) || 0));
  const quote = quoteCancellation({
    order: { ...policyOrderShape(input.order), paid_amount: collected },
    checkInDate: String(input.order.check_in_date),
    cancellationDate: input.today ?? taipeiToday(),
    alreadyRefunded: refunded,
    guaranteeBase: Number(input.order.final_price || 0),
    freeCancelDays: input.freeCancelDays,
  });
  const limit = Math.max(0, collected - refunded);
  return { quote, suggested: Math.min(limit, Math.max(0, Math.round(quote.refundAmount))), limit, collected, refunded };
}

export type RefundRole = "admin" | "member";
export type ResolvedAmount =
  | { ok: true; amount: number; override: boolean; reason: string }
  | { ok: false; status: 400; message: string; requiresReason?: boolean; suggested: number; limit: number };

export function resolveRefundAmount(input: {
  role: RefundRole; requested?: unknown; overrideReason?: unknown; q: RefundQuote;
}): ResolvedAmount {
  const { q } = input;
  const fail = (message: string, requiresReason = false): ResolvedAmount =>
    ({ ok: false, status: 400, message, suggested: q.suggested, limit: q.limit, ...(requiresReason ? { requiresReason } : {}) });
  const requested = input.requested;
  const amount = input.role === "member" || requested == null || requested === ""
    ? q.suggested
    : Number(requested);
  if (!Number.isInteger(amount)) return fail("退款金額必須是整數");
  if (amount <= 0) return fail("退款金額必須大於 0");
  if (amount > q.limit) return fail(`退款金額不可超過可退金額 NT$${q.limit.toLocaleString()}（已收 − 已退）`);
  const override = amount !== q.suggested;
  const reason = String(input.overrideReason ?? "").trim();
  if (override && reason.length < 2) {
    return fail(`實際退款金額與系統建議（NT$${q.suggested.toLocaleString()}）不同，請填寫調整原因。`, true);
  }
  return { ok: true, amount, override, reason };
}
