import { describe, it, expect } from "vitest";
import { resolveOrderPricingTemplateId as feResolve } from "@lakeze/shared/utils/orderPricingTemplate";
import { resolveOrderPricingTemplateId as beResolve } from "../../../../supabase/functions/_shared/orderPricingTemplate";
import { resolveOrderProjectDisplayName } from "@lakeze/shared/utils/orderProjectLabel";
import { getActualDiscountPercent } from "@lakeze/shared/utils/discountDisplay";
import vectors from "./fixtures/discount-pricing-vectors.json";

describe("B1 訂單對應專案純函式（前端／Edge 同一組測試向量）", () => {
  for (const c of vectors.templateCases) {
    it(`${c.id} ${c.name}`, () => {
      const input = {
        templates: c.templates,
        accommodationId: c.accommodationId,
        packageId: c.packageId,
        fallbackTemplateId: c.fallbackTemplateId,
      };
      const fe = feResolve(input as any);
      const be = beResolve(input as any);
      expect(fe).toBe(c.expectTemplateId);
      expect(be).toBe(c.expectTemplateId);
      expect(fe !== null).toBe(c.expectDiscountApplies);
      // eslint-disable-next-line no-console
      console.log(`${c.id} => FE=${fe} BE=${be} expect=${c.expectTemplateId}`);
    });
  }

  it("前端與 Edge 兩份純函式邏輯逐字相同（僅互相指向的註解一行不同）", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const root = path.resolve(__dirname, "../../../..");
    const strip = (s: string) =>
      s.split("\n").filter((l) => !l.includes("必須完全一致（同一組測試向量驗證）")).join("\n");
    const fe = strip(fs.readFileSync(path.join(root, "packages/shared/src/utils/orderPricingTemplate.ts"), "utf8"));
    const be = strip(fs.readFileSync(path.join(root, "supabase/functions/_shared/orderPricingTemplate.ts"), "utf8"));
    expect(fe).toBe(be);
  });

  it("沒有 packageId 時直接沿用 fallback；templates 為空陣列不會爆", () => {
    expect(feResolve({ templates: [], packageId: null, fallbackTemplateId: "tpl-a" })).toBe("tpl-a");
    expect(feResolve({ templates: null, packageId: "pkg-1", fallbackTemplateId: null })).toBeNull();
    expect(feResolve({})).toBeNull();
  });
});

describe("D1 折扣碼實際折扣率顯示", () => {
  it("案例二（原價30900／售價17000／35%）顯示 原價 -45%", () => {
    const pct = getActualDiscountPercent({ billedRoomTotal: 30900, discountAmount: 13900 });
    expect(pct).toBe(45);
  });

  it("50% 折扣碼（原價折後較便宜）顯示 原價 -50%", () => {
    const pct = getActualDiscountPercent({ billedRoomTotal: 30900, discountAmount: 15450 });
    expect(pct).toBe(50);
  });

  it("無折扣或帳列房費為 0 時回 null（不顯示）", () => {
    expect(getActualDiscountPercent({ billedRoomTotal: 30900, discountAmount: 0 })).toBeNull();
    expect(getActualDiscountPercent({ billedRoomTotal: 0, discountAmount: 100 })).toBeNull();
  });
});

describe("D2 後台「專案」顯示順序", () => {
  const templates = [{ id: "tpl-12", template_name: "12人包棟", project_name: null }];
  const packages = [{ id: "pkg-12", name: "12人包棟方案" }];

  it("有 pricing_template_id → 顯示專案名稱", () => {
    expect(
      resolveOrderProjectDisplayName({ pricingTemplateId: "tpl-12", templates, packageId: "pkg-12", packages }),
    ).toBe("12人包棟");
  });

  it("只有 package_id → 顯示方案名稱", () => {
    expect(
      resolveOrderProjectDisplayName({ pricingTemplateId: null, templates, packageId: "pkg-12", packages }),
    ).toBe("12人包棟方案");
  });

  it("兩者皆無（或查不到名稱）→ null，由呼叫端沿用現行 meal_plan 顯示", () => {
    expect(resolveOrderProjectDisplayName({ pricingTemplateId: null, templates, packageId: null, packages })).toBeNull();
    expect(
      resolveOrderProjectDisplayName({ pricingTemplateId: "tpl-unknown", templates, packageId: "pkg-unknown", packages }),
    ).toBeNull();
  });
});
