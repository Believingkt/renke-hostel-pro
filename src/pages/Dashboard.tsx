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

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  final_price: number;
  guest_count: number;
  order_date: string;
  room_types: {
    name: string;
  } | null;
}

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
  const [recentBookings, setRecentBookings] = useState<Order[]>([]);

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
          .select("room_count")
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
          
          // 近期訂房（最近10筆）
          setRecentBookings(ordersData.slice(0, 10));
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accommodationId]);

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "待確認",
      confirmed: "已確認",
      checked_in: "已入住",
      checked_out: "已退房",
      cancelled: "已取消",
    };
    return statusMap[status] || status;
  };

  const getPaymentStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      unpaid: "未付款",
      deposit_paid: "已付訂金",
      paid: "已付清",
      overdue: "已逾期",
    };
    return statusMap[status] || status;
  };

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
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Bar dataKey="營收" fill="hsl(var(--chart-1))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card hover:shadow-card-hover transition-base">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">訂房趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bookingData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="訂房數" 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={3}
                  dot={{ fill: "hsl(var(--chart-3))", r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card px-2 md:px-0 mx-2 md:mx-0">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">近期訂房</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">訂單編號</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">訂購時間</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">訂購人</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">入住日期</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">退房日期</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">付款狀態</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      暫無資料
                    </td>
                  </tr>
                ) : (
                  recentBookings.map((booking) => (
                    <tr key={booking.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm font-medium">
                        <Link 
                          to={`/admin/orders/${booking.id}`}
                          className="text-primary hover:underline"
                        >
                          {booking.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">{format(new Date(booking.order_date), 'yyyy-MM-dd HH:mm')}</td>
                      <td className="px-4 py-3 text-sm">{booking.guest_name}</td>
                      <td className="px-4 py-3 text-sm">{format(new Date(booking.check_in_date), 'yyyy-MM-dd')}</td>
                      <td className="px-4 py-3 text-sm">{format(new Date(booking.check_out_date), 'yyyy-MM-dd')}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            booking.payment_status === "paid"
                              ? "bg-stat-green-light text-stat-green"
                              : booking.payment_status === "deposit_paid"
                              ? "bg-stat-blue-light text-stat-blue"
                              : "bg-stat-coral-light text-stat-coral"
                          }`}
                        >
                          {getPaymentStatusLabel(booking.payment_status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      
    </div>
  );
};

export default Dashboard;
