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

interface MonthlyBookingData {
  month: string;
  bookings: number;
}

export interface OrderStatusData {
  status: string;
  count: number;
  label: string;
}

interface DashboardData {
  stats: DashboardStats;
  revenueData: ChartData[];
  bookingData: ChartData[];
  occupancyData: OccupancyData[];
  monthlyBookings: MonthlyBookingData[];
  orderStatusDistribution: OrderStatusData[];
}

const fetchDashboardData = async (
  accommodationId: string,
  comparisonMode: 'lastYear' | 'lastMonth',
  customDateRange?: { from: Date; to: Date }
): Promise<DashboardData> => {
  const now = new Date();
  const currentYear = now.getFullYear();
  
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
  
  console.log('Dashboard revenue check:', { monthlyRev, lastMonthRev, currentMonthOrdersCount: currentMonthOrders.length });
  
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
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    
    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(currentYear, month, 1);
      const monthKey = format(monthDate, 'yyyy-MM');
      const lastYearMonthKey = format(new Date(currentYear - 1, month, 1), 'yyyy-MM');
      const monthLabel = format(monthDate, 'MM月');
      const isFuture = month > currentMonth; // 標記未來月份
      
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
  
  // 只計算今年的數據（1-12月）
  for (let month = 0; month < 12; month++) {
    const monthDate = new Date(currentYear, month, 1);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthLabel = format(monthDate, 'MM月');
    const daysInMonth = monthEnd.getDate();
    const isFutureMonth = monthDate > now;
    
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
      
      // 計算入住率：總住宿天數 / (房間數 × 該月天數)
      const maxPossibleNights = roomCount * daysInMonth;
      const occupancyRate = maxPossibleNights > 0 
        ? Math.round((totalNights / maxPossibleNights) * 100)
        : 0;
      
      // 未來月份設為 null 或 0
      monthDataPoint[roomType.name] = isFutureMonth ? 0 : Math.min(100, occupancyRate);
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
  
  console.log('Dashboard final stats:', finalStats);
  console.log('Revenue data sample:', revenueData.slice(0, 3));
  console.log('Occupancy data:', occupancyData);

  // Calculate monthly bookings for the current year
  const monthlyBookings: MonthlyBookingData[] = Array.from({ length: 12 }, (_, i) => {
    const monthDate = new Date(currentYear, i, 1);
    const monthName = format(monthDate, 'M月');
    const monthStr = format(monthDate, 'yyyy-MM');
    
    const bookingsInMonth = ordersData.filter(order => {
      const checkInMonth = format(new Date(order.check_in_date), 'yyyy-MM');
      return checkInMonth === monthStr;
    }).length;

    return {
      month: monthName,
      bookings: bookingsInMonth,
    };
  });

  // Calculate order status distribution
  const statusOrder = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
  const statusMap = new Map<string, number>();
  
  statusOrder.forEach(status => {
    statusMap.set(status, 0);
  });

  ordersData.forEach(order => {
    const currentCount = statusMap.get(order.order_status) || 0;
    statusMap.set(order.order_status, currentCount + 1);
  });

  const orderStatusDistribution: OrderStatusData[] = statusOrder.map(status => ({
    status,
    count: statusMap.get(status) || 0,
    label: getOrderStatusLabel(status)
  }));
  
  return {
    stats: finalStats,
    revenueData,
    bookingData,
    occupancyData,
    monthlyBookings,
    orderStatusDistribution,
  };
};

export const useDashboardData = (
  accommodationId: string | null,
  comparisonMode: 'lastYear' | 'lastMonth',
  customDateRange?: { from: Date; to: Date }
) => {
  const queryClient = useQueryClient();
  
  const query = useQuery({
    queryKey: ['dashboard', accommodationId, comparisonMode, customDateRange],
    queryFn: () => fetchDashboardData(accommodationId!, comparisonMode, customDateRange),
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
