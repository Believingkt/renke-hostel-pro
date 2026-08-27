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

describe("包棟內房間組成斜線繼承上層狀態", () => {
  it("CASE 1: 上層有庫存未鎖房 → 無斜線且空白", () => {
    expect(compositionCellStriped(false, false, false)).toBe(false);
    expect(compositionCellDisplay(false, 2, 2).show).toBe(false);
  });
  it("CASE 2: 上層庫存 = 0 → 斜線", () => {
    expect(compositionCellStriped(false, true, false)).toBe(true);
  });
  it("CASE 3: 上層人工鎖房 → 斜線", () => {
    expect(compositionCellStriped(true, false, false)).toBe(true);
  });
  it("CASE 4: 上層恢復庫存 → 斜線消失", () => {
    expect(compositionCellStriped(false, false, false)).toBe(false);
  });
  it("CASE 5: 另一包棟仍有庫存 → 各自獨立不斜線", () => {
    expect(compositionCellStriped(false, false, false)).toBe(false);
    expect(compositionCellStriped(false, true, false)).toBe(true);
  });
  it("CASE 6: 無庫存但無扣除 → 只有斜線，不顯示 0/2", () => {
    expect(compositionCellStriped(false, true, false)).toBe(true);
    expect(compositionCellDisplay(false, 2, 2).show).toBe(false);
  });
  it("CASE 7: 無庫存＋既有扣除 → 斜線與數字同時", () => {
    expect(compositionCellStriped(false, true, false)).toBe(true);
    expect(compositionCellDisplay(true, 0, 2).text).toBe("0/2");
  });
  it("CASE 8: 有庫存＋有扣除 → 只有數字沒有斜線", () => {
    expect(compositionCellStriped(false, false, false)).toBe(false);
    expect(compositionCellDisplay(true, 1, 2).text).toBe("1/2");
  });
  it("CASE 9: 售罄（remaining 0）→ 斜線", () => {
    expect(compositionCellStriped(false, false, true)).toBe(true);
  });
});
