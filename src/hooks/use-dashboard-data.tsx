import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { getOrderStatusLabel } from "@/utils/orderHelpers";

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

interface OccupancyData {
  month: string;
  [roomTypeName: string]: number | string; // 动态的房型名称作为key
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
  const now = new Date();
  const currentYear = selectedYear || now.getFullYear();
  
  // 如果有自定義日期範圍，使用它；否則根據比較模式決定範圍
  let startDate: Date;
  let endDate: Date;
  
  if (customDateRange?.from && customDateRange?.to) {
    startDate = customDateRange.from;
    endDate = customDateRange.to;
  } else if (comparisonMode === 'lastYear') {
    // 與去年對比：查詢去年和今年的完整年度數據
    startDate = new Date(currentYear - 1, 0, 1); // 去年1月1日
    endDate = new Date(currentYear, 11, 31, 23, 59, 59); // 今年12月31日
  } else {
    // 與上月對比：最近 13 個月
    startDate = subMonths(now, 13);
    endDate = now;
  }
  
  // 平行查詢房型和訂單資料
  const [roomTypesResult, ordersResult] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, room_count")
      .eq("accommodation_id", accommodationId),
    supabase
      .from("orders")
      .select("*, room_types(name)")
      .eq("accommodation_id", accommodationId)
      .gte("order_date", startDate.toISOString())
      .lte("order_date", endDate.toISOString())
      .order("order_date", { ascending: false })
  ]);
  
  if (roomTypesResult.error) throw roomTypesResult.error;
  if (ordersResult.error) throw ordersResult.error;
  
  const roomTypesData = roomTypesResult.data || [];
  const ordersData = ordersResult.data || [];
  
  // 營收只計算實際入住的訂單（checked_in 或 checked_out）
  const isRevenueEligible = (status: string) => status === 'checked_in' || status === 'checked_out';
  
  const totalRoomCount = roomTypesData.reduce((sum, rt) => sum + (rt.room_count || 0), 0);
  
  // 預先按月份分組資料
  const ordersByMonth = new Map<string, typeof ordersData>();
  ordersData.forEach(order => {
    const orderDate = new Date(order.order_date);
    const monthKey = format(orderDate, 'yyyy-MM');
    if (!ordersByMonth.has(monthKey)) {
      ordersByMonth.set(monthKey, []);
    }
    ordersByMonth.get(monthKey)!.push(order);
  });
  
  // 本月和上月統計
  const currentMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  
  const currentMonthKey = format(currentMonthStart, 'yyyy-MM');
  const lastMonthKey = format(lastMonthStart, 'yyyy-MM');
  
  const currentMonthOrders = ordersByMonth.get(currentMonthKey) || [];
  const lastMonthOrders = ordersByMonth.get(lastMonthKey) || [];
  
  const monthlyBookingCount = currentMonthOrders.length;
  const lastMonthBookingCount = lastMonthOrders.length;
  const monthlyGuestCount = currentMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
  const lastMonthGuestCount = lastMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
  // Validate and sum revenues, filtering out invalid values
  const monthlyRev = currentMonthOrders.reduce((sum, o) => {
    const price = Number(o.final_price);
    return sum + (Number.isFinite(price) ? price : 0);
  }, 0);
  const lastMonthRev = lastMonthOrders.reduce((sum, o) => {
    const price = Number(o.final_price);
    return sum + (Number.isFinite(price) ? price : 0);
  }, 0);
  
  // 計算變化百分比
  const bookingChange = lastMonthBookingCount > 0 
    ? ((monthlyBookingCount - lastMonthBookingCount) / lastMonthBookingCount * 100).toFixed(1)
    : "0";
  const guestChange = lastMonthGuestCount > 0
    ? ((monthlyGuestCount - lastMonthGuestCount) / lastMonthGuestCount * 100).toFixed(1)
    : "0";
  const revChange = lastMonthRev > 0
    ? ((monthlyRev - lastMonthRev) / lastMonthRev * 100).toFixed(1)
    : "0";
    
  // Ensure all numeric values are valid
  const safeBookingChange = Number.isFinite(Number(bookingChange)) ? bookingChange : "0";
  const safeGuestChange = Number.isFinite(Number(guestChange)) ? guestChange : "0";
  const safeRevChange = Number.isFinite(Number(revChange)) ? revChange : "0";
  
  // 根據是否有自定義日期範圍來決定如何生成圖表數據
  let monthlyData: ChartData[] = [];
  
  if (customDateRange?.from && customDateRange?.to) {
    // 自定義日期範圍：只顯示該範圍內的數據
    const rangeStartKey = format(customDateRange.from, 'yyyy-MM');
    const rangeEndKey = format(customDateRange.to, 'yyyy-MM');
    
    // 獲取該範圍內的所有月份
    let currentDate = new Date(customDateRange.from);
    const endDate = new Date(customDateRange.to);
    
    while (currentDate <= endDate) {
      const monthKey = format(currentDate, 'yyyy-MM');
      const monthLabel = format(currentDate, 'yyyy/MM');
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const revenue = monthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: monthOrders.length,
        lastYearRevenue: 0,
        lastYearBookings: 0,
      });
      
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    }
  } else if (comparisonMode === 'lastYear') {
    // 與去年對比：生成當年1-12月的完整數據
    const dataYear = selectedYear || now.getFullYear();
    const currentMonth = dataYear === now.getFullYear() ? now.getMonth() : 11; // 0-11, show all months for past years
    
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(dataYear, month, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const lastYearMonthKey = format(new Date(dataYear - 1, month, 1), 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      const isFuture = dataYear === now.getFullYear() && month > now.getMonth();
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const lastYearOrders = ordersByMonth.get(lastYearMonthKey) || [];
      
      const revenue = monthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const lastYearRevenue = lastYearOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: monthOrders.length,
        lastYearRevenue: Number.isFinite(lastYearRevenue) ? lastYearRevenue : 0,
        lastYearBookings: lastYearOrders.length,
        isFuture,
      });
    }
  } else {
    // 與上月對比：生成過去12個月的圖表數據
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthKey = format(monthDate, 'yyyy-MM');
      const lastYearMonthKey = format(subMonths(monthDate, 12), 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const lastYearOrders = ordersByMonth.get(lastYearMonthKey) || [];
      
      const revenue = monthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const lastYearRevenue = lastYearOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      
      monthlyData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: monthOrders.length,
        lastYearRevenue: Number.isFinite(lastYearRevenue) ? lastYearRevenue : 0,
        lastYearBookings: lastYearOrders.length,
      });
    }
  }
  
  // 上月對比數據
  const lastMonthData: ChartData[] = [];
  
  if (customDateRange?.from && customDateRange?.to) {
    // 自定義日期範圍：與前一個相同長度的時段對比
    const rangeLength = Math.ceil((customDateRange.to.getTime() - customDateRange.from.getTime()) / (1000 * 60 * 60 * 24));
    const prevRangeStart = new Date(customDateRange.from);
    prevRangeStart.setDate(prevRangeStart.getDate() - rangeLength);
    const prevRangeEnd = new Date(customDateRange.from);
    prevRangeEnd.setDate(prevRangeEnd.getDate() - 1);
    
    let currentDate = new Date(customDateRange.from);
    const endDate = new Date(customDateRange.to);
    
    while (currentDate <= endDate) {
      const monthKey = format(currentDate, 'yyyy-MM');
      const prevDate = new Date(currentDate);
      prevDate.setMonth(prevDate.getMonth() - 1);
      const prevMonthKey = format(prevDate, 'yyyy-MM');
      const monthLabel = format(currentDate, 'yyyy/MM');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const prevMonthOrders = ordersByMonth.get(prevMonthKey) || [];
      
      const revenue = monthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const prevRevenue = prevMonthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      
      lastMonthData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: monthOrders.length,
        prevRevenue: Number.isFinite(prevRevenue) ? prevRevenue : 0,
        prevBookings: prevMonthOrders.length,
      });
      
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    }
  } else {
    // 預設：過去12個月的上月對比
    for (let i = 11; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const prevMonthDate = subMonths(monthDate, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const prevMonthKey = format(prevMonthDate, 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      
      const monthOrders = ordersByMonth.get(monthKey) || [];
      const prevMonthOrders = ordersByMonth.get(prevMonthKey) || [];
      
      const revenue = monthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      const prevRevenue = prevMonthOrders.reduce((sum, o) => {
        const price = Number(o.final_price);
        return sum + (Number.isFinite(price) ? price : 0);
      }, 0);
      
      lastMonthData.push({
        month: monthLabel,
        revenue: Number.isFinite(revenue) ? revenue : 0,
        bookings: monthOrders.length,
        prevRevenue: Number.isFinite(prevRevenue) ? prevRevenue : 0,
        prevBookings: prevMonthOrders.length,
      });
    }
  }
  
  // 根據對比模式設置數據，並確保至少有一個數據點
  let revenueData: ChartData[];
  let bookingData: ChartData[];
  
  if (customDateRange?.from && customDateRange?.to) {
    // 自定義範圍：簡化顯示，只顯示該範圍數據
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
  
  // 確保數據不為空，至少有一個數據點
  if (revenueData.length === 0) {
    revenueData = [{ month: format(now, 'M月'), "本期": 0 }];
  }
  if (bookingData.length === 0) {
    bookingData = [{ month: format(now, 'M月'), "本期": 0 }];
  }
  
  // 計算房型入住率（今年每個月）
  const occupancyData: OccupancyData[] = [];
  
  // 計算整體住房率和平均房價
  const monthlyOccupancyRate: MonthlyMetrics[] = [];
  const monthlyAveragePrice: MonthlyMetrics[] = [];
  
  // 只計算今年的數據（1-12月）
  const dataYear = selectedYear || now.getFullYear();
  for (let month = 0; month < 12; month++) {
    const monthDate = new Date(dataYear, month, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthLabel = format(monthDate, 'MM月');
    const daysInMonth = monthEnd.getDate();
    const isFutureMonth = dataYear === now.getFullYear() && monthDate > now;
    
    // 去年同期日期
    const lastYearMonthDate = new Date(dataYear - 1, month, 1);
    const lastYearMonthStart = startOfMonth(lastYearMonthDate);
    const lastYearMonthEnd = endOfMonth(lastYearMonthDate);
    
    const monthDataPoint: OccupancyData = {
      month: monthLabel,
    };
    
    // 獲取該月的訂單
    const monthOrders = ordersData.filter(o => {
      if (!o.check_in_date || !o.check_out_date) return false;
      const checkIn = new Date(o.check_in_date);
      const checkOut = new Date(o.check_out_date);
      // 訂單與該月有重疊
      return checkOut > monthStart && checkIn <= monthEnd;
    });
    
    // 計算整體住房率
    let totalNightsAllRooms = 0;
    let totalAvailableNights = 0;
    
    // 去年同期住房率
    let lastYearTotalNights = 0;
    let lastYearTotalAvailable = 0;
    
    // 獲取去年同期的訂單
    const lastYearMonthOrders = ordersData.filter(o => {
      if (!o.check_in_date || !o.check_out_date) return false;
      const checkIn = new Date(o.check_in_date);
      const checkOut = new Date(o.check_out_date);
      // 訂單與去年該月有重疊
      return checkOut > lastYearMonthStart && checkIn <= lastYearMonthEnd;
    });
    
    // 為每個房型計算入住率
    roomTypesData.forEach(roomType => {
      const roomCount = roomType.room_count || 1;
      
      // 計算該房型在該月的總住宿天數
      const roomOrders = monthOrders.filter(o => o.room_type_id === roomType.id);
      let totalNights = 0;
      
      roomOrders.forEach(order => {
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        
        // 計算與該月重疊的天數
        const overlapStart = checkIn < monthStart ? monthStart : checkIn;
        const overlapEnd = checkOut > monthEnd ? monthEnd : checkOut;
        const nights = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (nights > 0 && Number.isFinite(nights)) {
          totalNights += nights;
        }
      });
      
      // 計算去年同期該房型的總住宿天數
      const lastYearRoomOrders = lastYearMonthOrders.filter(o => o.room_type_id === roomType.id);
      let lastYearNights = 0;
      
      lastYearRoomOrders.forEach(order => {
        const checkIn = new Date(order.check_in_date);
        const checkOut = new Date(order.check_out_date);
        
        const overlapStart = checkIn < lastYearMonthStart ? lastYearMonthStart : checkIn;
        const overlapEnd = checkOut > lastYearMonthEnd ? lastYearMonthEnd : checkOut;
        const nights = Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
        
        if (nights > 0 && Number.isFinite(nights)) {
          lastYearNights += nights;
        }
      });
      
      // 計算入住率：總住宿天數 / (房間數 × 該月天數)
      const maxPossibleNights = roomCount * daysInMonth;
      const occupancyRate = maxPossibleNights > 0 
        ? Math.round((totalNights / maxPossibleNights) * 100)
        : 0;
      
      // 累加整體數據
      totalNightsAllRooms += totalNights;
      totalAvailableNights += maxPossibleNights;
      lastYearTotalNights += lastYearNights;
      lastYearTotalAvailable += maxPossibleNights;
      
      // 未來月份設為 null 或 0
      monthDataPoint[roomType.name] = isFutureMonth ? 0 : Math.min(100, occupancyRate);
    });
    
    // 計算整體住房率
    const overallOccupancyRate = totalAvailableNights > 0
      ? Math.round((totalNightsAllRooms / totalAvailableNights) * 100)
      : 0;
    
    // 計算去年同期整體住房率
    const lastYearOverallOccupancyRate = lastYearTotalAvailable > 0
      ? Math.round((lastYearTotalNights / lastYearTotalAvailable) * 100)
      : 0;
    
    monthlyOccupancyRate.push({
      month: monthLabel,
      occupancyRate: isFutureMonth ? 0 : Math.min(100, overallOccupancyRate),
      lastYearOccupancyRate: Math.min(100, lastYearOverallOccupancyRate),
      averagePrice: 0,
      isFuture: isFutureMonth,
    });
    
    // 計算平均房價（訂單總金額 / 總訂單數）
    const monthKey = format(monthDate, 'yyyy-MM');
    const monthOrdersForPrice = ordersByMonth.get(monthKey) || [];
    const totalRevenue = monthOrdersForPrice.reduce((sum, o) => {
      const price = Number(o.final_price);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);
    const orderCount = monthOrdersForPrice.length;
    const averagePrice = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;
    
    // 計算去年同期平均房價
    const lastYearMonthKey = format(lastYearMonthDate, 'yyyy-MM');
    const lastYearMonthOrdersForPrice = ordersByMonth.get(lastYearMonthKey) || [];
    const lastYearTotalRevenue = lastYearMonthOrdersForPrice.reduce((sum, o) => {
      const price = Number(o.final_price);
      return sum + (Number.isFinite(price) ? price : 0);
    }, 0);
    const lastYearOrderCount = lastYearMonthOrdersForPrice.length;
    const lastYearAveragePrice = lastYearOrderCount > 0 ? Math.round(lastYearTotalRevenue / lastYearOrderCount) : 0;
    
    monthlyAveragePrice.push({
      month: monthLabel,
      occupancyRate: 0,
      averagePrice: isFutureMonth ? 0 : averagePrice,
      lastYearAveragePrice: lastYearAveragePrice,
      isFuture: isFutureMonth,
    });
    
    occupancyData.push(monthDataPoint);
  }
  
  const finalStats = {
    totalRooms: Number.isFinite(totalRoomCount) ? totalRoomCount : 0,
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
    staleTime: 5 * 60 * 1000, // 資料在 5 分鐘內視為新鮮
    gcTime: 10 * 60 * 1000, // 快取保留 10 分鐘
    refetchOnWindowFocus: true, // 視窗獲得焦點時重新取得資料
  });
  
  // 提供手動刷新方法
  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', accommodationId] });
  };
  
  return {
    ...query,
    refreshData,
  };
};
