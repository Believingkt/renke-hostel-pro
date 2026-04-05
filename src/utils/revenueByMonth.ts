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
  confirmedOrders: { check_in_date: string; check_out_date: string; is_exclusive_package?: boolean }[],
  dailyRoomCap: number = 6
): Map<string, number> {
  const result = new Map<string, number>();
  confirmedOrders.forEach(order => {
    if (!order.check_in_date || !order.check_out_date) return;
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));
    const roomNightsPerDay = order.is_exclusive_package ? dailyRoomCap : 1;
    for (let i = 0; i < nights; i++) {
      const day = addDays(checkIn, i);
      const monthKey = format(day, 'yyyy-MM');
      result.set(monthKey, (result.get(monthKey) || 0) + roomNightsPerDay);
    }
  });
  return result;
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
