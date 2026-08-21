import { describe, expect, it } from "vitest";
import {
  calculateGroupBuyStayPrice,
  effectivePrices,
  findExcludedNight,
  getGroupBuyDateType,
  lowestEffectivePrice,
  stayNightDates,
  enabledDateTypes,
  isDateTypeEnabled,
  lowestEnabledPrice,
  findDisabledTypeNight,
  type GroupBuyDayType,
} from "@/lib/groupBuyPricing";

// 2026-08：17(一) 18(二) 19(三) 20(四) 21(五) 22(六) 23(日)
const PKG = { group_buy_price: 5000, weekday_price: 5000, peak_price: 6000, holiday_price: 8000 };
const NO_HOLIDAY = new Set<string>();

const total = (checkIn: string, checkOut: string, holidays = NO_HOLIDAY) =>
  calculateGroupBuyStayPrice({ checkIn, checkOut, pkg: PKG, holidays }).baseAccommodationTotal;

describe("團購逐晚價格", () => {
  it("案例 1：週一入住、週二退房 → 平日 5,000", () => {
    expect(total("2026-08-17", "2026-08-18")).toBe(5000);
  });

  it("案例 2：週五入住 → 旺日 6,000", () => {
    expect(total("2026-08-21", "2026-08-22")).toBe(6000);
  });

  it("案例 3：週六入住 → 假日 8,000", () => {
    expect(total("2026-08-22", "2026-08-23")).toBe(8000);
  });

  it("案例 4：週日入住 → 旺日 6,000", () => {
    expect(total("2026-08-23", "2026-08-24")).toBe(6000);
  });

  it("案例 5：週四入住、週日退房 → 5000+6000+8000 = 19,000", () => {
    const r = calculateGroupBuyStayPrice({
      checkIn: "2026-08-20",
      checkOut: "2026-08-23",
      pkg: PKG,
      holidays: NO_HOLIDAY,
    });
    expect(r.nights).toBe(3);
    expect(r.nightlyBreakdown.map((n) => n.type)).toEqual(["weekday", "peak", "holiday"]);
    expect(r.baseAccommodationTotal).toBe(19000);
  });

  it("案例 6：週一為國定假日 → 用假日價 8,000", () => {
    expect(getGroupBuyDateType("2026-08-17", new Set(["2026-08-17"]))).toBe("holiday");
    expect(total("2026-08-17", "2026-08-18", new Set(["2026-08-17"]))).toBe(8000);
  });

  it("退房日不計價", () => {
    expect(stayNightDates("2026-08-20", "2026-08-22")).toEqual(["2026-08-20", "2026-08-21"]);
  });
});

describe("價格 fallback", () => {
  it("未設定三段價 → 全部沿用 group_buy_price", () => {
    expect(effectivePrices({ group_buy_price: 4200 })).toEqual({ weekday: 4200, peak: 4200, holiday: 4200 });
  });

  it("部分設定 → 只有該段生效，其餘 fallback", () => {
    expect(effectivePrices({ group_buy_price: 4200, holiday_price: 9000 })).toEqual({
      weekday: 4200,
      peak: 4200,
      holiday: 9000,
    });
  });

  it("最低有效價含 fallback 一起比較", () => {
    expect(lowestEffectivePrice({ group_buy_price: 4800, holiday_price: 9000 })).toBe(4800);
    expect(lowestEffectivePrice(PKG)).toBe(5000);
  });
});

describe("不適用日期", () => {
  const ex = ["2026-08-21"];

  it("案例 7：8/21 入住 → 踩到不適用日", () => {
    expect(findExcludedNight("2026-08-21", "2026-08-22", ex)).toBe("2026-08-21");
  });

  it("案例 8：8/20 入住、8/21 退房 → 可以", () => {
    expect(findExcludedNight("2026-08-20", "2026-08-21", ex)).toBeNull();
  });

  it("案例 9：8/20 入住、8/22 退房 → 不可（住到 8/21 晚）", () => {
    expect(findExcludedNight("2026-08-20", "2026-08-22", ex)).toBe("2026-08-21");
  });

  it("案例 10：8/19 入住，8/22 之後皆不可（跨越 8/21）", () => {
    expect(findExcludedNight("2026-08-19", "2026-08-20", ex)).toBeNull();
    expect(findExcludedNight("2026-08-19", "2026-08-21", ex)).toBeNull();
    expect(findExcludedNight("2026-08-19", "2026-08-22", ex)).toBe("2026-08-21");
    expect(findExcludedNight("2026-08-19", "2026-08-24", ex)).toBe("2026-08-21");
  });
});

describe("方案不適用日期類型（disabled_date_types）", () => {
  const holidays = new Set<string>(["2026-10-10"]);
  const pkg = {
    group_buy_price: 5000,
    weekday_price: 4000,
    peak_price: 5000,
    holiday_price: 6000,
    disabled_date_types: ["weekday"] as GroupBuyDayType[],
  };

  it("未設定時三種日期類型皆適用（向下相容）", () => {
    const legacy = { group_buy_price: 5000, disabled_date_types: null };
    expect(enabledDateTypes(legacy)).toEqual(["weekday", "peak", "holiday"]);
    expect(isDateTypeEnabled(legacy, "weekday")).toBe(true);
  });

  it("設定不適用後對應類型關閉，其餘不受影響", () => {
    expect(isDateTypeEnabled(pkg, "weekday")).toBe(false);
    expect(isDateTypeEnabled(pkg, "holiday")).toBe(true);
    expect(enabledDateTypes(pkg)).toEqual(["peak", "holiday"]);
  });

  it("起價排除不適用類型", () => {
    expect(lowestEnabledPrice(pkg)).toBe(5000);
    expect(lowestEnabledPrice({ ...pkg, disabled_date_types: ["weekday", "peak", "holiday"] })).toBeNull();
  });

  it("住宿夜踩到不適用類型會被攔截，退房日不算住宿夜", () => {
    // 2026-03-02(一) 為平日 → 應被擋
    expect(findDisabledTypeNight("2026-03-02", "2026-03-03", pkg, holidays)?.date).toBe("2026-03-02");
    // 入住 2026-03-06(五,旺日) 退房 2026-03-07(六) → 只有一晚旺日，可預訂
    expect(findDisabledTypeNight("2026-03-06", "2026-03-07", pkg, holidays)).toBeNull();
  });
});
