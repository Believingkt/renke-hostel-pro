import { describe, it, expect } from "vitest";
import { cleanTierPricesForSave } from "@/lib/packageTierPayload";

describe("訂房入住方案存檔：不寫出 0 元的分日價", () => {
  it("只加了平日但沒填價格（sale 0、original null）→ 不寫入，回傳 {}", () => {
    expect(cleanTierPricesForSave({ weekday: { sale: 0, original: null } })).toEqual({});
  });

  it("全部沒填 → {}（等同原本沒有分日價，計價回退方案售價）", () => {
    expect(cleanTierPricesForSave({})).toEqual({});
    expect(cleanTierPricesForSave(null)).toEqual({});
    expect(cleanTierPricesForSave({ weekday: { sale: null, original: 0 }, weekend: { sale: NaN, original: null } })).toEqual({});
  });

  it("有填的日型照存，0 視為沒填寫成 null，不會出現 0 元", () => {
    const out = cleanTierPricesForSave({
      weekday: { sale: 3000, original: 3600 },
      friday_sunday: { sale: 0, original: 4000 },
      weekend: { sale: 0, original: 0 },
    });
    expect(out).toEqual({
      weekday: { sale: 3000, original: 3600 },
      friday_sunday: { sale: null, original: 4000 },
    });
    for (const v of Object.values(out)) {
      expect(v.sale).not.toBe(0);
      expect(v.original).not.toBe(0);
    }
  });
});
