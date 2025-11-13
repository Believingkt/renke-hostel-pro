import { Hotel, Users, Calendar, DollarSign } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Link } from "react-router-dom";

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
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { accommodationId } = useSubdomain();
  const [loading, setLoading] = useState(true);
  
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

  useEffect(() => {
    const getCachedSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email || null);
      }
    };
    getCachedSession();
  }, []);

  useEffect(() => {
    if (!accommodationId) return;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
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
          
          // 生成過去12個月的圖表數據
          const monthlyData = [];
          for (let i = 11; i >= 0; i--) {
            const monthDate = subMonths(now, i);
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);
            const monthLabel = format(monthDate, 'M月');
            
            const monthOrders = ordersData.filter(o => {
              const orderDate = new Date(o.order_date);
              return orderDate >= monthStart && orderDate <= monthEnd;
            });
            
            const revenue = monthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
            const bookingCount = monthOrders.length;
            
            monthlyData.push({
              month: monthLabel,
              revenue: revenue,
              bookings: bookingCount,
            });
          }
          
          setRevenueData(monthlyData.map(m => ({ month: m.month, "營收": m.revenue })));
          setBookingData(monthlyData.map(m => ({ month: m.month, "訂房數": m.bookings })));
          
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
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accommodationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="px-2 md:px-0">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">營運分析</h1>
      </div>

      {userId && (
        <Alert className="mx-2 md:mx-0">
          <Info className="h-4 w-4" />
          <AlertTitle>您的用戶資訊</AlertTitle>
          <AlertDescription className="mt-2 space-y-1">
            <p className="text-sm"><strong>Email:</strong> {userEmail}</p>
            <p className="text-sm font-mono break-all"><strong>User ID:</strong> {userId}</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4 px-2 md:px-0">
        <StatCard
          title="總房間數"
          value={totalRooms.toString()}
          change="+0%"
          icon={Hotel}
          variant="coral"
        />
        <StatCard
          title="本月訂房"
          value={monthlyBookings.toString()}
          change={bookingsChange}
          icon={Calendar}
          variant="green"
        />
        <StatCard
          title="住客人數"
          value={totalGuests.toString()}
          change={guestsChange}
          icon={Users}
          variant="blue"
        />
        <StatCard
          title="本月營收"
          value={`$${(monthlyRevenue / 1000).toFixed(1)}k`}
          change={revenueChange}
          icon={DollarSign}
          variant="purple"
        />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2 px-2 md:px-0">
        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">營收統計</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            <ResponsiveContainer width="100%" height={250} className="md:h-[300px]">
              <BarChart data={revenueData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '12px' }}
                  labelStyle={{ fontSize: '12px' }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                  iconSize={12}
                />
                <Bar dataKey="營收" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">訂房趨勢</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            <ResponsiveContainer width="100%" height={250} className="md:h-[300px]">
              <LineChart data={bookingData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                  width={40}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '12px' }}
                  labelStyle={{ fontSize: '12px' }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                  iconSize={12}
                />
                <Line 
                  type="monotone" 
                  dataKey="訂房數" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-3))", r: 4 }}
                  className="md:stroke-[3]"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="px-2 md:px-0">
        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">房型入住率（近30天）</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            <ResponsiveContainer width="100%" height={250} className="md:h-[300px]">
              <BarChart data={occupancyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="roomType" 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                />
                <YAxis 
                  tick={{ fontSize: 11 }}
                  className="md:text-xs"
                  width={40}
                  domain={[0, 100]}
                  label={{ value: '%', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={{ fontSize: '12px' }}
                  labelStyle={{ fontSize: '12px' }}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                  iconSize={12}
                />
                <Bar dataKey="入住率" fill="hsl(var(--chart-2))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
