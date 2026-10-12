import { format, addDays, differenceInDays } from 'date-fns';

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
 * 每晚房間數：room_quantity||1；包棟(lock_whole_building 或房型 is_exclusive_package)=該館可售房間總數
 * ========================================================================== */
export type RevenueBasis = "stay" | "booking";

export interface PerfOrderInput {
  order_status: string | null;
  final_price: number | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_quantity?: number | null;
  lock_whole_building?: boolean | null;
  room_type_id?: string | null;
}

const EFFECTIVE_ORDER_STATUSES = new Set(["confirmed", "checked_in", "checked_out"]);

export function isEffectiveOrder(status: string | null | undefined): boolean {
  return !!status && EFFECTIVE_ORDER_STATUSES.has(status);
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
  /** 包棟/獨佔的房型 id 集合 */
  exclusiveRoomTypeIds: Set<string>;
  /** 該館可售房間總數（room_count 加總，排除包棟虛擬房型） */
  buildingRooms: number;
}

/**
 * 計算單一民宿在指定期間、指定基準下的「訂單數、總營收、房晚數」。
 * 注意：
 *   - stay 基準：傳入的 orders 應已用 (check_in_date <= 期末) 且 (check_out_date > 期初) 篩過；此處再把夜數裁切到期間內。
 *   - booking 基準：傳入的 orders 應已用 created_at 落在期間內篩過；整張訂單全額計入。
 */
export function computePeriodMetrics(
  orders: PerfOrderInput[],
  opts: PeriodMetricsOptions
): { orderCount: number; revenue: number; roomNights: number } {
  const { basis, periodStart, periodEndExcl, exclusiveRoomTypeIds, buildingRooms } = opts;
  let orderCount = 0;
  let revenue = 0;
  let roomNights = 0;

  for (const o of orders) {
    if (!isEffectiveOrder(o.order_status)) continue;
    if (!o.check_in_date || !o.check_out_date) continue;

    const checkIn = new Date(o.check_in_date);
    const checkOut = new Date(o.check_out_date);
    const totalNights = Math.max(1, differenceInDays(checkOut, checkIn));
    const isWhole =
      o.lock_whole_building === true ||
      (o.room_type_id ? exclusiveRoomTypeIds.has(o.room_type_id) : false);
    const roomsPerNight = isWhole ? Math.max(1, buildingRooms) : Math.max(1, o.room_quantity || 1);
    const price = o.final_price || 0;

    if (basis === "stay") {
      const nights = overlapNights(checkIn, checkOut, periodStart, periodEndExcl);
      if (nights <= 0) continue;
      orderCount += 1;
      roomNights += nights * roomsPerNight;
      revenue += (price / totalNights) * nights;
    } else {
      orderCount += 1;
      roomNights += totalNights * roomsPerNight;
      revenue += price;
    }
  }

  return { orderCount, revenue, roomNights };
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
