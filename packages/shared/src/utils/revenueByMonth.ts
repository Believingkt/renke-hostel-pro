import { format, addDays, differenceInDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subWeeks, subMonths, subYears, differenceInCalendarDays } from 'date-fns';

export interface InventoryPriceRow {
  room_type_id: string;
  date: string;
  price: number;
  price_2_meals: number | null;
  price_3_meals: number | null;
}

// key: `${room_type_id}_${yyyy-MM-dd}`, value: { price, price_2_meals, price_3_meals }
export type PricingMap = Map<string, { price: number; price_2_meals: number | null; price_3_meals: number | null }>;

export function buildPricingMap(inventoryData: InventoryPriceRow[]): PricingMap {
  const map: PricingMap = new Map();
  inventoryData.forEach(item => {
    map.set(`${item.room_type_id}_${item.date}`, {
      price: item.price,
      price_2_meals: item.price_2_meals,
      price_3_meals: item.price_3_meals,
    });
  });
  return map;
}

/**
 * Pick the appropriate daily price from inventory based on the order's meal_plan.
 * Falls back to base price if meal-specific price is null.
 */
function pickDailyPrice(
  inv: { price: number; price_2_meals: number | null; price_3_meals: number | null },
  mealPlan: string | null
): number {
  if (mealPlan === '3_meals' || mealPlan === '三餐') {
    return inv.price_3_meals ?? inv.price;
  }
  if (mealPlan === '2_meals' || mealPlan === '二餐' || mealPlan === '兩餐') {
    return inv.price_2_meals ?? inv.price;
  }
  return inv.price;
}

/**
 * Split an order's revenue by month based on daily room prices from inventory.
 * Uses inventory prices as proportional weights to distribute final_price across months.
 * Falls back to equal distribution (final_price / nights) if no inventory price found.
 */
export function splitOrderRevenueByMonth(
  order: {
    check_in_date: string;
    check_out_date: string;
    room_type_id: string | null;
    final_price: number;
    meal_plan?: string | null;
  },
  _pricingMap?: PricingMap
): Map<string, number> {
  const result = new Map<string, number>();
  const checkIn = new Date(order.check_in_date);
  const checkOut = new Date(order.check_out_date);
  const totalNights = Math.max(1, differenceInDays(checkOut, checkIn));
  const dailyRevenue = order.final_price / totalNights;

  for (let i = 0; i < totalNights; i++) {
    const day = addDays(checkIn, i);
    const monthKey = format(day, 'yyyy-MM');
    result.set(monthKey, (result.get(monthKey) || 0) + dailyRevenue);
  }

  return result;
}

/**
 * Aggregate revenue by month from a list of confirmed orders using daily price splitting.
 */
export function aggregateRevenueByMonth(
  confirmedOrders: {
    check_in_date: string;
    check_out_date: string;
    room_type_id: string | null;
    final_price: number;
    meal_plan?: string | null;
  }[],
  pricingMap: PricingMap
): Map<string, number> {
  const result = new Map<string, number>();

  confirmedOrders.forEach(order => {
    if (!order.check_in_date || !order.check_out_date) return;
    const orderRevenue = splitOrderRevenueByMonth(order, pricingMap);
    orderRevenue.forEach((rev, monthKey) => {
      result.set(monthKey, (result.get(monthKey) || 0) + rev);
    });
  });

  return result;
}

/**
 * Compute room nights by month from confirmed orders.
 */
export function computeRoomNightsByMonth(
  confirmedOrders: { check_in_date: string; check_out_date: string; is_exclusive_package?: boolean; room_quantity?: number }[],
  dailyRoomCap: number = 6
): Map<string, number> {
  const result = new Map<string, number>();
  confirmedOrders.forEach(order => {
    if (!order.check_in_date || !order.check_out_date) return;
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));
    const roomNightsPerDay = order.is_exclusive_package ? dailyRoomCap : (order.room_quantity || 1);
    for (let i = 0; i < nights; i++) {
      const day = addDays(checkIn, i);
      const monthKey = format(day, 'yyyy-MM');
      result.set(monthKey, (result.get(monthKey) || 0) + roomNightsPerDay);
    }
  });
  return result;
}

/* ============================================================================
 * 營運分析（HQ OperationalOverview）期間指標計算 —— 本期/前期共用，避免兩份邏輯
 * 統計基準：
 *   - "stay"（依住宿日，飯店業慣例、預設）：期間內的住宿夜數
 *   - "booking"（依下訂日）：期間內下訂的整張訂單
 * 有效訂單：order_status ∈ {confirmed, checked_in, checked_out}
 * 每晚單位數：order_rooms.quantity 加總（包棟房型每個 quantity 算 1 單位，不乘全館房數）；
 *            無 order_rooms 時退回 room_quantity || 1
 * ========================================================================== */
