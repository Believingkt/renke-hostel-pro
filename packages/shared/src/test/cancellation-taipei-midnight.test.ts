import { afterEach, describe, expect, it, vi } from "vitest";
import {
  daysUntil,
  quoteCancellation,
  taipeiToday,
} from "../../../../supabase/functions/_shared/cancellationPolicy";

/**
 * Phase F2-F 一、Asia/Taipei 跨午夜邊界
 * 只驗證行為，不更動任何法規級距。
 */
describe("taipeiToday() 跨午夜（UTC+8）", () => {
  afterEach(() => vi.useRealTimers());

  const freeze = (iso: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  };

  it("CASE A：UTC 15:59 → 台北 23:59，日期仍為當日", () => {
    freeze("2026-09-06T15:59:00.000Z");
    expect(taipeiToday()).toBe("2026-09-06");
  });

  it("CASE B：UTC 16:00 → 台北隔日 00:00，日期翻到下一日", () => {
    freeze("2026-09-06T16:00:00.000Z");
    expect(taipeiToday()).toBe("2026-09-07");
  });

  it("UTC 15:59:59.999 與 16:00:00.000 恰好相差一日", () => {
    freeze("2026-09-06T15:59:59.999Z");
    const before = taipeiToday();
    vi.setSystemTime(new Date("2026-09-06T16:00:00.000Z"));
    const after = taipeiToday();
    expect(daysUntil(after, before)).toBe(1);
  });

  it("UTC 00:00（台北 08:00）仍為同一日，不會提前翻日", () => {
    freeze("2026-09-07T00:00:00.000Z");
    expect(taipeiToday()).toBe("2026-09-07");
  });

  it("check_in - cancellation 在邊界不會差一天（UTC 15:59）", () => {
    freeze("2026-09-06T15:59:00.000Z");
    expect(daysUntil("2026-09-20", taipeiToday())).toBe(14);
  });

  it("check_in - cancellation 在邊界不會差一天（UTC 16:00 → 13 天）", () => {
    freeze("2026-09-06T16:00:00.000Z");
    expect(daysUntil("2026-09-20", taipeiToday())).toBe(13);
  });

  it("級距跟著台北日期翻轉：15:59 仍為 100%，16:00 落入 70%", () => {
    const order = {
      order_source: "group_buy",
      payment_method: "atm",
      paid_amount: 6000,
      final_price: 20000,
    };
    freeze("2026-09-06T15:59:00.000Z");
    const a = quoteCancellation({ order, checkInDate: "2026-09-20" });
    expect(a.daysBefore).toBe(14);
    expect(a.refundPercent).toBe(100);

    vi.setSystemTime(new Date("2026-09-06T16:00:00.000Z"));
    const b = quoteCancellation({ order, checkInDate: "2026-09-20" });
    expect(b.daysBefore).toBe(13);
    expect(b.refundPercent).toBe(70);
  });
});
