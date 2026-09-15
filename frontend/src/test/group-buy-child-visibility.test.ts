import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHILD_TIER_VISIBILITY,
  anyChildTierVisible,
  applyVisibilityToGuests,
  parseChildTierVisibility,
} from "@/lib/groupBuyChildVisibility";

describe("團購兒童分齡顯示設定", () => {
  it("NULL / 非物件一律視為三種全顯示（既有活動相容）", () => {
    expect(parseChildTierVisibility(null)).toEqual(DEFAULT_CHILD_TIER_VISIBILITY);
    expect(parseChildTierVisibility(undefined)).toEqual(DEFAULT_CHILD_TIER_VISIBILITY);
    expect(parseChildTierVisibility("x")).toEqual(DEFAULT_CHILD_TIER_VISIBILITY);
  });

  it("部分設定只覆寫指定 tier，其餘維持顯示", () => {
    expect(parseChildTierVisibility({ infant: false })).toEqual({
      infant: false,
      toddler: true,
      child: true,
    });
  });

  it("三種全 OFF 時判定為隱藏整個孩童區塊", () => {
    const v = parseChildTierVisibility({ infant: false, toddler: false, child: false });
    expect(anyChildTierVisible(v)).toBe(false);
    expect(anyChildTierVisible(DEFAULT_CHILD_TIER_VISIBILITY)).toBe(true);
  });

  it("隱藏的年齡層人數一律歸零，成人不受影響", () => {
    const guests = { adults: 2, children: 2, toddlers: 1, infants: 1 };
    expect(applyVisibilityToGuests(guests, { infant: false, toddler: true, child: false })).toEqual({
      adults: 2,
      children: 0,
      toddlers: 1,
      infants: 0,
    });
  });
});
