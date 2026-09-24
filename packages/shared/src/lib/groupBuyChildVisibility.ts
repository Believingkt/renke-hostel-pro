/**
 * 團購專用「兒童分齡顯示設定」（Visibility Override）
 *
 * 隔離原則：本檔只讀取 group_buy_campaign_packages.child_tier_visibility，
 * 絕不寫回 accommodation_info.child_age_rules 或 accommodation_packages.child_age_rules_override。
 * NULL / 缺欄位 = 三種年齡層全部顯示（既有活動 100% 相容）。
 */
import type { ChildTierKey } from "@lakeze/shared/lib/child-rules";
import { TIER_ORDER } from "@lakeze/shared/lib/child-rules";
import type { GuestCounts } from "@lakeze/shared/lib/groupBuyGuests";

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

export function anyChildTierVisible(v: ChildTierVisibility): boolean {
  return TIER_ORDER.some((k) => v[k]);
}

/** 隱藏的年齡層一律歸零（顯示層與送單前的保險） */
export function applyVisibilityToGuests(g: GuestCounts, v: ChildTierVisibility): GuestCounts {
  return {
    adults: g.adults,
    children: v.child ? g.children : 0,
    toddlers: v.toddler ? g.toddlers : 0,
    infants: v.infant ? g.infants : 0,
  };
}
