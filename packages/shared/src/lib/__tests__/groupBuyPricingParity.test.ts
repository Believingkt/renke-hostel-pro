/**
 * 前後端 pricing helper 一致性測試。
 *
 * src/lib/groupBuyPricing.ts 與
 * supabase/functions/_shared/groupBuyPricing.ts
 * 目前是兩份相同邏輯的複本。任一份的日期分類、三段價 fallback 或逐晚計價被修改
 * 而另一份沒有同步時，本測試會失敗。
 */
import { describe, expect, it } from "vitest";
import * as fe from "@lakeze/shared/lib/groupBuyPricing";
import * as be from "../../../../../supabase/functions/_shared/groupBuyPricing";

// 2026-08：17(一) 21(五) 22(六) 23(日)
const HOLIDAYS = new Set(["2026-08-17"]);
const NONE = new Set<string>();

const PKGS: fe.GroupBuyPackagePriceFields[] = [
  { group_buy_price: 5000, weekday_price: 5000, peak_price: 6000, holiday_price: 8000 },
  { group_buy_price: 4200 },
  { group_buy_price: 4200, holiday_price: 9000 },
  { group_buy_price: 4200, weekday_price: null, peak_price: 0, holiday_price: 7777 },
];

const DATES = ["2026-08-17", "2026-08-18", "2026-08-21", "2026-08-22", "2026-08-23"];

const RANGES: Array<[string, string]> = [
  ["2026-08-17", "2026-08-18"], // 週一
  ["2026-08-21", "2026-08-22"], // 週五
  ["2026-08-22", "2026-08-23"], // 週六
  ["2026-08-23", "2026-08-24"], // 週日
  ["2026-08-20", "2026-08-23"], // 跨平日＋旺日＋假日
];

describe("前後端 groupBuyPricing 一致性", () => {
  it("日期分類（含國定假日優先）完全一致", () => {
    for (const d of DATES) {
      for (const holidays of [NONE, HOLIDAYS]) {
        expect(be.getGroupBuyDateType(d, holidays)).toBe(fe.getGroupBuyDateType(d, holidays));
      }
    }
  });

  it("三段價 fallback 完全一致", () => {
    for (const pkg of PKGS) {
      expect(be.effectivePrices(pkg)).toEqual(fe.effectivePrices(pkg));
      expect(be.lowestEffectivePrice(pkg)).toBe(fe.lowestEffectivePrice(pkg));
    }
  });

  it("逐晚計價完全一致", () => {
    for (const pkg of PKGS) {
      for (const [checkIn, checkOut] of RANGES) {
        for (const holidays of [NONE, HOLIDAYS]) {
          expect(be.calculateGroupBuyStayPrice({ checkIn, checkOut, pkg, holidays })).toEqual(
            fe.calculateGroupBuyStayPrice({ checkIn, checkOut, pkg, holidays }),
          );
        }
      }
    }
  });

  it("住宿夜清單與不適用日期判斷完全一致", () => {
    const excluded = ["2026-08-21"];
    for (const [checkIn, checkOut] of RANGES) {
      expect(be.stayNightDates(checkIn, checkOut)).toEqual(fe.stayNightDates(checkIn, checkOut));
      expect(be.findExcludedNight(checkIn, checkOut, excluded)).toBe(
        fe.findExcludedNight(checkIn, checkOut, excluded),
      );
    }
  });

  it("兩份 helper 的 checksum 相同（純文字比對，避免單向修改）", async () => {
    const [a, b] = await Promise.all([
      import("fs/promises").then((m) => m.readFile("src/lib/groupBuyPricing.ts", "utf8")),
      import("fs/promises").then((m) =>
        m.readFile("supabase/functions/_shared/groupBuyPricing.ts", "utf8"),
      ),
    ]);
    expect(b.trim()).toBe(a.trim());
  });
});
