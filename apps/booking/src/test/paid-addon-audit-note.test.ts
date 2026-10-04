import { describe, it, expect } from "vitest";
import { formatChangeValue, getFieldLabel } from "@/utils/orderAuditDiff";

// 已結清訂單「額外現場加購備註」變更記錄：顯示實際文字（非 是/否）
describe("extra_addon_note 變更記錄顯示", () => {
  it("使用正確標籤", () => {
    expect(getFieldLabel("extra_addon_note")).toBe("額外現場加購備註");
  });

  it("空值顯示 (空)", () => {
    expect(formatChangeValue("extra_addon_note", null)).toBe("(空)");
    expect(formatChangeValue("extra_addon_note", "")).toBe("(空)");
  });

  it("單行文字原樣顯示", () => {
    expect(formatChangeValue("extra_addon_note", "麵包200")).toBe("麵包200");
  });

  it("多行文字保留換行", () => {
    const v = "蛋糕300\n啤酒2瓶150";
    expect(formatChangeValue("extra_addon_note", v)).toBe(v);
    expect(formatChangeValue("extra_addon_note", v).split("\n")).toHaveLength(2);
  });
});
