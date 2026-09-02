// 團購 ATM「新制付款期限」共用規則（Phase A）
//
// 兩個期限必須永遠分開，不得互相覆蓋：
//   A. LOCAL BUSINESS DEADLINE  = orders.group_buy_payment_deadline_at
//      （前台顯示、自動取消、庫存釋放、逾期信的唯一依據）
//   B. PROVIDER VA EXPIRY       = orders.atm_expire_at
//      （TapPay 真實虛擬帳號期限，僅供金流稽核）
//
// group_buy_payment_deadline_at IS NULL = LEGACY 訂單，一律沿用舊 atm_expire_at 生命週期。

/** TapPay 虛擬帳號 provider 期限上限（天） */
export const TAPPAY_ATM_MAX_DAYS = 7;
/** ATM 活動可設定的付款期限上限（小時）＝ provider 可覆蓋的最大值 */
export const MAX_ATM_DEADLINE_HOURS = TAPPAY_ATM_MAX_DAYS * 24; // 168

/** 依付款期限時數換算「足以覆蓋本地期限」的最短合法 provider 天數（1～7） */
export function providerExpireDays(hours: number): number {
  const h = Number(hours);
  const safe = Number.isFinite(h) && h > 0 ? h : 72;
  return Math.min(TAPPAY_ATM_MAX_DAYS, Math.max(1, Math.ceil(safe / 24)));
}

/** ATM 活動的付款期限是否超過 provider 可覆蓋範圍（超過即不得建立 ATM 訂單） */
export function exceedsAtmDeadlineLimit(hours: number): boolean {
  const h = Number(hours);
  return Number.isFinite(h) && h > MAX_ATM_DEADLINE_HOURS;
}

export const ATM_DEADLINE_TOO_LONG_MESSAGE =
  "此活動的付款期限設定超過 ATM 虛擬帳號可支援的上限（7 天），請聯繫客服調整後再進行 ATM 付款。";

/**
 * 本地商業付款期限：以 server 端可信的訂單建立時間為基準，一旦寫入永不重算。
 * 基準來源與「訂單上方付款期限」相同（orders.created_at，退回 order_date）。
 */
export function computeLocalDeadline(createdAtIso: string, hours: number): Date {
  const base = new Date(createdAtIso);
  const h = Number(hours);
  const safe = Number.isFinite(h) && h > 0 ? h : 72;
  return new Date(base.getTime() + safe * 3600_000);
}
