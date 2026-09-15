// 團購專用「兒童分齡顯示設定」（Edge 版，與 src/lib/groupBuyChildVisibility.ts 一致）
// 只讀 group_buy_campaign_packages.child_tier_visibility；NULL = 三種全部顯示。
// deno-lint-ignore-file no-explicit-any
import { TIER_ORDER, type ChildTierKey } from "./groupBuyChildRules.ts";

export type ChildTierVisibility = Record<ChildTierKey, boolean>;

export const DEFAULT_CHILD_TIER_VISIBILITY: ChildTierVisibility = {
  infant: true,
  toddler: true,
  child: true,
};

export function parseChildTierVisibility(raw: unknown): ChildTierVisibility {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CHILD_TIER_VISIBILITY };
  const obj = raw as Record<string, unknown>;
  const out = { ...DEFAULT_CHILD_TIER_VISIBILITY };
  for (const key of TIER_ORDER) {
    if (typeof obj[key] === "boolean") out[key] = obj[key] as boolean;
  }
  return out;
}
