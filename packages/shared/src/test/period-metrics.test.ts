import { describe, it, expect } from "vitest";
import {
  computePeriodMetrics,
  computeOccupancyCapacity,
  resolvePeriodRange,
  PACKAGE_ROOMS_FALLBACK,
  type PerfOrderInput,
  type RoomTypeRoomsMeta,
} from "@lakeze/shared/utils/revenueByMonth";
import { format } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

// 期間：2026-09-01 ~ 2026-09-30（依住宿日）
const stayOpts = {
  basis: "stay" as const,
  periodStart: new Date("2026-09-01"),
  periodEndExcl: new Date("2026-10-01"),
};

describe("computePeriodMetrics 依住宿日（以 order_rooms 計每晚單位數）", () => {
  it("包棟 quantity=1 住 2 晚 → 房晚 2（包棟不乘全館房數）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 50000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", order_rooms: [{ quantity: 1 }] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.orderCount).toBe(1);
    expect(r.roomNights).toBe(2);
  });

  it("order_rooms 兩列 3＋2 住 1 晚 → 房晚 5", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 9000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", order_rooms: [{ quantity: 3 }, { quantity: 2 }] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.roomNights).toBe(5);
  });

  it("無 order_rooms → 退回 room_quantity（2 間住 2 晚 → 房晚 4）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 8000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", room_quantity: 2, order_rooms: [] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.roomNights).toBe(4);
    expect(Math.round(r.revenue)).toBe(8000);
  });

  it("無 order_rooms 且無 room_quantity → 退回 1", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 3000, check_in_date: "2026-09-05", check_out_date: "2026-09-06" },
    ];
    expect(computePeriodMetrics(orders, stayOpts).roomNights).toBe(1);
  });

  it("checked_out/checked_in 皆計入；pending/cancelled 不計", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "checked_out", final_price: 3000, check_in_date: "2026-09-05", check_out_date: "2026-09-06", order_rooms: [{ quantity: 1 }] },
      { order_status: "checked_in", final_price: 3000, check_in_date: "2026-09-07", check_out_date: "2026-09-08", order_rooms: [{ quantity: 1 }] },
      { order_status: "pending", final_price: 9999, check_in_date: "2026-09-09", check_out_date: "2026-09-10", order_rooms: [{ quantity: 1 }] },
      { order_status: "cancelled", final_price: 9999, check_in_date: "2026-09-09", check_out_date: "2026-09-10", order_rooms: [{ quantity: 1 }] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.orderCount).toBe(2);
    expect(r.roomNights).toBe(2);
    expect(Math.round(r.revenue)).toBe(6000);
  });

  it("跨月夜數裁切到期間內（與驗收 SQL 口徑一致）", () => {
    // 8/30–9/3 住 4 晚、2 間，final 4000 → 每晚 1000；落在 9 月 = 9/1,9/2 共 2 晚 × 2 間 = 4
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 4000, check_in_date: "2026-08-30", check_out_date: "2026-09-03", order_rooms: [{ quantity: 2 }] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.roomNights).toBe(4);
    expect(Math.round(r.revenue)).toBe(2000);
  });
});

describe("computePeriodMetrics 依下訂日", () => {
  const bookingOpts = { ...stayOpts, basis: "booking" as const };
  it("整張訂單全額與全夜數計入（不裁切）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 4000, check_in_date: "2026-08-30", check_out_date: "2026-09-03", order_rooms: [{ quantity: 2 }] },
    ];
    const r = computePeriodMetrics(orders, bookingOpts);
    expect(r.orderCount).toBe(1);
    expect(r.roomNights).toBe(8); // 4 晚 × 2 間
    expect(Math.round(r.revenue)).toBe(4000);
  });
});

