import { describe, expect, it } from "vitest";
import { compositionCellDisplay, compositionCellStriped } from "@/lib/compositionRowDisplay";

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

describe("包棟內房間組成斜線同步鎖房", () => {
  it("CASE 1/2: 有庫存未鎖房 → 空白無斜線", () => {
    expect(compositionCellDisplay(false, 2, 2).show).toBe(false);
    expect(compositionCellStriped(false)).toBe(false);
  });
  it("CASE 3: 上層鎖房 → 子列有斜線", () => {
    expect(compositionCellStriped(true)).toBe(true);
  });
  it("CASE 4: 上層未鎖房 → 無斜線", () => {
    expect(compositionCellStriped(false)).toBe(false);
  });
  it("CASE 5: 有扣除但未鎖房 → 只有數字沒有斜線", () => {
    expect(compositionCellDisplay(true, 1, 2).text).toBe("1/2");
    expect(compositionCellStriped(false)).toBe(false);
  });
  it("CASE 6: 鎖房＋扣除 → 兩者同時", () => {
    expect(compositionCellDisplay(true, 0, 3).text).toBe("0/3");
    expect(compositionCellStriped(true)).toBe(true);
  });
});
