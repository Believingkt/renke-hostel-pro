import { describe, it, expect } from "vitest";
import { enUS, zhTW } from "date-fns/locale";
import { formatReviewDate } from "@/components/ReviewsSection";

/**
 * 評價日期在英文模式下重新格式化；未啟用（未傳 localize 的頁面）行為必須完全不變。
 * 這裡只驗證顯示字串，不涉及任何資料寫入。
 */
describe("評價日期 locale 格式化", () => {
  it("未啟用時原樣輸出，不動任何字元", () => {
    expect(formatReviewDate("2025年11月", false, enUS)).toBe("2025年11月");
    expect(formatReviewDate("2025年11月15日", false, zhTW)).toBe("2025年11月15日");
  });

  it("英文模式下「年月」轉為英文月份", () => {
    expect(formatReviewDate("2025年11月", true, enUS)).toBe("November 2025");
  });

  it("英文模式下「年月日」轉為英文完整日期", () => {
    expect(formatReviewDate("2025年1月5日", true, enUS)).toBe("5 January 2025");
  });

  it("無法解析的字串原樣保留（例如 Google 相對時間或空值）", () => {
    expect(formatReviewDate("1 個月前", true, enUS)).toBe("1 個月前");
    expect(formatReviewDate("", true, enUS)).toBe("");
    expect(formatReviewDate("2025年13月", true, enUS)).toBe("2025年13月");
  });
});
