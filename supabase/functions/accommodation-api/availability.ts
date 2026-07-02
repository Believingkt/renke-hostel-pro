// Availability computation helpers for GET /accommodation-api/availability.
// 純函式（不接觸資料庫），方便單元測試。
// 邏輯沿用：
//   - room_inventory_pricing（pricing_template_id is null）作為每日容量/開關房/基礎房價
//   - 缺列時容量 fallback 至 room_types.room_count、is_available 視為 true
//   - orders + order_rooms 佔用扣房；退房日不扣
//   - 包棟互斥同前
//   - price 解算：inv.price（>0）→ shared/pricingTemplate.getTierForDate
//     （含 room_overrides / season_segments / tier enabled；tier 不可售則 price=null）
import {
  getTierForDate,
  type TemplateLike,
} from "../_shared/pricingTemplate.ts";

export interface RoomType {
  id: string;
  name: string;
  capacity: number | null;
  room_count: number | null;
  is_exclusive_package: boolean | null;
  is_bound_to_exclusive: boolean | null;
  bound_exclusive_ids: string[] | null;
}
export interface InvRow {
  room_type_id: string;
  date: string;
  price: number | null;
  available_rooms: number | null;
  is_available: boolean | null;
}
export interface OrderRow {
  id: string;
  room_type_id: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  lock_whole_building: boolean | null;
}
export interface OrderRoomRow {
  order_id: string;
  room_type_id: string;
  quantity: number;
}
export interface TemplateRow {
  room_type_id: string | null;
  price: number | null;
  weekday_price: number | null;
  peak_price: number | null;
  weekend_price: number | null;
}
export interface HolidayRow {
  holiday_date: string;
  holiday_type: string | null;
}

export const MAX_RANGE_DAYS = 60;
export const ACTIVE_ORDER_STATUSES = ["hold", "pending", "confirmed", "checked_in"];

export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
}

export function enumerateDates(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
}

export function daysBetweenInclusive(from: string, to: string): number {
  const start = new Date(from + "T00:00:00Z").getTime();
  const end = new Date(to + "T00:00:00Z").getTime();
  return Math.floor((end - start) / 86400000) + 1;
}

export type DayTier = "weekday" | "peak" | "weekend";

export function classifyDay(
  dateStr: string,
  holidaySet: Set<string>,
  workOnWeekendSet: Set<string>,
): DayTier {
  if (holidaySet.has(dateStr)) return "weekend";
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
  if (dow === 6) return "weekend";
  if ((dow === 5 || dow === 0) && !workOnWeekendSet.has(dateStr)) return "peak";
  return "weekday";
}

export function resolveTemplatePrice(t: TemplateRow | undefined | null, tier: DayTier): number | null {
  if (!t) return null;
  const weekday = t.weekday_price ?? t.price ?? null;
  const weekend = t.weekend_price ?? t.price ?? weekday;
  const peak = t.peak_price ?? t.weekday_price ?? weekend;
  const chosen = tier === "weekend" ? weekend : tier === "peak" ? peak : weekday;
  return chosen != null && chosen > 0 ? chosen : null;
}

export interface ComputeInput {
  from: string;
  to: string;
  roomTypes: RoomType[];
  inventory: InvRow[];
  orders: OrderRow[];
  orderRooms: OrderRoomRow[];
  templates: TemplateRow[];
  holidays: HolidayRow[];
}

export interface DayResult {
  date: string;
  remaining: number;
  price: number | null;
  is_available: boolean;
  closed: boolean;
}
export interface RoomTypeResult {
  room_type_id: string;
  name: string;
  capacity: number;
  days: DayResult[];
}

