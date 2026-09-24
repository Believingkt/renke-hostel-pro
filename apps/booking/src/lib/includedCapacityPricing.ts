/**
 * SHARED PACKAGE-INCLUDED CHILD PRICING CONTRACT
 *
 * 三個不得混用的概念：
 *  A. actual_guest_count   = adults + infants + toddlers + children（所有實際入住人頭）
 *  B. capacity_guest_count = adults + counts_toward_capacity=true 的兒童（只用於物理容量判斷）
 *  C. commercial_overflow  = max(0, actual_guest_count - included_guest_count)
 *
 * 正式規則：
 *  - 方案售價已包含的人頭（included pool）不得再收 child fee / over-limit fee。
 *  - 所有人（含 counts_toward_capacity=false 的 tier）都先吃 included pool。
 *  - max_count / over_limit_fee 只套用在「方案外（overflow）」該 tier 的人數，
 *    不是 raw tier total。
 *  - allowed=false、max_total_guests 等硬限制維持既有 contract。
 *  - includedGuestCount = null 或 0 時，overflow = 全部兒童 → 等同既有行為（legacy parity）。
 *
 * Group Buy 與 General /booking 共用本 contract（storage 仍各自獨立）。
 */
import {
  type ChildAgeRules,
  type ChildSelection,
  type ChildTierKey,
  TIER_ORDER,
  selectionCount,
} from "@lakeze/shared/lib/child-rules";

export interface IncludedCapacityBreakdownRow {
  key: ChildTierKey;
  label: string;
  /** 該 tier 實際入住人數（raw） */
  count: number;
  /** 該 tier 落在方案外的人數 */
  overflow_count: number;
  charged_base_count: number;
  charged_over_count: number;
  fee_per_night: number;
  over_limit_fee_per_night: number;
  nights: number;
  subtotal: number;
  free: boolean;
}

export interface IncludedCapacityEvaluation {
  blocked: boolean;
  blockedTiers: ChildTierKey[];
  blockReason?: string;
  /** A：實際入住總人數 */
  actualGuestCount: number;
  /** B：佔房型容量人數（adults + counts_toward_capacity 兒童） */
  capacityHeadcount: number;
  /** 方案已包含人數（null = 未設定） */
  includedGuestCount: number | null;
  /** C：方案外人數 */
  overflow: number;
  extraFeePerNight: number;
  extraFeeTotal: number;
  breakdown: IncludedCapacityBreakdownRow[];
}

/**
 * Included pool 分配順序（deterministic，沿用既有 fee precedence）：
 *  1. 成人優先佔用 included pool
 *  2. 兒童 tier 依「每晚費用由低到高」被 included pool 覆蓋（等價於既有實作
 *     「優先收取費用最高者」的 precedence），同費率時依 TIER_ORDER。
 */
function coverageOrder(rules: ChildAgeRules): ChildTierKey[] {
  return [...TIER_ORDER].sort((a, b) => {
    const fa = Math.max(0, rules.tiers[a].fee_per_night || 0);
    const fb = Math.max(0, rules.tiers[b].fee_per_night || 0);
    if (fa !== fb) return fa - fb;
    return TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b);
  });
}

