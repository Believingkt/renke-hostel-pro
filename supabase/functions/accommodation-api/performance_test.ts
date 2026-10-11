import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPerformance, taipeiDayRangeUtc, toTaipeiDate } from "./performance.ts";

const RT = [
  { id: "rt-a", room_count: 3, is_exclusive_package: false },
  { id: "rt-b", room_count: 2, is_exclusive_package: false },
  { id: "rt-x", room_count: 1, is_exclusive_package: true },
];

Deno.test("toTaipeiDate shifts UTC into Taipei day", () => {
  assertEquals(toTaipeiDate("2026-06-01T17:30:00Z"), "2026-06-02");
  assertEquals(toTaipeiDate("2026-06-01T15:59:59Z"), "2026-06-01");
});

Deno.test("taipeiDayRangeUtc covers whole Taipei days", () => {
  const r = taipeiDayRangeUtc("2026-06-01", "2026-06-02");
  assertEquals(r.startUtc, "2026-05-31T16:00:00.000Z");
  assertEquals(r.endUtc, "2026-06-02T16:00:00.000Z");
});

Deno.test("buildPerformance: booked vs stay axes, cancellation and occupancy", () => {
  const res = buildPerformance({
    from: "2026-06-01",
    to: "2026-06-03",
    roomTypes: RT,
    inventory: [{ room_type_id: "rt-a", date: "2026-06-02", available_rooms: 1, is_available: true }],
    orders: [
      // 進單 6/1、住 6/2–6/3（2 晚）、2 間、未取消
      { id: "o1", order_date: "2026-06-01T02:00:00Z", order_status: "confirmed", check_in_date: "2026-06-02", check_out_date: "2026-06-04", final_price: 4000, paid_amount: 1000, room_quantity: 2, room_type_id: "rt-a", lock_whole_building: false, order_source: "website" },
      // 進單 6/1、住 6/1 一晚、已取消
      { id: "o2", order_date: "2026-06-01T05:00:00Z", order_status: "cancelled", check_in_date: "2026-06-01", check_out_date: "2026-06-02", final_price: 3000, paid_amount: 0, room_quantity: 1, room_type_id: "rt-b", lock_whole_building: false, order_source: "kol" },
      // 範圍外進單（5/20），只算入住軸 6/1
      { id: "o3", order_date: "2026-05-20T05:00:00Z", order_status: "checked_out", check_in_date: "2026-05-31", check_out_date: "2026-06-02", final_price: 2000, paid_amount: 2000, room_quantity: 1, room_type_id: "rt-b", lock_whole_building: false, order_source: "website" },
    ],
    orderRooms: [],
  });

  const d1 = res.daily[0], d2 = res.daily[1], d3 = res.daily[2];
  // 進單軸 6/1：2 筆、gross 7000、取消 1 筆 3000、net 4000
  assertEquals(d1.booked.orders, 2);
  assertEquals(d1.booked.gross_revenue, 7000);
  assertEquals(d1.booked.cancelled_orders, 1);
  assertEquals(d1.booked.net_revenue, 4000);
  assertEquals(d1.booked.collected_amount, 1000);
  assertEquals(d1.booked.room_nights, 2 * 2 + 1);
  // 入住軸 6/1：o3 一間（1000/晚）、o2 取消 1 房晚 3000；容量 5
  assertEquals(d1.stay.occupied_room_nights, 1);
  assertEquals(d1.stay.revenue, 1000);
  assertEquals(d1.stay.cancelled_room_nights, 1);
  assertEquals(d1.stay.cancelled_revenue, 3000);
  assertEquals(d1.stay.available_room_nights, 5);
  assertEquals(d1.stay.occupancy_rate, 0.2);
  // 6/2：o1 兩間（2000/晚）、check_in 1；容量 rt-a 覆寫為 1 + rt-b 2 = 3
  assertEquals(d2.stay.occupied_room_nights, 2);
  assertEquals(d2.stay.revenue, 2000);
  assertEquals(d2.stay.check_ins, 1);
  assertEquals(d2.stay.available_room_nights, 3);
  // 6/3：o1 兩間
  assertEquals(d3.stay.occupied_room_nights, 2);
  assertEquals(d3.stay.check_ins, 0);

  assertEquals(res.summary.booked.cancellation_rate_by_orders, 0.5);
  assertEquals(res.summary.booked.cancellation_rate_by_revenue, Math.round((3000 / 7000) * 10000) / 10000);
  assertEquals(res.summary.stay.occupied_room_nights, 5);
  assertEquals(res.summary.stay.available_room_nights, 13);
  assertEquals(res.summary.by_source.map((s) => s.source), ["website", "kol"]);
});

Deno.test("buildPerformance: whole-building / exclusive package fills capacity; order_rooms quantity wins", () => {
  const res = buildPerformance({
    from: "2026-06-01",
    to: "2026-06-01",
    roomTypes: RT,
    inventory: [],
    orders: [
      { id: "x1", order_date: "2026-06-01T00:00:00Z", order_status: "confirmed", check_in_date: "2026-06-01", check_out_date: "2026-06-02", final_price: 9000, paid_amount: 0, room_quantity: 1, room_type_id: "rt-x", lock_whole_building: false, order_source: null },
    ],
    orderRooms: [],
  });
  assertEquals(res.daily[0].stay.occupied_room_nights, 5);
  assertEquals(res.daily[0].stay.occupancy_rate, 1);
  assertEquals(res.summary.by_source[0].source, "unknown");

  const res2 = buildPerformance({
    from: "2026-06-01",
    to: "2026-06-01",
    roomTypes: RT,
    inventory: [],
    orders: [
      { id: "y1", order_date: "2026-06-01T00:00:00Z", order_status: "confirmed", check_in_date: "2026-06-01", check_out_date: "2026-06-02", final_price: 1000, paid_amount: 0, room_quantity: 1, room_type_id: "rt-a", lock_whole_building: false, order_source: "website" },
    ],
    orderRooms: [{ order_id: "y1", room_type_id: "rt-a", quantity: 3 }],
  });
  assertEquals(res2.daily[0].stay.occupied_room_nights, 3);
  assertEquals(res2.daily[0].booked.room_nights, 3);
});
