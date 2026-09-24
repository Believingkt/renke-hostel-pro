import { describe, expect, it } from "vitest";
import {
  computeLocalDeadline,
  exceedsAtmDeadlineLimit,
  MAX_ATM_DEADLINE_HOURS,
  providerExpireDays,
} from "../../../../supabase/functions/_shared/groupBuyAtmDeadline";

describe("團購 ATM 付款期限（新制）", () => {
  it("provider 天數必須足以覆蓋本地期限，且落在 1～7 天", () => {
    expect(providerExpireDays(1)).toBe(1);
    expect(providerExpireDays(24)).toBe(1);
    expect(providerExpireDays(25)).toBe(2);
    expect(providerExpireDays(72)).toBe(3);
    expect(providerExpireDays(168)).toBe(7);
    expect(providerExpireDays(0)).toBe(3); // 非法值 → 預設 72h
  });

  it("超過 168 小時一律不得建立 ATM 訂單", () => {
    expect(exceedsAtmDeadlineLimit(168)).toBe(false);
    expect(exceedsAtmDeadlineLimit(169)).toBe(true);
  });

  it("本地期限＝建立時間 + 期限時數（絕對時間）", () => {
    const created = "2026-01-01T00:00:00.000Z";
    expect(computeLocalDeadline(created, 1).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(computeLocalDeadline(created, MAX_ATM_DEADLINE_HOURS).toISOString()).toBe(
      "2026-01-08T00:00:00.000Z",
    );
  });
});
