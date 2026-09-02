// 團購「旅客自助取消」分流規則（純函式，可被單元測試直接引用）
//
// 規則（Source of Truth = orders 該筆的真實付款欄位，禁止用 campaign 設定回推）：
//   direct_cancel    未收款（ATM 未付款／銀行匯款未匯／信用卡未成立）
//                    → 直接取消訂單、釋放庫存、隱藏虛擬帳號，不需退款
//   card_auto_refund 信用卡（payment_provider=tappay 且 isCardPaidOrder）且尚有可退餘額
//                    → 依取消政策級距自動原卡退刷（refund-first）
//   manual_review    其餘（ATM／銀行匯款「已收款」）
//                    → 維持現行人工退款審核流程（銀行退匯無法自動化）
//
// 注意：退款金額一律依 quoteCancellation() 級距計算；
//       政策無法自動判定（requiresManualReview）時必須降級為 manual_review。

import { isCardPaidOrder } from "./orderRefund.ts";
import { remainingRefundableWithFee } from "./refundFee.ts";

export type GroupBuySelfCancelMode = "direct_cancel" | "card_auto_refund" | "manual_review";

export interface SelfCancelOrderLike {
  order_status?: string | null;
  payment_status?: string | null;
  payment_provider?: string | null;
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  room_charge_rec_trade_id?: string | null;
  paid_amount?: number | null;
  refunded_amount?: number | null;
  refund_fee_amount?: number | null;
}

export interface SelfCancelClassification {
  mode: GroupBuySelfCancelMode;
  isCardOrder: boolean;
  paid: number;
  refundable: number;
}

export function classifyGroupBuySelfCancel(order: SelfCancelOrderLike): SelfCancelClassification {
  const paid = Math.max(0, Math.round(Number(order?.paid_amount) || 0));
  const refundable = remainingRefundableWithFee(order as never);
  const isCardOrder = String(order?.payment_provider ?? "") === "tappay" &&
    isCardPaidOrder(order as never);

  if (paid <= 0 && refundable <= 0) {
    return { mode: "direct_cancel", isCardOrder, paid, refundable };
  }
  if (isCardOrder && refundable > 0) {
    return { mode: "card_auto_refund", isCardOrder, paid, refundable };
  }
  return { mode: "manual_review", isCardOrder, paid, refundable };
}

/**
 * 自助取消的實際退款金額：依政策級距，且不得超過可退餘額。
 * requiresManualReview（政策無法自動判定）→ 降級人工審核，絕不自動退款。
 */
export function resolveSelfCancelRefundAmount(input: {
  refundable: number;
  policyRefundAmount: number;
  requiresManualReview?: boolean;
}): { manualReview: boolean; refundAmount: number } {
  if (input.requiresManualReview) return { manualReview: true, refundAmount: 0 };
  const refundable = Math.max(0, Math.round(Number(input.refundable) || 0));
  const policy = Math.max(0, Math.round(Number(input.policyRefundAmount) || 0));
  return { manualReview: false, refundAmount: Math.min(refundable, policy) };
}
