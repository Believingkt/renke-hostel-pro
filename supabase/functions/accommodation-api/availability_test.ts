import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAvailability,
  classifyDay,
  daysBetweenInclusive,
  enumerateDates,
  isValidDateStr,
  MAX_RANGE_DAYS,
  resolveTemplatePrice,
} from "./availability.ts";

const RT_STD = {
  id: "rt-std",
  name: "標準房",
  capacity: 2,
  room_count: 3,
  is_exclusive_package: false,
  is_bound_to_exclusive: false,
  bound_exclusive_ids: null,
};
const RT_EXCL = {
  id: "rt-excl",
  name: "包棟",
  capacity: 12,
  room_count: 1,
  is_exclusive_package: true,
  is_bound_to_exclusive: true,
  bound_exclusive_ids: null,
};

Deno.test("date helpers: enumerate + range validation", () => {
  assertEquals(enumerateDates("2026-07-01", "2026-07-03"), [
    "2026-07-01",
    "2026-07-02",
    "2026-07-03",
  ]);
  assertEquals(daysBetweenInclusive("2026-07-01", "2026-07-03"), 3);
  assertEquals(isValidDateStr("2026-07-01"), true);
  assertEquals(isValidDateStr("2026/07/01"), false);
  assertEquals(MAX_RANGE_DAYS, 60);
});

Deno.test("classifyDay: weekend/peak/weekday + holidays", () => {
  const holidays = new Set(["2026-07-01"]);
  const wow = new Set(["2026-07-05"]); // 週日補上班
  assertEquals(classifyDay("2026-07-01", holidays, wow), "weekend"); // 國定假日
  assertEquals(classifyDay("2026-07-04", new Set(), new Set()), "weekend"); // Saturday
  assertEquals(classifyDay("2026-07-03", new Set(), new Set()), "peak"); // Friday
  assertEquals(classifyDay("2026-07-05", new Set(), wow), "weekday"); // Sunday but補班
  assertEquals(classifyDay("2026-07-06", new Set(), new Set()), "weekday"); // Monday
});

Deno.test("resolveTemplatePrice: tier fallback", () => {
  const t = {
    room_type_id: "rt-std",
    price: 3000,
    weekday_price: 3000,
    peak_price: null,
    weekend_price: 5000,
  };
  assertEquals(resolveTemplatePrice(t, "weekday"), 3000);
  assertEquals(resolveTemplatePrice(t, "peak"), 3000); // fallback to weekday
  assertEquals(resolveTemplatePrice(t, "weekend"), 5000);
  assertEquals(resolveTemplatePrice(null, "weekday"), null);
});

Deno.test("remaining: single-night order occupies only the night, not check-out day", () => {
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-03",
    roomTypes: [RT_STD],
    inventory: [
      { room_type_id: "rt-std", date: "2026-07-01", price: 2000, available_rooms: 3, is_available: true },
      { room_type_id: "rt-std", date: "2026-07-02", price: 2000, available_rooms: 3, is_available: true },
      { room_type_id: "rt-std", date: "2026-07-03", price: 2000, available_rooms: 3, is_available: true },
    ],
    orders: [
      {
        id: "o1",
        room_type_id: "rt-std",
        check_in_date: "2026-07-01",
        check_out_date: "2026-07-02",
        order_status: "confirmed",
        lock_whole_building: false,
      },
    ],
    orderRooms: [],
    templates: [],
    holidays: [],
  });
  const days = res[0].days;
  assertEquals(days.map((d) => d.remaining), [2, 3, 3]);
  assertEquals(days.map((d) => d.is_available), [true, true, true]);
});

Deno.test("closed day: is_available=false → remaining=0, price=null, closed=true", () => {
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-01",
    roomTypes: [RT_STD],
    inventory: [
      { room_type_id: "rt-std", date: "2026-07-01", price: 2000, available_rooms: 3, is_available: false },
    ],
    orders: [],
    orderRooms: [],
    templates: [],
    holidays: [],
  });
  assertEquals(res[0].days[0].remaining, 0);
  assertEquals(res[0].days[0].closed, true);
  assertEquals(res[0].days[0].is_available, false);
  assertEquals(res[0].days[0].price, null);
});

Deno.test("no inventory row: capacity falls back to room_types.room_count, is_available=true", () => {
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-01",
    roomTypes: [RT_STD],
    inventory: [],
    orders: [
      {
        id: "o1",
        room_type_id: "rt-std",
        check_in_date: "2026-07-01",
        check_out_date: "2026-07-02",
        order_status: "hold",
        lock_whole_building: false,
      },
    ],
    orderRooms: [],
    templates: [
      { room_type_id: "rt-std", price: 2500, weekday_price: 2500, peak_price: null, weekend_price: 4000 },
    ],
    holidays: [],
  });
  // room_count=3, occupancy=1 → remaining=2
  assertEquals(res[0].days[0].remaining, 2);
  assertEquals(res[0].days[0].is_available, true);
});

