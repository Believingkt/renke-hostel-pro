import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HQOverviewSkeleton } from "@/components/skeletons/HQSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Calendar, 
  Users, 
  DollarSign, 
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  BarChart3,
  PieChart as PieChartIcon
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line,
  Tooltip,
  Legend
} from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";

interface AccommodationStats {
  id: string;
  name: string;
  is_active: boolean;
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  checked_in_orders: number;
  checked_out_orders: number;
  cancelled_orders: number;
  monthly_revenue: number;
  yearly_revenue: number;
  total_customers: number;
}

interface MonthlyData {
  month: string;
  revenue: number;
  orders: number;
}

interface OperationalOverviewProps {
  accommodations: { id: string; name: string; is_active?: boolean }[];
}

const COLORS = [
  'hsl(203, 78%, 43%)', 
  'hsl(19, 82%, 51%)', 
  'hsl(142, 76%, 36%)', 
  'hsl(271, 81%, 56%)',
  'hsl(189, 75%, 48%)',
  'hsl(45, 93%, 58%)',
];

const STATUS_COLORS = {
  pending: 'hsl(38, 92%, 50%)',
  confirmed: 'hsl(142, 76%, 36%)',
  checked_in: 'hsl(203, 78%, 43%)',
  checked_out: 'hsl(271, 81%, 56%)',
  cancelled: 'hsl(0, 84%, 60%)',
};

