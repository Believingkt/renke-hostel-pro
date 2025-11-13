import { Hotel, Users, Calendar, DollarSign, Radio } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Link } from "react-router-dom";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const revenueData = [
  { month: "1月", "2025年": 45000, "2024年": 38000 },
  { month: "2月", "2025年": 52000, "2024年": 43000 },
  { month: "3月", "2025年": 48000, "2024年": 41000 },
  { month: "4月", "2025年": 61000, "2024年": 52000 },
  { month: "5月", "2025年": 55000, "2024年": 47000 },
  { month: "6月", "2025年": 67000, "2024年": 58000 },
  { month: "7月", "2025年": 59000, "2024年": 51000 },
  { month: "8月", "2025年": 64000, "2024年": 55000 },
  { month: "9月", "2025年": 57000, "2024年": 49000 },
  { month: "10月", "2025年": 62000, "2024年": 53000 },
  { month: "11月", "2025年": 58000, "2024年": 50000 },
  { month: "12月", "2025年": 70000, "2024年": 60000 },
];

const bookingData = [
  { month: "1月", "2025年": 145, "2024年": 130 },
  { month: "2月", "2025年": 168, "2024年": 155 },
  { month: "3月", "2025年": 152, "2024年": 140 },
  { month: "4月", "2025年": 189, "2024年": 172 },
  { month: "5月", "2025年": 176, "2024年": 165 },
  { month: "6月", "2025年": 203, "2024年": 188 },
  { month: "7月", "2025年": 195, "2024年": 180 },
  { month: "8月", "2025年": 210, "2024年": 195 },
  { month: "9月", "2025年": 182, "2024年": 170 },
  { month: "10月", "2025年": 198, "2024年": 185 },
  { month: "11月", "2025年": 187, "2024年": 175 },
  { month: "12月", "2025年": 220, "2024年": 200 },
];

