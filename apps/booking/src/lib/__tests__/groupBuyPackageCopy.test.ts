import { describe, expect, it } from "vitest";
import { baseCopyName, nextCopyName } from "@/lib/groupBuyPackageCopy";

describe("團購方案複製命名", () => {
  it("第一次複製", () => {
    expect(nextCopyName("雙人房專案", ["雙人房專案"])).toBe("雙人房專案（複製）");
  });
  it("第二次複製", () => {
    expect(nextCopyName("雙人房專案", ["雙人房專案", "雙人房專案（複製）"])).toBe("雙人房專案（複製 2）");
  });
  it("複製副本不會疊加尾綴", () => {
    expect(nextCopyName("雙人房專案（複製）", ["雙人房專案", "雙人房專案（複製）"])).toBe("雙人房專案（複製 2）");
    expect(
      nextCopyName("雙人房專案（複製 2）", ["雙人房專案", "雙人房專案（複製）", "雙人房專案（複製 2）"]),
    ).toBe("雙人房專案（複製 3）");
  });
  it("baseCopyName 還原原名", () => {
    expect(baseCopyName("A（複製 5）")).toBe("A");
    expect(baseCopyName("A")).toBe("A");
  });
});
