import { format, addDays, differenceInDays } from 'date-fns';

export type PricingMap = Map<string, number>; // key: `${room_type_id}_${yyyy-MM-dd}`

export function buildPricingMap(
  inventoryData: { room_type_id: string; date: string; price: number }[]
): PricingMap {
  const map = new Map<string, number>();
  inventoryData.forEach(item => {
    map.set(`${item.room_type_id}_${item.date}`, item.price);
  });
  return map;
}

/**
 * Split an order's revenue by month based on daily room prices from inventory.
 * Each night of stay uses the inventory price for that date.
 * Falls back to final_price / nights if no inventory price found.
 */
export function splitOrderRevenueByMonth(
  order: {
    check_in_date: string;
    check_out_date: string;
    room_type_id: string | null;
    final_price: number;
  },
  pricingMap: PricingMap
): Map<string, number> {
  const result = new Map<string, number>();
  const checkIn = new Date(order.check_in_date);
  const checkOut = new Date(order.check_out_date);
  const totalNights = Math.max(1, differenceInDays(checkOut, checkIn));
  const fallbackDailyPrice = order.final_price / totalNights;

  for (let i = 0; i < totalNights; i++) {
    const day = addDays(checkIn, i);
    const dateStr = format(day, 'yyyy-MM-dd');
    const monthKey = format(day, 'yyyy-MM');

    let dailyPrice = fallbackDailyPrice;
    if (order.room_type_id) {
      const inventoryPrice = pricingMap.get(`${order.room_type_id}_${dateStr}`);
      if (inventoryPrice !== undefined) {
        dailyPrice = inventoryPrice;
      }
    }

    result.set(monthKey, (result.get(monthKey) || 0) + dailyPrice);
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
  confirmedOrders: { check_in_date: string; check_out_date: string }[]
): Map<string, number> {
  const result = new Map<string, number>();
  confirmedOrders.forEach(order => {
    if (!order.check_in_date || !order.check_out_date) return;
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));
    for (let i = 0; i < nights; i++) {
      const day = addDays(checkIn, i);
      const monthKey = format(day, 'yyyy-MM');
      result.set(monthKey, (result.get(monthKey) || 0) + 1);
    }
  });
  return result;
}
