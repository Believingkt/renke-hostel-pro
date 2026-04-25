import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { getOrderStatusLabel } from "@/utils/orderHelpers";
import { buildPricingMap, aggregateRevenueByMonth, computeRoomNightsByMonth, computeBookingCountByMonth, type PricingMap } from "@/utils/revenueByMonth";

interface DashboardStats {
  totalRooms: number;
  monthlyBookings: number;
  totalGuests: number;
  monthlyRevenue: number;
  bookingsChange: string;
  guestsChange: string;
  revenueChange: string;
}

interface ChartData {
  month: string;
  revenue?: number;
  bookings?: number;
  lastYearRevenue?: number;
  lastYearBookings?: number;
  prevRevenue?: number;
  prevBookings?: number;
  今年?: number;
  去年?: number;
  本月?: number;
  上月?: number;
  本期?: number;
  isFuture?: boolean;
}

export interface BookingTrendsPoint {
  month: string;
  接單: number;
  住宿: number;
  營收: number;
  baseline: number;
  isFuture?: boolean;
}

interface OccupancyData {
  month: string;
  [roomTypeName: string]: number | string;
}

interface MonthlyMetrics {
  month: string;
  occupancyRate: number;
  lastYearOccupancyRate?: number;
  averagePrice: number;
  lastYearAveragePrice?: number;
  isFuture?: boolean;
}

interface DashboardData {
  stats: DashboardStats;
  revenueData: ChartData[];
  bookingData: ChartData[];
  bookingTrendsData: BookingTrendsPoint[];
  bookingTrendsBaselineSource: 'lastYear' | 'recent3Months' | 'none';
  occupancyData: OccupancyData[];
  monthlyOccupancyRate: MonthlyMetrics[];
  monthlyAveragePrice: MonthlyMetrics[];
}

