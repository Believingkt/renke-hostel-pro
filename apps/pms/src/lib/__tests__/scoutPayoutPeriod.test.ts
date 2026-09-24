import { describe, expect, it } from "vitest";
import {
  buildPayoutPeriod,
  resolveNextPayoutPeriod,
  resolvePrevPayoutPeriod,
  resolveFollowingPayoutPeriod,
} from "../scoutPayoutPeriod";

/** 產生對應「台北時間某日中午」的 Date（避免時區邊界誤判） */
const taipeiNoon = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d, 4, 0, 0));

describe("resolveNextPayoutPeriod", () => {
  it("8/1 -> 8/10 期，資料窗 7/21–8/5", () => {
    const p = resolveNextPayoutPeriod(taipeiNoon(2026, 8, 1));
    expect(p.payoutMonthKey).toBe("2026-08");
    expect(p.period).toBe("10");
    expect(p.periodStart).toBe("2026-07-21");
    expect(p.periodEnd).toBe("2026-08-05");
    expect(p.dataMonthKey).toBe("2026-07");
    expect(p.isMonthlyPayout).toBe(true);
  });

  it("8/10 仍為 8/10 期", () => {
    expect(resolveNextPayoutPeriod(taipeiNoon(2026, 8, 10)).label).toBe("8/10 期");
  });

  it("8/11 -> 8/25 期，資料窗 8/6–8/20", () => {
    const p = resolveNextPayoutPeriod(taipeiNoon(2026, 8, 11));
    expect(p.period).toBe("25");
    expect(p.periodStart).toBe("2026-08-06");
    expect(p.periodEnd).toBe("2026-08-20");
    expect(p.isMonthlyPayout).toBe(false);
  });

  it("8/25 仍為 8/25 期", () => {
    expect(resolveNextPayoutPeriod(taipeiNoon(2026, 8, 25)).label).toBe("8/25 期");
  });

  it("8/26 -> 9/10 期", () => {
    const p = resolveNextPayoutPeriod(taipeiNoon(2026, 8, 26));
    expect(p.payoutMonthKey).toBe("2026-09");
    expect(p.period).toBe("10");
    expect(p.periodStart).toBe("2026-08-21");
    expect(p.periodEnd).toBe("2026-09-05");
    expect(p.dataMonthKey).toBe("2026-08");
  });

  it("12/26 跨年 -> 次年 1/10 期", () => {
    const p = resolveNextPayoutPeriod(taipeiNoon(2026, 12, 26));
    expect(p.payoutMonthKey).toBe("2027-01");
    expect(p.periodStart).toBe("2026-12-21");
    expect(p.periodEnd).toBe("2027-01-05");
    expect(p.dataMonthKey).toBe("2026-12");
  });
});

describe("prev / following", () => {
  it("25 日期的上一期是同月 10 日期", () => {
    const p = resolvePrevPayoutPeriod(buildPayoutPeriod(2026, 8, "25"));
    expect(p.payoutMonthKey).toBe("2026-08");
    expect(p.period).toBe("10");
  });

  it("10 日期的上一期是上月 25 日期（跨年）", () => {
    const p = resolvePrevPayoutPeriod(buildPayoutPeriod(2027, 1, "10"));
    expect(p.payoutMonthKey).toBe("2026-12");
    expect(p.period).toBe("25");
  });

  it("25 日期的下一期是次月 10 日期", () => {
    const p = resolveFollowingPayoutPeriod(buildPayoutPeriod(2026, 12, "25"));
    expect(p.payoutMonthKey).toBe("2027-01");
    expect(p.period).toBe("10");
  });
});