export type RevenueBasis = "stay" | "booking";

export interface PerfOrderInput {
  order_status: string | null;
  final_price: number | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_quantity?: number | null;
  room_type_id?: string | null;
  /** 訂單層包棟鎖定（orders.lock_whole_building） */
  lock_whole_building?: boolean | null;
  /** 該訂單的 order_rooms 明細（每列一房型 × 數量）。每晚單位數＝quantity 加總 */
  order_rooms?: { quantity: number | null; room_type_id?: string | null }[] | null;
}

/** 包棟房型未填房間組成時，間數換算採用的預設值 */
export const PACKAGE_ROOMS_FALLBACK = 2.5;

/** 間數換算所需的房型資訊 */
export interface RoomTypeRoomsMeta {
  is_exclusive_package?: boolean | null;
  lock_whole_building?: boolean | null;
  double_room_count?: number | null;
  triple_room_count?: number | null;
  quad_room_count?: number | null;
}

/**
 * 單一「每晚單位」換算為間數的係數：
 *   - 一般房型 → 1
 *   - 包棟房型（is_exclusive_package / lock_whole_building，或訂單層 lock_whole_building）
 *     → double+triple+quad 房間數總和；總和為 0 時用 PACKAGE_ROOMS_FALLBACK
 */
export function roomsPerUnit(
  meta?: RoomTypeRoomsMeta | null,
  orderLocksWholeBuilding = false
): number {
  const isPackage = !!(meta?.is_exclusive_package || meta?.lock_whole_building || orderLocksWholeBuilding);
  if (!isPackage) return 1;
  const composed =
    (Number(meta?.double_room_count) || 0) +
    (Number(meta?.triple_room_count) || 0) +
    (Number(meta?.quad_room_count) || 0);
  return composed > 0 ? composed : PACKAGE_ROOMS_FALLBACK;
}

/**
 * 每晚間數：逐筆 order_rooms 依其房型判斷係數後加總（Σ quantity × 係數）。
 * 無 order_rooms 時退回 room_quantity || 1，房型取訂單層 room_type_id。
 */
export function roomsPerNight(
  order: PerfOrderInput,
  roomTypeMeta?: Map<string, RoomTypeRoomsMeta>
): number {
  const locked = !!order.lock_whole_building;
  if (order.order_rooms && order.order_rooms.length > 0) {
    let qty = 0;
    let rooms = 0;
    for (const r of order.order_rooms) {
      const q = Number(r.quantity) || 0;
      if (q <= 0) continue;
      qty += q;
      rooms += q * roomsPerUnit(r.room_type_id ? roomTypeMeta?.get(r.room_type_id) : undefined, locked);
    }
    if (qty > 0) return rooms;
  }
  const units = Math.max(1, Number(order.room_quantity) || 1);
  return units * roomsPerUnit(order.room_type_id ? roomTypeMeta?.get(order.room_type_id) : undefined, locked);
}

const EFFECTIVE_ORDER_STATUSES = new Set(["confirmed", "checked_in", "checked_out"]);

export function isEffectiveOrder(status: string | null | undefined): boolean {
  return !!status && EFFECTIVE_ORDER_STATUSES.has(status);
}

/**
 * 每晚佔用單位數：order_rooms.quantity 加總（包棟房型每個 quantity 算 1 單位，不乘全館房數）；
 * 無 order_rooms 時退回 room_quantity || 1。
 */
export function unitsPerNight(order: PerfOrderInput): number {
  if (order.order_rooms && order.order_rooms.length > 0) {
    const sum = order.order_rooms.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
    if (sum > 0) return sum;
  }
  return Math.max(1, Number(order.room_quantity) || 1);
}

/** [checkIn, checkOut) 與 [periodStart, periodEndExcl) 的重疊夜數 */
function overlapNights(checkIn: Date, checkOut: Date, periodStart: Date, periodEndExcl: Date): number {
  const s = checkIn > periodStart ? checkIn : periodStart;
  const e = checkOut < periodEndExcl ? checkOut : periodEndExcl;
  const n = differenceInDays(e, s);
  return n > 0 ? n : 0;
}

export interface PeriodMetricsOptions {
  basis: RevenueBasis;
  /** 期間起（含，當日 00:00） */
  periodStart: Date;
  /** 期間迄的隔日 00:00（排除上界，= 期末日 + 1 天） */
  periodEndExcl: Date;
  /** 房型間數換算資訊（room_type_id → meta）；未提供時所有房型視為一般房 */
  roomTypeMeta?: Map<string, RoomTypeRoomsMeta>;
}

