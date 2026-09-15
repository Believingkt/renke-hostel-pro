/**
 * 團購活動層（Campaign-Level）兒童分齡規則
 *
 * SoT：group_buy_campaigns.child_age_rules（jsonb，NULL = 尚未設定）
 * 隔離原則：
 *  - 只讀／只寫 group_buy_campaigns.child_age_rules
 *  - 絕不寫回 accommodation_info.child_age_rules / accommodation_packages.child_age_rules_override
 *  - NULL 時 fallback 為「目前既有行為」（民宿一般規則 + 方案覆寫，三種年齡層全部顯示），
 *    確保既有活動（如 ma）在管理員第一次儲存前 0 regression。
 *
 * 計算演算法共用 src/lib/child-rules.ts 的純函式（evaluateChildSelection），
 * 但設定 storage 完全獨立。
 */
import {
  type ChildAgeRules,
  type ChildTierKey,
  TIER_ORDER,
  parseChildAgeRules,
  resolveChildRules,
} from "@/lib/child-rules";
import {
  DEFAULT_CHILD_TIER_VISIBILITY,
  parseChildTierVisibility,
  type ChildTierVisibility,
} from "@/lib/groupBuyChildVisibility";

export interface GroupBuyChildRules extends ChildAgeRules {
  /** 團購頁顯示開關（與 tier.allowed「接受訂房」是兩個不同 contract） */
  tier_visibility: ChildTierVisibility;
}

export function parseGroupBuyChildRules(raw: unknown): GroupBuyChildRules {
  const base = parseChildAgeRules(raw);
  const vis = parseChildTierVisibility(
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).tier_visibility : undefined,
  );
  return { ...base, tier_visibility: vis };
}

/** campaign 尚未設定時，以既有行為（民宿規則 + 方案覆寫、全部顯示）作為 fallback */
export function resolveGroupBuyChildRules(
  campaignRaw: unknown,
  accommodationRules: unknown,
  packageOverride?: unknown,
): GroupBuyChildRules {
  if (campaignRaw && typeof campaignRaw === "object") {
    return parseGroupBuyChildRules(campaignRaw);
  }
  return {
    ...resolveChildRules(accommodationRules, packageOverride),
    tier_visibility: { ...DEFAULT_CHILD_TIER_VISIBILITY },
  };
}

/**
 * 正式 SoT = PER PACKAGE（group_buy_campaign_packages.child_age_rules）。
 * package 未設定時，過渡期 fallback 至 campaign（DEPRECATED），再 fallback 民宿規則。
 */
export function resolveGroupBuyPackageChildRules(
  packageRaw: unknown,
  campaignRaw: unknown,
  accommodationRules: unknown,
  packageOverride?: unknown,
): GroupBuyChildRules {
  if (packageRaw && typeof packageRaw === "object") {
    return parseGroupBuyChildRules(packageRaw);
  }
  return resolveGroupBuyChildRules(campaignRaw, accommodationRules, packageOverride);
}


/** 初始化（COPY ONCE）：由一般訂房規則複製為團購自己的 snapshot */
export function initGroupBuyChildRulesFrom(accommodationRules: unknown): GroupBuyChildRules {
  return {
    ...parseChildAgeRules(accommodationRules),
    tier_visibility: { ...DEFAULT_CHILD_TIER_VISIBILITY },
  };
}

export function groupBuyTierVisible(rules: GroupBuyChildRules, key: ChildTierKey): boolean {
  return rules.tier_visibility[key] !== false;
}

export function anyGroupBuyTierVisible(rules: GroupBuyChildRules): boolean {
  return TIER_ORDER.some((k) => groupBuyTierVisible(rules, k));
}
