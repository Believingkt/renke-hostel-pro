// 台灣交通部觀光署「旅館業／民宿定型化契約應記載事項」取消退款級距（後端權威版本）
// 前端 src/lib/cancellation-policy.ts 僅供顯示，實際退款金額一律以本檔為準。
//
// 兩套制度（不可互相混用）：
//   deposit          收取「定金」制度 → 退還「已收定金」的比例
//   full_prepayment  預收「約定房價總金額」制度 → 退還「已預收總額」的比例
//   guarantee        僅綁卡擔保、入住日才請款（尚未收款）→ 沿用既有違約金級距（本次不變更）
//   unknown          無法可靠判定 → 一律 manual_review，禁止自動退款
//
// 日期一律使用 Asia/Taipei 純日期計算：days = check_in_date - cancellation_date

export type CancellationPolicyType =
  | "deposit"
  | "full_prepayment"
  | "guarantee"
  | "unknown";

export interface RefundTier {
  /** 距住宿日「最少」天數（含） */
  minDaysBefore: number;
  /** 退還比例（0–100） */
  refundPercent: number;
  label: string;
}

/** 訂金制：退還「已收定金」比例（由寬到嚴） */
export const DEPOSIT_REFUND_TIERS: RefundTier[] = [
  { minDaysBefore: 14, refundPercent: 100, label: "入住日前第 14 日以前取消，退還定金 100%" },
  { minDaysBefore: 10, refundPercent: 70, label: "入住日前第 10～13 日取消，退還定金 70%" },
  { minDaysBefore: 7, refundPercent: 50, label: "入住日前第 7～9 日取消，退還定金 50%" },
  { minDaysBefore: 4, refundPercent: 40, label: "入住日前第 4～6 日取消，退還定金 40%" },
  { minDaysBefore: 2, refundPercent: 30, label: "入住日前第 2～3 日取消，退還定金 30%" },
  { minDaysBefore: 1, refundPercent: 20, label: "入住日前第 1 日取消，退還定金 20%" },
  { minDaysBefore: 0, refundPercent: 0, label: "入住當日取消或未通知，不予退還" },
];

/** 預收約定房價總金額制：退還「已預收總額」比例（由寬到嚴） */
export const FULL_PREPAYMENT_REFUND_TIERS: RefundTier[] = [
  { minDaysBefore: 3, refundPercent: 100, label: "入住日前第 3 日以前取消，退還已預收房價總額 100%" },
  { minDaysBefore: 1, refundPercent: 50, label: "入住日前第 1～2 日取消，退還 50%" },
  { minDaysBefore: 0, refundPercent: 0, label: "入住當日取消或未通知，不予退還" },
];

/** 綁卡擔保（尚未收款）→ 沿用既有違約金級距（percent = 應收違約金比例） */
export interface GuaranteeTier {
  minDaysBefore: number;
  feePercent: number;
  label: string;
}
export const GUARANTEE_FEE_TIERS: GuaranteeTier[] = [
  { minDaysBefore: 14, feePercent: 0, label: "住宿日前 14 日（含）以前取消，不收取費用" },
  { minDaysBefore: 10, feePercent: 30, label: "住宿日前 10–13 日內取消，扣 30%" },
  { minDaysBefore: 7, feePercent: 50, label: "住宿日前 7–9 日內取消，扣 50%" },
  { minDaysBefore: 4, feePercent: 60, label: "住宿日前 4–6 日內取消，扣 60%" },
  { minDaysBefore: 2, feePercent: 70, label: "住宿日前 2–3 日內取消，扣 70%" },
  { minDaysBefore: 1, feePercent: 80, label: "住宿日前 1 日內取消，扣 80%" },
  { minDaysBefore: 0, feePercent: 100, label: "住宿日當日取消，扣 100%" },
];