Deno.test("price template fallback when inv.price is null/0", () => {
  const res = buildAvailability({
    from: "2026-07-01", // Wednesday → weekday
    to: "2026-07-04", // Saturday → weekend
    roomTypes: [RT_STD],
    inventory: [
      { room_type_id: "rt-std", date: "2026-07-01", price: 0, available_rooms: 3, is_available: true },
      { room_type_id: "rt-std", date: "2026-07-04", price: null, available_rooms: 3, is_available: true },
    ],
    orders: [],
    orderRooms: [],
    templates: [
      { room_type_id: "rt-std", price: 3000, weekday_price: 3000, peak_price: null, weekend_price: 5000 },
    ],
    holidays: [],
  });
  const byDate = Object.fromEntries(res[0].days.map((d) => [d.date, d.price]));
  assertEquals(byDate["2026-07-01"], 3000);
  assertEquals(byDate["2026-07-04"], 5000);
});

Deno.test("multi-room via order_rooms: occupancy scales with quantity", () => {
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-01",
    roomTypes: [RT_STD],
    inventory: [
      { room_type_id: "rt-std", date: "2026-07-01", price: 2000, available_rooms: 3, is_available: true },
    ],
    orders: [
      {
        id: "o1",
        room_type_id: "rt-std",
        check_in_date: "2026-07-01",
        check_out_date: "2026-07-02",
        order_status: "confirmed",
        lock_whole_building: false,
      },
    ],
    orderRooms: [
      { order_id: "o1", room_type_id: "rt-std", quantity: 2 },
    ],
    templates: [],
    holidays: [],
  });
  assertEquals(res[0].days[0].remaining, 1);
});

Deno.test("lock_whole_building closes all room types for that date", () => {
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-02",
    roomTypes: [RT_STD, RT_EXCL],
    inventory: [
      { room_type_id: "rt-std", date: "2026-07-01", price: 2000, available_rooms: 3, is_available: true },
      { room_type_id: "rt-std", date: "2026-07-02", price: 2000, available_rooms: 3, is_available: true },
      { room_type_id: "rt-excl", date: "2026-07-01", price: 20000, available_rooms: 1, is_available: true },
      { room_type_id: "rt-excl", date: "2026-07-02", price: 20000, available_rooms: 1, is_available: true },
    ],
    orders: [
      {
        id: "o1",
        room_type_id: null,
        check_in_date: "2026-07-01",
        check_out_date: "2026-07-02",
        order_status: "hold",
        lock_whole_building: true,
      },
    ],
    orderRooms: [],
    templates: [],
    holidays: [],
  });
  const d0std = res.find((r) => r.room_type_id === "rt-std")!.days[0];
  const d0ex = res.find((r) => r.room_type_id === "rt-excl")!.days[0];
  assertEquals(d0std.closed, true);
  assertEquals(d0ex.closed, true);
  assertEquals(res.find((r) => r.room_type_id === "rt-std")!.days[1].closed, false);
});

Deno.test("filter by multiple room_type_id filters output (upstream)", () => {
  // buildAvailability只計算傳入的房型，模擬 API 過濾後傳入
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-01",
    roomTypes: [RT_STD], // 只有 std
    inventory: [],
    orders: [],
    orderRooms: [],
    templates: [],
    holidays: [],
  });
  assertEquals(res.length, 1);
  assertEquals(res[0].room_type_id, "rt-std");
});

Deno.test("date range validation: exceeding MAX_RANGE_DAYS days", () => {
  assertEquals(daysBetweenInclusive("2026-07-01", "2026-09-30") > MAX_RANGE_DAYS, true);
});

// ---------- Parity tests: room_overrides / season_segments ----------
// Import the frontend helper directly to assert API prices match
// what the front-end / points-booking-api would compute.
import { getTierForDate as feGetTierForDate } from "../../../src/utils/pricingTemplateHelpers.ts";

const RT_A = {
  id: "rt-a",
  name: "A房",
  capacity: 2,
  room_count: 2,
  is_exclusive_package: false,
  is_bound_to_exclusive: false,
  bound_exclusive_ids: null,
};
const RT_B = {
  id: "rt-b",
  name: "B房",
  capacity: 4,
  room_count: 2,
  is_exclusive_package: false,
  is_bound_to_exclusive: false,
  bound_exclusive_ids: null,
};

