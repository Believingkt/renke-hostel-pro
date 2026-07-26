// 台灣交通部觀光署旅宿業定型化契約：取消退款級距（後端權威版本）
// 前端 src/lib/cancellation-policy.ts 僅供顯示，實際扣款一律以本檔為準。

export interface CancelTier {
  /** 距離住宿日「最少」天數（含） */
  minDaysBefore: number;
  percent: number;
  label: string;
}

/** 由寬到嚴排序（天數大 → 小） */
export const TW_CANCEL_TIERS: CancelTier[] = [
  { minDaysBefore: 14, percent: 0, label: "住宿日前 14 日（含）以前取消，不收取費用" },
  { minDaysBefore: 10, percent: 30, label: "住宿日前 10–13 日內取消，扣 30%" },
  { minDaysBefore: 7, percent: 50, label: "住宿日前 7–9 日內取消，扣 50%" },
  { minDaysBefore: 4, percent: 60, label: "住宿日前 4–6 日內取消，扣 60%" },
  { minDaysBefore: 2, percent: 70, label: "住宿日前 2–3 日內取消，扣 70%" },
  { minDaysBefore: 1, percent: 80, label: "住宿日前 1 日內取消，扣 80%" },
  { minDaysBefore: 0, percent: 100, label: "住宿日當日取消，扣 100%" },
];

/** 以 yyyy-MM-dd 計算「今天」到入住日還有幾天（UTC 日期差，皆為純日期字串） */
export function daysUntil(checkInDate: string, todayDate: string): number {
  const a = Date.parse(`${checkInDate}T00:00:00Z`);
  const b = Date.parse(`${todayDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
}

export interface CancelFeeResult {
  daysBefore: number;
  percent: number;
  label: string;
  feeAmount: number;
  refundAmount: number;
  freeCancel: boolean;
}

/**
 * 計算取消手續費。
 * @param baseAmount 訂單應付總額（final_price）
 * @param checkInDate yyyy-MM-dd
 * @param todayDate   yyyy-MM-dd（台灣時區當天）
 * @param paidAmount  已實收金額（決定可退多少）
 * @param freeCancelDays 民宿自訂免費取消天數，預設 14
 */
export function calcCancellationFee(
  baseAmount: number,
  checkInDate: string,
  todayDate: string,
  paidAmount = 0,
  freeCancelDays = 14,
): CancelFeeResult {
  const days = daysUntil(checkInDate, todayDate);
  const base = Math.max(0, Math.round(baseAmount || 0));

  // 民宿自訂免費取消天數優先（>= 該天數一律 0%）
  if (days >= (freeCancelDays ?? 14)) {
    return {
      daysBefore: days,
      percent: 0,
      label: `住宿日前 ${freeCancelDays ?? 14} 日（含）以前取消，不收取費用`,
      feeAmount: 0,
      refundAmount: Math.max(0, Math.round(paidAmount || 0)),
      freeCancel: true,
    };
  }

  const tier =
    TW_CANCEL_TIERS.find((t) => days >= t.minDaysBefore) ??
    TW_CANCEL_TIERS[TW_CANCEL_TIERS.length - 1];

  const feeAmount = Math.round((base * tier.percent) / 100);
  const paid = Math.max(0, Math.round(paidAmount || 0));

  return {
    daysBefore: days,
    percent: tier.percent,
    label: tier.label,
    feeAmount,
    refundAmount: Math.max(0, paid - feeAmount),
    freeCancel: tier.percent === 0,
  };
}

/** 取得台灣時區的 yyyy-MM-dd */
export function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
