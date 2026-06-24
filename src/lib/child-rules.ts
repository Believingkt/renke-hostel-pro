/**
 * 兒童分齡規則（嬰兒 / 幼兒 / 兒童）
 *
 * 由民宿設定預設值（accommodation_info.child_age_rules），方案可選擇覆寫
 * （accommodation_packages.child_age_rules_override）。
 */

export type ChildTierKey = "infant" | "toddler" | "child";

export interface ChildTier {
  label: string;
  min_age: number;
  max_age: number;
  /** 每位每晚加價（NT$，0 = 免費） */
  fee_per_night: number;
  /** 人數上限；null = 不限 */
  max_count: number | null;
  /** 超過 max_count 時，每多 1 位的每晚加價（NT$）；0 或未設 = 嚴格不可超過（block） */
  over_limit_fee_per_night?: number;
  /** 是否接受該年齡層訂房 */
  allowed: boolean;
  /** 是否計入房型容量（一般嬰兒不計） */
  counts_toward_capacity: boolean;
}

export interface ChildAgeRules {
  tiers: Record<ChildTierKey, ChildTier>;
  note: string;
  /** 兒童加大人合計上限（含計入容量的兒童）；null = 不限 */
  max_total_guests?: number | null;
}


export const TIER_ORDER: ChildTierKey[] = ["infant", "toddler", "child"];

export const DEFAULT_CHILD_AGE_RULES: ChildAgeRules = {
  tiers: {
    infant: {
      label: "嬰兒",
      min_age: 0,
      max_age: 2,
      fee_per_night: 0,
      max_count: null,
      allowed: true,
      counts_toward_capacity: false,
    },
    toddler: {
      label: "幼兒",
      min_age: 3,
      max_age: 6,
      fee_per_night: 500,
      max_count: 2,
      allowed: true,
      counts_toward_capacity: true,
    },
    child: {
      label: "兒童",
      min_age: 7,
      max_age: 12,
      fee_per_night: 800,
      max_count: 2,
      allowed: true,
      counts_toward_capacity: true,
    },
  },
  note: "",
};

/** 嚴謹解析 jsonb 欄位，缺欄位以預設補齊 */
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
      fee_per_night: Number.isFinite(t.fee_per_night)
        ? Number(t.fee_per_night)
        : def.fee_per_night,
      max_count:
        t.max_count === null || t.max_count === undefined || t.max_count === ""
          ? null
          : Number.isFinite(Number(t.max_count))
            ? Number(t.max_count)
            : def.max_count,
      allowed: typeof t.allowed === "boolean" ? t.allowed : def.allowed,
      counts_toward_capacity:
        typeof t.counts_toward_capacity === "boolean"
          ? t.counts_toward_capacity
          : def.counts_toward_capacity,
    };
  }
  return {
    tiers,
    note: typeof obj.note === "string" ? obj.note : "",
  };
}

/** 套用方案覆寫：override 非 null 時以 override 為準 */
export function resolveChildRules(
  accommodationRules: unknown,
  packageOverride?: unknown,
): ChildAgeRules {
  if (packageOverride && typeof packageOverride === "object") {
    return parseChildAgeRules(packageOverride);
  }
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
  /** 任一年齡層被禁止或超過上限 → 整體不可訂（圖卡淡化） */
  blocked: boolean;
  /** 被禁止/超限的年齡層 */
  blockedTiers: ChildTierKey[];
  /** 每晚總加價（NT$） */
  extraFeePerNight: number;
  /** 總加價（NT$，已乘 nights） */
  extraFeeTotal: number;
  /** 對應的可讀說明，例如「兒童 +NT$1,600（2 位 × 1 晚）」 */
  breakdown: Array<{ key: ChildTierKey; label: string; count: number; subtotal: number }>;
  /** 額外占用的「人」數（用於與成人合計判斷房型容量；嬰兒通常不計） */
  capacityHeadcount: number;
}

export function evaluateChildSelection(
  rules: ChildAgeRules,
  selection: ChildSelection,
  nights: number,
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
    if (tier.max_count !== null && count > tier.max_count) {
      blockedTiers.push(key);
      continue;
    }
    if (tier.counts_toward_capacity) capacityHeadcount += count;
    const subtotal = (tier.fee_per_night || 0) * count * safeNights;
    extraFeePerNight += (tier.fee_per_night || 0) * count;
    if (subtotal > 0) {
      breakdown.push({ key, label: tier.label, count, subtotal });
    }
  }

  return {
    blocked: blockedTiers.length > 0,
    blockedTiers,
    extraFeePerNight,
    extraFeeTotal: extraFeePerNight * safeNights,
    breakdown,
    capacityHeadcount,
  };
}

/** 摘要文字：嬰兒 0-2 歲免費 · 幼兒 3-6 歲 +500/位/晚（上限 2）· … */
export function summarizeChildRules(rules: ChildAgeRules): string {
  return TIER_ORDER.map((key) => {
    const t = rules.tiers[key];
    if (!t.allowed) return `${t.label} ${t.min_age}-${t.max_age} 歲：不接受`;
    const fee = t.fee_per_night > 0 ? `+NT$${t.fee_per_night}/位/晚` : "免費";
    const cap = t.max_count !== null ? `（上限 ${t.max_count} 位）` : "";
    return `${t.label} ${t.min_age}-${t.max_age} 歲 ${fee}${cap}`;
  }).join(" · ");
}
