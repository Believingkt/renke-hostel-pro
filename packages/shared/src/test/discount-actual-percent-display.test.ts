// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import MobileOrderSummary from "../../../../apps/booking/src/components/booking-flow/MobileOrderSummary";
import { computeDiscountedRoomCharge } from "@lakeze/shared/utils/discountPricing";
import { getActualDiscountPercent } from "@lakeze/shared/utils/discountDisplay";

/** 案例二：原價 30,900／官網售價 17,000／折扣碼 N% */
function renderSummary(percent: number) {
  const charge = computeDiscountedRoomCharge({
    saleTotal: 17000,
    originalTotal: 30900,
    discountKind: "percentage",
    discountValue: percent,
  });
  const actual = getActualDiscountPercent({
    billedRoomTotal: charge.billedRoomTotal,
    discountAmount: charge.discountAmount,
  });
  const html = renderToStaticMarkup(
    React.createElement(MobileOrderSummary as any, {
      accommodationName: "雲岫",
      checkInDate: new Date("2026-11-26T00:00:00+08:00"),
      checkOutDate: new Date("2026-11-27T00:00:00+08:00"),
      calculateNights: () => 1,
      totalGuests: 12,
      adultsCount: 12,
      selectedRoom: { id: "r1", name: "全棟" },
      roomsCount: 1,
      roomSubtotal: charge.billedRoomTotal,
      calculateFinalTotal: () => charge.chargedRoomTotal,
      appliedDiscount: { code: "168168", type: "percentage", value: percent },
      actualDiscountPercent: actual,
      calculateDiscount: () => charge.discountAmount,
    }),
  );
  return { html, charge, actual };
}

describe("D1 前台折扣顯示（實際折扣率）", () => {
  it("折扣碼 35%（售價較便宜）→ 顯示「原價 -45%」", () => {
    const { html, charge, actual } = renderSummary(35);
    expect(charge).toEqual({ billedRoomTotal: 30900, discountAmount: 13900, chargedRoomTotal: 17000 });
    expect(actual).toBe(45);
    expect(html).toContain("原價 -45%");
    expect(html).not.toContain("折扣原價35%");
    // eslint-disable-next-line no-console
    console.log("D1 35% =>", html.match(/已套用[^<]*/)?.[0]);
  });

  it("折扣碼 50%（原價折後較便宜）→ 顯示「原價 -50%」，不顯示官網更優惠提示", () => {
    const { html, charge, actual } = renderSummary(50);
    expect(charge).toEqual({ billedRoomTotal: 30900, discountAmount: 15450, chargedRoomTotal: 15450 });
    expect(actual).toBe(50);
    expect(html).toContain("原價 -50%");
    // 官網優惠價提示僅在 charged >= sale 時出現；此案 15450 < 17000 → 不出現
    expect(charge.chargedRoomTotal >= 17000).toBe(false);
    expect(html).not.toContain("官網優惠價");
    // eslint-disable-next-line no-console
    console.log("D1 50% =>", html.match(/已套用[^<]*/)?.[0]);
  });
});