describe("computeOccupancyCapacity 與入住率 ≤100%", () => {
  it("管理員設定 villa/room capacity → 相加", () => {
    const cap = computeOccupancyCapacity({ roomTypes: [{ room_count: 20, is_exclusive_package: false }], daily_villa_capacity: 2, daily_room_capacity: 3 });
    expect(cap.allCapacity).toBe(5);
  });

  it("雲岫向下相容：包棟＋散客房型 → room_count 全加總", () => {
    const cap = computeOccupancyCapacity({ accName: "雲岫", roomTypes: [{ room_count: 1, is_exclusive_package: true }, { room_count: 4, is_exclusive_package: false }] });
    expect(cap.allCapacity).toBe(5);
  });

  it("其餘館：room_count 加總，上限為 daily_capacity（未設預設 6）", () => {
    expect(computeOccupancyCapacity({ roomTypes: [{ room_count: 10 }] }).allCapacity).toBe(6);
    expect(computeOccupancyCapacity({ roomTypes: [{ room_count: 10 }], daily_capacity: 12 }).allCapacity).toBe(10);
  });

  it("同日 1 棟包棟 + 容量 1 → 入住率 100% 不超過", () => {
    const cap = computeOccupancyCapacity({ roomTypes: [{ room_count: 1, is_exclusive_package: true }], daily_villa_capacity: 1 });
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 30000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", order_rooms: [{ quantity: 1 }] },
    ];
    const { roomNights } = computePeriodMetrics(orders, stayOpts);
    const availableRoomNights = cap.allCapacity * 1; // 1 晚
    const occupancy = (roomNights / availableRoomNights) * 100;
    expect(cap.allCapacity).toBe(1);
    expect(roomNights).toBe(1);
    expect(occupancy).toBe(100);
    expect(occupancy).toBeLessThanOrEqual(100);
  });
});

describe("resolvePeriodRange 依基準決定是否截到今天", () => {
  const now = new Date(2026, 9, 8, 12, 0, 0); // 2026-10-08（週四）

  it("依住宿日：本月取完整 10/01–10/31（含未來已訂夜），前期取完整 9 月", () => {
    const cur = resolvePeriodRange("month", { basis: "stay", now });
    expect([fmt(cur.start), fmt(cur.end)]).toEqual(["2026-10-01", "2026-10-31"]);
    const prev = resolvePeriodRange("month", { basis: "stay", now, isPrevious: true });
    expect([fmt(prev.start), fmt(prev.end)]).toEqual(["2026-09-01", "2026-09-30"]);
  });

  it("依下訂日：本月截到今天 10/01–10/08，前期取同樣經過天數 9/01–9/08", () => {
    const cur = resolvePeriodRange("month", { basis: "booking", now });
    expect([fmt(cur.start), fmt(cur.end)]).toEqual(["2026-10-01", "2026-10-08"]);
    const prev = resolvePeriodRange("month", { basis: "booking", now, isPrevious: true });
    expect([fmt(prev.start), fmt(prev.end)]).toEqual(["2026-09-01", "2026-09-08"]);
  });

  it("依住宿日：本年完整；依下訂日截到今天", () => {
    expect(fmt(resolvePeriodRange("year", { basis: "stay", now }).end)).toBe("2026-12-31");
    expect(fmt(resolvePeriodRange("year", { basis: "booking", now }).end)).toBe("2026-10-08");
  });

  it("依住宿日：本季完整 10/01–12/31，前期完整 7/01–9/30", () => {
    const cur = resolvePeriodRange("quarter", { basis: "stay", now });
    expect([fmt(cur.start), fmt(cur.end)]).toEqual(["2026-10-01", "2026-12-31"]);
    const prev = resolvePeriodRange("quarter", { basis: "stay", now, isPrevious: true });
    expect([fmt(prev.start), fmt(prev.end)]).toEqual(["2026-07-01", "2026-09-30"]);
  });

  it("自訂區間兩基準相同：前期取緊鄰在前同天數", () => {
    const opts = { basis: "stay" as const, now, customFrom: new Date(2026, 8, 1), customTo: new Date(2026, 8, 30) };
    expect([fmt(resolvePeriodRange("custom", opts).start), fmt(resolvePeriodRange("custom", opts).end)]).toEqual(["2026-09-01", "2026-09-30"]);
    const prev = resolvePeriodRange("custom", { ...opts, isPrevious: true });
    expect([fmt(prev.start), fmt(prev.end)]).toEqual(["2026-08-02", "2026-08-31"]);
  });
});

