import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  Loader2
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";

interface AccommodationStats {
  id: string;
  name: string;
  is_active: boolean;
  total_orders: number;
  pending_orders: number;
  confirmed_orders: number;
  checked_in_orders: number;
  cancelled_orders: number;
  monthly_revenue: number;
  yearly_revenue: number;
  total_customers: number;
}

interface OperationalOverviewProps {
  accommodations: { id: string; name: string; is_active?: boolean }[];
}

export function OperationalOverview({ accommodations }: OperationalOverviewProps) {
  const [stats, setStats] = useState<AccommodationStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    totalOrders: 0,
    pendingOrders: 0,
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

        const allOrders = orders || [];
        const pendingOrders = allOrders.filter(o => o.order_status === "pending").length;
        const confirmedOrders = allOrders.filter(o => o.order_status === "confirmed").length;
        const checkedInOrders = allOrders.filter(o => o.order_status === "checked_in").length;
        const cancelledOrders = allOrders.filter(o => o.order_status === "cancelled").length;

        // Calculate monthly revenue (non-cancelled orders in current month)
        const monthlyOrders = allOrders.filter(o => {
          const orderDate = o.created_at?.split('T')[0];
          return orderDate >= monthStart && orderDate <= monthEnd && o.order_status !== "cancelled";
        });
        const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);

        // Calculate yearly revenue
        const yearlyOrders = allOrders.filter(o => {
          const orderDate = o.created_at?.split('T')[0];
          return orderDate >= yearStart && orderDate <= yearEnd && o.order_status !== "cancelled";
        });
        const yearlyRevenue = yearlyOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);

        return {
          id: acc.id,
          name: acc.name,
          is_active: acc.is_active !== false,
          total_orders: allOrders.length,
          pending_orders: pendingOrders,
          confirmed_orders: confirmedOrders,
          checked_in_orders: checkedInOrders,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
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
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-500" />
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

      {/* Per-Accommodation Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
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
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
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
                      <span className="ml-2 font-semibold text-green-600 dark:text-green-400">
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