const Dashboard = () => {
  const { accommodationId } = useSubdomain();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [comparisonMode, setComparisonMode] = useState<'lastYear' | 'lastMonth'>('lastYear');
  
  // 統計數據
  const [totalRooms, setTotalRooms] = useState(0);
  const [monthlyBookings, setMonthlyBookings] = useState(0);
  const [totalGuests, setTotalGuests] = useState(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState(0);
  const [bookingsChange, setBookingsChange] = useState("+0%");
  const [guestsChange, setGuestsChange] = useState("+0%");
  const [revenueChange, setRevenueChange] = useState("+0%");
  
  // 圖表數據
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [bookingData, setBookingData] = useState<any[]>([]);
  const [occupancyData, setOccupancyData] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
        
      // 獲取房型總數
      const { data: roomTypesData } = await supabase
          .from("room_types")
          .select("id, name, room_count")
          .eq("accommodation_id", accommodationId);
        
        const totalRoomCount = roomTypesData?.reduce((sum, rt) => sum + (rt.room_count || 0), 0) || 0;
        setTotalRooms(totalRoomCount);
        
        // 獲取所有訂單
        const { data: ordersData } = await supabase
          .from("orders")
          .select(`
            *,
            room_types (
              name
            )
          `)
          .eq("accommodation_id", accommodationId)
          .order("order_date", { ascending: false });
        
        if (ordersData) {
          const now = new Date();
          const currentMonthStart = startOfMonth(now);
          const currentMonthEnd = endOfMonth(now);
          const lastMonthStart = startOfMonth(subMonths(now, 1));
          const lastMonthEnd = endOfMonth(subMonths(now, 1));
          
          // 本月訂單
          const currentMonthOrders = ordersData.filter(o => {
            const orderDate = new Date(o.order_date);
            return orderDate >= currentMonthStart && orderDate <= currentMonthEnd;
          });
          
          // 上月訂單
          const lastMonthOrders = ordersData.filter(o => {
            const orderDate = new Date(o.order_date);
            return orderDate >= lastMonthStart && orderDate <= lastMonthEnd;
          });
          
          // 計算統計
          const monthlyBookingCount = currentMonthOrders.length;
          const lastMonthBookingCount = lastMonthOrders.length;
          const monthlyGuestCount = currentMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
          const lastMonthGuestCount = lastMonthOrders.reduce((sum, o) => sum + (o.guest_count || 0), 0);
          const monthlyRev = currentMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
          const lastMonthRev = lastMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
          
          setMonthlyBookings(monthlyBookingCount);
          setTotalGuests(monthlyGuestCount);
          setMonthlyRevenue(monthlyRev);
          
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
          
          setBookingsChange(`${Number(bookingChange) >= 0 ? '+' : ''}${bookingChange}%`);
          setGuestsChange(`${Number(guestChange) >= 0 ? '+' : ''}${guestChange}%`);
          setRevenueChange(`${Number(revChange) >= 0 ? '+' : ''}${revChange}%`);
          
          // 生成過去12個月的圖表數據（今年）
          const monthlyData = [];
          const lastYearData = [];
          
          for (let i = 11; i >= 0; i--) {
            const monthDate = subMonths(now, i);
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);
            const monthLabel = format(monthDate, 'M月');
            
            // 今年數據
            const monthOrders = ordersData.filter(o => {
              const orderDate = new Date(o.order_date);
              return orderDate >= monthStart && orderDate <= monthEnd;
            });
            
            const revenue = monthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
            const bookingCount = monthOrders.length;
            
            // 去年同期數據
            const lastYearMonthStart = subMonths(monthStart, 12);
            const lastYearMonthEnd = subMonths(monthEnd, 12);
            const lastYearOrders = ordersData.filter(o => {
              const orderDate = new Date(o.order_date);
              return orderDate >= lastYearMonthStart && orderDate <= lastYearMonthEnd;
            });
            
            const lastYearRevenue = lastYearOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
            const lastYearBookingCount = lastYearOrders.length;
            
            monthlyData.push({
              month: monthLabel,
              revenue: revenue,
              bookings: bookingCount,
              lastYearRevenue: lastYearRevenue,
              lastYearBookings: lastYearBookingCount,
            });
          }
          
          // 上月對比數據
          const lastMonthData = [];
          for (let i = 11; i >= 0; i--) {
            const monthDate = subMonths(now, i);
            const prevMonthDate = subMonths(monthDate, 1);
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);
            const prevMonthStart = startOfMonth(prevMonthDate);
            const prevMonthEnd = endOfMonth(prevMonthDate);
            const monthLabel = format(monthDate, 'M月');
            
            const monthOrders = ordersData.filter(o => {
              const orderDate = new Date(o.order_date);
              return orderDate >= monthStart && orderDate <= monthEnd;
            });
            
            const prevMonthOrders = ordersData.filter(o => {
              const orderDate = new Date(o.order_date);
              return orderDate >= prevMonthStart && orderDate <= prevMonthEnd;
            });
            
            const revenue = monthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
            const bookingCount = monthOrders.length;
            const prevRevenue = prevMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
            const prevBookingCount = prevMonthOrders.length;
            
            lastMonthData.push({
              month: monthLabel,
              revenue: revenue,
              bookings: bookingCount,
              prevRevenue: prevRevenue,
              prevBookings: prevBookingCount,
            });
          }
          
          // 根據對比模式設置數據
          if (comparisonMode === 'lastYear') {
            setRevenueData(monthlyData.map(m => ({ 
              month: m.month, 
              "今年": m.revenue,
              "去年": m.lastYearRevenue
            })));
            setBookingData(monthlyData.map(m => ({ 
              month: m.month, 
              "今年": m.bookings,
              "去年": m.lastYearBookings
            })));
          } else {
            setRevenueData(lastMonthData.map(m => ({ 
              month: m.month, 
              "本月": m.revenue,
              "上月": m.prevRevenue
            })));
            setBookingData(lastMonthData.map(m => ({ 
              month: m.month, 
              "本月": m.bookings,
              "上月": m.prevBookings
            })));
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
                const roomType = roomTypesData?.find(rt => rt.id === order.room_type_id);
                occupancyByRoomType[order.room_type_id] = {
                  totalNights: 0,
                  roomCount: roomType?.room_count || 0,
                  roomTypeName: order.room_types?.name || '未知房型'
                };
              }
              occupancyByRoomType[order.room_type_id].totalNights += nights;
            }
          });
          
          // 計算入住率百分比
          const occupancyArray = Object.entries(occupancyByRoomType).map(([roomTypeId, data]) => {
            const maxPossibleNights = data.roomCount * 30; // 30天
            const occupancyRate = maxPossibleNights > 0 
              ? ((data.totalNights / maxPossibleNights) * 100).toFixed(1)
              : "0";
            return {
              roomType: data.roomTypeName,
              入住率: parseFloat(occupancyRate)
            };
          }).sort((a, b) => b.入住率 - a.入住率);
          
          setOccupancyData(occupancyArray);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        setError(error instanceof Error ? error.message : "載入數據時發生錯誤");
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (!accommodationId) return;
    fetchData();

    // 設置即時訂閱
    console.log('Setting up realtime subscription for orders');
    const channel = supabase
      .channel('dashboard-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `accommodation_id=eq.${accommodationId}`
        },
        (payload) => {
          console.log('Realtime order change detected:', payload);
          setIsLiveUpdating(true);
          setLastUpdateTime(new Date());
          
          // 顯示通知
          if (payload.eventType === 'INSERT') {
            toast.success('新訂單已加入', {
              description: '儀表板數據已自動更新'
            });
          } else if (payload.eventType === 'UPDATE') {
            toast.info('訂單已更新', {
              description: '儀表板數據已自動更新'
            });
          }
          
          // 重新獲取數據
          fetchData().then(() => {
            setTimeout(() => setIsLiveUpdating(false), 1000);
          });
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [accommodationId, comparisonMode]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="無法載入儀表板"
        message={error}
        onRetry={fetchData}
      />
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="px-2 md:px-0 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">營運分析</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setComparisonMode('lastYear')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                comparisonMode === 'lastYear'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              去年同期
            </button>
            <button
              onClick={() => setComparisonMode('lastMonth')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                comparisonMode === 'lastMonth'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              上月對比
            </button>
          </div>
          <Badge 
            variant={isLiveUpdating ? "default" : "secondary"} 
            className={`transition-all ${isLiveUpdating ? 'animate-pulse' : ''}`}
          >
            <Radio className={`w-3 h-3 mr-1 ${isLiveUpdating ? 'animate-spin' : ''}`} />
            {isLiveUpdating ? '更新中...' : '即時監控'}
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            最後更新: {format(lastUpdateTime, 'HH:mm:ss')}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4 px-2 md:px-0">
        <StatCard
          title="總房間數"
          value={totalRooms.toString()}
          change="+0%"
          icon={Hotel}
          variant="coral"
          isUpdating={isLiveUpdating}
        />
        <StatCard
          title="本月訂房"
          value={monthlyBookings.toString()}
          change={bookingsChange}
          icon={Calendar}
          variant="green"
          isUpdating={isLiveUpdating}
        />
        <StatCard
          title="住客人數"
          value={totalGuests.toString()}
          change={guestsChange}
          icon={Users}
          variant="blue"
          isUpdating={isLiveUpdating}
        />
        <StatCard
          title="本月營收"
          value={`$${(monthlyRevenue / 1000).toFixed(1)}k`}
          change={revenueChange}
          icon={DollarSign}
          variant="purple"
          isUpdating={isLiveUpdating}
        />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2 px-2 md:px-0">
        <Card className={`shadow-card hover:shadow-card-hover transition-all duration-300 ${isLiveUpdating ? 'ring-2 ring-chart-1/50' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-lg lg:text-xl">營收統計</CardTitle>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs">
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2 md:px-6 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart 
                data={revenueData} 
                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickMargin={8}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={35}
                  tickMargin={5}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '12px',
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '6px 10px'
                  }}
                  labelStyle={{ fontSize: '12px', fontWeight: 600 }}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                  iconSize={8}
                />
                <Bar 
                  dataKey={comparisonMode === 'lastYear' ? '今年' : '本月'}
                  fill="hsl(var(--chart-1))" 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={0}
                  animationEasing="ease-in-out"
                />
                <Bar 
                  dataKey={comparisonMode === 'lastYear' ? '去年' : '上月'}
                  fill="hsl(var(--chart-4))" 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={100}
                  animationEasing="ease-in-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={`shadow-card hover:shadow-card-hover transition-all duration-300 ${isLiveUpdating ? 'ring-2 ring-chart-3/50' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-lg lg:text-xl">訂房趨勢</CardTitle>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs">
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-1 md:px-6 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart 
                data={bookingData} 
                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickMargin={8}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={35}
                  tickMargin={5}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '13px',
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ fontSize: '13px', fontWeight: 600 }}
                  cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconSize={10}
                />
                <Line 
                  type="monotone" 
                  dataKey={comparisonMode === 'lastYear' ? '今年' : '本月'}
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2.5}
                  dot={{ fill: "hsl(var(--chart-3))", r: 5, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                  activeDot={{ r: 7, strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={0}
                  animationEasing="ease-in-out"
                />
                <Line 
                  type="monotone" 
                  dataKey={comparisonMode === 'lastYear' ? '去年' : '上月'}
                  stroke="hsl(var(--chart-5))" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: "hsl(var(--chart-5))", r: 4, strokeWidth: 2, stroke: 'hsl(var(--background))' }}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={100}
                  animationEasing="ease-in-out"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="px-2 md:px-0">
        <Card className={`shadow-card hover:shadow-card-hover transition-all duration-300 ${isLiveUpdating ? 'ring-2 ring-chart-2/50' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base md:text-lg lg:text-xl">房型入住率（近30天）</CardTitle>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs">
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-1 md:px-6 pb-4">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart 
                data={occupancyData} 
                margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                <XAxis 
                  dataKey="roomType" 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickMargin={8}
                  angle={-15}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  tick={{ fontSize: 10 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={35}
                  tickMargin={5}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '13px',
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ fontSize: '13px', fontWeight: 600 }}
                  formatter={(value: number) => [`${value}%`, '入住率']}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.2 }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  iconSize={10}
                />
                <Bar 
                  dataKey="入住率" 
                  fill="hsl(var(--chart-2))" 
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                  isAnimationActive={true}
                  animationDuration={800}
                  animationBegin={0}
                  animationEasing="ease-in-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
