// 團購活動層（Campaign-Level）兒童分齡規則（Edge 版，與 src/lib/groupBuyChildRules.ts 一致）
// SoT：group_buy_campaigns.child_age_rules；NULL = fallback 既有行為（民宿規則 + 方案覆寫、全部顯示）。
// 絕不寫回 accommodation_info.child_age_rules / accommodation_packages.child_age_rules_override。
// deno-lint-ignore-file no-explicit-any
import {
  type ChildAgeRules,
  type ChildTierKey,
  TIER_ORDER,
  parseChildAgeRules,
  resolveChildRules,
} from "./groupBuyChildRules.ts";
import {
  DEFAULT_CHILD_TIER_VISIBILITY,
  parseChildTierVisibility,
  type ChildTierVisibility,
} from "./groupBuyChildVisibility.ts";

export interface GroupBuyChildRules extends ChildAgeRules {
  tier_visibility: ChildTierVisibility;
}

export function parseGroupBuyChildRules(raw: unknown): GroupBuyChildRules {
  const base = parseChildAgeRules(raw);
  const vis = parseChildTierVisibility(
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).tier_visibility : undefined,
  );
  return { ...base, tier_visibility: vis };
}

export function resolveGroupBuyChildRules(
  campaignRaw: unknown,
  accommodationRules: unknown,
  packageOverride?: unknown,
): GroupBuyChildRules {
  if (campaignRaw && typeof campaignRaw === "object") return parseGroupBuyChildRules(campaignRaw);
  return {
    ...resolveChildRules(accommodationRules, packageOverride),
    tier_visibility: { ...DEFAULT_CHILD_TIER_VISIBILITY },
  };
}

export function anyGroupBuyTierVisible(rules: GroupBuyChildRules): boolean {
  return TIER_ORDER.some((k: ChildTierKey) => rules.tier_visibility[k] !== false);
}