describe("間數（依房型逐筆計算）", () => {
  const RT_NORMAL = "rt-normal";
  const RT_PKG_NO_COMPOSITION = "rt-pkg-plain";
  const RT_SENSHAN_18 = "rt-senshan-18";

  const meta = new Map<string, RoomTypeRoomsMeta>([
    [RT_NORMAL, { is_exclusive_package: false, double_room_count: 1, triple_room_count: 0, quad_room_count: 0 }],
    [RT_PKG_NO_COMPOSITION, { is_exclusive_package: true, double_room_count: 0, triple_room_count: 0, quad_room_count: 0 }],
    // 森山「18 人包區」：3 雙 + 3 四
    [RT_SENSHAN_18, { is_exclusive_package: true, double_room_count: 3, triple_room_count: 0, quad_room_count: 3 }],
  ]);
  const opts = { ...stayOpts, roomTypeMeta: meta };

  it("一般房型 1 間住 2 晚 → 間數 2", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 8000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", order_rooms: [{ quantity: 1, room_type_id: RT_NORMAL }] },
    ];
    const r = computePeriodMetrics(orders, opts);
    expect(r.roomNights).toBe(2);
    expect(r.rooms).toBe(2);
  });

  it("包棟房型未填房間組成住 2 晚 → 間數 5（2 × PACKAGE_ROOMS_FALLBACK）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 50000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", order_rooms: [{ quantity: 1, room_type_id: RT_PKG_NO_COMPOSITION }] },
    ];
    const r = computePeriodMetrics(orders, opts);
    expect(r.roomNights).toBe(2);
    expect(r.rooms).toBe(2 * PACKAGE_ROOMS_FALLBACK);
    expect(r.rooms).toBe(5);
  });

  it("森山「18 人包區」（3 雙＋3 四）住 1 晚 → 間數 6", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 36000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", order_rooms: [{ quantity: 1, room_type_id: RT_SENSHAN_18 }] },
    ];
    const r = computePeriodMetrics(orders, opts);
    expect(r.roomNights).toBe(1);
    expect(r.rooms).toBe(6);
  });

  it("同一訂單混房型：一般 2 間 + 森山包區 1 間住 1 晚 → 房晚 3、間數 8", () => {
    const orders: PerfOrderInput[] = [
      {
        order_status: "confirmed", final_price: 50000, check_in_date: "2026-09-10", check_out_date: "2026-09-11",
        order_rooms: [{ quantity: 2, room_type_id: RT_NORMAL }, { quantity: 1, room_type_id: RT_SENSHAN_18 }],
      },
    ];
    const r = computePeriodMetrics(orders, opts);
    expect(r.roomNights).toBe(3);
    expect(r.rooms).toBe(8);
  });

  it("訂單層 lock_whole_building 且房型無組成 → 走 fallback 2.5", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 20000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", lock_whole_building: true, order_rooms: [{ quantity: 1 }] },
    ];
    expect(computePeriodMetrics(orders, opts).rooms).toBe(PACKAGE_ROOMS_FALLBACK);
  });

  it("未提供房型資訊時一律視為一般房（間數 = 房晚數）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 8000, check_in_date: "2026-09-10", check_out_date: "2026-09-12", order_rooms: [{ quantity: 2 }] },
    ];
    const r = computePeriodMetrics(orders, stayOpts);
    expect(r.roomNights).toBe(4);
    expect(r.rooms).toBe(4);
  });

  it("依下訂日基準同樣套用房型係數（森山包區 2 晚 → 12）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 72000, check_in_date: "2026-11-01", check_out_date: "2026-11-03", order_rooms: [{ quantity: 1, room_type_id: RT_SENSHAN_18 }] },
    ];
    const r = computePeriodMetrics(orders, { ...opts, basis: "booking" });
    expect(r.rooms).toBe(12);
  });

  it("無 order_rooms 時用訂單層 room_type_id（包棟無組成 2 間 1 晚 → 5）", () => {
    const orders: PerfOrderInput[] = [
      { order_status: "confirmed", final_price: 60000, check_in_date: "2026-09-10", check_out_date: "2026-09-11", room_quantity: 2, room_type_id: RT_PKG_NO_COMPOSITION, order_rooms: [] },
    ];
    expect(computePeriodMetrics(orders, opts).rooms).toBe(5);
  });
});