Deno.test("parity: room_overrides overrides template top-level per room_type", () => {
  // template 頂層 weekday=3000/weekend=5000；rt-a 覆寫 weekday=2500/weekend=4500
  const template = {
    room_type_id: null,
    price: 3000,
    weekday_price: 3000,
    peak_price: 4000,
    weekend_price: 5000,
    weekday_enabled: true,
    peak_enabled: true,
    weekend_enabled: true,
    room_overrides: [
      { room_type_id: "rt-a", weekday_price: 2500, peak_price: 3500, weekend_price: 4500, available_rooms: 2 },
    ],
    season_segments: null,
  };
  const res = buildAvailability({
    from: "2026-07-01", // Wed weekday
    to: "2026-07-04",   // Sat weekend
    roomTypes: [RT_A, RT_B],
    inventory: [], // 無 base row → 全走 template
    orders: [],
    orderRooms: [],
    templates: [
      { ...template, room_type_id: "rt-a" } as any,
      { ...template, room_type_id: "rt-b" } as any,
    ],
    holidays: [],
  });
  const a = res.find((r) => r.room_type_id === "rt-a")!;
  const b = res.find((r) => r.room_type_id === "rt-b")!;

  // Parity vs 前端 helper
  for (const rt of ["rt-a", "rt-b"]) {
    const days = (rt === "rt-a" ? a : b).days;
    for (const day of days) {
      const dow = new Date(day.date + "T00:00:00Z").getUTCDay();
      const tier = dow === 6 ? "weekend" : (dow === 5 || dow === 0 ? "peak" : "weekday");
      const feInfo = feGetTierForDate(template as any, rt, day.date, tier as any);
      const expected = feInfo.enabled && feInfo.price && feInfo.price > 0 ? feInfo.price : null;
      assertEquals(day.price, expected, `${rt} ${day.date} tier=${tier}`);
    }
  }

  // 具體值檢查（rt-a 走覆寫、rt-b 走頂層）
  const byA = Object.fromEntries(a.days.map((d) => [d.date, d.price]));
  const byB = Object.fromEntries(b.days.map((d) => [d.date, d.price]));
  assertEquals(byA["2026-07-01"], 2500); // Wed weekday override
  assertEquals(byA["2026-07-03"], 3500); // Fri peak override
  assertEquals(byA["2026-07-04"], 4500); // Sat weekend override
  assertEquals(byB["2026-07-01"], 3000);
  assertEquals(byB["2026-07-03"], 4000);
  assertEquals(byB["2026-07-04"], 5000);
});

Deno.test("parity: season_segments — per-day segment resolution + per-segment room override", () => {
  const template = {
    room_type_id: "rt-a",
    price: null,
    weekday_price: null,
    peak_price: null,
    weekend_price: null,
    season_segments: [
      {
        id: "s1",
        label: "淡季",
        valid_from: "2026-07-01",
        valid_until: "2026-07-10",
        weekday_price: 2000,
        peak_price: 2500,
        weekend_price: 3000,
        weekday_enabled: true,
        peak_enabled: true,
        weekend_enabled: true,
        room_overrides: [
          { room_type_id: "rt-a", weekday_price: 1800, peak_price: null, weekend_price: 2800, available_rooms: 2 },
        ],
      },
      {
        id: "s2",
        label: "旺季",
        valid_from: "2026-07-11",
        valid_until: "2026-07-31",
        weekday_price: 3500,
        peak_price: 4500,
        weekend_price: 6000,
        weekday_enabled: true,
        peak_enabled: false, // 旺季 peak 關閉 → API price 應為 null
        weekend_enabled: true,
      },
    ],
  };
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-20",
    roomTypes: [RT_A],
    inventory: [],
    orders: [],
    orderRooms: [],
    templates: [template as any],
    holidays: [],
  });
  const days = res[0].days;

  // Full parity loop against frontend helper
  for (const day of days) {
    const dow = new Date(day.date + "T00:00:00Z").getUTCDay();
    const tier = dow === 6 ? "weekend" : (dow === 5 || dow === 0 ? "peak" : "weekday");
    const feInfo = feGetTierForDate(template as any, "rt-a", day.date, tier as any);
    const expected = feInfo.enabled && feInfo.price && feInfo.price > 0 ? feInfo.price : null;
    assertEquals(day.price, expected, `rt-a ${day.date} tier=${tier}`);
  }

  const byDate = Object.fromEntries(days.map((d) => [d.date, d.price]));
  // 2026-07-01 Wed weekday 淡季 → rt-a override 1800
  assertEquals(byDate["2026-07-01"], 1800);
  // 2026-07-03 Fri peak 淡季 → override peak=null → segment peak 2500
  assertEquals(byDate["2026-07-03"], 2500);
  // 2026-07-04 Sat weekend 淡季 → override 2800
  assertEquals(byDate["2026-07-04"], 2800);
  // 2026-07-13 Mon weekday 旺季 → segment 3500
  assertEquals(byDate["2026-07-13"], 3500);
  // 2026-07-17 Fri peak 旺季 → peak_enabled=false → null
  assertEquals(byDate["2026-07-17"], null);
  // 2026-07-18 Sat weekend 旺季 → 6000
  assertEquals(byDate["2026-07-18"], 6000);
});

