import { addDays, format, subDays } from "date-fns";
import { zhTW } from "date-fns/locale";

/**
 * 台灣交通部觀光署旅宿業定型化契約：取消變更規則
 * 預設適用於所有民宿；之後可從後台 booking_settings 帶入覆寫。
 */
export interface CancellationRule {
  /** 距離住宿日 N 天以內（含）開始 */
  daysBefore: number;
  /** 扣款比例（0–100） */
  percent: number;
  label: string;
}

export const TW_DEFAULT_CANCEL_RULES: CancellationRule[] = [
  { daysBefore: 0, percent: 100, label: "住宿日當日取消，扣 100%" },
  { daysBefore: 1, percent: 80, label: "住宿日前 1 日內取消，扣 80%" },
  { daysBefore: 3, percent: 70, label: "住宿日前 2–3 日內取消，扣 70%" },
  { daysBefore: 6, percent: 60, label: "住宿日前 4–6 日內取消，扣 60%" },
  { daysBefore: 9, percent: 50, label: "住宿日前 7–9 日內取消，扣 50%" },
  { daysBefore: 13, percent: 30, label: "住宿日前 10–13 日內取消，扣 30%" },
  { daysBefore: 14, percent: 0, label: "住宿日前 14 日（含）以前取消，不收取費用" },
];

/** 預設「免費取消天數」= 14（與法規一致） */
export const DEFAULT_FREE_CANCEL_DAYS = 14;

/**
 * 計算免費取消截止日（最後一天可全額退款的日期）。
 * 規則：住宿日前 14 日（含）以前取消 0% → deadline = checkIn - 14 天的 23:59
 */
export function getFreeCancelDeadline(
  checkIn: Date | null | undefined,
  freeDays: number = DEFAULT_FREE_CANCEL_DAYS,
): Date | null {
  if (!checkIn) return null;
  const d = subDays(checkIn, freeDays);
  d.setHours(23, 59, 0, 0);
  return d;
}

export function formatFreeCancelDeadline(deadline: Date | null): string {
  if (!deadline) return "";
  return format(deadline, "M月d日 (EEE) 23:59", { locale: zhTW });
}
