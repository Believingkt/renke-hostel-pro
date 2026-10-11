// Performance computation for GET /accommodation-api/performance.
// 純函式（不接觸資料庫），方便單元測試。
// 兩條時間軸、以日為粒度（台北時區）：
//   - booked（進單軸）：以 order_date 落在哪一天計；gross = 含後來取消、net = 排除取消
//   - stay（入住軸）：每一晚佔用房晚；營收以 final_price / nights 平均攤到每晚；退房日不計
//   - 住房率 = 佔用房晚 / 可售房晚（room_inventory_pricing.available_rooms → room_types.room_count；is_available=false 視為 0）
//   - 包棟方案房型或 lock_whole_building 的訂單視為當晚佔滿全部可售房
import { enumerateDates } from "../_shared/availability.ts";

export const MAX_PERFORMANCE_RANGE_DAYS = 366;
export const EXCLUDED_TEST_SOURCES = ["test", "test_data"];

export interface PerfRoomType {
  id: string;
  room_count: number | null;
  is_exclusive_package: boolean | null;
}
export interface PerfInvRow {
  room_type_id: string;
  date: string;
  available_rooms: number | null;
  is_available: boolean | null;
}
export interface PerfOrder {
  id: string;
  order_date: string | null;
  created_at?: string | null;
  order_status: string;
  check_in_date: string;
  check_out_date: string;
  final_price: number | null;
  paid_amount: number | null;
  room_quantity: number | null;
  room_type_id: string | null;
  lock_whole_building: boolean | null;
  order_source: string | null;
}
export interface PerfOrderRoom {
  order_id: string;
  room_type_id: string;
  quantity: number;
}

export interface BookedBucket {
  orders: number;
  gross_revenue: number;
  cancelled_orders: number;
  cancelled_revenue: number;
  net_orders: number;
  net_revenue: number;
  collected_amount: number;
  room_nights: number;
}
export interface StayBucket {
  occupied_room_nights: number;
  available_room_nights: number;
  occupancy_rate: number | null;
  revenue: number;
  check_ins: number;
  cancelled_room_nights: number;
  cancelled_revenue: number;
}
export interface DailyPerf {
  date: string;
  booked: BookedBucket;
  stay: StayBucket;
}
export interface SourceBucket {
  source: string;
  orders: number;
  gross_revenue: number;
  cancelled_orders: number;
  net_revenue: number;
}
export interface PerformanceResult {
  summary: {
    booked: BookedBucket & {
      cancellation_rate_by_orders: number | null;
      cancellation_rate_by_revenue: number | null;
    };
    stay: StayBucket;
    by_source: SourceBucket[];
  };
  daily: DailyPerf[];
}

export interface PerformanceInput {
  from: string;
  to: string;
  roomTypes: PerfRoomType[];
  inventory: PerfInvRow[];
  orders: PerfOrder[];
  orderRooms: PerfOrderRoom[];
}

/** timestamptz → 台北日期字串 YYYY-MM-DD */
export function toTaipeiDate(ts: string): string {
  const d = new Date(ts);
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 台北 [startDay 00:00, endDay+1 00:00) 的 UTC ISO 區間（供 PostgREST 比較 timestamptz） */
export function taipeiDayRangeUtc(startDay: string, endDay: string): { startUtc: string; endUtc: string } {
  const startUtc = new Date(`${startDay}T00:00:00+08:00`).toISOString();
  const [ey, em, ed] = endDay.split("-").map(Number);
  const endUtc = new Date(Date.UTC(ey, em - 1, ed + 1, -8, 0, 0)).toISOString();
  return { startUtc, endUtc };
}

const emptyBooked = (): BookedBucket => ({
  orders: 0,
  gross_revenue: 0,
  cancelled_orders: 0,
  cancelled_revenue: 0,
  net_orders: 0,
  net_revenue: 0,
  collected_amount: 0,
  room_nights: 0,
});
const emptyStay = (): StayBucket => ({
  occupied_room_nights: 0,
  available_room_nights: 0,
  occupancy_rate: null,
  revenue: 0,
  check_ins: 0,
  cancelled_room_nights: 0,
  cancelled_revenue: 0,
});

const rate = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 10000) / 10000 : null;
const round0 = (n: number) => Math.round(n);

