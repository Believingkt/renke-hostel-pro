import { describe, it, expect } from "vitest";
import { validateTierDraft, tierDiscountLabel, type TierDraft } from "../../utils/packageTierEditor";

const draft = (weekdaySale: string, weekdayOriginal = ""): TierDraft => ({
  weekday: { sale: weekdaySale, original: weekdayOriginal },
  friday_sunday: { sale: "", original: "" },
  weekend: { sale: "", original: "" },
});

describe("packageTierEditor 金額解析：千分位逗號", () => {
  it("「17,000」視為 17000", () => {
    expect(validateTierDraft(draft("17,000"))).toEqual({ ok: true, payload: { weekday: { sale: 17000, original: 17000 } } });
  });

  it("多組千分位與無逗號寫法結果相同", () => {
    expect(validateTierDraft(draft("17,000", "1,030,900"))).toEqual(validateTierDraft(draft("17000", "1030900")));
  });

  it("前後空白仍可解析", () => {
    expect(validateTierDraft(draft(" 17,000 "))).toEqual({ ok: true, payload: { weekday: { sale: 17000, original: 17000 } } });
  });

  it("分組不正確的逗號仍視為格式錯誤", () => {
    for (const bad of ["1,70", "17,00,0", ",17000", "17000,", "1,7000", "17,000.5", "-17,000"]) {
      expect(validateTierDraft(draft(bad))).toEqual({ ok: false, errors: ["平日金額必須為正整數"] });
    }
  });

  it("其餘驗證規則不變：原價低於售價、售價為 0", () => {
    expect(validateTierDraft(draft("17,000", "100"))).toEqual({ ok: false, errors: ["平日原價不得低於售價"] });
    expect(validateTierDraft(draft("0"))).toEqual({ ok: false, errors: ["平日售價必須大於 0"] });
  });

  it("折數標示也接受千分位", () => {
    expect(tierDiscountLabel("17,000", "30,900")).toBe(tierDiscountLabel("17000", "30900"));
  });
});
