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

import {
  buildRefundPatch,
  flagRefundNeedsManual,
  isCardPaidOrder,
  refundOrderCard,
  resolveSyncRecTradeId,
} from "./orderRefund.ts";
import { queryTapPayRecord } from "./tappay.ts";

export type PaymentProvider = "manual" | "tappay";

/** group_buy_campaigns.payment_method 允許值 */
export type CampaignPaymentMethod = "manual_bank_transfer" | "tappay";

export interface OrderPaymentShape {
  payment_provider?: string | null;
  order_source?: string | null;
  paid_amount?: number | null;
  refunded_amount?: number | null;
  /** 已扣除的退款處理費（人工銀行退款用；信用卡一律 0）——同樣屬於已沖銷金額 */
  refund_fee_amount?: number | null;
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

/**
 * 剩餘可退金額（一律由 server 讀 orders 重算，不信任前端）。
 * 已沖銷 = 實退旅客金額 + 已扣除的退款處理費。
 */
export function remainingRefundable(order: OrderPaymentShape): number {
  const paid = Math.max(0, Math.round(Number(order?.paid_amount) || 0));
  const refunded = Math.max(0, Math.round(Number(order?.refunded_amount) || 0));
  const fee = Math.max(0, Math.round(Number(order?.refund_fee_amount) || 0));
  return Math.max(0, paid - refunded - fee);
}

/**
 * 退款狀態語意（沿用 orders.refund_status，不另建欄位）：
 *   none             不需退款（未收款，或無任何應退金額）
 *   pending_manual   已取消且有已收款尚未退回 → 待人工退款（與一般訂房既有值一致）
 *   partial_refunded 已退部分
 *   refunded         已全額退回
 *
 * 寫入端一律使用 pending_manual；舊資料可能存在 "pending"，讀取端需相容。
 */
export type RefundStatus = "none" | "pending_manual" | "partial_refunded" | "refunded";

/** 取消訂單當下應寫入的退款狀態 */
export function refundStatusOnCancel(paid: number, alreadyRefunded: number): RefundStatus {
  const p = Math.max(0, Math.round(paid || 0));
  const r = Math.max(0, Math.round(alreadyRefunded || 0));
  if (p <= 0) return "none";
  if (r >= p) return "refunded";
  if (r > 0) return "partial_refunded";
  return "pending_manual";
}

/** 完成一次退款後的狀態 */
export function refundStatusAfterRefund(paid: number, totalRefunded: number): RefundStatus {
  const p = Math.max(0, Math.round(paid || 0));
  const t = Math.max(0, Math.round(totalRefunded || 0));
  if (p <= 0) return "none";
  if (t >= p) return "refunded";
  if (t > 0) return "partial_refunded";
  return "pending_manual";
}

export interface RefundRequest {
  order: OrderPaymentShape & { id: string };
  amount: number;
  note?: string | null;
  /** TapPay 退刷需要 service-role client（解析原交易、寫 deposit_charges 稽核、建人工待辦） */
  supabase?: any;
  /** 稽核用來源標記 */
  triggerSource?: string;
}

export interface RefundResult {
  ok: boolean;
  /** manual = 需人工於銀行端完成後由後台登記；tappay = 由金流 API 即時退刷 */
  handledBy: PaymentProvider;
  amount: number;
  message?: string;
  error?: string;
  /** 實際退刷所指向的原付款交易編號 */
  recTradeId?: string | null;
  /** true = 結果未知（timeout／網路錯誤）：禁止重試，須由 tappay-sync-refund 對帳回正 */
  needsReconciliation?: boolean;
}

/**
 * 退款前置檢查（純函式，可測）：比對 TapPay 原交易與本地帳務。
 * 只判斷「這筆退款能不能送出、可退上限多少」，不決定法規退款比例。
 */
export function evaluateTappayRefundGate(input: {
  requested: number;
  localRemaining: number;
  tappayFound: boolean;
  tappayAmount: number | null;
  tappayRefunded: number | null;
  localRefunded: number;
}): { ok: boolean; error?: string; message?: string; tappayRemaining: number } {
  const requested = Math.max(0, Math.round(input.requested || 0));
  const tappayAmount = Math.max(0, Math.round(Number(input.tappayAmount) || 0));
  const tappayRefunded = Math.max(0, Math.round(Number(input.tappayRefunded) || 0));
  const tappayRemaining = Math.max(0, tappayAmount - tappayRefunded);

  if (!input.tappayFound) {
    return { ok: false, error: "tappay_query_failed", message: "無法向金流確認原交易狀態，請稍後再試或改人工處理", tappayRemaining: 0 };
  }
  // 金流已有退款但本地尚未同步 → 先對帳，嚴禁再退一次
  if (tappayRefunded > Math.max(0, Math.round(input.localRefunded || 0))) {
    return {
      ok: false,
      error: "refund_reconciliation_required",
      message: `金流顯示此交易已退款 NT$${tappayRefunded.toLocaleString("en-US")}，本地尚未同步，請先執行退款對帳（tappay-sync-refund）`,
      tappayRemaining,
    };
  }
  if (requested > tappayRemaining) {
    return {
      ok: false,
      error: "refund_exceeds_tappay_remaining",
      message: `退款金額超過金流可退餘額 NT$${tappayRemaining.toLocaleString("en-US")}`,
      tappayRemaining,
    };
  }
  if (requested > Math.max(0, Math.round(input.localRemaining || 0))) {
    return { ok: false, error: "refund_exceeds_local_remaining", message: "退款金額超過本地可退金額", tappayRemaining };
  }
  return { ok: true, tappayRemaining };
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
  // settle 尚未啟用（團購信用卡收款走 group-buy-* 3DS 主線，不經 adapter）。
  settlePayment: () =>
    Promise.resolve({ ok: false, handledBy: "tappay", amount: 0, error: "tappay_not_enabled" }),

  /**
   * TapPay 信用卡退刷。
   * 共用 _shared/orderRefund.ts（唯一一份 TapPay Refund HTTP 包裝＝_shared/tappay.ts refundTapPay），
   * 本函式只負責「對指定原交易退指定金額」，退款比例／政策一律由呼叫端（cancellationPolicy）決定。
   */
  refundPayment: async (req): Promise<RefundResult> => {
    const amount = Math.max(0, Math.round(req.amount || 0));
    const fail = (error: string, message?: string, extra?: Partial<RefundResult>): RefundResult => ({
      ok: false, handledBy: "tappay", amount: 0, error, message, ...extra,
    });
    if (amount <= 0) return fail("zero_amount", "退款金額必須大於 0");

    const supabase = req.supabase;
    if (!supabase) return fail("tappay_refund_no_client", "退款服務設定缺失（缺少後端連線）");

    const order = req.order as any;
    const triggerSource = req.triggerSource ?? "payment_adapter_refund";

    // ATM／銀行轉帳／現金絕不進入信用卡退刷
    if (!isCardPaidOrder(order)) {
      return fail("refund_not_card", "此訂單非信用卡付款，無法自動退刷，請改人工退款");
    }

    const partnerKey = Deno.env.get("TAPPAY_PARTNER_KEY");
    if (!partnerKey) return fail("no_partner_key", "金流設定缺失，無法自動退刷");

    // 1) 解析原付款交易編號（沿用已驗收的 resolver：原付款欄位 → deposit_charges → notes legacy）
    const resolution = await resolveSyncRecTradeId(supabase, order);
    if (!resolution.recTradeId) {
      await flagRefundNeedsManual(supabase, order, amount, {
        attempted: false, success: false, refunded: 0, recTradeId: null,
        reason: "no_rec_trade_id", note: "查無可退刷交易編號",
      });
      return fail("refund_no_rec_trade_id", "查無可退刷的原交易編號，已轉人工退款");
    }

    // 2) 退款前必須 Query 原交易，核對金額與已退金額
    const record = await queryTapPayRecord({ partnerKey, recTradeId: resolution.recTradeId })
      .catch(() => null);
    const gate = evaluateTappayRefundGate({
      requested: amount,
      localRemaining: remainingRefundable(order),
      tappayFound: !!record?.found,
      tappayAmount: record?.amount ?? null,
      tappayRefunded: record?.refundedAmount ?? null,
      localRefunded: Math.max(0, Math.round(Number(order.refunded_amount) || 0)),
    });
    if (!gate.ok) {
      return fail(gate.error!, gate.message, { recTradeId: resolution.recTradeId });
    }

    // 3) 實際退刷（唯一 HTTP 實作在 _shared/tappay.ts）
    const outcome = await refundOrderCard(supabase, order, amount, triggerSource, {
      recTradeId: resolution.recTradeId,
    });

    if (outcome.success) {
      return {
        ok: true,
        handledBy: "tappay",
        amount: outcome.refunded,
        recTradeId: outcome.recTradeId,
        message: outcome.note,
      };
    }

    // 4) 失敗／timeout：不重試、不標記退款完成，寫回 refund_status 並建立人工待辦
    try {
      await supabase.from("orders").update(buildRefundPatch(outcome, 0)).eq("id", order.id);
    } catch (e) {
      console.error("[paymentAdapter] refund patch failed", e);
    }
    await flagRefundNeedsManual(supabase, order, amount, outcome);

    return fail(
      outcome.networkError ? "refund_result_unknown" : "refund_failed",
      outcome.networkError
        ? "退款送出後未取得金流回應，系統已標記待對帳，請勿重複退款（將由退款對帳自動回正）"
        : `自動退刷失敗：${outcome.msg ?? outcome.status ?? "unknown"}`,
      { recTradeId: outcome.recTradeId, needsReconciliation: !!outcome.networkError },
    );
  },
};

export function getPaymentAdapter(order: OrderPaymentShape): PaymentAdapterApi {
  return getPaymentProvider(order) === "tappay" ? tappayAdapter : manualAdapter;
}

export const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  manual: "銀行匯款（人工對帳）",
  tappay: "TapPay 線上刷卡",
};
