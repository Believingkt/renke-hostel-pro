import { describe, expect, it } from "vitest";
import { checkRateChange, effectivePercentAt, parsePercentInput } from "@/lib/courseProfitRateValidation";

const versions = [
  { percent: 5, effective_from: "2026-06-01" },
  { percent: 8, effective_from: "2026-08-01" },
];

describe("parsePercentInput", () => {
  it("擋空白與非數字", () => {
    expect(parsePercentInput("").ok).toBe(false);
    expect(parsePercentInput("abc").ok).toBe(false);
  });
  it("擋負數與 >100", () => {
    expect(parsePercentInput("-1").ok).toBe(false);
    expect(parsePercentInput("100.01").ok).toBe(false);
  });
  it("接受 0、100 與任意小數位", () => {
    expect(parsePercentInput("0").value).toBe(0);
    expect(parsePercentInput("100").value).toBe(100);
    expect(parsePercentInput("0.12345").value).toBeCloseTo(0.12345);
  });
});

describe("effectivePercentAt", () => {
  it("取生效日當下最新版本", () => {
    expect(effectivePercentAt(versions, "2026-07-15")).toBe(5);
    expect(effectivePercentAt(versions, "2026-09-01")).toBe(8);
    expect(effectivePercentAt(versions, "2026-01-01")).toBeNull();
  });
});

describe("checkRateChange", () => {
  it("無變動時拒絕", () => {
    const r = checkRateChange({ percentRaw: "8", effectiveFrom: "2026-09-01", versions });
    expect(r.ok).toBe(false);
    expect(r.title).toContain("沒有變動");
  });
  it("同生效日已有版本時拒絕", () => {
    expect(checkRateChange({ percentRaw: "9", effectiveFrom: "2026-08-01", versions }).ok).toBe(false);
  });
  it("已發放期別拒絕", () => {
    const r = checkRateChange({ percentRaw: "9", effectiveFrom: "2026-09-01", versions, periodLocked: true });
    expect(r.ok).toBe(false);
    expect(r.title).toContain("已標記發放");
  });
  it("正常變動通過並回傳前值", () => {
    const r = checkRateChange({ percentRaw: "9.5", effectiveFrom: "2026-09-01", versions });
    expect(r.ok).toBe(true);
    expect(r.percent).toBe(9.5);
    expect(r.previousPercent).toBe(8);
  });
  it("首次設定 previousPercent 為 null", () => {
    const r = checkRateChange({ percentRaw: "3", effectiveFrom: "2026-09-01", versions: [] });
    expect(r.ok).toBe(true);
    expect(r.previousPercent).toBeNull();
  });
});
