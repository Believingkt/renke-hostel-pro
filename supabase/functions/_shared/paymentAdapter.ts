// 付款 Provider 抽象層（最小架構，本輪僅啟用 manual）
//
// 語意界線（務必維持）：
//   payment_provider = 處理付款的「系統」→ manual（人工銀行匯款）／tappay
//   payment_method   = 付款的「工具」  → bank_transfer / atm / cash / credit_card ...
// 兩者不可互相取代。
//
// 安全邊界（未來啟用 TapPay 時務必遵守）：
//   團購 TapPay 的請款金額「絕對不得」接受前端傳入的 total／amount。
//   必須由 server 讀 orders 後，以 orders.deposit_amount（訂金）決定 charge amount，
//   因為 process-tappay-payment 在不帶 orderPayload 時不會自行比對 orders.final_price。
//
// 注意：orders 另有一組 deposit_required_amount / deposit_charged_amount ... 屬於
// 「入住保證金 security deposit」，與訂房訂金無關，任何情況都不要混用。
//
// deno-lint-ignore-file no-explicit-any

export type PaymentProvider = "manual" | "tappay";

/** group_buy_campaigns.payment_method 允許值 */
export type CampaignPaymentMethod = "manual_bank_transfer" | "tappay";

export interface OrderPaymentShape {
  payment_provider?: string | null;
  order_source?: string | null;
  paid_amount?: number | null;
  refunded_amount?: number | null;
  deposit_amount?: number | null;
}

/** 訂單的付款 provider：一律以 orders 資料為準，不得用目前 campaign 設定回推歷史訂單 */
export function getPaymentProvider(order: OrderPaymentShape): PaymentProvider {
  return order?.payment_provider === "tappay" ? "tappay" : "manual";
}

/** 活動付款方式 → 建單時要寫入訂單的 provider / method */
export function resolveCampaignPayment(
  campaignPaymentMethod?: string | null,
): { provider: PaymentProvider; paymentMethod: string } {
  if (campaignPaymentMethod === "tappay") {
    // 本輪不啟用：資料結構先支援，實際流程仍未接上。
    return { provider: "tappay", paymentMethod: "credit_card" };
  }
  return { provider: "manual", paymentMethod: "bank_transfer" };
}

/** 剩餘可退金額（一律由 server 讀 orders 重算，不信任前端） */
export function remainingRefundable(order: OrderPaymentShape): number {
  const paid = Math.max(0, Math.round(Number(order?.paid_amount) || 0));
  const refunded = Math.max(0, Math.round(Number(order?.refunded_amount) || 0));
  return Math.max(0, paid - refunded);
}

/**
 * 退款狀態語意（沿用 orders.refund_status，不另建欄位）：
 *   none            不需退款（未收款，或無任何應退金額）
 *   pending         已取消且有已收款尚未退回 → 待退款
 *   partial_refunded 已退部分
 *   refunded        已全額退回
 *   failed / pending_manual 為既有一般訂房流程使用值，此處不覆寫
 */
export type RefundStatus = "none" | "pending" | "partial_refunded" | "refunded";

/** 取消訂單當下應寫入的退款狀態 */
export function refundStatusOnCancel(paid: number, alreadyRefunded: number): RefundStatus {
  const p = Math.max(0, Math.round(paid || 0));
  const r = Math.max(0, Math.round(alreadyRefunded || 0));
  if (p <= 0) return "none";
  if (r >= p) return "refunded";
  if (r > 0) return "partial_refunded";
  return "pending";
}

/** 完成一次退款後的狀態 */
export function refundStatusAfterRefund(paid: number, totalRefunded: number): RefundStatus {
  const p = Math.max(0, Math.round(paid || 0));
  const t = Math.max(0, Math.round(totalRefunded || 0));
  if (p <= 0) return "none";
  if (t >= p) return "refunded";
  if (t > 0) return "partial_refunded";
  return "pending";
}

export interface RefundRequest {
  order: OrderPaymentShape & { id: string };
  amount: number;
  note?: string | null;
}

export interface RefundResult {
  ok: boolean;
  /** manual = 需人工於銀行端完成後由後台登記；tappay = 由金流 API 即時退刷 */
  handledBy: PaymentProvider;
  amount: number;
  message?: string;
  error?: string;
}

export interface SettleRequest {
  order: OrderPaymentShape & { id: string };
  amount: number;
}

export interface PaymentAdapterApi {
  provider: PaymentProvider;
  /** 收款：manual 僅代表「人工確認已收到匯款」，不呼叫任何金流 API */
  settlePayment(req: SettleRequest): Promise<RefundResult>;
  /** 退款：manual 僅代表「人工已於銀行完成退匯，登記入帳」 */
  refundPayment(req: RefundRequest): Promise<RefundResult>;
}

const manualAdapter: PaymentAdapterApi = {
  provider: "manual",
  settlePayment: (req) =>
    Promise.resolve({ ok: true, handledBy: "manual", amount: Math.max(0, Math.round(req.amount || 0)) }),
  refundPayment: (req) =>
    Promise.resolve({ ok: true, handledBy: "manual", amount: Math.max(0, Math.round(req.amount || 0)) }),
};

const tappayAdapter: PaymentAdapterApi = {
  provider: "tappay",
  // 本輪不啟用。未來實作時：settle 需 server 依 orders.deposit_amount 決定金額後呼叫
  // process-tappay-payment；refund 走 _shared/orderRefund.ts 既有 TapPay 退刷包裝。
  settlePayment: () =>
    Promise.resolve({ ok: false, handledBy: "tappay", amount: 0, error: "tappay_not_enabled" }),
  refundPayment: () =>
    Promise.resolve({ ok: false, handledBy: "tappay", amount: 0, error: "tappay_not_enabled" }),
};

export function getPaymentAdapter(order: OrderPaymentShape): PaymentAdapterApi {
  return getPaymentProvider(order) === "tappay" ? tappayAdapter : manualAdapter;
}

export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  manual: "銀行匯款（人工對帳）",
  tappay: "TapPay 線上刷卡",
};
