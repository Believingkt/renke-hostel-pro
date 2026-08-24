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

/* ------------------------------------------------------------------ *
 * 雙軌取消政策（顯示用）
 * 權威計算一律在 supabase/functions/_shared/cancellationPolicy.ts，
 * 這裡只負責前台文案，兩邊需同步更新。
 * ------------------------------------------------------------------ */

export type CancellationPolicyType = "deposit" | "full_prepayment" | "guarantee" | "unknown";

/** 訂金制（銀行匯款 / ATM）：退還「已收定金」比例 */
export const DEPOSIT_POLICY_LINES: string[] = [
  "入住日前第 14 日以前取消：退還定金 100%",
  "入住日前第 10～13 日取消：退還定金 70%",
  "入住日前第 7～9 日取消：退還定金 50%",
  "入住日前第 4～6 日取消：退還定金 40%",
  "入住日前第 2～3 日取消：退還定金 30%",
  "入住日前第 1 日取消：退還定金 20%",
  "入住當日取消或未通知：不予退還",
];

/** 全額預收制（信用卡全額付款）：退還「已預收房價總額」比例 */
export const FULL_PREPAYMENT_POLICY_LINES: string[] = [
  "入住日前第 3 日以前取消：退還已預收房價總額 100%",
  "入住日前第 1～2 日取消：退還 50%",
  "入住當日取消或未通知：不予退還",
];

export const FULL_PREPAYMENT_CHARGE_NOTICE = "信用卡將一次支付訂單全額。";

export const CANCELLATION_POLICY_TITLE: Record<CancellationPolicyType, string> = {
  deposit: "取消政策（收取定金）",
  full_prepayment: "取消政策（預收房價總額）",
  guarantee: "取消政策",
  unknown: "取消政策",
};

/** 依付款方式取得應顯示的政策類型 */
export function policyTypeForPaymentMethod(
  method: "bank" | "atm" | "credit" | string | null | undefined,
): CancellationPolicyType {
  if (method === "credit" || method === "credit_card" || method === "card") return "full_prepayment";
  if (method === "atm" || method === "bank" || method === "bank_transfer") return "deposit";
  return "unknown";
}

/** 依政策類型取得前台顯示條列 */
export function cancellationLinesFor(policy: CancellationPolicyType): string[] {
  if (policy === "full_prepayment") return FULL_PREPAYMENT_POLICY_LINES;
  if (policy === "deposit") return DEPOSIT_POLICY_LINES;
  if (policy === "guarantee") return TW_DEFAULT_CANCEL_RULES.slice().reverse().map((r) => r.label);
  return [];
}

export const UNKNOWN_POLICY_NOTE =
  "此訂單之取消退款方式需由住宿方依原付款條件確認，若需取消請聯絡客服。";

export interface CancellationPolicyCopy {
  policy: CancellationPolicyType;
  title: string;
  /** 制度說明（信用卡全額付款時提示「一次支付全額」） */
  intro: string | null;
  lines: string[];
  /** unknown 時的替代說明（此時 lines 為空，不得顯示任何百分比） */
  fallbackNote: string | null;
}

/**
 * 前台顯示層唯一來源。所有團購／一般訂房頁面一律使用本函式，
 * 不得各自 hardcode 級距文字。後端對應：
 * supabase/functions/_shared/cancellationPolicyCopy.ts
 */
export function cancellationPolicyCopy(policy: CancellationPolicyType): CancellationPolicyCopy {
  return {
    policy,
    title: CANCELLATION_POLICY_TITLE[policy] ?? "取消政策",
    intro: policy === "full_prepayment" ? FULL_PREPAYMENT_CHARGE_NOTICE : null,
    lines: cancellationLinesFor(policy),
    fallbackNote: policy === "unknown" ? UNKNOWN_POLICY_NOTE : null,
  };
}