export function buildPerformance(input: PerformanceInput): PerformanceResult {
  const { from, to, roomTypes, inventory, orders, orderRooms } = input;
  const dates = enumerateDates(from, to);
  const daily = new Map<string, DailyPerf>();
  for (const d of dates) daily.set(d, { date: d, booked: emptyBooked(), stay: emptyStay() });

  // 可售房晚（排除包棟方案虛擬房型）
  const invMap = new Map<string, PerfInvRow>();
  for (const inv of inventory) invMap.set(`${inv.room_type_id}_${inv.date}`, inv);
  const sellableTypes = roomTypes.filter((rt) => !rt.is_exclusive_package);
  const exclusiveIds = new Set(roomTypes.filter((rt) => rt.is_exclusive_package).map((rt) => rt.id));
  const capacityByDate = new Map<string, number>();
  for (const d of dates) {
    let cap = 0;
    for (const rt of sellableTypes) {
      const inv = invMap.get(`${rt.id}_${d}`);
      if (inv?.is_available === false) continue;
      cap += inv?.available_rooms ?? rt.room_count ?? 0;
    }
    capacityByDate.set(d, cap);
    daily.get(d)!.stay.available_room_nights = cap;
  }

  const qtyByOrder = new Map<string, number>();
  for (const r of orderRooms) qtyByOrder.set(r.order_id, (qtyByOrder.get(r.order_id) ?? 0) + Number(r.quantity || 0));

  const seen = new Set<string>();
  const bySource = new Map<string, SourceBucket>();

  for (const o of orders) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    const cancelled = o.order_status === "cancelled";
    const price = Number(o.final_price || 0);
    const nightsAll = enumerateDates(o.check_in_date, o.check_out_date).slice(0, -1);
    const nights = Math.max(1, nightsAll.length);
    const wholeHouse = !!o.lock_whole_building || (o.room_type_id ? exclusiveIds.has(o.room_type_id) : false);
    const qty = qtyByOrder.get(o.id) ?? Number(o.room_quantity || 0);
    const roomsPerNight = (d: string) =>
      wholeHouse ? (capacityByDate.get(d) ?? 0) : (qty > 0 ? qty : 1);

    // ── 進單軸 ──
    const orderTs = o.order_date || o.created_at;
    const bookedDay = orderTs ? toTaipeiDate(orderTs) : null;
    if (bookedDay && daily.has(bookedDay)) {
      const b = daily.get(bookedDay)!.booked;
      const rn = wholeHouse
        ? nightsAll.reduce((s, d) => s + (capacityByDate.get(d) ?? 0), 0)
        : nights * (qty > 0 ? qty : 1);
      b.orders += 1;
      b.gross_revenue += price;
      b.room_nights += rn;
      if (cancelled) {
        b.cancelled_orders += 1;
        b.cancelled_revenue += price;
      } else {
        b.net_orders += 1;
        b.net_revenue += price;
        b.collected_amount += Number(o.paid_amount || 0);
      }
      const src = o.order_source || "unknown";
      const sb = bySource.get(src) ?? { source: src, orders: 0, gross_revenue: 0, cancelled_orders: 0, net_revenue: 0 };
      sb.orders += 1;
      sb.gross_revenue += price;
      if (cancelled) sb.cancelled_orders += 1;
      else sb.net_revenue += price;
      bySource.set(src, sb);
    }

    // ── 入住軸 ──
    const perNight = price / nights;
    for (const d of nightsAll) {
      const row = daily.get(d);
      if (!row) continue;
      const rooms = roomsPerNight(d);
      if (cancelled) {
        row.stay.cancelled_room_nights += rooms;
        row.stay.cancelled_revenue += perNight;
      } else {
        row.stay.occupied_room_nights += rooms;
        row.stay.revenue += perNight;
        if (d === o.check_in_date) row.stay.check_ins += 1;
      }
    }
  }

  const sumBooked = emptyBooked();
  const sumStay = emptyStay();
  const dailyArr: DailyPerf[] = [];
  for (const d of dates) {
    const row = daily.get(d)!;
    row.stay.revenue = round0(row.stay.revenue);
    row.stay.cancelled_revenue = round0(row.stay.cancelled_revenue);
    row.stay.occupancy_rate = rate(row.stay.occupied_room_nights, row.stay.available_room_nights);
    for (const k of Object.keys(sumBooked) as (keyof BookedBucket)[]) sumBooked[k] += row.booked[k];
    sumStay.occupied_room_nights += row.stay.occupied_room_nights;
    sumStay.available_room_nights += row.stay.available_room_nights;
    sumStay.revenue += row.stay.revenue;
    sumStay.check_ins += row.stay.check_ins;
    sumStay.cancelled_room_nights += row.stay.cancelled_room_nights;
    sumStay.cancelled_revenue += row.stay.cancelled_revenue;
    dailyArr.push(row);
  }
  sumStay.occupancy_rate = rate(sumStay.occupied_room_nights, sumStay.available_room_nights);

  return {
    summary: {
      booked: {
        ...sumBooked,
        cancellation_rate_by_orders: rate(sumBooked.cancelled_orders, sumBooked.orders),
        cancellation_rate_by_revenue: rate(sumBooked.cancelled_revenue, sumBooked.gross_revenue),
      },
      stay: sumStay,
      by_source: Array.from(bySource.values()).sort((a, b) => b.gross_revenue - a.gross_revenue),
    },
    daily: dailyArr,
  };
}

export const PERFORMANCE_DEFINITIONS = {
  timezone: "Asia/Taipei",
  booked: "以 order_date（台北日期）計入當天：orders/gross_revenue 含後來取消的訂單（＝進單時的預估營收）；cancelled_* 為其中已取消；net_* 為排除取消後；collected_amount 為未取消訂單的 paid_amount 合計。",
  stay: "以每一晚（check_in_date ≤ 日 < check_out_date）計入：occupied_room_nights 為未取消訂單佔用房數；revenue 為 final_price ÷ 住宿晚數 攤到每晚；available_room_nights 取 room_inventory_pricing.available_rooms（缺列用 room_types.room_count，is_available=false 視為 0，排除包棟方案虛擬房型）；occupancy_rate = occupied / available；cancelled_* 為原訂該晚入住但已取消者。",
  exclusions: "排除 order_status=hold、order_source=test/test_data，以及該館在「業績推播來源設定」中關閉的來源。包棟方案房型或 lock_whole_building 訂單視為當晚佔滿全部可售房。",
};
