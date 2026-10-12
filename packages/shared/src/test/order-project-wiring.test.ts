// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const bookingFlow = read("apps/booking/src/pages/BookingFlow.tsx");
const validatePrices = read("supabase/functions/validate-order-prices/index.ts");
const paidOrder = read("supabase/functions/create-paid-order/index.ts");
const threeDs = read("supabase/functions/complete-3ds-booking/index.ts");
const cardBound = read("supabase/functions/create-card-bound-order/index.ts");

describe("B2 前台折扣碼驗證與價格驗證改用共用 resolver", () => {
  it("BookingFlow 以共用純函式算出 orderPricingTemplateId", () => {
    expect(bookingFlow).toContain('from "@lakeze/shared/utils/orderPricingTemplate"');
    expect(bookingFlow).toContain("resolveOrderPricingTemplateId({");
    expect(bookingFlow).toContain("fallbackTemplateId: selectedTemplate?.id || null,");
  });

  it("validate_discount_code 與 validate-order-prices 都帶 orderPricingTemplateId", () => {
    expect(bookingFlow).toContain("p_pricing_template_id: orderPricingTemplateId");
    expect(bookingFlow).toContain("pricingTemplateId: orderPricingTemplateId,");
    expect(bookingFlow).not.toContain("p_pricing_template_id: selectedTemplate?.id");
  });
});

describe("B3 validate-order-prices 伺服器端自行決定專案（body 值僅 fallback）", () => {
  it("呼叫 validate_discount_code 前先 resolve", () => {
    expect(validatePrices).toContain('from "../_shared/orderPricingTemplate.ts"');
    expect(validatePrices).toContain("fallbackTemplateId: pricingTemplateId ?? null,");
    expect(validatePrices).toContain("p_pricing_template_id: resolvedPricingTemplateId");
  });

  it("折扣計算段未被改動（仍用 computeDiscountedRoomCharge 的取較便宜公式）", () => {
    expect(validatePrices).toContain("const charge = computeDiscountedRoomCharge({");
    expect(validatePrices).toContain("saleTotal: calculatedRoomTotal,");
    expect(validatePrices).toContain("originalTotal: discountBase,");
    expect(validatePrices).toContain(
      "calculatedDiscount = Math.max(0, Math.min(chargedRoomTotal, chargedRoomTotal - charge.chargedRoomTotal));",
    );
  });
});

describe("B4 四個官網建單入口寫入 pricing_template_id", () => {
  it("BookingFlow 直接 insert：orders 與 order_rooms 都寫入", () => {
    expect(bookingFlow).toContain("pricing_template_id: orderPricingTemplateId,");
    expect(bookingFlow).toContain("template_id: orderPricingTemplateId,");
  });

  for (const [name, src] of [
    ["create-paid-order", paidOrder],
    ["complete-3ds-booking", threeDs],
    ["create-card-bound-order", cardBound],
  ] as const) {
    it(`${name} 於伺服器端 resolve 後寫入 orders.pricing_template_id`, () => {
      expect(src).toContain('from "../_shared/orderPricingTemplate.ts"');
      expect(src).toContain("const orderPricingTemplateId = resolveOrderPricingTemplateId({");
      expect(src).toContain("pricing_template_id: orderPricingTemplateId,");
    });
  }

  it("create-paid-order 的 order_rooms 寫入 template_id", () => {
    expect(paidOrder).toContain("template_id: orderPricingTemplateId,");
  });

  it("complete-3ds-booking / create-card-bound-order 維持不寫 order_rooms", () => {
    expect(threeDs).not.toContain('from("order_rooms")');
    expect(cardBound).not.toContain('from("order_rooms")');
  });
});

describe("D2 後台「專案」顯示順序：專案 → 方案 → 現行 meal_plan", () => {
  const sites = [
    "apps/booking/src/pages/OrderDetail.tsx",
    "apps/booking/src/components/orders/OrdersTable.tsx",
    "apps/booking/src/components/orders/OrderQuickPreview.tsx",
    "apps/booking/src/pages/CustomerOrders.tsx",
  ];
  for (const site of sites) {
    it(`${site} 使用共用顯示函式並以 meal_plan 作最後 fallback`, () => {
      const src = read(site);
      expect(src).toContain('from "@lakeze/shared/utils/orderProjectLabel"');
      expect(src).toContain("resolveOrderProjectDisplayName({");
      expect(src).toMatch(/pricingTemplateId:/);
      expect(src).toMatch(/packageId:/);
      expect(src).toMatch(/\?\?\s*\(?\s*(getTemplateDisplayName|getMealPlanDisplayName|order\.meal_plan)/);
    });
  }

  it("orders.meal_plan 寫入邏輯未改動（BookingFlow 仍寫 selectedMealPlan）", () => {
    expect(bookingFlow).toContain("meal_plan: selectedMealPlan,");
  });
});

describe("不得改動的檔案維持原狀（安全邊界）", () => {
  it("discountPricing.ts 兩份仍為同一公式", () => {
    const fe = read("packages/shared/src/utils/discountPricing.ts");
    const be = read("supabase/functions/_shared/discountPricing.ts");
    const strip = (s: string) => s.split("\n").filter((l) => !l.includes("必須完全一致")).join("\n");
    expect(strip(fe)).toBe(strip(be));
    expect(fe).toContain("const charged = Math.min(sale, discountedOriginal);");
  });
});
