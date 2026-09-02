/**
 * 團購專用：Package Included Capacity 計價（GROUP BUY ONLY）
 *
 * 正式原則：
 *  - 方案售價已包含的人頭（included_guest_count，NULL 時沿用 max_guests）
 *    不得因「兒童分類」再被二次加價。
 *  - 只有超出 included 的 overflow 人頭，才會產生 child fee / over-limit fee。
 *  - 硬限制（allowed=false、max_count 且 over_limit_fee=0、max_total_guests）
 *    完全維持既有 contract，不因 included capacity 而被繞過。
 *  - counts_toward_capacity=false 的 tier（例如嬰兒）不佔 included capacity，
 *    其費用維持既有行為。
 *
 * 一般訂房 /booking 不使用本檔案，calculator（child-rules.ts）未被修改。
 */
import {
  type ChildAgeRules,
  type ChildSelection,
  type ChildTierKey,
  TIER_ORDER,
  evaluateChildSelection,
  selectionCount,
} from "@/lib/child-rules";

export interface GroupBuyChildEvaluation {
  blocked: boolean;
  blockedTiers: ChildTierKey[];
  blockReason?: string;
  /** 成人 + 計入容量的兒童 */
  capacityHeadcount: number;
  /** 方案已包含人數（null = 未設定，等同不提供 included 折抵） */
  includedGuestCount: number | null;
  /** 超出 included 的人頭數 */
  overflow: number;
  extraFeePerNight: number;
  extraFeeTotal: number;
  breakdown: Array<{
    key: ChildTierKey;
    label: string;
    count: number;
    charged_base_count: number;
    charged_over_count: number;
    fee_per_night: number;
    over_limit_fee_per_night: number;
    nights: number;
    subtotal: number;
    free: boolean;
  }>;
}

interface Unit {
  key: ChildTierKey;
  kind: "over" | "base";
  fee: number;
}

/** 方案已包含人數：included_guest_count 優先，其次 max_guests；皆無 = null */
export function packageIncludedGuestCount(pkg: {
  included_guest_count?: number | null;
  max_guests?: number | null;
} | null | undefined): number | null {
  if (!pkg) return null;
  const inc = Number(pkg.included_guest_count);
  if (Number.isFinite(inc) && inc > 0) return Math.round(inc);
  const max = Number(pkg.max_guests);
  if (Number.isFinite(max) && max > 0) return Math.round(max);
  return null;
}

export function evaluateGroupBuyChildSelection(
  rules: ChildAgeRules,
  selection: ChildSelection,
  nights: number,
  adults: number,
  includedGuestCount: number | null,
): GroupBuyChildEvaluation {
  const safeNights = Math.max(1, Math.round(nights || 1));
  const safeAdults = Math.max(0, Math.round(adults || 0));
  // 硬限制與容量判定完全沿用既有 calculator（未改寫，/booking 無 regression）
  const base = evaluateChildSelection(rules, selection, safeNights, safeAdults);
  const capacityHeadcount = safeAdults + base.capacityHeadcount;

  if (base.blocked) {
    return {
      blocked: true,
      blockedTiers: base.blockedTiers,
      blockReason: base.blockReason,
      capacityHeadcount,
      includedGuestCount,
      overflow: 0,
      extraFeePerNight: 0,
      extraFeeTotal: 0,
      breakdown: [],
    };
  }

  // 計入容量的兒童人頭；成人優先占用 included capacity
  const capacityTiers = TIER_ORDER.filter((k) => rules.tiers[k].counts_toward_capacity);
  const childCapacityGuests = capacityTiers.reduce((sum, k) => sum + selectionCount(selection, k), 0);
  const coverage = includedGuestCount == null ? 0 : Math.max(0, includedGuestCount - safeAdults);
  const coveredChildren = Math.min(childCapacityGuests, coverage);
  const chargeableChildren = Math.max(0, childCapacityGuests - coveredChildren);
  const overflow = includedGuestCount == null ? 0 : Math.max(0, capacityHeadcount - includedGuestCount);

  // 可收費單位：over-limit 名額視為「最後進來的人」，優先落在 overflow
  const units: Unit[] = [];
  for (const key of capacityTiers) {
    const tier = rules.tiers[key];
    const count = selectionCount(selection, key);
    if (count <= 0) continue;
    const overCount = tier.max_count !== null && count > tier.max_count ? count - tier.max_count : 0;
    const baseCount = count - overCount;
    for (let i = 0; i < overCount; i++) {
      units.push({ key, kind: "over", fee: Math.max(0, tier.over_limit_fee_per_night || 0) });
    }
    for (let i = 0; i < baseCount; i++) {
      units.push({ key, kind: "base", fee: Math.max(0, tier.fee_per_night || 0) });
    }
  }
  units.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "over" ? -1 : 1;
    return b.fee - a.fee;
  });

  const chargedBase = new Map<ChildTierKey, number>();
  const chargedOver = new Map<ChildTierKey, number>();
  let extraFeePerNight = 0;
  for (const unit of units.slice(0, chargeableChildren)) {
    const map = unit.kind === "over" ? chargedOver : chargedBase;
    map.set(unit.key, (map.get(unit.key) ?? 0) + 1);
    extraFeePerNight += unit.fee;
  }

  // 不計入容量的 tier（例如嬰兒）：不佔 included 人頭，費用維持既有行為
  for (const key of TIER_ORDER) {
    const tier = rules.tiers[key];
    if (tier.counts_toward_capacity) continue;
    const count = selectionCount(selection, key);
    if (count <= 0) continue;
    const overCount = tier.max_count !== null && count > tier.max_count ? count - tier.max_count : 0;
    const baseCount = count - overCount;
    chargedBase.set(key, baseCount);
    chargedOver.set(key, overCount);
    extraFeePerNight += baseCount * Math.max(0, tier.fee_per_night || 0) +
      overCount * Math.max(0, tier.over_limit_fee_per_night || 0);
  }

  const breakdown: GroupBuyChildEvaluation["breakdown"] = [];
  for (const key of TIER_ORDER) {
    const tier = rules.tiers[key];
    const count = selectionCount(selection, key);
    if (count <= 0) continue;
    const cb = chargedBase.get(key) ?? 0;
    const co = chargedOver.get(key) ?? 0;
    const subtotal =
      (cb * Math.max(0, tier.fee_per_night || 0) + co * Math.max(0, tier.over_limit_fee_per_night || 0)) *
      safeNights;
    breakdown.push({
      key,
      label: tier.label,
      count,
      charged_base_count: cb,
      charged_over_count: co,
      fee_per_night: Math.max(0, tier.fee_per_night || 0),
      over_limit_fee_per_night: Math.max(0, tier.over_limit_fee_per_night || 0),
      nights: safeNights,
      subtotal,
      free: subtotal <= 0,
    });
  }

  return {
    blocked: false,
    blockedTiers: [],
    capacityHeadcount,
    includedGuestCount,
    overflow,
    extraFeePerNight,
    extraFeeTotal: extraFeePerNight * safeNights,
    breakdown,
  };
}
