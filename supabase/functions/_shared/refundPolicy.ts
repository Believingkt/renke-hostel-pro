// 團購取消／退款規則（Email 版本）
// 與前台 src/lib/refundPolicy.ts 為同一份規則，兩邊需同步更新。

/**
 * 退款匯款手續費改為每館可設定（booking_settings.manual_refund_fee_amount）。
 * 不得再寫死金額；未帶入設定時視為 0（不輸出手續費文案）。
 */
export const DEFAULT_REFUND_HANDLING_FEE = 0;

/** 依館別手續費產生文案；fee <= 0 時回傳 null */
export function refundFeeText(fee: number): string | null {
  const f = Math.max(0, Math.round(Number(fee) || 0));
  return f > 0 ? `退款將扣除 NT$${f} 匯款手續費。` : null;
}

export const REFUND_SCHEDULE_RULES = [
  "前月 25 日～本月 10 日確認 → 本月 15 日退款",
  "本月 11 日～25 日確認 → 本月最後一天退款",
];

export const REFUND_SCHEDULE_INTRO = "若符合退款條件，將以「審核確認日」為基準：";
export const REFUND_PENDING_REVIEW_TEXT = "在民宿完成審核前，訂單仍維持原訂房狀態。";
export const CANCEL_REQUEST_RECEIVED_TEXT = "已收到您的取消申請，民宿正在審核。";

/** 退款時程規則 HTML 區塊（供 Email template 使用） */
export function refundScheduleHtml(
  opts: { showPendingReview?: boolean; handlingFee?: number } = {},
): string {
  const feeText = refundFeeText(opts.handlingFee ?? 0);
  return `<p style="margin:0 0 6px">${REFUND_SCHEDULE_INTRO}</p>
   <ul style="margin:0 0 8px;padding-left:20px">
     ${REFUND_SCHEDULE_RULES.map((r) => `<li style="margin:2px 0">${r}</li>`).join("")}
   </ul>
   ${feeText ? `<p style="margin:0">${feeText}</p>` : ""}
   ${opts.showPendingReview ? `<p style="margin:6px 0 0">${REFUND_PENDING_REVIEW_TEXT}</p>` : ""}`;
}

/** 信用卡（TapPay）退款文案：原卡退刷、無匯款手續費（與 src/lib/refundPolicy.ts 同步） */
export const CREDIT_REFUND_SCHEDULE_INTRO = "信用卡付款一律退回原付款卡片：";
export const CREDIT_REFUND_SCHEDULE_RULES = [
  "民宿完成審核後，系統即向金流送出退刷，不需人工匯款",
  "實際入帳時間依發卡銀行作業，約 3～7 個工作天",
];
export const CREDIT_REFUND_NO_FEE_TEXT = "信用卡退款不收取匯款手續費。";
