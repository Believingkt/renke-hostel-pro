/**
 * 團購訂單取消／退款規則（唯一文案來源）
 *
 * 前台 Alert、取消狀態卡與（對應的 Edge Function email 版本）都必須引用這裡，
 * 避免規則調整時漏改其中一處。Email 端因為 Deno 無法 import src/，
 * 於 supabase/functions/_shared/refundPolicy.ts 維持同一份文字，兩邊需同步更新。
 */

/** 退款匯款手續費（新台幣） */
export const REFUND_HANDLING_FEE = 30;

/** 退款時程規則（以「審核確認日」為基準） */
export const REFUND_SCHEDULE_RULES: string[] = [
  "前月 25 日～本月 10 日確認 → 本月 15 日退款",
  "本月 11 日～25 日確認 → 本月最後一天退款",
];

export const REFUND_SCHEDULE_TITLE = "退款時間";
export const REFUND_SCHEDULE_INTRO = "若符合退款條件，將以「審核確認日」為基準：";
export const REFUND_FEE_TEXT = `退款將扣除 NT$${REFUND_HANDLING_FEE} 匯款手續費。`;
export const REFUND_PENDING_REVIEW_TEXT = "在民宿完成審核前，訂單仍維持原訂房狀態。";
export const CANCEL_REQUEST_RECEIVED_TEXT = "已收到您的取消申請，民宿正在審核。";

/* ─────────────────────────────────────────────────────────────
 * 信用卡（TapPay）退款文案
 * 信用卡一律原卡退刷，沒有「人工匯回」流程，也不收 NT$30 匯款手續費。
 * 任何 payment_provider = tappay 的訂單都必須使用這一組文案。
 * ───────────────────────────────────────────────────────────── */
export const CREDIT_REFUND_SCHEDULE_TITLE = "退款時間";
export const CREDIT_REFUND_SCHEDULE_INTRO = "信用卡付款一律退回原付款卡片：";
export const CREDIT_REFUND_SCHEDULE_RULES: string[] = [
  "民宿完成審核後，系統即向金流送出退刷，不需人工匯款",
  "實際入帳時間依發卡銀行作業，約 3～7 個工作天",
];
export const CREDIT_REFUND_NO_FEE_TEXT = "信用卡退款不收取匯款手續費。";
