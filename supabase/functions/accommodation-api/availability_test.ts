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
