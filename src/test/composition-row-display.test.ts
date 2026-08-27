import { describe, expect, it } from "vitest";
import { compositionCellDisplay } from "@/lib/compositionRowDisplay";

describe("包棟內房間組成日曆格顯示", () => {
  it("CASE 1: total 2 無訂單 → 空白", () => {
    expect(compositionCellDisplay(false, 2, 2).show).toBe(false);
  });

  it("CASE 2: total 3 無訂單 → 空白", () => {
    expect(compositionCellDisplay(false, 3, 3).show).toBe(false);
  });

  it("CASE 3: total 2 扣除 1 → 🔒1/2", () => {
    expect(compositionCellDisplay(true, 1, 2)).toEqual({ show: true, text: "1/2" });
  });

  it("CASE 4: total 3 全部使用 → 🔒0/3", () => {
    expect(compositionCellDisplay(true, 0, 3)).toEqual({ show: true, text: "0/3" });
  });

  it("CASE 10: 包區連動僅部分鎖房 → 仍顯示既有扣除", () => {
    expect(compositionCellDisplay(true, 3, 3).text).toBe("3/3");
  });
});