/**
 * 計算單一民宿在指定期間、指定基準下的「訂單數、總營收、房晚數」。
 *   - stay 基準：傳入的 orders 應已用 (check_in_date <= 期末) 且 (check_out_date > 期初) 篩過；此處再把夜數裁切到期間內。
 *   - booking 基準：傳入的 orders 應已用 created_at 落在期間內篩過；整張訂單全額計入。
 * 房晚數 = Σ(期間內夜數 × 每晚單位數)；每晚單位數見 unitsPerNight。
 */
export function computePeriodMetrics(
  orders: PerfOrderInput[],
  opts: PeriodMetricsOptions
): { orderCount: number; revenue: number; roomNights: number; rooms: number } {
  const { basis, periodStart, periodEndExcl, roomTypeMeta } = opts;
  let orderCount = 0;
  let revenue = 0;
  let roomNights = 0;
  let rooms = 0;

  for (const o of orders) {
    if (!isEffectiveOrder(o.order_status)) continue;
    if (!o.check_in_date || !o.check_out_date) continue;

    const checkIn = new Date(o.check_in_date);
    const checkOut = new Date(o.check_out_date);
    const totalNights = Math.max(1, differenceInDays(checkOut, checkIn));
    const units = unitsPerNight(o);
    const roomUnits = roomsPerNight(o, roomTypeMeta);
    const price = o.final_price || 0;

    if (basis === "stay") {
      const nights = overlapNights(checkIn, checkOut, periodStart, periodEndExcl);
      if (nights <= 0) continue;
      orderCount += 1;
      roomNights += nights * units;
      rooms += nights * roomUnits;
      revenue += (price / totalNights) * nights;
    } else {
      orderCount += 1;
      roomNights += totalNights * units;
      rooms += totalNights * roomUnits;
      revenue += price;
    }
  }

  return { orderCount, revenue, roomNights, rooms };
}

export interface CapacityRoomType {
  room_count: number | null;
  is_exclusive_package?: boolean | null;
}

export interface OccupancyCapacityConfig {
  roomTypes: CapacityRoomType[];
  accName?: string | null;
  daily_capacity?: number | null;
  daily_villa_capacity?: number | null;
  daily_room_capacity?: number | null;
}

export interface OccupancyCapacityResult {
  splitMode: boolean;
  allCapacity: number;
  exclusiveCap: number;
  standardCap: number;
  exclusiveRoomCount: number;
  standardRoomCount: number;
  villaAsSingleUnit: boolean;
}

/**
 * 每日可售單位數 —— 與民宿後台「住房率報表」(OccupancyRevenueTable) 同一套口徑，供總部與後台共用。
 *   1) 管理員設定 daily_villa_capacity／daily_room_capacity → 兩者相加（包棟以「棟」為單位）。
 *   2) 雲岫向下相容：有包棟又有散客房型 → 包棟棟數 + 散客間數（全部 room_count）。
 *   3) 其餘：所有房型 room_count 加總，上限為 daily_capacity（未設時預設 6）。
 */
export function computeOccupancyCapacity(cfg: OccupancyCapacityConfig): OccupancyCapacityResult {
  const dailyCap = Number(cfg.daily_capacity) > 0 ? Number(cfg.daily_capacity) : 6;
  const villa = Number(cfg.daily_villa_capacity) > 0 ? Number(cfg.daily_villa_capacity) : 0;
  const room = Number(cfg.daily_room_capacity) > 0 ? Number(cfg.daily_room_capacity) : 0;

  const exclusiveRoomCount = cfg.roomTypes.filter(rt => rt.is_exclusive_package).reduce((s, rt) => s + (rt.room_count || 0), 0);
  const standardRoomCount = cfg.roomTypes.filter(rt => !rt.is_exclusive_package).reduce((s, rt) => s + (rt.room_count || 0), 0);

  const isYunxiu = (cfg.accName || "").includes("雲岫");
  const adminSplit = villa > 0 || room > 0;
  const splitMode = adminSplit || (isYunxiu && exclusiveRoomCount > 0 && standardRoomCount > 0);
  const villaAsSingleUnit = adminSplit;

  let exclusiveCap: number;
  let standardCap: number;
  if (adminSplit) {
    exclusiveCap = villa;
    standardCap = room;
  } else if (splitMode) {
    exclusiveCap = exclusiveRoomCount;
    standardCap = standardRoomCount;
  } else {
    exclusiveCap = 0;
    standardCap = 0;
  }

  let allCapacity: number;
  if (splitMode) {
    allCapacity = exclusiveCap + standardCap;
  } else {
    const total = cfg.roomTypes.reduce((s, rt) => s + (rt.room_count || 0), 0);
    allCapacity = Math.min(total, dailyCap);
  }

  return { splitMode, allCapacity, exclusiveCap, standardCap, exclusiveRoomCount, standardRoomCount, villaAsSingleUnit };
}

