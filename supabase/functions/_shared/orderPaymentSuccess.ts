// 「訂單付款成功」共用：PAYUNi 用的 patch 與副作用（更新訂單、寄信、KOL、推播）。
// patch 以 buildTappayNotifySuccessPatch 為基準，只換 payment_method／balance_payment_method；TapPay 檔案不動。
// deno-lint-ignore-file no-explicit-any
import { buildTappayNotifySuccessPatch } from "./patchBuilders.ts";

export const PAYUNI_PAYMENT_METHOD = "credit_card_payuni";
export const PAYUNI_PAID_LABEL = "信用卡(PAYUNi)";
export const PAYUNI_ATM_METHOD = "atm_payuni";
export const PAYUNI_ATM_PAID_LABEL = "ATM 虛擬帳號轉帳(PAYUNi)";
export type PayuniChannel = "card" | "atm";

export function buildPayuniSuccessPatch(input: {
  newPaymentStatus: string;
  newPaidAmount: number;
  newNotes: string;
  currentOrderStatus: string | null;
  confirmedAtIso: string;
}, channel: PayuniChannel = "card"): Record<string, unknown> {
  const base = buildTappayNotifySuccessPatch({ ...input, isAtm: false }) as Record<string, unknown>;
  const atm = channel === "atm";
  return {
    ...base,
    payment_method: atm ? PAYUNI_ATM_METHOD : PAYUNI_PAYMENT_METHOD,
    balance_payment_method: input.newPaymentStatus === "paid" ? (atm ? PAYUNI_ATM_PAID_LABEL : PAYUNI_PAID_LABEL) : null,
  };
}

export interface PaymentSuccessEffects {
  sendBookingConfirmation: (orderId: string) => Promise<unknown>;
  sendFinalPaymentReceived: (orderId: string, paidThisTime: number) => Promise<unknown>;
  kolWebhook: (orderId: string) => Promise<unknown>;
  push: (orderId: string, event: "order_created" | "payment_success") => Promise<unknown>;
  /** ATM 入帳收據：deposit → auto_atm_deposit；final → auto_atm_final */
  sendAtmPaymentReceived: (orderId: string, paidThisTime: number, kind: "deposit" | "final") => Promise<unknown>;
  /** ATM 取號後的訂房確認信（atm_va_created） */
  sendAtmCreated: (orderId: string) => Promise<unknown>;
}

export interface OrderForPayment {
  id: string;
  order_number: string;
  final_price: number;
  paid_amount: number | null;
  payment_status: string | null;
  order_status: string | null;
  notes: string | null;
  discount_code?: string | null;
}

/** 入帳一筆成功付款；回傳新的付款狀態。副作用失敗只記 log。 */
export async function applyOrderPaymentSuccess(
  admin: any,
  effects: PaymentSuccessEffects,
  order: OrderForPayment,
  amount: number,
  ref: { merTradeNo: string; tradeNo: string | null; authCode: string | null; channel?: PayuniChannel },
  nowIso = new Date().toISOString(),
): Promise<string> {
  const prevPaid = Number(order.paid_amount || 0);
  const newPaid = prevPaid + amount;
  const newStatus = newPaid >= Number(order.final_price) ? "paid" : newPaid > 0 ? "deposit_paid" : (order.payment_status ?? "unpaid");
  const atm = ref.channel === "atm";
  const note = `[PAYUNi${atm ? " ATM" : ""}] ${nowIso} - 付款成功 NT$${amount} (MerTradeNo: ${ref.merTradeNo}${ref.tradeNo ? `, TradeNo: ${ref.tradeNo}` : ""}${ref.authCode ? `, auth_code: ${ref.authCode}` : ""})`;
  const patch = buildPayuniSuccessPatch({
    newPaymentStatus: newStatus,
    newPaidAmount: newPaid,
    newNotes: order.notes ? `${order.notes}\n${note}` : note,
    currentOrderStatus: order.order_status,
    confirmedAtIso: nowIso,
  }, ref.channel ?? "card");
  const { error } = await admin.rpc("update_order_with_context", {
    p_order_id: order.id,
    p_patch: patch,
    p_source: "payuni_trade_notify",
    p_reason: `付款成功 NT$${amount}（MerTradeNo: ${ref.merTradeNo}）`,
    p_actor_label: "PAYUNi",
    p_actor_type: "system",
  });
  if (error) throw new Error(`update_order_with_context failed: ${error.message}`);

  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { console.error(`[orderPaymentSuccess] ${label} failed: ${e instanceof Error ? e.message : e}`); }
  };
  const firstPayment = prevPaid <= 0;
  if (atm) {
    // ATM：確認信已在取號時寄出；入帳只寄收據（同 TapPay ATM），KOL／推播同信用卡
    if (firstPayment && order.discount_code) await safe("kol-webhook", () => effects.kolWebhook(order.id));
    if (firstPayment) await safe("push created", () => effects.push(order.id, "order_created"));
    if (newStatus === "deposit_paid") await safe("atm deposit email", () => effects.sendAtmPaymentReceived(order.id, amount, "deposit"));
    else if (order.payment_status !== "paid" && newStatus === "paid") await safe("atm final email", () => effects.sendAtmPaymentReceived(order.id, amount, "final"));
  } else if (firstPayment) {
    if (order.discount_code) await safe("kol-webhook", () => effects.kolWebhook(order.id));
    await safe("booking email", () => effects.sendBookingConfirmation(order.id));
    await safe("push created", () => effects.push(order.id, "order_created"));
  } else if (order.payment_status !== "paid" && newStatus === "paid") {
    await safe("final payment email", () => effects.sendFinalPaymentReceived(order.id, amount));
  }
  await safe("push paid", () => effects.push(order.id, "payment_success"));
  return newStatus;
}
