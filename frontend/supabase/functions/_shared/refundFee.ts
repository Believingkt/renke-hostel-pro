// 人工退款手續費（館別可設定）帳務模型 — 唯一計算來源
//
// 帳務定義（不可更動語意）：
//   refunded_amount    = 實際退還給旅客的金額（actual payout）
//   refund_fee_amount  = 實際扣除的退款處理費（累計）
//   settledRefund      = refunded_amount + refund_fee_amount  ← 用來對帳 paid_amount
//   remainingRefundable = paid_amount - settledRefund
//
// 規則：
//   1. 手續費金額一律來自 booking_settings.manual_refund_fee_amount（每館可不同，可為 0）。
//      任何地方都不得寫死 30。
//   2. 只有人工銀行退款（銀行匯款／ATM，payment_provider = manual 或非信用卡）才扣手續費。
//      信用卡原卡退刷（TapPay）一律 fee = 0。
//   3. 手續費不得超過本次退款總額（gross），也不得為負。

export const DEFAULT_MANUAL_REFUND_FEE = 0;

const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

export interface RefundFeeSplit {
  /** 本次退款總額（自 paid_amount 沖銷的金額） */
  gross: number;
  /** 本次實際扣除的手續費 */
  fee: number;
  /** 本次實際退還旅客的金額 */
  payout: number;
}

/** 依館別設定切分「本次退款總額」為 手續費 + 實付旅客金額 */
export function splitRefundFee(input: {
  gross: number;
  configuredFee: number;
  /** true = 信用卡原卡退刷，一律不收手續費 */
  isCardRefund?: boolean;
}): RefundFeeSplit {
  const gross = n(input.gross);
  const configured = input.isCardRefund ? 0 : n(input.configuredFee);
  const fee = Math.min(configured, gross);
  return { gross, fee, payout: Math.max(0, gross - fee) };
}

/** 已沖銷總額（退款 + 手續費） */
export function settledRefund(o: { refunded_amount?: unknown; refund_fee_amount?: unknown }): number {
  return n(o?.refunded_amount) + n(o?.refund_fee_amount);
}

/** 尚可退金額 = 已收 - 已沖銷（含手續費） */
export function remainingRefundableWithFee(
  o: { paid_amount?: unknown; refunded_amount?: unknown; refund_fee_amount?: unknown },
): number {
  return Math.max(0, n(o?.paid_amount) - settledRefund(o));
}

/** 讀取館別設定的人工退款手續費（查不到 → 0，不 fallback 到任何硬編金額） */
export async function loadManualRefundFee(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  accommodationId: string | null | undefined,
): Promise<number> {
  if (!accommodationId) return DEFAULT_MANUAL_REFUND_FEE;
  try {
    const { data } = await supabase
      .from("booking_settings")
      .select("manual_refund_fee_amount")
      .eq("accommodation_id", accommodationId)
      .maybeSingle();
    return n(data?.manual_refund_fee_amount);
  } catch (_e) {
    return DEFAULT_MANUAL_REFUND_FEE;
  }
}