Deno.test("parity: date outside all segments → price=null (not fallback to template top-level)", () => {
  const template = {
    room_type_id: "rt-a",
    // 頂層有價，但 segments 存在 → 頂層價不應被使用
    weekday_price: 9999,
    peak_price: 9999,
    weekend_price: 9999,
    season_segments: [
      {
        valid_from: "2026-07-01",
        valid_until: "2026-07-05",
        weekday_price: 2000,
        peak_price: 2200,
        weekend_price: 2500,
      },
    ],
  };
  const res = buildAvailability({
    from: "2026-07-04",
    to: "2026-07-08",
    roomTypes: [RT_A],
    inventory: [],
    orders: [],
    orderRooms: [],
    templates: [template as any],
    holidays: [],
  });
  const byDate = Object.fromEntries(res[0].days.map((d) => [d.date, d.price]));
  assertEquals(byDate["2026-07-04"], 2500); // Sat in segment
  assertEquals(byDate["2026-07-05"], 2200); // Sun in segment (peak)
  assertEquals(byDate["2026-07-06"], null); // Mon outside segment
  assertEquals(byDate["2026-07-08"], null); // Wed outside segment

  // Parity
  for (const day of res[0].days) {
    const dow = new Date(day.date + "T00:00:00Z").getUTCDay();
    const tier = dow === 6 ? "weekend" : (dow === 5 || dow === 0 ? "peak" : "weekday");
    const feInfo = feGetTierForDate(template as any, "rt-a", day.date, tier as any);
    const expected = feInfo.enabled && feInfo.price && feInfo.price > 0 ? feInfo.price : null;
    assertEquals(day.price, expected, `${day.date} tier=${tier}`);
  }
});

// ---------- Parity: 直接呼叫前端 templatePriceResolver 本尊（純函式版） ----------
import { resolveTemplatePricesFromRows } from "../../../src/utils/templatePriceResolverPure.ts";

/**
 * 通用 helper：對每個房型的每日 price，比對「API 結果」與「前端 pure resolver 結果」。
 * 前端 resolver 只回有價的日期；API 對「無法解價」的日期回 null。
 * 對齊：feResult[d] ?? null === apiDay.price
 */
function assertParity(
  label: string,
  apiDays: { date: string; price: number | null }[],
  feResult: Record<string, number>,
) {
  for (const day of apiDays) {
    const expected = feResult[day.date] ?? null;
    assertEquals(day.price, expected, `${label} ${day.date}`);
  }
}

Deno.test("parity-pure: room_overrides — API prices match resolveTemplatePricesFromRows", () => {
  const template = {
    id: "tmpl-1",
    template_name: "標準方案",
    room_type_id: null,
    price: 3000,
    weekday_price: 3000,
    peak_price: 4000,
    weekend_price: 5000,
    room_overrides: [
      { room_type_id: "rt-a", weekday_price: 2500, peak_price: 3500, weekend_price: 4500, available_rooms: 2 },
    ],
    season_segments: null,
  };
  const dates = enumerateDates("2026-07-01", "2026-07-06");
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-06",
    roomTypes: [RT_A, RT_B],
    inventory: [],
    orders: [],
    orderRooms: [],
    templates: [
      { ...template, room_type_id: "rt-a" } as any,
      { ...template, room_type_id: "rt-b" } as any,
    ],
    holidays: [],
  });
  for (const rt of ["rt-a", "rt-b"]) {
    const fe = resolveTemplatePricesFromRows({
      roomTypeId: rt,
      template,
      dates,
      publicHolidays: [],
    });
    const apiDays = res.find((r) => r.room_type_id === rt)!.days;
    assertParity(`overrides ${rt}`, apiDays, fe);
  }
});

