// 原付款方式（ATM／銀行匯款／信用卡）判定 — server 端稽核與事件文案唯一來源。
//
// ⚠️ 規則必須與前台 src/lib/groupBuyPayment.ts → paymentMethodKind() 完全一致
//    （測試 src/test/payment-method-audit.test.ts 會逐一比對兩者結果）。
//
// 重點：ATM 與銀行匯款的 payment_provider 同為 manual，退款通道也同為人工銀行退款，
//      但「原付款方式」必須可從 audit / event 直接區分，禁止只記 provider。

const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer", "atm_vacc"]);
const CARD_METHODS = new Set(["credit_card", "credit_card_3ds", "card", "信用卡"]);
const BANK_METHODS = new Set(["bank", "bank_transfer", "transfer", "manual_transfer", "匯款"]);

export type PaymentMethodKind = "atm" | "bank" | "card" | "unknown";

export interface PaymentMethodOrderShape {
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  payment_provider?: string | null;
}

function methodsOf(o: PaymentMethodOrderShape): string[] {
  return [o.balance_payment_method, o.payment_method, o.deposit_payment_method].filter(Boolean) as string[];
}

export function paymentMethodKind(o: PaymentMethodOrderShape | null | undefined): PaymentMethodKind {
  if (!o) return "unknown";
  const methods = methodsOf(o);
  if (methods.some((m) => ATM_METHODS.has(m))) return "atm";
  if (methods.some((m) => CARD_METHODS.has(m))) return "card";
  if (methods.some((m) => BANK_METHODS.has(m))) return "bank";
  if (o.room_charge_rec_trade_id || o.payment_provider === "tappay") return "card";
  if (o.payment_provider === "manual") return "bank";
  return "unknown";
}

export const PAYMENT_METHOD_KIND_LABEL: Record<PaymentMethodKind, string> = {
  atm: "ATM 虛擬帳號",
  bank: "銀行匯款",
  card: "信用卡",
  unknown: "未指定付款方式",
};

export function paymentMethodLabel(o: PaymentMethodOrderShape | null | undefined): string {
  return PAYMENT_METHOD_KIND_LABEL[paymentMethodKind(o)];
}

/** 退款通道（與原付款方式分開，不得互相覆蓋） */
export function refundChannelKey(isCardOrder: boolean): "tappay_card_refund" | "manual_bank_refund" {
  return isCardOrder ? "tappay_card_refund" : "manual_bank_refund";
}

export function refundChannelLabel(isCardOrder: boolean): string {
  return isCardOrder ? "原信用卡退刷（TapPay）" : "人工匯款退款";
}

/** audit_logs.details 的付款方式欄位（原始 enum 必留，不可只留中文 display） */
export function auditPaymentFields(o: PaymentMethodOrderShape, isCardOrder: boolean) {
  const kind = paymentMethodKind(o);
  return {
    payment_provider: o.payment_provider ?? null,
    payment_method: o.payment_method ?? null,
    deposit_payment_method: o.deposit_payment_method ?? null,
    balance_payment_method: o.balance_payment_method ?? null,
    payment_method_kind: kind,
    original_payment_method: o.payment_method ?? kind,
    original_payment_method_label: PAYMENT_METHOD_KIND_LABEL[kind],
    refund_channel: refundChannelKey(isCardOrder),
    refund_channel_label: refundChannelLabel(isCardOrder),
  };
}

/**
 * group_buy_payment_events.refunded 的第一段文字：原付款方式－退款方式。
 * ATM 與銀行匯款必須可從文字直接區分。
 */
export function refundedEventSourceNote(
  o: PaymentMethodOrderShape,
  isCardOrder: boolean,
  recTradeId?: string | null,
): string {
  if (isCardOrder) {
    return `原信用卡退刷（TapPay${recTradeId ? ` ${recTradeId}` : ""}）`;
  }
  const kind = paymentMethodKind(o);
  const source = kind === "atm"
    ? "ATM 虛擬帳號"
    : kind === "bank"
    ? "銀行匯款"
    : PAYMENT_METHOD_KIND_LABEL[kind];
  return `${source}－人工匯款退款`;
}