export function buildAvailability(input: ComputeInput): RoomTypeResult[] {
  const { from, to, roomTypes, inventory, orders, orderRooms, templates, holidays } = input;
  const dates = enumerateDates(from, to);

  // Holidays
  const holidaySet = new Set<string>();
  const workOnWeekendSet = new Set<string>();
  for (const h of holidays) {
    if (h.holiday_type === "work_on_weekend") workOnWeekendSet.add(h.holiday_date);
    else holidaySet.add(h.holiday_date);
  }

  // Inventory map
  const invMap = new Map<string, InvRow>();
  for (const inv of inventory) invMap.set(`${inv.room_type_id}_${inv.date}`, inv);

  // Template map (first template per room_type_id)
  const templateMap = new Map<string, TemplateRow>();
  for (const t of templates) {
    if (t.room_type_id && !templateMap.has(t.room_type_id)) templateMap.set(t.room_type_id, t);
  }

  // Occupancy: count "room-nights" per (room_type_id, date). Excludes check_out_date.
  const activeOrders = orders.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.order_status));
  const orderRoomsByOrder = new Map<string, OrderRoomRow[]>();
  for (const r of orderRooms) {
    const list = orderRoomsByOrder.get(r.order_id) ?? [];
    list.push(r);
    orderRoomsByOrder.set(r.order_id, list);
  }
  const occupied = new Map<string, number>(); // key = rtId_date
  const bump = (rtId: string, d: string, n: number) => {
    const k = `${rtId}_${d}`;
    occupied.set(k, (occupied.get(k) ?? 0) + n);
  };
  for (const o of activeOrders) {
    const rooms = orderRoomsByOrder.get(o.id);
    const nights = enumerateDates(o.check_in_date, o.check_out_date).slice(0, -1); // exclude check-out
    for (const d of nights) {
      if (d < from || d > to) continue;
      if (rooms && rooms.length > 0) {
        for (const r of rooms) bump(r.room_type_id, d, r.quantity);
      } else if (o.room_type_id) {
        bump(o.room_type_id, d, 1);
      }
    }
  }

  // Whole-building locks
  const wholeLocked = new Set<string>();
  for (const o of activeOrders) {
    if (!o.lock_whole_building) continue;
    for (const d of enumerateDates(o.check_in_date, o.check_out_date).slice(0, -1)) {
      if (d >= from && d <= to) wholeLocked.add(d);
    }
  }

  // Exclusive package cross-locks
  const rtById = new Map(roomTypes.map((r) => [r.id, r]));
  const sharedExclusiveIds = roomTypes
    .filter((r) => r.is_exclusive_package && r.is_bound_to_exclusive)
    .map((r) => r.id);
  const sharedExclusiveBookedDates = new Set<string>(); // any shared-exclusive order → block others
  const boundRoomLockDatesByExclusive = new Map<string, Set<string>>(); // exclusiveId → dates
  for (const o of activeOrders) {
    const rt = o.room_type_id ? rtById.get(o.room_type_id) : null;
    if (!rt) continue;
    const nights = enumerateDates(o.check_in_date, o.check_out_date).slice(0, -1);
    if (rt.is_exclusive_package && rt.is_bound_to_exclusive) {
      for (const d of nights) sharedExclusiveBookedDates.add(d);
    } else if (!rt.is_exclusive_package && rt.is_bound_to_exclusive) {
      const targets = rt.bound_exclusive_ids && rt.bound_exclusive_ids.length > 0
        ? rt.bound_exclusive_ids
        : sharedExclusiveIds;
      for (const exId of targets) {
        const set = boundRoomLockDatesByExclusive.get(exId) ?? new Set<string>();
        for (const d of nights) set.add(d);
        boundRoomLockDatesByExclusive.set(exId, set);
      }
    }
  }
  const isBlockedByExclusive = (rt: RoomType, d: string): boolean => {
    if (rt.is_exclusive_package) {
      if (!rt.is_bound_to_exclusive) return false;
      if (sharedExclusiveBookedDates.has(d)) {
        // don't block the very same room type from its own bookings (still counts as occupied instead)
        return true;
      }
      return boundRoomLockDatesByExclusive.get(rt.id)?.has(d) === true;
    }
    return rt.is_bound_to_exclusive === true && sharedExclusiveBookedDates.has(d);
  };

  const results: RoomTypeResult[] = [];
  for (const rt of roomTypes) {
    const days: DayResult[] = [];
    const capacityFallback = rt.room_count ?? 0;
    const template = templateMap.get(rt.id);
    for (const d of dates) {
      const inv = invMap.get(`${rt.id}_${d}`);
      const invAvailable = inv?.is_available !== false; // undefined/null → true
      const capacity = inv?.available_rooms ?? capacityFallback;
      const occ = occupied.get(`${rt.id}_${d}`) ?? 0;
      const wholeBlock = wholeLocked.has(d);
      const exclusiveBlock = isBlockedByExclusive(rt, d);
      const closed = wholeBlock || exclusiveBlock || !invAvailable;
      const remaining = closed ? 0 : Math.max(0, capacity - occ);
      const tier = classifyDay(d, holidaySet, workOnWeekendSet);
      let price: number | null = null;
      if (!closed) {
        if (inv?.price != null && inv.price > 0) price = inv.price;
        else price = resolveTemplatePrice(template, tier);
      }
      days.push({ date: d, remaining, price, is_available: !closed, closed });
    }
    results.push({
      room_type_id: rt.id,
      name: rt.name,
      capacity: rt.capacity ?? 0,
      days,
    });
  }
  return results;
}
