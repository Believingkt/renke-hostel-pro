/**
 * 共用：成交組獎金「eligibility」判定。
 *
 * 唯一語意：order_meta.force_commission_eligible = true 時，
 * 人工解除「免抽成來源（exempt）」限制；否則沿用 !isExempt(order)。
 *
 * 嚴禁在此加入金額、closer_rate、threshold、payout_month、snapshot_month、
 * 80/20、paid、adjustment month、退款或取消公式等任何商業規則。
 */

export interface EligibilityMetaLike {
  force_commission_eligible?: boolean | null;
}

export function isCommissionEligible(
  order: unknown,
  meta: EligibilityMetaLike | null | undefined,
  isExempt: (order: any) => boolean,
): boolean {
  if (meta?.force_commission_eligible === true) return true;
  return !isExempt(order as any);
}