/** 取得台灣時區的 yyyy-MM-dd */
export function taipeiToday(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 純日期天數差：check_in_date - cancellation_date（皆為 Asia/Taipei 的 yyyy-MM-dd） */
export function daysUntil(checkInDate: string, cancellationDate: string): number {
  const a = Date.parse(`${checkInDate}T00:00:00Z`);
  const b = Date.parse(`${cancellationDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86400000);
}

export function depositRefundPercent(days: number): number {
  return (DEPOSIT_REFUND_TIERS.find((t) => days >= t.minDaysBefore) ??
    DEPOSIT_REFUND_TIERS[DEPOSIT_REFUND_TIERS.length - 1]).refundPercent;
}

export function fullPrepaymentRefundPercent(days: number): number {
  return (FULL_PREPAYMENT_REFUND_TIERS.find((t) => days >= t.minDaysBefore) ??
    FULL_PREPAYMENT_REFUND_TIERS[FULL_PREPAYMENT_REFUND_TIERS.length - 1]).refundPercent;
}

// ---------------------------------------------------------------- policy 判定

export interface PolicyOrderShape {
  order_source?: string | null;
  payment_provider?: string | null;
  payment_method?: string | null;
  deposit_payment_method?: string | null;
  balance_payment_method?: string | null;
  paid_amount?: number | null;
  final_price?: number | null;
  deposit_amount?: number | null;
  room_charge_status?: string | null;
}

const CARD_METHODS = new Set([
  "credit_card",
  "credit_card_3ds",
  "card",
  "tappay",
  "信用卡",
]);
const ATM_METHODS = new Set(["atm", "ATM", "atm_transfer", "虛擬帳號"]);
const BANK_METHODS = new Set([
  "bank_transfer",
  "manual_bank_transfer",
  "bank",
  "transfer",
  "匯款",
  "銀行匯款",
]);

function methodsOf(order: PolicyOrderShape): string[] {
  return [
    order.payment_method,
    order.balance_payment_method,
    order.deposit_payment_method,
  ].filter(Boolean).map((m) => String(m)) as string[];
}

export interface PolicyResolution {
  policy: CancellationPolicyType;
  /** 判定依據（寫入 audit trail） */
  reason: string;
  /** 無法可靠判定 → 需人工確認，禁止自動退款 */
  requiresManualReview: boolean;
}

/**
 * 依「訂單原始付款制度 / provider / method」判定契約政策。
 * 明確禁止：單純以 deposit_amount > 0 或 paid_amount >= final_price 反推。
 */
export function resolveCancellationPolicy(order: PolicyOrderShape): PolicyResolution {
  const methods = methodsOf(order);
  const provider = String(order.payment_provider ?? "");
  const isGroupBuy = order.order_source === "group_buy";

  const hasCard = methods.some((m) => CARD_METHODS.has(m)) || provider === "tappay";
  const hasAtm = methods.some((m) => ATM_METHODS.has(m));
  const hasBank = methods.some((m) => BANK_METHODS.has(m));

  if (isGroupBuy) {
    // 團購：信用卡 = 全額刷卡 → 全額預收制；銀行匯款 / ATM = 訂金制
    if (hasCard && !hasAtm && !hasBank) {
      return { policy: "full_prepayment", reason: "group_buy_credit_card", requiresManualReview: false };
    }
    if (hasAtm) return { policy: "deposit", reason: "group_buy_atm", requiresManualReview: false };
    if (hasBank) return { policy: "deposit", reason: "group_buy_bank_transfer", requiresManualReview: false };
    return { policy: "unknown", reason: "group_buy_unknown_payment_method", requiresManualReview: true };
  }

  // 一般訂房
  // 綁卡擔保、入住日才請款 → 尚未收款，沿用既有違約金級距（本次不變更）
  if (
    !hasAtm && !hasBank &&
    (order.room_charge_status === "card_bound" || order.room_charge_status === "pending") &&
    Math.round(Number(order.paid_amount) || 0) === 0
  ) {
    return { policy: "guarantee", reason: "card_bound_not_charged", requiresManualReview: false };
  }

  if (hasAtm) return { policy: "deposit", reason: "booking_atm", requiresManualReview: false };
  if (hasBank) return { policy: "deposit", reason: "booking_bank_transfer", requiresManualReview: false };

  if (hasCard) {
    const paid = Math.round(Number(order.paid_amount) || 0);
    const total = Math.round(Number(order.final_price) || 0);
    // 明確屬於「預收全額」的路徑：信用卡且已收足全額
    if (total > 0 && paid >= total) {
      return { policy: "full_prepayment", reason: "booking_credit_card_full_prepaid", requiresManualReview: false };
    }
    if (paid > 0) {
      // 信用卡但僅收部分（訂金型刷卡）→ 訂金制，基準為實收金額
      return { policy: "deposit", reason: "booking_credit_card_partial", requiresManualReview: false };
    }
    return { policy: "guarantee", reason: "booking_credit_card_unpaid", requiresManualReview: false };
  }

  const paid = Math.round(Number(order.paid_amount) || 0);
  if (paid <= 0) {
    // 未收款 → 沒有退款問題
    return { policy: "guarantee", reason: "no_payment_recorded", requiresManualReview: false };
  }
  return { policy: "unknown", reason: "unrecognized_payment_method", requiresManualReview: true };
}

// ---------------------------------------------------------------- 金額計算

export interface CancellationQuote {
  policy: CancellationPolicyType;
  policyReason: string;
  daysBefore: number;
  /** 退還比例（deposit / full_prepayment 適用） */
  refundPercent: number;
  /** 違約金比例（guarantee 適用；deposit / full_prepayment = 100 - refundPercent） */
  feePercent: number;
  /** 計算基準金額 */
  baseAmount: number;
  refundAmount: number;
  /** 業者得保留（違約金）金額 */
  retainedAmount: number;
  /** guarantee 制下應「向客人收取」的違約金 */
  feeAmount: number;
  label: string;
  requiresManualReview: boolean;
  freeCancel: boolean;
}

export interface QuoteInput {
  order: PolicyOrderShape;
  checkInDate: string;
  /** Asia/Taipei 的 yyyy-MM-dd，預設今天 */
  cancellationDate?: string;
  /** 已退款金額（避免重複退） */
  alreadyRefunded?: number;
  /** guarantee 制的違約金基準（預設 final_price） */
  guaranteeBase?: number;
  /** 民宿自訂免費取消天數（僅 guarantee 制沿用） */
  freeCancelDays?: number;
  /** 覆寫 policy（僅供測試/管理員稽核用） */
  policyOverride?: CancellationPolicyType;
}

/**
 * 依訂單真實資料計算法規退款金額。
 * 呼叫端一律使用本函式結果，不得採用前端傳入的 refundAmount。
 */
export function quoteCancellation(input: QuoteInput): CancellationQuote {
  const { order, checkInDate } = input;
  const today = input.cancellationDate || taipeiToday();
  const days = daysUntil(checkInDate, today);
  const resolved = resolveCancellationPolicy(order);
  const policy = input.policyOverride ?? resolved.policy;

  const paid = Math.max(0, Math.round(Number(order.paid_amount) || 0));
  const refunded = Math.max(0, Math.round(Number(input.alreadyRefunded) || 0));
  const refundable = Math.max(0, paid - refunded);

  if (policy === "unknown") {
    return {
      policy,
      policyReason: resolved.reason,
      daysBefore: days,
      refundPercent: 0,
      feePercent: 0,
      baseAmount: refundable,
      refundAmount: 0,
      retainedAmount: 0,
      feeAmount: 0,
      label: "無法判定此訂單適用的取消政策，需人工確認後處理退款",
      requiresManualReview: true,
      freeCancel: false,
    };
  }

  if (policy === "guarantee") {
    const freeDays = Number.isFinite(input.freeCancelDays as number)
      ? Number(input.freeCancelDays)
      : 14;
    const base = Math.max(0, Math.round(Number(input.guaranteeBase ?? order.final_price) || 0));
    if (days >= freeDays) {
      return {
        policy,
        policyReason: resolved.reason,
        daysBefore: days,
        refundPercent: 100,
        feePercent: 0,
        baseAmount: base,
        refundAmount: refundable,
        retainedAmount: 0,
        feeAmount: 0,
        label: `住宿日前 ${freeDays} 日（含）以前取消，不收取費用`,
        requiresManualReview: false,
        freeCancel: true,
      };
    }
    const tier = GUARANTEE_FEE_TIERS.find((t) => days >= t.minDaysBefore) ??
      GUARANTEE_FEE_TIERS[GUARANTEE_FEE_TIERS.length - 1];
    const feeAmount = Math.round((base * tier.feePercent) / 100);
    return {
      policy,
      policyReason: resolved.reason,
      daysBefore: days,
      refundPercent: 100 - tier.feePercent,
      feePercent: tier.feePercent,
      baseAmount: base,
      refundAmount: Math.max(0, refundable - feeAmount),
      retainedAmount: Math.min(refundable, feeAmount),
      feeAmount,
      label: tier.label,
      requiresManualReview: false,
      freeCancel: tier.feePercent === 0,
    };
  }

  const tiers = policy === "full_prepayment" ? FULL_PREPAYMENT_REFUND_TIERS : DEPOSIT_REFUND_TIERS;
  const tier = tiers.find((t) => days >= t.minDaysBefore) ?? tiers[tiers.length - 1];
  // 訂金制基準 = 實際收取的定金；全額預收制基準 = 已預收總額。兩者皆等於「實收金額」。
  const base = refundable;
  const refundAmount = Math.min(refundable, Math.round((base * tier.refundPercent) / 100));

  return {
    policy,
    policyReason: resolved.reason,
    daysBefore: days,
    refundPercent: tier.refundPercent,
    feePercent: 100 - tier.refundPercent,
    baseAmount: base,
    refundAmount,
    retainedAmount: Math.max(0, refundable - refundAmount),
    feeAmount: Math.max(0, refundable - refundAmount),
    label: tier.label,
    requiresManualReview: false,
    freeCancel: tier.refundPercent === 100,
  };
}

// -------------------------------------------------- 相容層（舊呼叫端過渡使用）

export interface CancelFeeResult {
  daysBefore: number;
  percent: number;
  label: string;
  feeAmount: number;
  refundAmount: number;
  freeCancel: boolean;
}

/** @deprecated 請改用 quoteCancellation()。保留僅為相容尚未遷移的呼叫端。 */
export function calcCancellationFee(
  baseAmount: number,
  checkInDate: string,
  todayDate: string,
  paidAmount = 0,
  freeCancelDays = 14,
): CancelFeeResult {
  const q = quoteCancellation({
    order: { paid_amount: paidAmount, final_price: baseAmount, room_charge_status: "card_bound" },
    checkInDate,
    cancellationDate: todayDate,
    guaranteeBase: baseAmount,
    freeCancelDays,
    policyOverride: "guarantee",
  });
  return {
    daysBefore: q.daysBefore,
    percent: q.feePercent,
    label: q.label,
    feeAmount: q.feeAmount,
    refundAmount: q.refundAmount,
    freeCancel: q.freeCancel,
  };
}