Deno.test("parity-pure: season_segments — API prices match resolveTemplatePricesFromRows", () => {
  const template = {
    id: "tmpl-2",
    template_name: "四季方案",
    room_type_id: "rt-a",
    price: null,
    weekday_price: null,
    peak_price: null,
    weekend_price: null,
    season_segments: [
      {
        id: "s1",
        valid_from: "2026-07-01",
        valid_until: "2026-07-10",
        weekday_price: 2000,
        peak_price: 2500,
        weekend_price: 3000,
        weekday_enabled: true,
        peak_enabled: true,
        weekend_enabled: true,
        room_overrides: [
          { room_type_id: "rt-a", weekday_price: 1800, peak_price: null, weekend_price: 2800, available_rooms: 2 },
        ],
      },
      {
        id: "s2",
        valid_from: "2026-07-11",
        valid_until: "2026-07-31",
        weekday_price: 3500,
        peak_price: 4500,
        weekend_price: 6000,
        weekday_enabled: true,
        peak_enabled: false,
        weekend_enabled: true,
      },
    ],
  };
  const dates = enumerateDates("2026-07-01", "2026-07-20");
  const fe = resolveTemplatePricesFromRows({
    roomTypeId: "rt-a",
    template,
    dates,
    publicHolidays: [],
  });
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-20",
    roomTypes: [RT_A],
    inventory: [],
    orders: [],
    orderRooms: [],
    templates: [template as any],
    holidays: [],
  });
  assertParity("segments rt-a", res[0].days, fe);
});

Deno.test("parity-pure: meal column — 二食 template 從 inv.price_2_meals 取值", () => {
  const template = {
    id: "tmpl-2meals",
    template_name: "二食方案",
    room_type_id: "rt-a",
    // 無 tier 價、無 flat price → 前端會走 base row fallback + meal column
    price: null,
    weekday_price: null,
    peak_price: null,
    weekend_price: null,
    season_segments: null,
  };
  const dates = enumerateDates("2026-07-01", "2026-07-04");
  const baseRows = [
    { date: "2026-07-01", price: 3000, price_2_meals: 3500, price_3_meals: 4000 },
    { date: "2026-07-02", price: 3000, price_2_meals: 3500, price_3_meals: 4000 },
    { date: "2026-07-03", price: 3000, price_2_meals: 3500, price_3_meals: 4000 },
    { date: "2026-07-04", price: 3000, price_2_meals: 3500, price_3_meals: 4000 },
  ];
  const fe = resolveTemplatePricesFromRows({
    roomTypeId: "rt-a",
    template,
    dates,
    baseRows,
    publicHolidays: [],
  });
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-04",
    roomTypes: [RT_A],
    inventory: baseRows.map((r) => ({
      room_type_id: "rt-a",
      date: r.date,
      price: r.price,
      price_2_meals: r.price_2_meals,
      price_3_meals: r.price_3_meals,
      available_rooms: 2,
      is_available: true,
    })),
    orders: [],
    orderRooms: [],
    templates: [template as any],
    holidays: [],
  });
  // FE 應該全部 3500（二食欄位）
  assertEquals(fe["2026-07-01"], 3500);
  assertEquals(fe["2026-07-04"], 3500);
  assertParity("meal-2 rt-a", res[0].days, fe);
});

Deno.test("parity-pure: meal column — 三食 template 從 inv.price_3_meals 取值", () => {
  const template = {
    id: "tmpl-3meals",
    template_name: "三食豪華方案",
    room_type_id: "rt-a",
    price: null,
    weekday_price: null,
    peak_price: null,
    weekend_price: null,
  };
  const dates = enumerateDates("2026-07-01", "2026-07-03");
  const baseRows = [
    { date: "2026-07-01", price: 3000, price_2_meals: 3500, price_3_meals: 4200 },
    { date: "2026-07-02", price: 3000, price_2_meals: 3500, price_3_meals: 4200 },
    { date: "2026-07-03", price: 3000, price_2_meals: 3500, price_3_meals: 4200 },
  ];
  const fe = resolveTemplatePricesFromRows({
    roomTypeId: "rt-a",
    template,
    dates,
    baseRows,
    publicHolidays: [],
  });
  const res = buildAvailability({
    from: "2026-07-01",
    to: "2026-07-03",
    roomTypes: [RT_A],
    inventory: baseRows.map((r) => ({
      room_type_id: "rt-a",
      date: r.date,
      price: r.price,
      price_2_meals: r.price_2_meals,
      price_3_meals: r.price_3_meals,
      available_rooms: 2,
      is_available: true,
    })),
    orders: [],
    orderRooms: [],
    templates: [template as any],
    holidays: [],
  });
  assertEquals(fe["2026-07-01"], 4200);
  assertParity("meal-3 rt-a", res[0].days, fe);
});
