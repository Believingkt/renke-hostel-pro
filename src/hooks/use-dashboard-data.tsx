import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

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
}

interface OccupancyData {
  roomType: string;
  occupancyRate: number;
}

interface DashboardData {
  stats: DashboardStats;
  revenueData: ChartData[];
  bookingData: ChartData[];
  occupancyData: OccupancyData[];
}

const fetchDashboardData = async (
  accommodationId: string,
  comparisonMode: 'lastYear' | 'lastMonth',
  customDateRange?: { from: Date; to: Date }
): Promise<DashboardData> => {
  const now = new Date();
  
  // 如果有自定義日期範圍，使用它；否則使用預設的最近 13 個月
  let startDate: Date;
  let endDate: Date;
  
  if (customDateRange?.from && customDateRange?.to) {
    startDate = customDateRange.from;
    endDate = customDateRange.to;
  } else {
    // 計算查詢範圍：最近 13 個月（包含去年同期數據）
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
  const monthlyRev = currentMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
  const lastMonthRev = lastMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
  
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
  
  // 生成過去12個月的圖表數據
  const monthlyData: ChartData[] = [];
  
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const monthKey = format(monthDate, 'yyyy-MM');
    const lastYearMonthKey = format(subMonths(monthDate, 12), 'yyyy-MM');
    const monthLabel = format(monthDate, 'M月');
    
    const monthOrders = ordersByMonth.get(monthKey) || [];
    const lastYearOrders = ordersByMonth.get(lastYearMonthKey) || [];
    
    const revenue = monthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
    const lastYearRevenue = lastYearOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
    
    monthlyData.push({
      month: monthLabel,
      revenue: revenue,
      bookings: monthOrders.length,
      lastYearRevenue: lastYearRevenue,
      lastYearBookings: lastYearOrders.length,
    });
  }
  
  // 上月對比數據
  const lastMonthData: ChartData[] = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(now, i);
    const prevMonthDate = subMonths(monthDate, 1);
    const monthKey = format(monthDate, 'yyyy-MM');
    const prevMonthKey = format(prevMonthDate, 'yyyy-MM');
    const monthLabel = format(monthDate, 'M月');
    
    const monthOrders = ordersByMonth.get(monthKey) || [];
    const prevMonthOrders = ordersByMonth.get(prevMonthKey) || [];
    
    const revenue = monthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
    const prevRevenue = prevMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
    
    lastMonthData.push({
      month: monthLabel,
      revenue: revenue,
      bookings: monthOrders.length,
      prevRevenue: prevRevenue,
      prevBookings: prevMonthOrders.length,
    });
  }
  
  // 根據對比模式設置數據
  let revenueData: ChartData[];
  let bookingData: ChartData[];
  
  if (comparisonMode === 'lastYear') {
    revenueData = monthlyData.map(m => ({ 
      month: m.month, 
      "今年": m.revenue,
      "去年": m.lastYearRevenue
    }));
    bookingData = monthlyData.map(m => ({ 
      month: m.month, 
      "今年": m.bookings,
      "去年": m.lastYearBookings
    }));
  } else {
    revenueData = lastMonthData.map(m => ({ 
      month: m.month, 
      "本月": m.revenue,
      "上月": m.prevRevenue
    }));
    bookingData = lastMonthData.map(m => ({ 
      month: m.month, 
      "本月": m.bookings,
      "上月": m.prevBookings
    }));
  }
  
  // 計算房型入住率（過去30天）
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentOrders = ordersData.filter(o => {
    const orderDate = new Date(o.order_date);
    return orderDate >= thirtyDaysAgo;
  });
  
  // 按房型分組計算入住率
  const occupancyByRoomType: { [key: string]: { totalNights: number, roomCount: number, roomTypeName: string } } = {};
  
  recentOrders.forEach(order => {
    const checkIn = new Date(order.check_in_date);
    const checkOut = new Date(order.check_out_date);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    
    if (order.room_type_id) {
      if (!occupancyByRoomType[order.room_type_id]) {
        const roomType = roomTypesData.find(rt => rt.id === order.room_type_id);
        occupancyByRoomType[order.room_type_id] = {
          totalNights: 0,
          roomCount: roomType?.room_count || 1,
          roomTypeName: roomType?.name || '未知房型'
        };
      }
      occupancyByRoomType[order.room_type_id].totalNights += nights;
    }
  });
  
  const occupancyData: OccupancyData[] = Object.values(occupancyByRoomType).map(data => ({
    roomType: data.roomTypeName,
    occupancyRate: Math.min(100, Math.round((data.totalNights / (data.roomCount * 30)) * 100))
  }));
  
  return {
    stats: {
      totalRooms: totalRoomCount,
      monthlyBookings: monthlyBookingCount,
      totalGuests: monthlyGuestCount,
      monthlyRevenue: monthlyRev,
      bookingsChange: `${Number(bookingChange) >= 0 ? '+' : ''}${bookingChange}%`,
      guestsChange: `${Number(guestChange) >= 0 ? '+' : ''}${guestChange}%`,
      revenueChange: `${Number(revChange) >= 0 ? '+' : ''}${revChange}%`,
    },
    revenueData,
    bookingData,
    occupancyData,
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
