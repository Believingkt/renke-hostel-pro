import { describe, it, expect } from "vitest";
import { toNightRange, addDaysDateOnly } from "../amenityAllocation";

describe("toNightRange (date-only)", () => {
  it("CASE A｜一晚住宿", () => {
    expect(toNightRange("2026-09-26", "2026-09-27")).toEqual({
      start: "2026-09-26",
      end: "2026-09-26",
    });
  });

  it("CASE B｜兩晚住宿", () => {
    expect(toNightRange("2026-09-26", "2026-09-28")).toEqual({
      start: "2026-09-26",
      end: "2026-09-27",
    });
  });

  it("CASE C｜跨月", () => {
    expect(toNightRange("2026-09-30", "2026-10-02")).toEqual({
      start: "2026-09-30",
      end: "2026-10-01",
    });
  });

  it("CASE D｜跨年", () => {
    expect(toNightRange("2026-12-31", "2027-01-02")).toEqual({
      start: "2026-12-31",
      end: "2027-01-01",
    });
  });

  it("CASE E｜timezone independent (TZ env)", () => {
    // 目前 runtime TZ 下的結果應與純字串預期一致
    expect(toNightRange("2026-09-26", "2026-09-27")?.end).toBe("2026-09-26");
    expect(addDaysDateOnly("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysDateOnly("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("同日進出（0 晚）回傳 null", () => {
    expect(toNightRange("2026-09-26", "2026-09-26")).toBeNull();
  });

  it("缺值或格式錯誤回傳 null", () => {
    expect(toNightRange(null, "2026-09-27")).toBeNull();
    expect(toNightRange("2026-09-26", null)).toBeNull();
    expect(toNightRange("bad", "2026-09-27")).toBeNull();
  });

  it("接受帶時間戳的輸入（只取日期部分）", () => {
    expect(toNightRange("2026-09-26T00:00:00Z", "2026-09-28T00:00:00Z")).toEqual({
      start: "2026-09-26",
      end: "2026-09-27",
    });
  });
});