const fetchDashboardData = async (
  accommodationId: string,
  comparisonMode: 'lastYear' | 'lastMonth',
  customDateRange?: { from: Date; to: Date },
  selectedYear?: number
): Promise<DashboardData> => {
  const DAILY_ROOM_CAP = 6;
  const now = new Date();
  const currentYear = selectedYear || now.getFullYear();
  
  let startDate: Date;
  let endDate: Date;
  
  if (customDateRange?.from && customDateRange?.to) {
    startDate = customDateRange.from;
    endDate = customDateRange.to;
  } else if (comparisonMode === 'lastYear') {
    startDate = new Date(currentYear - 1, 0, 1);
    endDate = new Date(currentYear, 11, 31, 23, 59, 59);
  } else {
    startDate = subMonths(now, 13);
    endDate = now;
  }
  
  // Step 1: Fetch room types, orders, and order_rooms in parallel
  const [roomTypesResult, ordersResult, orderRoomsResult] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, room_count, is_exclusive_package")
      .eq("accommodation_id", accommodationId),
    supabase
      .from("orders")
      .select("*, room_types(name)")
      .eq("accommodation_id", accommodationId)
      .gte("order_date", startDate.toISOString())
      .lte("order_date", endDate.toISOString())
      .order("order_date", { ascending: false }),
    supabase
      .from("order_rooms")
      .select("order_id, room_type_id, quantity")
      .limit(10000),
  ]);
  
  if (roomTypesResult.error) throw roomTypesResult.error;
  if (ordersResult.error) throw ordersResult.error;
  
  const roomTypesData = roomTypesResult.data || [];
  const ordersData = ordersResult.data || [];
  
  // Build order_rooms lookup: order_id -> total room quantity
  const orderRoomsMap = new Map<string, number>();
  const orderRoomsExclusive = new Map<string, boolean>();
  const exclusiveSetForLookup = new Set(roomTypesData.filter(rt => rt.is_exclusive_package).map(rt => rt.id));
  (orderRoomsResult.data || []).forEach(or => {
    const current = orderRoomsMap.get(or.order_id) || 0;
    orderRoomsMap.set(or.order_id, current + (or.quantity || 1));
    if (exclusiveSetForLookup.has(or.room_type_id)) {
      orderRoomsExclusive.set(or.order_id, true);
    }
  });
  
  const isRevenueEligible = (status: string) => status === 'confirmed';
  const totalRoomCount = roomTypesData.reduce((sum, rt) => sum + (rt.room_count || 0), 0);

  // Step 2: Fetch inventory pricing for daily revenue splitting
  const confirmedWithDates = ordersData.filter(o => isRevenueEligible(o.order_status) && o.check_in_date && o.check_out_date);
  const roomTypeIds = roomTypesData.map(rt => rt.id);
  
  let pricingMap: PricingMap = new Map();
  if (roomTypeIds.length > 0 && confirmedWithDates.length > 0) {
    let minDate = confirmedWithDates[0].check_in_date;
    let maxDate = confirmedWithDates[0].check_out_date;
    confirmedWithDates.forEach(o => {
      if (o.check_in_date < minDate) minDate = o.check_in_date;
      if (o.check_out_date > maxDate) maxDate = o.check_out_date;
    });
    
    const { data: inventoryData } = await supabase
      .from('room_inventory_pricing')
      .select('room_type_id, date, price, price_2_meals, price_3_meals')
      .in('room_type_id', roomTypeIds)
      .gte('date', minDate)
      .lte('date', maxDate)
      .limit(10000);
    
    pricingMap = buildPricingMap(inventoryData || []);
  }

  // Pre-compute revenue and room nights by month using daily price splitting
  const revenueByMonth = aggregateRevenueByMonth(
    confirmedWithDates.map(o => ({
      check_in_date: o.check_in_date,
      check_out_date: o.check_out_date,
      room_type_id: o.room_type_id,
      final_price: Number(o.final_price) || 0,
      meal_plan: o.meal_plan,
    })),
    pricingMap
  );
  
  // Build exclusive package lookup
  const exclusiveSet = new Set(roomTypesData.filter(rt => rt.is_exclusive_package).map(rt => rt.id));
  
  const roomNightsByMonth = computeRoomNightsByMonth(
    confirmedWithDates.map(o => {
      const orRooms = orderRoomsMap.get(o.id);
      const orExclusive = orderRoomsExclusive.get(o.id);
      const isExclusive = orExclusive || exclusiveSet.has(o.room_type_id);
      return {
        check_in_date: o.check_in_date,
        check_out_date: o.check_out_date,
        is_exclusive_package: isExclusive,
        room_quantity: isExclusive ? undefined : (orRooms || 1),
      };
    })
  );
  const bookingCountByMonth = computeBookingCountByMonth(confirmedWithDates);
  
  // Keep ordersByMonth for backward compat (stats cards use order_date for current/last month comparison)
  const ordersByMonth = new Map<string, typeof ordersData>();
  ordersData.forEach(order => {
    const orderDate = new Date(order.order_date);
    const monthKey = format(orderDate, 'yyyy-MM');
    if (!ordersByMonth.has(monthKey)) {
      ordersByMonth.set(monthKey, []);
    }
    ordersByMonth.get(monthKey)!.push(order);
  });

  // Bookings placed by month (based on order_date), only revenue-eligible orders
  const bookingPlacedByMonth = new Map<string, number>();
  // Revenue grouped by order_date (transaction month) — 接單金額 = 該月成交訂單總額
  const revenueByOrderMonth = new Map<string, number>();
  ordersData.forEach(order => {
    if (!isRevenueEligible(order.order_status)) return;
    const monthKey = format(new Date(order.order_date), 'yyyy-MM');
    bookingPlacedByMonth.set(monthKey, (bookingPlacedByMonth.get(monthKey) || 0) + 1);
    revenueByOrderMonth.set(monthKey, (revenueByOrderMonth.get(monthKey) || 0) + (order.final_price || 0));
  });
  // Stats cards
  const currentMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  
  const currentMonthKey = format(currentMonthStart, 'yyyy-MM');
  const lastMonthKey = format(lastMonthStart, 'yyyy-MM');
  
  const currentMonthOrders = ordersByMonth.get(currentMonthKey) || [];
  const lastMonthOrders = ordersByMonth.get(lastMonthKey) || [];
  
  const confirmedCurrentMonthOrders = currentMonthOrders.filter(o => isRevenueEligible(o.order_status));
  const confirmedLastMonthOrders = lastMonthOrders.filter(o => isRevenueEligible(o.order_status));
  const monthlyBookingCount = confirmedCurrentMonthOrders.length;
  const lastMonthBookingCount = confirmedLastMonthOrders.length;
  const monthlyGuestCount = confirmedCurrentMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
  const lastMonthGuestCount = confirmedLastMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
  
  // Revenue from daily price splitting
  const monthlyRev = revenueByMonth.get(currentMonthKey) || 0;
  const lastMonthRev = revenueByMonth.get(lastMonthKey) || 0;
  
  // Calculate change percentages
  const bookingChange = lastMonthBookingCount > 0 
    ? ((monthlyBookingCount - lastMonthBookingCount) / lastMonthBookingCount * 100).toFixed(1)
    : "0";
  const guestChange = lastMonthGuestCount > 0
    ? ((monthlyGuestCount - lastMonthGuestCount) / lastMonthGuestCount * 100).toFixed(1)
    : "0";
  const revChange = lastMonthRev > 0
    ? ((monthlyRev - lastMonthRev) / lastMonthRev * 100).toFixed(1)
    : "0";
    
  const safeBookingChange = Number.isFinite(Number(bookingChange)) ? bookingChange : "0";
  const safeGuestChange = Number.isFinite(Number(guestChange)) ? guestChange : "0";
  const safeRevChange = Number.isFinite(Number(revChange)) ? revChange : "0";
  
  // Generate chart data
  let monthlyData: ChartData[] = [];
  
  if (customDateRange?.from && customDateRange?.to) {
    let currentDate = new Date(customDateRange.from);
    const rangeEnd = new Date(customDateRange.to);
    
    while (currentDate <= rangeEnd) {
      const monthKey = format(currentDate, 'yyyy-MM');
      const monthLabel = format(currentDate, 'yyyy/MM');
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const revenue = revenueByMonth.get(monthKey) || 0;
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: bookingCountByMonth.get(monthKey) || 0,
        lastYearRevenue: 0,
        lastYearBookings: 0,
      });
      
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    }
  } else if (comparisonMode === 'lastYear') {
    const dataYear = selectedYear || now.getFullYear();
    
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(dataYear, month, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const lastYearMonthKey = format(new Date(dataYear - 1, month, 1), 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      const isFuture = dataYear === now.getFullYear() && month > now.getMonth();
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const lastYearOrders = ordersByMonth.get(lastYearMonthKey) || [];
      
      const revenue = revenueByMonth.get(monthKey) || 0;
      const lastYearRevenue = revenueByMonth.get(lastYearMonthKey) || 0;
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: bookingCountByMonth.get(monthKey) || 0,
        lastYearRevenue: Number.isFinite(lastYearRevenue) ? lastYearRevenue : 0,
        lastYearBookings: bookingCountByMonth.get(lastYearMonthKey) || 0,
        isFuture,
      });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const lastYearMonthKey = format(subMonths(monthDate, 12), 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const lastYearOrders = ordersByMonth.get(lastYearMonthKey) || [];
      
      const revenue = revenueByMonth.get(monthKey) || 0;
      const lastYearRevenue = revenueByMonth.get(lastYearMonthKey) || 0;
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: bookingCountByMonth.get(monthKey) || 0,
        lastYearRevenue: Number.isFinite(lastYearRevenue) ? lastYearRevenue : 0,
        lastYearBookings: bookingCountByMonth.get(lastYearMonthKey) || 0,
      });
    }
  }
  
  // Last month comparison data
  const lastMonthData: ChartData[] = [];
  
  if (customDateRange?.from && customDateRange?.to) {
    let currentDate = new Date(customDateRange.from);
    const rangeEnd = new Date(customDateRange.to);
    
    while (currentDate <= rangeEnd) {
      const monthKey = format(currentDate, 'yyyy-MM');
      const prevDate = new Date(currentDate);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonthKey = format(prevDate, 'yyyy-MM');
      const monthLabel = format(currentDate, 'yyyy/MM');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const prevMonthOrders = ordersByMonth.get(prevMonthKey) || [];
      
      const revenue = revenueByMonth.get(monthKey) || 0;
      const prevRevenue = revenueByMonth.get(prevMonthKey) || 0;
      
      lastMonthData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: bookingCountByMonth.get(monthKey) || 0,
        prevRevenue: Number.isFinite(prevRevenue) ? prevRevenue : 0,
        prevBookings: bookingCountByMonth.get(prevMonthKey) || 0,
      });
      
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const prevMonthDate = subMonths(monthDate, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const prevMonthKey = format(prevMonthDate, 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const prevMonthOrders = ordersByMonth.get(prevMonthKey) || [];
      
      const revenue = revenueByMonth.get(monthKey) || 0;
      const prevRevenue = revenueByMonth.get(prevMonthKey) || 0;
      
      lastMonthData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: bookingCountByMonth.get(monthKey) || 0,
        prevRevenue: Number.isFinite(prevRevenue) ? prevRevenue : 0,
        prevBookings: bookingCountByMonth.get(prevMonthKey) || 0,
      });
    }
  }
  
  // Set chart data based on comparison mode
  let revenueData: ChartData[];
  let bookingData: ChartData[];
  
  if (customDateRange?.from && customDateRange?.to) {
    revenueData = monthlyData.map(m => ({ 
      month: m.month, 
      "本期": Number.isFinite(m.revenue) ? m.revenue : 0,
    }));
    bookingData = monthlyData.map(m => ({ 
      month: m.month, 
      "本期": m.bookings || 0,
    }));
  } else if (comparisonMode === 'lastYear') {
    revenueData = monthlyData.map(m => ({ 
      month: m.month, 
      "今年": Number.isFinite(m.revenue) ? m.revenue : 0,
      "去年": Number.isFinite(m.lastYearRevenue) ? m.lastYearRevenue : 0,
      isFuture: m.isFuture
    }));
    bookingData = monthlyData.map(m => ({ 
      month: m.month, 
      "今年": m.bookings || 0,
      "去年": m.lastYearBookings || 0,
      isFuture: m.isFuture
    }));
  } else {
    revenueData = lastMonthData.map(m => ({ 
      month: m.month, 
      "本月": Number.isFinite(m.revenue) ? m.revenue : 0,
      "上月": Number.isFinite(m.prevRevenue) ? m.prevRevenue : 0
    }));
    bookingData = lastMonthData.map(m => ({ 
      month: m.month, 
      "本月": m.bookings || 0,
      "上月": m.prevBookings || 0
    }));
  }
  
  if (revenueData.length === 0) {
    revenueData = [{ month: format(now, 'M月'), "本期": 0 }];
  }
  if (bookingData.length === 0) {
    bookingData = [{ month: format(now, 'M月'), "本期": 0 }];
  }
  
  // Occupancy data
  const occupancyData: OccupancyData[] = [];
  const monthlyOccupancyRate: MonthlyMetrics[] = [];
  const monthlyAveragePrice: MonthlyMetrics[] = [];
  
  const dataYear = selectedYear || now.getFullYear();
  for (let month = 0; month < 12; month++) {
    const monthDate = new Date(dataYear, month, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthLabel = format(monthDate, 'MM月');
    const daysInMonth = monthEnd.getDate();
    const isFutureMonth = dataYear === now.getFullYear() && monthDate > now;
    
    const lastYearMonthDate = new Date(dataYear - 1, month, 1);
    const lastYearMonthStart = startOfMonth(lastYearMonthDate);
    const lastYearMonthEnd = endOfMonth(lastYearMonthDate);
    
    const monthDataPoint: OccupancyData = { month: monthLabel };
    
    // Get confirmed orders overlapping this month
    const monthOrders = ordersData.filter(o => {
      if (!o.check_in_date || !o.check_out_date) return false;
      if (!isRevenueEligible(o.order_status)) return false;
      const checkIn = new Date(o.check_in_date);
      const checkOut = new Date(o.check_out_date);
      return checkOut > monthStart && checkIn <= monthEnd;
    });
    
    
    let totalNightsAllRooms = 0;
    let lastYearTotalNights = 0;
    
    const lastYearMonthOrders = ordersData.filter(o => {
      if (!o.check_in_date || !o.check_out_date) return false;
      if (!isRevenueEligible(o.order_status)) return false;
      const checkIn = new Date(o.check_in_date);
      const checkOut = new Date(o.check_out_date);
      return checkOut > lastYearMonthStart && checkIn <= lastYearMonthEnd;
    });
    
    // Helper: count stay nights in a month using day-by-day iteration
    // Now accounts for order_rooms quantities
    const countNightsInMonth = (orders: typeof ordersData, mStart: Date, mKey: string, isExclusive: boolean, roomTypeId?: string) => {
      let nights = 0;
      orders.forEach(order => {
        if (!order.check_in_date || !order.check_out_date) return;
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        const totalN = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Determine multiplier from order_rooms or fallback
        let multiplier: number;
        if (isExclusive) {
          multiplier = DAILY_ROOM_CAP;
        } else {
          const orRooms = orderRoomsMap.get(order.id);
          if (orRooms && roomTypeId) {
            // Get quantity for this specific room type from order_rooms
            const orderRoomEntries = (orderRoomsResult.data || []).filter(
              or => or.order_id === order.id && or.room_type_id === roomTypeId
            );
            multiplier = orderRoomEntries.reduce((sum, or) => sum + (or.quantity || 1), 0) || 1;
          } else {
            multiplier = 1;
          }
        }
        
        for (let i = 0; i < totalN; i++) {
          const day = new Date(checkIn);
          day.setDate(day.getDate() + i);
          if (format(day, 'yyyy-MM') === mKey) nights += multiplier;
        }
      });
      return nights;
    };

    const monthKey = format(monthDate, 'yyyy-MM');
    const lastYearMonthKey = format(lastYearMonthDate, 'yyyy-MM');

    roomTypesData.forEach(roomType => {
      const roomCount = roomType.room_count || 1;
      const isExclusive = !!roomType.is_exclusive_package;
      
      // Include orders that have this room type via order_rooms OR via room_type_id
      const orderIdsWithRoomType = new Set(
        (orderRoomsResult.data || [])
          .filter(or => or.room_type_id === roomType.id)
          .map(or => or.order_id)
      );
      const roomOrders = monthOrders.filter(o => o.room_type_id === roomType.id || orderIdsWithRoomType.has(o.id));
      const totalNights = countNightsInMonth(roomOrders, monthStart, monthKey, isExclusive, roomType.id);
      
      const lastYearRoomOrders = lastYearMonthOrders.filter(o => o.room_type_id === roomType.id || orderIdsWithRoomType.has(o.id));
      const lastYearNights = countNightsInMonth(lastYearRoomOrders, lastYearMonthStart, lastYearMonthKey, isExclusive, roomType.id);
      
      const maxPossibleNights = (isExclusive ? DAILY_ROOM_CAP : roomCount) * daysInMonth;
      const occupancyRate = maxPossibleNights > 0 
        ? Math.round((totalNights / maxPossibleNights) * 100)
        : 0;
      
      totalNightsAllRooms += totalNights;
      lastYearTotalNights += lastYearNights;
      
      monthDataPoint[roomType.name] = isFutureMonth ? 0 : Math.min(100, occupancyRate);
    });
    
    // Use hard cap of 6 rooms/day, matching the Occupancy & Revenue Report
    const totalAvailableNights = DAILY_ROOM_CAP * daysInMonth;
    const overallOccupancyRate = totalAvailableNights > 0
      ? Math.round((totalNightsAllRooms / totalAvailableNights) * 1000) / 10
      : 0;
    
    const lastYearOverallOccupancyRate = totalAvailableNights > 0
      ? Math.round((lastYearTotalNights / totalAvailableNights) * 1000) / 10
      : 0;
    
    monthlyOccupancyRate.push({
      month: monthLabel,
      occupancyRate: Math.min(100, overallOccupancyRate),
      lastYearOccupancyRate: Math.min(100, lastYearOverallOccupancyRate),
      averagePrice: 0,
      isFuture: isFutureMonth,
    });
    
    // Average price (ADR) using daily-split revenue / room nights
    const monthRevenue = revenueByMonth.get(monthKey) || 0;
    const monthRoomNights = roomNightsByMonth.get(monthKey) || 0;
    const averagePrice = monthRoomNights > 0 ? Math.round(monthRevenue / monthRoomNights) : 0;
    
    const lastYearMonthRevenue = revenueByMonth.get(lastYearMonthKey) || 0;
    const lastYearMonthRoomNights = roomNightsByMonth.get(lastYearMonthKey) || 0;
    const lastYearAveragePrice = lastYearMonthRoomNights > 0 ? Math.round(lastYearMonthRevenue / lastYearMonthRoomNights) : 0;
    
    monthlyAveragePrice.push({
      month: monthLabel,
      occupancyRate: 0,
      averagePrice: averagePrice,
      lastYearAveragePrice: lastYearAveragePrice,
      isFuture: isFutureMonth,
    });
    
    occupancyData.push(monthDataPoint);
  }
  
  // Build Booking Trends data: 接單 (by order_date) vs 住宿 (by stay date) per month for selectedYear
  const trendsYear = selectedYear || now.getFullYear();
  const bookingTrendsRaw: BookingTrendsPoint[] = [];
  for (let month = 0; month < 12; month++) {
    const monthDate = new Date(trendsYear, month, 1);
    const monthKey = format(monthDate, 'yyyy-MM');
    const monthLabel = format(monthDate, 'MM月');
    const isFuture = trendsYear === now.getFullYear() && month > now.getMonth();
    bookingTrendsRaw.push({
      month: monthLabel,
      接單: bookingPlacedByMonth.get(monthKey) || 0,
      住宿: bookingCountByMonth.get(monthKey) || 0,
      營收: Math.round(revenueByMonth.get(monthKey) || 0),
      baseline: 0,
      isFuture,
    });
  }

  // Baseline: prefer last full year average of 接單; fallback to last 3 months (with data) average
  let baselineSource: 'lastYear' | 'recent3Months' | 'none' = 'none';
  let baseline = 0;
  const lastYearKeys: string[] = [];
  for (let m = 0; m < 12; m++) {
    lastYearKeys.push(format(new Date(trendsYear - 1, m, 1), 'yyyy-MM'));
  }
  const lastYearValues = lastYearKeys.map(k => bookingPlacedByMonth.get(k) || 0);
  const lastYearTotal = lastYearValues.reduce((a, b) => a + b, 0);
  if (lastYearTotal > 0) {
    baseline = lastYearTotal / 12;
    baselineSource = 'lastYear';
  } else {
    // Fallback: average of last 3 completed months with data (relative to "now")
    const recentMonthKeys: string[] = [];
    for (let i = 1; i <= 3; i++) {
      recentMonthKeys.push(format(subMonths(now, i), 'yyyy-MM'));
    }
    const recentValues = recentMonthKeys
      .map(k => bookingPlacedByMonth.get(k) || 0)
      .filter(v => v > 0);
    if (recentValues.length > 0) {
      baseline = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
      baselineSource = 'recent3Months';
    }
  }
  const bookingTrendsData = bookingTrendsRaw.map(p => ({
    ...p,
    baseline: Math.round(baseline * 10) / 10,
  }));

  const finalStats = {
    totalRooms: DAILY_ROOM_CAP,
    monthlyBookings: Number.isFinite(monthlyBookingCount) ? monthlyBookingCount : 0,
    totalGuests: Number.isFinite(monthlyGuestCount) ? monthlyGuestCount : 0,
    monthlyRevenue: Number.isFinite(monthlyRev) ? monthlyRev : 0,
    bookingsChange: `${Number(safeBookingChange) >= 0 ? '+' : ''}${safeBookingChange}%`,
    guestsChange: `${Number(safeGuestChange) >= 0 ? '+' : ''}${safeGuestChange}%`,
    revenueChange: `${Number(safeRevChange) >= 0 ? '+' : ''}${safeRevChange}%`,
  };

  return {
    stats: finalStats,
    revenueData,
    bookingData,
    bookingTrendsData,
    bookingTrendsBaselineSource: baselineSource,
    occupancyData,
    monthlyOccupancyRate,
    monthlyAveragePrice,
  };
};

export const useDashboardData = (
  accommodationId: string | null,
  comparisonMode: 'lastYear' | 'lastMonth',
  customDateRange?: { from: Date; to: Date },
  selectedYear?: number
) => {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['dashboard', accommodationId, comparisonMode, customDateRange, selectedYear],
    queryFn: () => fetchDashboardData(accommodationId!, comparisonMode, customDateRange, selectedYear),
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  
  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', accommodationId] });
  };
  
  return {
    ...query,
    refreshData,
  };
};