export function evaluateIncludedCapacityPricing(
  rules: ChildAgeRules,
  selection: ChildSelection,
  nights: number,
  adults: number,
  includedGuestCount: number | null,
): IncludedCapacityEvaluation {
  const safeNights = Math.max(1, Math.round(nights || 1));
  const safeAdults = Math.max(0, Math.round(adults || 0));
  const counts = {} as Record<ChildTierKey, number>;
  for (const key of TIER_ORDER) counts[key] = Math.max(0, Math.round(selectionCount(selection, key) || 0));

  const childTotal = TIER_ORDER.reduce((s, k) => s + counts[k], 0);
  const actualGuestCount = safeAdults + childTotal;
  const capacityHeadcount =
    safeAdults + TIER_ORDER.reduce((s, k) => s + (rules.tiers[k].counts_toward_capacity ? counts[k] : 0), 0);

  const blockedTiers: ChildTierKey[] = [];

  // 硬限制 1：不接受的年齡層
  for (const key of TIER_ORDER) {
    if (counts[key] > 0 && !rules.tiers[key].allowed) blockedTiers.push(key);
  }

  // 硬限制 2：兒童加大人合計上限（既有語意：成人 + 計入容量的兒童，raw count）
  let totalExceeded = false;
  if (rules.max_total_guests != null && rules.max_total_guests > 0) {
    if (capacityHeadcount > rules.max_total_guests) totalExceeded = true;
  }

  const included = includedGuestCount == null ? 0 : Math.max(0, Math.round(includedGuestCount));
  // included pool：成人優先，其次兒童（依 coverage order）
  let remainingPool = Math.max(0, included - safeAdults);
  const overflowByTier = {} as Record<ChildTierKey, number>;
  for (const key of TIER_ORDER) overflowByTier[key] = counts[key];
  for (const key of coverageOrder(rules)) {
    if (remainingPool <= 0) break;
    const covered = Math.min(overflowByTier[key], remainingPool);
    overflowByTier[key] -= covered;
    remainingPool -= covered;
  }
  const overflow = Math.max(0, actualGuestCount - included);

  // 費用：max_count / over_limit_fee 只作用於 overflow tier count
  let extraFeePerNight = 0;
  const breakdown: IncludedCapacityBreakdownRow[] = [];
  for (const key of TIER_ORDER) {
    const tier = rules.tiers[key];
    const raw = counts[key];
    if (raw <= 0) continue;
    const over = overflowByTier[key];
    let baseCount = over;
    let overCount = 0;
    if (tier.max_count !== null && over > tier.max_count) {
      const overFee = Math.max(0, tier.over_limit_fee_per_night || 0);
      if (overFee > 0) {
        baseCount = tier.max_count;
        overCount = over - tier.max_count;
      } else {
        // over_limit_fee = 0 → 嚴格不可超過（僅針對 overflow 人數判斷）
        if (!blockedTiers.includes(key)) blockedTiers.push(key);
        continue;
      }
    }
    const perNight =
      baseCount * Math.max(0, tier.fee_per_night || 0) +
      overCount * Math.max(0, tier.over_limit_fee_per_night || 0);
    extraFeePerNight += perNight;
    breakdown.push({
      key,
      label: tier.label,
      count: raw,
      overflow_count: over,
      charged_base_count: baseCount,
      charged_over_count: overCount,
      fee_per_night: Math.max(0, tier.fee_per_night || 0),
      over_limit_fee_per_night: Math.max(0, tier.over_limit_fee_per_night || 0),
      nights: safeNights,
      subtotal: perNight * safeNights,
      free: perNight <= 0,
    });
  }

  const blocked = blockedTiers.length > 0 || totalExceeded;
  let blockReason: string | undefined;
  if (totalExceeded) {
    blockReason = `兒童加大人合計不可超過 ${rules.max_total_guests} 位，請調整人數`;
  } else if (blockedTiers.length > 0) {
    const labels = blockedTiers.map((k) => rules.tiers[k].label).join("、");
    blockReason = `${labels}人數超過上限`;
  }

  if (blocked) {
    return {
      blocked: true,
      blockedTiers,
      blockReason,
      actualGuestCount,
      capacityHeadcount,
      includedGuestCount,
      overflow: 0,
      extraFeePerNight: 0,
      extraFeeTotal: 0,
      breakdown: [],
    };
  }

  return {
    blocked: false,
    blockedTiers: [],
    actualGuestCount,
    capacityHeadcount,
    includedGuestCount,
    overflow,
    extraFeePerNight,
    extraFeeTotal: extraFeePerNight * safeNights,
    breakdown,
  };
}

/** 方案已包含人數（Group Buy：included_guest_count → max_guests；General：package.guest_count） */
export function resolveIncludedGuestCount(
  ...candidates: Array<number | null | undefined>
): number | null {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}
