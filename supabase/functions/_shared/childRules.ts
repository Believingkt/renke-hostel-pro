// 兒童分齡規則（Edge 版）：與前端 src/lib/child-rules.ts 邏輯一致。
// 僅供團購建單 server 端重算使用，不影響一般訂房既有驗價流程。
// deno-lint-ignore-file no-explicit-any

export type ChildTierKey = "infant" | "toddler" | "child";

export interface ChildTier {
  label: string;
  min_age: number;
  max_age: number;
  fee_per_night: number;
  max_count: number | null;
  over_limit_fee_per_night?: number;
  allowed: boolean;
  counts_toward_capacity: boolean;
}

export interface ChildAgeRules {
  tiers: Record<ChildTierKey, ChildTier>;
  note: string;
  max_total_guests?: number | null;
}

export const TIER_ORDER: ChildTierKey[] = ["infant", "toddler", "child"];

export const DEFAULT_CHILD_AGE_RULES: ChildAgeRules = {
  tiers: {
    infant: { label: "嬰兒", min_age: 0, max_age: 2, fee_per_night: 0, max_count: null, allowed: true, counts_toward_capacity: false },
    toddler: { label: "幼兒", min_age: 3, max_age: 6, fee_per_night: 500, max_count: 2, allowed: true, counts_toward_capacity: true },
    child: { label: "兒童", min_age: 7, max_age: 12, fee_per_night: 800, max_count: 2, allowed: true, counts_toward_capacity: true },
  },
  note: "",
};

export function parseChildAgeRules(raw: unknown): ChildAgeRules {
  if (!raw || typeof raw !== "object") return DEFAULT_CHILD_AGE_RULES;
  const obj = raw as any;
  const tiersIn = obj.tiers && typeof obj.tiers === "object" ? obj.tiers : {};
  const tiers = {} as Record<ChildTierKey, ChildTier>;
  for (const key of TIER_ORDER) {
    const t = tiersIn[key] && typeof tiersIn[key] === "object" ? tiersIn[key] : {};
    const def = DEFAULT_CHILD_AGE_RULES.tiers[key];
    tiers[key] = {
      label: typeof t.label === "string" && t.label ? t.label : def.label,
      min_age: Number.isFinite(t.min_age) ? Number(t.min_age) : def.min_age,
      max_age: Number.isFinite(t.max_age) ? Number(t.max_age) : def.max_age,
      fee_per_night: Number.isFinite(t.fee_per_night) ? Number(t.fee_per_night) : def.fee_per_night,
      max_count:
        t.max_count === null || t.max_count === undefined || t.max_count === ""
          ? null
          : Number.isFinite(Number(t.max_count))
            ? Number(t.max_count)
            : def.max_count,
      over_limit_fee_per_night: Number.isFinite(Number(t.over_limit_fee_per_night))
        ? Math.max(0, Number(t.over_limit_fee_per_night))
        : 0,
      allowed: typeof t.allowed === "boolean" ? t.allowed : def.allowed,
      counts_toward_capacity:
        typeof t.counts_toward_capacity === "boolean" ? t.counts_toward_capacity : def.counts_toward_capacity,
    };
  }
  return {
    tiers,
    note: typeof obj.note === "string" ? obj.note : "",
    max_total_guests:
      obj.max_total_guests === null || obj.max_total_guests === undefined || obj.max_total_guests === ""
        ? null
        : Number.isFinite(Number(obj.max_total_guests))
          ? Number(obj.max_total_guests)
          : null,
  };
}

export function resolveChildRules(accommodationRules: unknown, packageOverride?: unknown): ChildAgeRules {
  if (packageOverride && typeof packageOverride === "object") return parseChildAgeRules(packageOverride);
  return parseChildAgeRules(accommodationRules);
}

export interface ChildSelection {
  infants: number;
  toddlers: number;
  children: number;
}

export function selectionCount(sel: ChildSelection, key: ChildTierKey): number {
  if (key === "infant") return sel.infants;
  if (key === "toddler") return sel.toddlers;
  return sel.children;
}

export interface ChildEvaluation {
  blocked: boolean;
  blockedTiers: ChildTierKey[];
  extraFeePerNight: number;
  extraFeeTotal: number;
  breakdown: Array<{ key: ChildTierKey; label: string; count: number; subtotal: number }>;
  capacityHeadcount: number;
  totalExceeded?: boolean;
  blockReason?: string;
}

export function evaluateChildSelection(
  rules: ChildAgeRules,
  selection: ChildSelection,
  nights: number,
  adultsCount?: number,
): ChildEvaluation {
  const safeNights = Math.max(1, Math.round(nights || 1));
  const blockedTiers: ChildTierKey[] = [];
  let extraFeePerNight = 0;
  let capacityHeadcount = 0;
  const breakdown: ChildEvaluation["breakdown"] = [];

  for (const key of TIER_ORDER) {
    const tier = rules.tiers[key];
    const count = selectionCount(selection, key);
    if (count <= 0) continue;
    if (!tier.allowed) {
      blockedTiers.push(key);
      continue;
    }
    let baseCount = count;
    let overCount = 0;
    if (tier.max_count !== null && count > tier.max_count) {
      const overFee = Math.max(0, tier.over_limit_fee_per_night || 0);
      if (overFee > 0) {
        baseCount = tier.max_count;
        overCount = count - tier.max_count;
      } else {
        blockedTiers.push(key);
        continue;
      }
    }
    if (tier.counts_toward_capacity) capacityHeadcount += count;
    const basePerNight = (tier.fee_per_night || 0) * baseCount;
    const overPerNight = (tier.over_limit_fee_per_night || 0) * overCount;
    extraFeePerNight += basePerNight + overPerNight;
    const subtotal = (basePerNight + overPerNight) * safeNights;
    if (subtotal > 0) breakdown.push({ key, label: tier.label, count, subtotal });
  }

  let totalExceeded = false;
  if (typeof adultsCount === "number" && rules.max_total_guests != null && rules.max_total_guests > 0) {
    if (Math.max(0, adultsCount) + capacityHeadcount > rules.max_total_guests) totalExceeded = true;
  }

  const blocked = blockedTiers.length > 0 || totalExceeded;
  let blockReason: string | undefined;
  if (totalExceeded) {
    blockReason = `兒童加大人合計不可超過 ${rules.max_total_guests} 位，請調整人數`;
  } else if (blockedTiers.length > 0) {
    const labels = blockedTiers.map((k) => rules.tiers[k].label).join("、");
    blockReason = `${labels}人數超過上限或不接受入住`;
  }

  return {
    blocked,
    blockedTiers,
    extraFeePerNight,
    extraFeeTotal: extraFeePerNight * safeNights,
    breakdown,
    capacityHeadcount,
    totalExceeded,
    blockReason,
  };
}