export function OperationalOverview({ accommodations }: OperationalOverviewProps) {
  const [stats, setStats] = useState<AccommodationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyData[]>([]);
  const [totals, setTotals] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    confirmedOrders: 0,
    checkedInOrders: 0,
    checkedOutOrders: 0,
    cancelledOrders: 0,
    monthlyRevenue: 0,
    yearlyRevenue: 0,
    totalCustomers: 0,
  });

  useEffect(() => {
    loadStats();
  }, [accommodations]);

  const loadStats = async () => {
    if (accommodations.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
      const yearStart = format(startOfYear(now), 'yyyy-MM-dd');
      const yearEnd = format(endOfYear(now), 'yyyy-MM-dd');

      // Get all orders for monthly trends
      const { data: allOrders, error: allOrdersError } = await supabase
        .from("orders")
        .select("accommodation_id, order_status, final_price, created_at")
        .gte("created_at", format(subMonths(now, 11), 'yyyy-MM-dd'));

      if (allOrdersError) throw allOrdersError;

      // Calculate monthly trends
      const monthlyMap = new Map<string, { revenue: number; orders: number }>();
      for (let i = 11; i >= 0; i--) {
        const date = subMonths(now, i);
        const key = format(date, 'M月');
        monthlyMap.set(key, { revenue: 0, orders: 0 });
      }

      allOrders?.forEach(order => {
        if (order.order_status !== 'cancelled' && order.created_at) {
          const orderDate = new Date(order.created_at);
          const key = format(orderDate, 'M月');
          const current = monthlyMap.get(key);
          if (current) {
            current.revenue += order.final_price || 0;
            current.orders += 1;
          }
        }
      });

      setMonthlyTrends(
        Array.from(monthlyMap.entries()).map(([month, data]) => ({
          month,
          revenue: data.revenue,
          orders: data.orders,
        }))
      );

      const statsPromises = accommodations.map(async (acc) => {
        // Get orders for this accommodation
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("order_status, final_price, created_at")
          .eq("accommodation_id", acc.id);

        if (ordersError) throw ordersError;

        // Get customers count
        const { count: customersCount, error: customersError } = await supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("accommodation_id", acc.id);

        if (customersError) throw customersError;

        const allAccOrders = orders || [];
        const pendingOrders = allAccOrders.filter(o => o.order_status === "pending").length;
        const confirmedOrders = allAccOrders.filter(o => o.order_status === "confirmed").length;
        const checkedInOrders = allAccOrders.filter(o => o.order_status === "checked_in").length;
        const checkedOutOrders = allAccOrders.filter(o => o.order_status === "checked_out").length;
        const cancelledOrders = allAccOrders.filter(o => o.order_status === "cancelled").length;

        // Calculate monthly revenue (non-cancelled orders in current month)
        const monthlyOrders = allAccOrders.filter(o => {
          const orderDate = o.created_at?.split('T')[0];
          return orderDate >= monthStart && orderDate <= monthEnd && o.order_status !== "cancelled";
        });
        const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);

        // Calculate yearly revenue
        const yearlyOrders = allAccOrders.filter(o => {
          const orderDate = o.created_at?.split('T')[0];
          return orderDate >= yearStart && orderDate <= yearEnd && o.order_status !== "cancelled";
        });
        const yearlyRevenue = yearlyOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);

        return {
          id: acc.id,
          name: acc.name,
          is_active: acc.is_active !== false,
          total_orders: allAccOrders.length,
          pending_orders: pendingOrders,
          confirmed_orders: confirmedOrders,
          checked_in_orders: checkedInOrders,
          checked_out_orders: checkedOutOrders,
          cancelled_orders: cancelledOrders,
          monthly_revenue: monthlyRevenue,
          yearly_revenue: yearlyRevenue,
          total_customers: customersCount || 0,
        };
      });

      const allStats = await Promise.all(statsPromises);
      setStats(allStats);

      // Calculate totals
      setTotals({
        totalOrders: allStats.reduce((sum, s) => sum + s.total_orders, 0),
        pendingOrders: allStats.reduce((sum, s) => sum + s.pending_orders, 0),
        confirmedOrders: allStats.reduce((sum, s) => sum + s.confirmed_orders, 0),
        checkedInOrders: allStats.reduce((sum, s) => sum + s.checked_in_orders, 0),
        checkedOutOrders: allStats.reduce((sum, s) => sum + s.checked_out_orders, 0),
        cancelledOrders: allStats.reduce((sum, s) => sum + s.cancelled_orders, 0),
        monthlyRevenue: allStats.reduce((sum, s) => sum + s.monthly_revenue, 0),
        yearlyRevenue: allStats.reduce((sum, s) => sum + s.yearly_revenue, 0),
        totalCustomers: allStats.reduce((sum, s) => sum + s.total_customers, 0),
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatShortCurrency = (value: number) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}萬`;
    }
    return value.toLocaleString();
  };

  // Prepare order status pie chart data
  const orderStatusData = [
    { name: '待確認', value: totals.pendingOrders, color: STATUS_COLORS.pending },
    { name: '已確認', value: totals.confirmedOrders, color: STATUS_COLORS.confirmed },
    { name: '入住中', value: totals.checkedInOrders, color: STATUS_COLORS.checked_in },
    { name: '已退房', value: totals.checkedOutOrders, color: STATUS_COLORS.checked_out },
    { name: '已取消', value: totals.cancelledOrders, color: STATUS_COLORS.cancelled },
  ].filter(item => item.value > 0);

  // Prepare accommodation revenue comparison data
  const accommodationRevenueData = stats
    .map((s, index) => ({
      name: s.name.length > 6 ? s.name.slice(0, 6) + '...' : s.name,
      fullName: s.name,
      月營收: s.monthly_revenue,
      年營收: s.yearly_revenue,
      color: COLORS[index % COLORS.length],
    }))
    .sort((a, b) => b.月營收 - a.月營收);

  if (loading) {
    return <HQOverviewSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">民宿數量</p>
                <p className="text-2xl font-bold">{accommodations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">待處理訂單</p>
                <p className="text-2xl font-bold">{totals.pendingOrders}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">本月營收</p>
                <p className="text-2xl font-bold">{formatCurrency(totals.monthlyRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">總客戶數</p>
                <p className="text-2xl font-bold">{totals.totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue Trend */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">營收趨勢</CardTitle>
                <CardDescription>近12個月營收變化</CardDescription>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyTrends.some(d => d.revenue > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tickFormatter={formatShortCurrency}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), '營收']}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill="hsl(203, 78%, 43%)" 
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground">
                <p className="text-sm">暫無營收數據</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">訂單狀態分佈</CardTitle>
                <CardDescription>各狀態訂單數量佔比</CardDescription>
              </div>
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <PieChartIcon className="h-4 w-4 text-purple-500" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {orderStatusData.length > 0 ? (
              <div className="flex items-center">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie
                      data={orderStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {orderStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value} 筆`, name]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {orderStatusData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value} 筆</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                <p className="text-sm">暫無訂單數據</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Orders Trend */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">訂單趨勢</CardTitle>
              <CardDescription>近12個月訂單數量變化</CardDescription>
            </div>
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Calendar className="h-4 w-4 text-orange-500" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {monthlyTrends.some(d => d.orders > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip 
                  formatter={(value: number) => [`${value} 筆`, '訂單']}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="orders" 
                  stroke="hsl(25, 90%, 60%)" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--background))', stroke: 'hsl(25, 90%, 60%)', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: 'hsl(25, 90%, 60%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground">
              <p className="text-sm">暫無訂單數據</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accommodation Revenue Comparison */}
      {stats.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">各民宿營收比較</CardTitle>
                <CardDescription>本月各民宿營收排行</CardDescription>
              </div>
              <div className="p-2 bg-primary/10 rounded-lg">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, stats.length * 50)}>
              <BarChart 
                data={accommodationRevenueData} 
                layout="vertical"
                margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" horizontal={true} vertical={false} />
                <XAxis 
                  type="number"
                  tickFormatter={formatShortCurrency}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), '營收']}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.fullName || label}
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Bar 
                  dataKey="月營收" 
                  radius={[0, 4, 4, 0]}
                  maxBarSize={30}
                >
                  {accommodationRevenueData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-Accommodation Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            各民宿營運概況
          </CardTitle>
          <CardDescription>
            查看每個民宿的訂單狀態和營收數據
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              尚無民宿資料
            </p>
          ) : (
            <div className="space-y-4">
              {stats.map((stat) => (
                <div
                  key={stat.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{stat.name}</span>
                      {!stat.is_active && (
                        <Badge variant="secondary">已停用</Badge>
                      )}
                    </div>
                    <Badge variant="outline" className="gap-1">
                      <Calendar className="h-3 w-3" />
                      {stat.total_orders} 筆訂單
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <span className="text-muted-foreground">待確認:</span>
                      <span className="font-medium">{stat.pending_orders}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">已確認:</span>
                      <span className="font-medium">{stat.confirmed_orders}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-muted-foreground">入住中:</span>
                      <span className="font-medium">{stat.checked_in_orders}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-muted-foreground">已取消:</span>
                      <span className="font-medium">{stat.cancelled_orders}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">客戶:</span>
                      <span className="font-medium">{stat.total_customers}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t">
                    <div>
                      <span className="text-sm text-muted-foreground">本月營收:</span>
                      <span className="ml-2 font-semibold text-primary">
                        {formatCurrency(stat.monthly_revenue)}
                      </span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">年度營收:</span>
                      <span className="ml-2 font-semibold">
                        {formatCurrency(stat.yearly_revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
