/**
 * 訂房訂金（ATM 匯款）計算工具
 *
 * 規則：ATM 虛擬帳號匯款僅收取「訂單總額 × 訂金比例」的訂金，
 * 尾款於入住當天現場付清（現金 / 刷卡 / 匯款）。
 * 訂金比例來自各民宿 booking_settings.deposit_percentage，未設定時預設 30%。
 */

export const DEFAULT_DEPOSIT_PERCENTAGE = 30;

export interface DepositSettingsLike {
  use_deposit?: boolean | null;
  deposit_percentage?: number | null;
}

/** 取得該民宿的訂金比例（%）。未啟用訂金時回傳 100（等於全額付款） */
export function resolveDepositPercentage(settings?: DepositSettingsLike | null): number {
  if (settings && settings.use_deposit === false) return 100;
  const pct = Number(settings?.deposit_percentage);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return DEFAULT_DEPOSIT_PERCENTAGE;
  return pct;
}

/** 依比例計算訂金金額（四捨五入到元，且不超過總額） */
export function calcDepositAmount(total: number, percentage: number): number {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (percentage >= 100) return safeTotal;
  return Math.min(safeTotal, Math.round((safeTotal * percentage) / 100));
}

/** 一次取得訂金 / 尾款 */
export function getDepositBreakdown(total: number, settings?: DepositSettingsLike | null) {
  const percentage = resolveDepositPercentage(settings);
  const deposit = calcDepositAmount(total, percentage);
  const balance = Math.max(0, Math.round(Number(total) || 0) - deposit);
  return { percentage, deposit, balance, isFullPayment: percentage >= 100 };
}
