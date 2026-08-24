// 團購付款／退款狀態判定（唯一 source of truth = orders 表）
//
// 重要：不得再用 group_buy_payment_events（例如是否存在 admin_confirmed）判斷付款狀態，
// events 僅作為 audit trail。

export interface OrderPaymentFields {
  order_status?: string | null;
  payment_status?: string | null;
  paid_amount?: number | null;
  deposit_amount?: number | null;
  refund_status?: string | null;
  refunded_amount?: number | null;
  /** 已扣除的退款處理費（人工銀行退款；信用卡為 0） */
  refund_fee_amount?: number | null;
  payment_provider?: string | null;
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
}


export type DepositState = "unpaid" | "partial" | "paid";

const num = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

/** 訂金三態：來自 orders.paid_amount / deposit_amount / payment_status */
export function depositState(o: OrderPaymentFields): DepositState {
  const paid = num(o.paid_amount);
  const deposit = num(o.deposit_amount);
  if (o.payment_status === "paid") return "paid";
  if (paid <= 0) return "unpaid";
  if (deposit > 0 && paid < deposit) return "partial";
  return "paid";
}

export const DEPOSIT_STATE_LABEL: Record<DepositState, string> = {
  unpaid: "未付",
  partial: "部分付款",
  paid: "已付",
};

export const DEPOSIT_STATE_VARIANT: Record<DepositState, "default" | "secondary" | "outline"> = {
  unpaid: "outline",
  partial: "secondary",
  paid: "default",
};

export type RefundState = "none" | "pending" | "partial" | "refunded" | "failed";

/** 退款狀態：沿用 orders.refund_status / refunded_amount，未取消的訂單不顯示 */
export function refundState(o: OrderPaymentFields): RefundState {
  const paid = num(o.paid_amount);
  const refunded = num(o.refunded_amount) + num(o.refund_fee_amount);
  const status = String(o.refund_status ?? "none");
  if (status === "failed") return "failed";
  if (refunded > 0 && refunded >= paid) return "refunded";
  if (status === "refunded") return "refunded";
  if (refunded > 0) return "partial";
  if (status === "pending" || status === "pending_manual") return "pending";
  if (status === "partial_refunded") return "partial";
  // 已取消但仍有未退回的已收款 → 視為待退款（相容尚未寫入 pending 的舊資料）
  if (o.order_status === "cancelled" && paid - refunded > 0) return "pending";
  return "none";
}

export const REFUND_STATE_LABEL: Record<RefundState, string> = {
  none: "不需退款",
  pending: "待退款",
  partial: "部分退款",
  refunded: "已退款",
  failed: "退款失敗／需人工處理",
};

export const REFUND_STATE_VARIANT: Record<RefundState, "default" | "secondary" | "outline" | "destructive"> = {
  none: "outline",
  pending: "destructive",
  partial: "secondary",
  refunded: "secondary",
  failed: "destructive",
};

/** 已沖銷 = 實退旅客 + 已扣手續費；剩餘可退 = 已收 − 已沖銷 */
export function settledRefund(o: OrderPaymentFields): number {
  return num(o.refunded_amount) + num(o.refund_fee_amount);
}

export function remainingRefundable(o: OrderPaymentFields): number {
  return Math.max(0, num(o.paid_amount) - settledRefund(o));
}

/** 是否顯示「處理退款」：已取消、仍有可退金額、且未標記為已全額退款 */
export function canProcessRefund(o: OrderPaymentFields): boolean {
  return (
    o.order_status === "cancelled" &&
    remainingRefundable(o) > 0 &&
    o.refund_status !== "refunded"
  );
}

export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  manual: "銀行匯款",
  tappay: "TapPay 信用卡",
};

/** 歷史訂單一律以 orders 資料為準，不用目前 campaign 設定覆蓋 */
export function paymentProviderLabel(o: OrderPaymentFields): string {
  return PAYMENT_PROVIDER_LABEL[String(o.payment_provider ?? "manual")] ?? String(o.payment_provider);
}

// ── 原付款方式 vs 退款方式（兩者不可混用）────────────────────────────
// SoT = orders.payment_method（含 deposit_/balance_payment_method），
// 不得只看 payment_provider：ATM 與銀行匯款同為 manual，只看 provider 會把 ATM 誤顯示為銀行匯款。

const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer", "atm_vacc"]);
const CARD_METHODS = new Set(["credit_card", "credit_card_3ds", "card", "信用卡"]);
const BANK_METHODS = new Set(["bank", "bank_transfer", "transfer", "manual_transfer", "匯款"]);

export type PaymentMethodKind = "atm" | "bank" | "card" | "unknown";

function methodsOf(o: OrderPaymentFields): string[] {
  return [o.balance_payment_method, o.payment_method, o.deposit_payment_method].filter(Boolean) as string[];
}

/** 判定「旅客原本如何付款」 */
export function paymentMethodKind(o: OrderPaymentFields | null | undefined): PaymentMethodKind {
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

/** 原付款方式顯示文字 */
export function paymentMethodLabel(o: OrderPaymentFields | null | undefined): string {
  return PAYMENT_METHOD_KIND_LABEL[paymentMethodKind(o)];
}

/** 退款管道顯示文字（與原付款方式分開，不得反向覆蓋） */
export function refundChannelLabel(o: OrderPaymentFields | null | undefined): string {
  return paymentMethodKind(o) === "card" ? "原信用卡退刷（TapPay）" : "人工匯款退款";
}

