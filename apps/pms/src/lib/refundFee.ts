/**
 * 人工退款手續費：前端唯一入口。
 * 直接 re-export Edge Function 共用實作，避免前後端各自維護一套切分邏輯。
 * 帳務語意見 supabase/functions/_shared/refundFee.ts。
 */
export {
  DEFAULT_MANUAL_REFUND_FEE,
  remainingRefundableWithFee,
  settledRefund,
  splitRefundFee,
  type RefundFeeSplit,
} from "../../../../supabase/functions/_shared/refundFee";
