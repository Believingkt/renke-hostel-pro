import { describe, it, expect } from "vitest";
import {
  calcOrderAddonTotal,
  extraOnSiteAddonFromNotes,
  pureRoomFeeOf,
} from "@/lib/orderAddonTotal";

describe("extraOnSiteAddonFromNotes", () => {
  it("returns 0 without a marker block", () => {
    expect(extraOnSiteAddonFromNotes(null)).toBe(0);
    expect(extraOnSiteAddonFromNotes("一般備註")).toBe(0);
  });

  it("parses the on-site addon marker block", () => {
    expect(
      extraOnSiteAddonFromNotes("備註\n【額外現場加購金額】1200【額外現場加購金額END】"),
    ).toBe(1200);
  });
});

describe("calcOrderAddonTotal", () => {
  it("sums custom_addon_details totals", () => {
    expect(
      calcOrderAddonTotal({
        custom_addon_details: [
          { addon_type: "加床", total: 1000 },
          { addon_type: "接機車資", total: 800 },
        ],
      }),
    ).toBe(1800);
  });

  it("ignores legacy meal / bbq special-casing (they are plain custom addons now)", () => {
    expect(
      calcOrderAddonTotal({
        custom_addon_details: [
          { addon_type: "meal", total: 500 },
          { addon_type: "bbq", total: 700 },
        ],
      }),
    ).toBe(1200);
  });

  it("prefers the legacy pet_plan_price column over pet rows in custom details", () => {
    expect(
      calcOrderAddonTotal({
        pet_plan_price: 600,
        custom_addon_details: [
          { addon_type: "pet", total: 400 },
          { addon_type: "加床", total: 1000 },
        ],
      }),
    ).toBe(1600);
  });

  it("falls back to pet rows in custom details when the column is empty", () => {
    expect(
      calcOrderAddonTotal({
        pet_plan_price: 0,
        custom_addon_details: [{ addon_type: "pet", total: 400 }],
      }),
    ).toBe(400);
  });

  it("adds on-site extras from notes", () => {
    expect(
      calcOrderAddonTotal({
        custom_addon_details: [{ addon_type: "加床", total: 1000 }],
        notes: "【額外現場加購金額】500【額外現場加購金額END】",
      }),
    ).toBe(1500);
  });

  it("tolerates malformed custom_addon_details", () => {
    expect(calcOrderAddonTotal({ custom_addon_details: null })).toBe(0);
    expect(calcOrderAddonTotal({ custom_addon_details: "oops" as unknown })).toBe(0);
    expect(
      calcOrderAddonTotal({ custom_addon_details: [null, { addon_type: "x", total: "300" }] }),
    ).toBe(300);
  });
});

describe("pureRoomFeeOf — paid order addon edit guard", () => {
  it("keeps the room fee stable when only addons change", () => {
    const before = {
      total_price: 52000,
      discount_amount: 0,
      final_price: 52000,
      custom_addon_details: [{ addon_type: "加床", total: 2000 }],
    };
    const after = {
      ...before,
      total_price: 53500,
      final_price: 53500,
      custom_addon_details: [{ addon_type: "加床", total: 3500 }],
    };
    expect(pureRoomFeeOf(before)).toBe(50000);
    expect(pureRoomFeeOf(after)).toBe(50000);
  });

  it("keeps legacy pet orders stable when adding a new custom addon", () => {
    const legacy = {
      total_price: 30800,
      discount_amount: 800,
      final_price: 30000,
      pet_plan_price: 800,
      custom_addon_details: [],
    };
    const edited = {
      ...legacy,
      total_price: 32800,
      final_price: 32000,
      custom_addon_details: [{ addon_type: "接機車資", total: 2000 }],
    };
    expect(pureRoomFeeOf(legacy)).toBe(30000);
    expect(pureRoomFeeOf(edited)).toBe(30000);
  });

  it("detects a real room-fee change", () => {
    const before = {
      total_price: 52000,
      discount_amount: 0,
      final_price: 52000,
      custom_addon_details: [{ addon_type: "加床", total: 2000 }],
    };
    const after = { ...before, total_price: 55000, final_price: 55000 };
    expect(pureRoomFeeOf(after)).not.toBe(pureRoomFeeOf(before));
  });

  it("does not subtract addons for old orders whose total_price excludes them", () => {
    // final_price !== total_price - discount → total_price 未含加購
    const order = {
      total_price: 20000,
      discount_amount: 0,
      final_price: 21000,
      custom_addon_details: [{ addon_type: "加床", total: 1000 }],
    };
    expect(pureRoomFeeOf(order)).toBe(20000);
  });

  it("never returns a negative room fee", () => {
    expect(
      pureRoomFeeOf({
        total_price: 500,
        discount_amount: 0,
        final_price: 500,
        custom_addon_details: [{ addon_type: "加床", total: 1000 }],
      }),
    ).toBe(0);
  });
});
