import { describe, expect, it } from "vitest";
import {
  composeDealDate,
  isFutureTaipeiDate,
  taipeiDateStr,
  taipeiMonthOf,
  taipeiTimeStr,
} from "../dealDate";

describe("dealDate helpers", () => {
  it("台北日期／期別以 UTC+8 判定（UTC 深夜不會少一天）", () => {
    expect(taipeiDateStr("2026-07-31T17:00:00Z")).toBe("2026-08-01");
    expect(taipeiMonthOf("2026-07-31T17:00:00Z")).toBe("2026-08");
    expect(taipeiMonthOf("2026-07-31T15:59:00Z")).toBe("2026-07");
  });

  it("改日期時保留原本時分秒", () => {
    const original = "2026-08-20T01:55:11.162Z"; // 台北 09:55:11
    expect(taipeiTimeStr(original)).toBe("09:55:11");
    const next = composeDealDate(original, "2026-08-15");
    expect(taipeiDateStr(next)).toBe("2026-08-15");
    expect(taipeiTimeStr(next)).toBe("09:55:11");
  });

  it("跨期判定：8/01 改到 7/31 視為跨期", () => {
    const original = "2026-08-01T02:00:00Z";
    const next = composeDealDate(original, "2026-07-31");
    expect(taipeiMonthOf(original)).toBe("2026-08");
    expect(taipeiMonthOf(next)).toBe("2026-07");
  });

  it("未來日期判定", () => {
    const today = taipeiDateStr();
    expect(isFutureTaipeiDate(today)).toBe(false);
    const tomorrow = taipeiDateStr(new Date(Date.now() + 86400000));
    expect(isFutureTaipeiDate(tomorrow)).toBe(true);
  });
});