export type OverviewTimeRange = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

export interface ResolvePeriodOptions {
  basis: RevenueBasis;
  now: Date;
  isPrevious?: boolean;
  customFrom?: Date;
  customTo?: Date;
}

/**
 * 解析營運分析期間 → { start(當日00:00), end(當日23:59) }，本期/前期共用。
 * 依住宿日(stay)：week/month/quarter/year 取「完整期間」（含未來已訂住宿夜），前期取完整前一區間。
 * 依下訂日(booking)：同上區間「截到今天」，前期取「同樣經過天數」。
 * today / custom / all 兩基準相同（today=當日、custom=使用者選取、all=自2020起）。
 */
export function resolvePeriodRange(
  range: OverviewTimeRange,
  { basis, now, isPrevious = false, customFrom, customTo }: ResolvePeriodOptions
): { start: Date; end: Date } {
  if (range === "all") {
    return { start: new Date(2020, 0, 1), end: endOfDay(now) };
  }

  if (range === "custom") {
    const from = customFrom ? startOfDay(customFrom) : startOfDay(now);
    const to = customTo ? endOfDay(customTo) : endOfDay(now);
    if (!isPrevious) return { start: from, end: to };
    const spanDays = differenceInCalendarDays(to, from) + 1;
    const prevEnd = endOfDay(subDays(from, 1));
    const prevStart = startOfDay(subDays(prevEnd, spanDays - 1));
    return { start: prevStart, end: prevEnd };
  }

  if (range === "today") {
    if (!isPrevious) return { start: startOfDay(now), end: endOfDay(now) };
    return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
  }

  // week / month / quarter / year
  let periodStart: Date;
  let periodEnd: Date;
  let prevPeriodStart: Date;
  let prevPeriodEnd: Date;
  switch (range) {
    case "week":
      periodStart = startOfWeek(now, { weekStartsOn: 1 });
      periodEnd = endOfWeek(now, { weekStartsOn: 1 });
      prevPeriodStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      prevPeriodEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
      break;
    case "quarter": {
      const qm = Math.floor(now.getMonth() / 3) * 3;
      periodStart = new Date(now.getFullYear(), qm, 1);
      periodEnd = new Date(now.getFullYear(), qm + 3, 0);
      prevPeriodStart = new Date(now.getFullYear(), qm - 3, 1);
      prevPeriodEnd = new Date(now.getFullYear(), qm, 0);
      break;
    }
    case "year":
      periodStart = startOfYear(now);
      periodEnd = endOfYear(now);
      prevPeriodStart = startOfYear(subYears(now, 1));
      prevPeriodEnd = endOfYear(subYears(now, 1));
      break;
    case "month":
    default:
      periodStart = startOfMonth(now);
      periodEnd = endOfMonth(now);
      prevPeriodStart = startOfMonth(subMonths(now, 1));
      prevPeriodEnd = endOfMonth(subMonths(now, 1));
      break;
  }

  if (basis === "stay") {
    if (!isPrevious) return { start: startOfDay(periodStart), end: endOfDay(periodEnd) };
    return { start: startOfDay(prevPeriodStart), end: endOfDay(prevPeriodEnd) };
  }

  const elapsedDays = differenceInCalendarDays(startOfDay(now), startOfDay(periodStart)) + 1;
  if (!isPrevious) {
    return { start: startOfDay(periodStart), end: endOfDay(now) };
  }
  return {
    start: startOfDay(prevPeriodStart),
    end: endOfDay(addDays(startOfDay(prevPeriodStart), elapsedDays - 1)),
  };
}

/**
 * Count unique booking orders per month based on stay-date overlap.
 * An order is counted in every month its stay dates overlap with.
 */
export function computeBookingCountByMonth(
  confirmedOrders: { check_in_date: string; check_out_date: string }[]
): Map<string, number> {
  const result = new Map<string, number>();
  confirmedOrders.forEach(order => {
    if (!order.check_in_date || !order.check_out_date) return;
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));
    // Collect unique months this order spans
    const months = new Set<string>();
    for (let i = 0; i < nights; i++) {
      months.add(format(addDays(checkIn, i), 'yyyy-MM'));
    }
    months.forEach(monthKey => {
      result.set(monthKey, (result.get(monthKey) || 0) + 1);
    });
  });
  return result;
}
