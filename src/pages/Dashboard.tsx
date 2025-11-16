import { Hotel, Users, Calendar, DollarSign, Radio, Zap } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [testDataCount, setTestDataCount] = useState(20);
  
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

  const handleGenerateTestData = async () => {
    if (!accommodationId) {
      toast.error("無法取得住宿 ID");
      return;
    }

    if (testDataCount < 1 || testDataCount > 1000) {
      toast.error("請輸入 1-1000 之間的數量");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-test-orders', {
        body: {
          accommodationId,
          count: testDataCount,
        },
      });

      if (error) throw error;

      toast.success(data.message || '成功生成測試數據');
      // 重新載入數據
      fetchData();
    } catch (error) {
      console.error('Error generating test data:', error);
      toast.error('生成測試數據失敗');
    } finally {
      setIsGenerating(false);
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isGenerating}
                className="gap-2"
              >
                <Zap className={`h-4 w-4 ${isGenerating ? 'animate-pulse' : ''}`} />
                {isGenerating ? '生成中...' : '生成測試數據'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">生成測試數據</h4>
                  <p className="text-sm text-muted-foreground">
                    選擇要生成的測試訂單數量（1-1000）
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-count">訂單數量</Label>
                  <Input
                    id="test-count"
                    type="number"
                    min="1"
                    max="1000"
                    value={testDataCount}
                    onChange={(e) => setTestDataCount(Number(e.target.value))}
                    placeholder="輸入數量"
                  />
                </div>
                <Button
                  onClick={handleGenerateTestData}
                  disabled={isGenerating}
                  className="w-full gap-2"
                >
                  <Zap className="h-4 w-4" />
                  {isGenerating ? '生成中...' : `生成 ${testDataCount} 筆資料`}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
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
        <Card className={`shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden border-border/50 ${isLiveUpdating ? 'ring-2 ring-chart-1/30 shadow-chart-1/20' : ''}`}>
          <CardHeader className="pb-4 bg-gradient-to-br from-chart-1/5 to-transparent border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-lg lg:text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  營收統計
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Revenue Analysis</p>
              </div>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs shadow-sm">
                  <Radio className="w-3 h-3 mr-1" />
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-6 pt-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart 
                data={revenueData} 
                margin={{ top: 10, right: 10, left: -15, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorRevenue1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.7} />
                  </linearGradient>
                  <linearGradient id="colorRevenue2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-4))" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="hsl(var(--chart-4))" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  tickMargin={10}
                  axisLine={{ strokeWidth: 1 }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  width={40}
                  tickMargin={8}
                  axisLine={{ strokeWidth: 1 }}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '13px',
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    boxShadow: '0 8px 24px -4px hsl(var(--foreground) / 0.12)'
                  }}
                  labelStyle={{ 
                    fontSize: '13px', 
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    marginBottom: '6px'
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                  cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1, radius: 4 }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontSize: '12px', 
                    paddingTop: '16px',
                    fontWeight: 500
                  }}
                  iconSize={12}
                  iconType="circle"
                />
                <Bar 
                  dataKey={comparisonMode === 'lastYear' ? '今年' : '本月'}
                  fill="url(#colorRevenue1)" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={45}
                  isAnimationActive={true}
                  animationDuration={1000}
                  animationBegin={0}
                  animationEasing="ease-out"
                />
                <Bar 
                  dataKey={comparisonMode === 'lastYear' ? '去年' : '上月'}
                  fill="url(#colorRevenue2)" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={45}
                  isAnimationActive={true}
                  animationDuration={1000}
                  animationBegin={150}
                  animationEasing="ease-out"
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={`shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden border-border/50 ${isLiveUpdating ? 'ring-2 ring-chart-3/30 shadow-chart-3/20' : ''}`}>
          <CardHeader className="pb-4 bg-gradient-to-br from-chart-3/5 to-transparent border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-lg lg:text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  訂房趨勢
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Booking Trends</p>
              </div>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs shadow-sm">
                  <Radio className="w-3 h-3 mr-1" />
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-6 pt-4">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart 
                data={bookingData} 
                margin={{ top: 10, right: 10, left: -15, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorBooking1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="colorBooking2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-5))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--chart-5))" stopOpacity={0.02} />
                  </linearGradient>
                  <filter id="shadow1">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(var(--chart-3))" floodOpacity="0.3" />
                  </filter>
                  <filter id="shadow2">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="hsl(var(--chart-5))" floodOpacity="0.2" />
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  tickMargin={10}
                  axisLine={{ strokeWidth: 1 }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  width={40}
                  tickMargin={8}
                  axisLine={{ strokeWidth: 1 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '13px',
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    boxShadow: '0 8px 24px -4px hsl(var(--foreground) / 0.12)'
                  }}
                  labelStyle={{ 
                    fontSize: '13px', 
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    marginBottom: '6px'
                  }}
                  formatter={(value: number) => [`${value} 筆`, '']}
                  cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 2, strokeDasharray: '5 5' }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontSize: '12px', 
                    paddingTop: '16px',
                    fontWeight: 500
                  }}
                  iconSize={12}
                  iconType="circle"
                />
                <Line 
                  type="monotone" 
                  dataKey={comparisonMode === 'lastYear' ? '今年' : '本月'}
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={3}
                  dot={{ 
                    fill: "hsl(var(--chart-3))", 
                    r: 5, 
                    strokeWidth: 3, 
                    stroke: 'hsl(var(--background))',
                    filter: 'url(#shadow1)'
                  }}
                  activeDot={{ 
                    r: 8, 
                    strokeWidth: 3,
                    fill: 'hsl(var(--chart-3))',
                    stroke: 'hsl(var(--background))'
                  }}
                  isAnimationActive={true}
                  animationDuration={1200}
                  animationBegin={0}
                  animationEasing="ease-out"
                  fill="url(#colorBooking1)"
                />
                <Line 
                  type="monotone" 
                  dataKey={comparisonMode === 'lastYear' ? '去年' : '上月'}
                  stroke="hsl(var(--chart-5))" 
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={{ 
                    fill: "hsl(var(--chart-5))", 
                    r: 4, 
                    strokeWidth: 2, 
                    stroke: 'hsl(var(--background))',
                    filter: 'url(#shadow2)'
                  }}
                  activeDot={{ 
                    r: 7, 
                    strokeWidth: 2,
                    fill: 'hsl(var(--chart-5))',
                    stroke: 'hsl(var(--background))'
                  }}
                  isAnimationActive={true}
                  animationDuration={1200}
                  animationBegin={200}
                  animationEasing="ease-out"
                  fill="url(#colorBooking2)"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="px-2 md:px-0">
        <Card className={`shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden border-border/50 ${isLiveUpdating ? 'ring-2 ring-chart-2/30 shadow-chart-2/20' : ''}`}>
          <CardHeader className="pb-4 bg-gradient-to-br from-chart-2/5 to-transparent border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base md:text-lg lg:text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  房型入住率（近30天）
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Room Occupancy Rate</p>
              </div>
              {isLiveUpdating && (
                <Badge variant="secondary" className="animate-pulse text-xs shadow-sm">
                  <Radio className="w-3 h-3 mr-1" />
                  更新中
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-6 pt-4">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart 
                data={occupancyData} 
                margin={{ top: 10, right: 10, left: -15, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorOccupancy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} vertical={false} />
                <XAxis 
                  dataKey="roomType" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  tickMargin={10}
                  angle={-12}
                  textAnchor="end"
                  height={65}
                  axisLine={{ strokeWidth: 1 }}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  width={40}
                  tickMargin={8}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  axisLine={{ strokeWidth: 1 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    fontSize: '13px',
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    boxShadow: '0 8px 24px -4px hsl(var(--foreground) / 0.12)'
                  }}
                  labelStyle={{ 
                    fontSize: '13px', 
                    fontWeight: 600,
                    color: 'hsl(var(--foreground))',
                    marginBottom: '6px'
                  }}
                  formatter={(value: number) => [`${value}%`, '入住率']}
                  cursor={{ fill: 'hsl(var(--accent))', opacity: 0.1, radius: 4 }}
                />
                <Legend 
                  wrapperStyle={{ 
                    fontSize: '12px', 
                    paddingTop: '16px',
                    fontWeight: 500
                  }}
                  iconSize={12}
                  iconType="circle"
                />
                <Bar 
                  dataKey="入住率" 
                  fill="url(#colorOccupancy)" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={55}
                  isAnimationActive={true}
                  animationDuration={1000}
                  animationBegin={0}
                  animationEasing="ease-out"
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
