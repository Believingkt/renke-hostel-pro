import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  TrendingUp,
  TrendingDown,
  DollarSign, 
  Calendar,
  Download,
  Building2,
  ShoppingCart,
  Percent,
  Loader2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  Users,
  Minus,
  GitCompareArrows
} from "lucide-react";
import { format, subDays, subWeeks, subMonths, subYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, differenceInDays, eachMonthOfInterval, getMonth, getYear } from "date-fns";
import { zhTW } from "date-fns/locale";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  ComposedChart,
  Area,
  ReferenceLine,
  Cell,
  PieChart,
  Pie
} from "recharts";

interface AccommodationPerformance {
  id: string;
  name: string;
  is_active: boolean;
  orderCount: number;
  revenue: number;
  averageOrderValue: number;
  occupancyRate: number;
  cancelledCount: number;
  roomNights: number;
}

interface TrendDataPoint {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  prevRevenue?: number;
  prevOrders?: number;
}

interface MonthlyComparison {
  month: string;
  label: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
  previousOrders: number;
  revenueGrowth: number;
  ordersGrowth: number;
}

interface PerformanceReportProps {
  accommodations: { id: string; name: string; is_active?: boolean }[];
}

type TimeRange = "today" | "week" | "month" | "quarter" | "year" | "all";

export function PerformanceReport({ accommodations }: PerformanceReportProps) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [performanceData, setPerformanceData] = useState<AccommodationPerformance[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState<AccommodationPerformance[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [monthlyComparison, setMonthlyComparison] = useState<MonthlyComparison[]>([]);
  const [exporting, setExporting] = useState(false);

  const getDateRange = (range: TimeRange, isPrevious = false) => {
    const now = new Date();
    let start: Date;
    let end: Date;

    switch (range) {
      case "today":
        start = startOfDay(now);
        end = endOfDay(now);
        if (isPrevious) {
          start = startOfDay(subDays(now, 1));
          end = endOfDay(subDays(now, 1));
        }
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfWeek(now, { weekStartsOn: 1 });
        if (isPrevious) {
          start = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
          end = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
        }
        break;
      case "month":
        start = startOfMonth(now);
        end = endOfMonth(now);
        if (isPrevious) {
          start = startOfMonth(subMonths(now, 1));
          end = endOfMonth(subMonths(now, 1));
        }
        break;
      case "quarter":
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterMonth, 1);
        end = new Date(now.getFullYear(), quarterMonth + 3, 0);
        if (isPrevious) {
          start = new Date(now.getFullYear(), quarterMonth - 3, 1);
          end = new Date(now.getFullYear(), quarterMonth, 0);
        }
        break;
      case "year":
        start = startOfYear(now);
        end = endOfYear(now);
        if (isPrevious) {
          start = startOfYear(subYears(now, 1));
          end = endOfYear(subYears(now, 1));
        }
        break;
      case "all":
      default:
        start = new Date(2020, 0, 1);
        end = now;
        break;
    }

    return { start, end };
  };

  const loadPerformanceData = async () => {
    if (accommodations.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { start, end } = getDateRange(timeRange);
      const startStr = format(start, "yyyy-MM-dd");
      const endStr = format(end, "yyyy-MM-dd");

      const prevRange = getDateRange(timeRange, true);
      const prevStartStr = format(prevRange.start, "yyyy-MM-dd");
      const prevEndStr = format(prevRange.end, "yyyy-MM-dd");

      const [currentData, previousData, trend, monthly] = await Promise.all([
        loadPeriodData(startStr, endStr),
        timeRange !== "all" ? loadPeriodData(prevStartStr, prevEndStr) : Promise.resolve([]),
        loadTrendDataWithComparison(start, end, prevRange.start, prevRange.end),
        loadMonthlyComparison(),
      ]);

      setPerformanceData(currentData);
      setPreviousPeriodData(previousData);
      setTrendData(trend);
      setMonthlyComparison(monthly);
    } catch (error) {
      console.error("Error loading performance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrendDataWithComparison = async (
    start: Date, 
    end: Date, 
    prevStart: Date, 
    prevEnd: Date
  ): Promise<TrendDataPoint[]> => {
    const days = eachDayOfInterval({ start, end });
    const prevDays = eachDayOfInterval({ start: prevStart, end: prevEnd });
    const accIds = accommodations.map(a => a.id);
    
    const maxPoints = 31;
    const step = Math.max(1, Math.ceil(days.length / maxPoints));
    const sampledDays = days.filter((_, i) => i % step === 0 || i === days.length - 1);
    
    const [{ data: currentOrders }, { data: prevOrders }] = await Promise.all([
      supabase
        .from("orders")
        .select("created_at, final_price, order_status, accommodation_id")
        .in("accommodation_id", accIds)
        .gte("created_at", format(start, "yyyy-MM-dd"))
        .lte("created_at", format(end, "yyyy-MM-dd") + "T23:59:59"),
      supabase
        .from("orders")
        .select("created_at, final_price, order_status, accommodation_id")
        .in("accommodation_id", accIds)
        .gte("created_at", format(prevStart, "yyyy-MM-dd"))
        .lte("created_at", format(prevEnd, "yyyy-MM-dd") + "T23:59:59"),
    ]);
    
    const orders = currentOrders || [];
    const previousOrdersList = prevOrders || [];
    
    const trendMap = new Map<string, { revenue: number; orders: number; prevRevenue: number; prevOrders: number }>();
    
    sampledDays.forEach((day, index) => {
      const dateKey = format(day, "yyyy-MM-dd");
      trendMap.set(dateKey, { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 });
    });
    
    orders.forEach(order => {
      if (order.order_status === "cancelled") return;
      const orderDate = format(new Date(order.created_at), "yyyy-MM-dd");
      const closestDate = sampledDays.reduce((prev, curr) => {
        const currKey = format(curr, "yyyy-MM-dd");
        const prevKey = format(prev, "yyyy-MM-dd");
        return currKey <= orderDate ? curr : prev;
      });
      const dateKey = format(closestDate, "yyyy-MM-dd");
      
      const existing = trendMap.get(dateKey) || { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 };
      existing.revenue += order.final_price || 0;
      existing.orders += 1;
      trendMap.set(dateKey, existing);
    });

    // Map previous period orders
    const prevStep = Math.max(1, Math.ceil(prevDays.length / maxPoints));
    const sampledPrevDays = prevDays.filter((_, i) => i % prevStep === 0 || i === prevDays.length - 1);
    
    previousOrdersList.forEach(order => {
      if (order.order_status === "cancelled") return;
      const orderDate = format(new Date(order.created_at), "yyyy-MM-dd");
      const closestPrevDate = sampledPrevDays.reduce((prev, curr) => {
        const currKey = format(curr, "yyyy-MM-dd");
        const prevKey = format(prev, "yyyy-MM-dd");
        return currKey <= orderDate ? curr : prev;
      });
      const prevIndex = sampledPrevDays.indexOf(closestPrevDate);
      
      if (prevIndex >= 0 && prevIndex < sampledDays.length) {
        const correspondingCurrentDate = sampledDays[prevIndex];
        const dateKey = format(correspondingCurrentDate, "yyyy-MM-dd");
        const existing = trendMap.get(dateKey) || { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 };
        existing.prevRevenue += order.final_price || 0;
        existing.prevOrders += 1;
        trendMap.set(dateKey, existing);
      }
    });
    
    return sampledDays.map(day => {
      const dateKey = format(day, "yyyy-MM-dd");
      const data = trendMap.get(dateKey) || { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 };
      return {
        date: dateKey,
        label: format(day, "M/d", { locale: zhTW }),
        revenue: data.revenue,
        orders: data.orders,
        prevRevenue: data.prevRevenue,
        prevOrders: data.prevOrders,
      };
    });
  };

  const loadMonthlyComparison = async (): Promise<MonthlyComparison[]> => {
    const now = new Date();
    const currentYear = getYear(now);
    const previousYear = currentYear - 1;
    const accIds = accommodations.map(a => a.id);

    const months = eachMonthOfInterval({
      start: new Date(currentYear, 0, 1),
      end: now,
    });

    const [{ data: currentYearOrders }, { data: previousYearOrders }] = await Promise.all([
      supabase
        .from("orders")
        .select("created_at, final_price, order_status")
        .in("accommodation_id", accIds)
        .gte("created_at", `${currentYear}-01-01`)
        .lte("created_at", format(now, "yyyy-MM-dd") + "T23:59:59"),
      supabase
        .from("orders")
        .select("created_at, final_price, order_status")
        .in("accommodation_id", accIds)
        .gte("created_at", `${previousYear}-01-01`)
        .lte("created_at", `${previousYear}-12-31T23:59:59`),
    ]);

    const currentOrders = (currentYearOrders || []).filter(o => o.order_status !== "cancelled");
    const prevOrders = (previousYearOrders || []).filter(o => o.order_status !== "cancelled");

    return months.map(month => {
      const monthNum = getMonth(month);
      const monthLabel = format(month, "M月", { locale: zhTW });

      const currentMonthOrders = currentOrders.filter(o => getMonth(new Date(o.created_at)) === monthNum);
      const prevMonthOrders = prevOrders.filter(o => getMonth(new Date(o.created_at)) === monthNum);

      const currentRevenue = currentMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
      const previousRevenue = prevMonthOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
      const currentOrderCount = currentMonthOrders.length;
      const previousOrderCount = prevMonthOrders.length;

      const revenueGrowth = previousRevenue > 0 
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
        : currentRevenue > 0 ? 100 : 0;
      const ordersGrowth = previousOrderCount > 0 
        ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100 
        : currentOrderCount > 0 ? 100 : 0;

      return {
        month: format(month, "yyyy-MM"),
        label: monthLabel,
        currentRevenue,
        previousRevenue,
        currentOrders: currentOrderCount,
        previousOrders: previousOrderCount,
        revenueGrowth: Math.round(revenueGrowth * 10) / 10,
        ordersGrowth: Math.round(ordersGrowth * 10) / 10,
      };
    });
  };

  const loadPeriodData = async (startDate: string, endDate: string): Promise<AccommodationPerformance[]> => {
    const results = await Promise.all(
      accommodations.map(async (acc) => {
        const { data: orders } = await supabase
          .from("orders")
          .select("order_status, final_price, check_in_date, check_out_date")
          .eq("accommodation_id", acc.id)
          .gte("created_at", startDate)
          .lte("created_at", endDate + "T23:59:59");

        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("room_count")
          .eq("accommodation_id", acc.id);

        const allOrders = orders || [];
        const validOrders = allOrders.filter((o) => o.order_status !== "cancelled");
        const cancelledOrders = allOrders.filter((o) => o.order_status === "cancelled");
        const revenue = validOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
        
        const roomNights = validOrders.reduce((sum, o) => {
          const checkIn = new Date(o.check_in_date);
          const checkOut = new Date(o.check_out_date);
          return sum + differenceInDays(checkOut, checkIn);
        }, 0);

        const totalRooms = (roomTypes || []).reduce((sum, rt) => sum + (rt.room_count || 1), 0);
        const daysInPeriod = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
        const totalRoomNights = totalRooms * daysInPeriod;
        const occupancyRate = totalRoomNights > 0 ? (roomNights / totalRoomNights) * 100 : 0;

        return {
          id: acc.id,
          name: acc.name,
          is_active: acc.is_active !== false,
          orderCount: validOrders.length,
          revenue,
          averageOrderValue: validOrders.length > 0 ? Math.round(revenue / validOrders.length) : 0,
          occupancyRate: Math.round(occupancyRate * 10) / 10,
          cancelledCount: cancelledOrders.length,
          roomNights,
        };
      })
    );

    return results;
  };

  useEffect(() => {
    loadPerformanceData();
  }, [accommodations, timeRange]);

  const totals = useMemo(() => {
    const totalRevenue = performanceData.reduce((sum, d) => sum + d.revenue, 0);
    const totalOrders = performanceData.reduce((sum, d) => sum + d.orderCount, 0);
    const totalRoomNights = performanceData.reduce((sum, d) => sum + d.roomNights, 0);
    const avgOccupancy = performanceData.length > 0
      ? performanceData.reduce((sum, d) => sum + d.occupancyRate, 0) / performanceData.length
      : 0;

    const prevRevenue = previousPeriodData.reduce((sum, d) => sum + d.revenue, 0);
    const prevOrders = previousPeriodData.reduce((sum, d) => sum + d.orderCount, 0);
    const prevRoomNights = previousPeriodData.reduce((sum, d) => sum + d.roomNights, 0);
    const prevAvgOccupancy = previousPeriodData.length > 0
      ? previousPeriodData.reduce((sum, d) => sum + d.occupancyRate, 0) / previousPeriodData.length
      : 0;

    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersChange = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;
    const roomNightsChange = prevRoomNights > 0 ? ((totalRoomNights - prevRoomNights) / prevRoomNights) * 100 : 0;
    const occupancyChange = prevAvgOccupancy > 0 ? ((avgOccupancy - prevAvgOccupancy) / prevAvgOccupancy) * 100 : 0;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;
    const prevAvgOrderValue = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
    const avgOrderValueChange = prevAvgOrderValue > 0 
      ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100 
      : 0;

    return {
      totalRevenue,
      totalOrders,
      totalRoomNights,
      avgOccupancy: Math.round(avgOccupancy * 10) / 10,
      avgOrderValue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      ordersChange: Math.round(ordersChange * 10) / 10,
      roomNightsChange: Math.round(roomNightsChange * 10) / 10,
      occupancyChange: Math.round(occupancyChange * 10) / 10,
      avgOrderValueChange: Math.round(avgOrderValueChange * 10) / 10,
      prevRevenue,
      prevOrders,
      prevRoomNights,
    };
  }, [performanceData, previousPeriodData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getTimeRangeLabel = (range: TimeRange) => {
    switch (range) {
      case "today": return "今日";
      case "week": return "本週";
      case "month": return "本月";
      case "quarter": return "本季";
      case "year": return "本年";
      case "all": return "全部時間";
    }
  };

  const getPreviousLabel = (range: TimeRange) => {
    switch (range) {
      case "today": return "昨日";
      case "week": return "上週";
      case "month": return "上月";
      case "quarter": return "上季";
      case "year": return "去年";
      case "all": return "";
    }
  };

  const GrowthIndicator = ({ value, showValue = true }: { value: number; showValue?: boolean }) => {
    if (value === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
    const isPositive = value > 0;
    return (
      <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? "text-green-500" : "text-destructive"}`}>
        {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        {showValue && <span>{Math.abs(value)}%</span>}
      </div>
    );
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { start, end } = getDateRange(timeRange);
      const headers = ["民宿名稱", "狀態", "訂單數", "營收", "平均客單價", "入住率(%)", "取消訂單數", "房晚數", "營收成長率(%)"];
      const rows = performanceData.map((d) => {
        const prevData = previousPeriodData.find(p => p.id === d.id);
        const growth = prevData && prevData.revenue > 0 
          ? ((d.revenue - prevData.revenue) / prevData.revenue * 100).toFixed(1)
          : "N/A";
        return [
          d.name,
          d.is_active ? "營運中" : "已停用",
          d.orderCount,
          d.revenue,
          d.averageOrderValue,
          d.occupancyRate,
          d.cancelledCount,
          d.roomNights,
          growth,
        ];
      });

      rows.push([
        "合計",
        "",
        totals.totalOrders,
        totals.totalRevenue,
        totals.avgOrderValue,
        totals.avgOccupancy,
        performanceData.reduce((sum, d) => sum + d.cancelledCount, 0),
        totals.totalRoomNights,
        totals.revenueChange,
      ]);

      const csvContent = [
        `業績報表 - ${getTimeRangeLabel(timeRange)} (${format(start, "yyyy/MM/dd")} ~ ${format(end, "yyyy/MM/dd")})`,
        `同期比較: ${getPreviousLabel(timeRange)}`,
        "",
        headers.join(","),
        ...rows.map((row) => row.join(",")),
      ].join("\n");

      const bom = "\uFEFF";
      const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `業績報表_${getTimeRangeLabel(timeRange)}_${format(new Date(), "yyyyMMdd")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExporting(false);
    }
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            業績報表
          </h3>
          <p className="text-sm text-muted-foreground">
            {getTimeRangeLabel(timeRange)}業績總覽與民宿對比
            {timeRange !== "all" && ` (與${getPreviousLabel(timeRange)}同期比較)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">今日</SelectItem>
              <SelectItem value="week">本週</SelectItem>
              <SelectItem value="month">本月</SelectItem>
              <SelectItem value="quarter">本季</SelectItem>
              <SelectItem value="year">本年</SelectItem>
              <SelectItem value="all">全部時間</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportCSV} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            匯出 CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards with Growth */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              {timeRange !== "all" && <GrowthIndicator value={totals.revenueChange} />}
            </div>
            <p className="text-sm text-muted-foreground">總營收</p>
            <p className="text-xl font-bold">{formatCurrency(totals.totalRevenue)}</p>
            {timeRange !== "all" && totals.prevRevenue > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {getPreviousLabel(timeRange)}: {formatCurrency(totals.prevRevenue)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <ShoppingCart className="h-5 w-5 text-blue-500" />
              </div>
              {timeRange !== "all" && <GrowthIndicator value={totals.ordersChange} />}
            </div>
            <p className="text-sm text-muted-foreground">訂單數</p>
            <p className="text-xl font-bold">{totals.totalOrders}</p>
            {timeRange !== "all" && totals.prevOrders > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {getPreviousLabel(timeRange)}: {totals.prevOrders} 筆
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Target className="h-5 w-5 text-purple-500" />
              </div>
              {timeRange !== "all" && <GrowthIndicator value={totals.avgOrderValueChange} />}
            </div>
            <p className="text-sm text-muted-foreground">平均客單價</p>
            <p className="text-xl font-bold">{formatCurrency(totals.avgOrderValue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Percent className="h-5 w-5 text-amber-500" />
              </div>
              {timeRange !== "all" && <GrowthIndicator value={totals.occupancyChange} />}
            </div>
            <p className="text-sm text-muted-foreground">平均入住率</p>
            <p className="text-xl font-bold">{totals.avgOccupancy}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
              {timeRange !== "all" && <GrowthIndicator value={totals.roomNightsChange} />}
            </div>
            <p className="text-sm text-muted-foreground">總房晚數</p>
            <p className="text-xl font-bold">{totals.totalRoomNights}</p>
            {timeRange !== "all" && totals.prevRoomNights > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {getPreviousLabel(timeRange)}: {totals.prevRoomNights} 晚
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Period Comparison Chart */}
      {timeRange !== "all" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitCompareArrows className="h-5 w-5 text-blue-500" />
              營收同期比較
            </CardTitle>
            <CardDescription>
              {getTimeRangeLabel(timeRange)} vs {getPreviousLabel(timeRange)}營收趨勢對比
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData.some(d => d.revenue > 0 || d.prevRevenue! > 0) ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      width={45}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value), 
                        name === 'revenue' ? getTimeRangeLabel(timeRange) : getPreviousLabel(timeRange)
                      ]}
                    />
                    <Legend 
                      formatter={(value) => value === 'revenue' ? getTimeRangeLabel(timeRange) : getPreviousLabel(timeRange)}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="prevRevenue" 
                      fill="hsl(var(--muted))" 
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      fillOpacity={0.3}
                      name="prevRevenue"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(142, 76%, 36%)" 
                      strokeWidth={2.5}
                      dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                      name="revenue"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                <div className="text-center">
                  <p className="text-sm">暫無同期比較數據</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly YoY Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-green-500" />
              月營收年度比較
            </CardTitle>
            <CardDescription>
              今年各月營收 vs 去年同期
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyComparison.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyComparison} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      width={45}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value), 
                        name === 'currentRevenue' ? '今年' : '去年'
                      ]}
                    />
                    <Legend formatter={(value) => value === 'currentRevenue' ? '今年' : '去年'} />
                    <Bar dataKey="previousRevenue" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} maxBarSize={20} name="previousRevenue" />
                    <Bar dataKey="currentRevenue" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} maxBarSize={20} name="currentRevenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground">
                <p className="text-sm">暫無年度比較數據</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              月成長率趨勢
            </CardTitle>
            <CardDescription>
              各月份營收年增率
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyComparison.length > 0 ? (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyComparison} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => `${value}%`}
                      width={45}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number) => [`${value}%`, '年增率']}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="revenueGrowth" name="年增率" maxBarSize={24} radius={[4, 4, 0, 0]}>
                      {monthlyComparison.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.revenueGrowth >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(var(--destructive))'} 
                        />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[260px] text-muted-foreground">
                <p className="text-sm">暫無成長率數據</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-5 w-5 text-green-500" />
              營收趨勢
            </CardTitle>
            <CardDescription>
              {getTimeRangeLabel(timeRange)}營收變化
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData.some(d => d.revenue > 0) ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      width={45}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value: number) => [formatCurrency(value), '營收']}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="hsl(142, 76%, 36%)" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground">
                <p className="text-sm">暫無營收數據</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
              訂單趨勢
            </CardTitle>
            <CardDescription>
              {getTimeRangeLabel(timeRange)}訂單數量變化
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && trendData.some(d => d.orders > 0) ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                    <XAxis 
                      dataKey="label" 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={30}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                      formatter={(value: number) => [`${value} 筆`, '訂單']}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="orders" 
                      stroke="hsl(210, 80%, 55%)" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(210, 80%, 55%)', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground">
                <p className="text-sm">暫無訂單數據</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            民宿營收比較
          </CardTitle>
          <CardDescription>
            各民宿{getTimeRangeLabel(timeRange)}營收對比
          </CardDescription>
        </CardHeader>
        <CardContent>
          {performanceData.length > 0 && performanceData.some(d => d.revenue > 0) ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={performanceData.sort((a, b) => b.revenue - a.revenue).slice(0, 10)} 
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" horizontal={false} />
                  <XAxis 
                    type="number"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                  />
                  <YAxis 
                    type="category"
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: number) => [formatCurrency(value), '營收']}
                  />
                  <Bar 
                    dataKey="revenue" 
                    fill="hsl(210, 80%, 55%)"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={35}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground">
              <p className="text-sm">暫無民宿營收數據</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            民宿業績對比明細
          </CardTitle>
          <CardDescription>
            各民宿{getTimeRangeLabel(timeRange)}業績與{getPreviousLabel(timeRange)}同期比較
          </CardDescription>
        </CardHeader>
        <CardContent>
          {performanceData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">尚無民宿資料</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">民宿名稱</TableHead>
                    <TableHead className="font-semibold text-right">訂單數</TableHead>
                    <TableHead className="font-semibold text-right">營收</TableHead>
                    <TableHead className="font-semibold text-right">成長率</TableHead>
                    <TableHead className="font-semibold text-right">平均客單價</TableHead>
                    <TableHead className="font-semibold text-right">入住率</TableHead>
                    <TableHead className="font-semibold text-right">房晚數</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceData
                    .sort((a, b) => b.revenue - a.revenue)
                    .map((data, index) => {
                      const prevData = previousPeriodData.find((p) => p.id === data.id);
                      const revenueChange = prevData && prevData.revenue > 0
                        ? ((data.revenue - prevData.revenue) / prevData.revenue) * 100
                        : 0;
                      const ordersChange = prevData && prevData.orderCount > 0
                        ? ((data.orderCount - prevData.orderCount) / prevData.orderCount) * 100
                        : 0;

                      return (
                        <TableRow key={data.id} className={!data.is_active ? "opacity-60" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-sm">#{index + 1}</span>
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{data.name}</span>
                              {!data.is_active && <Badge variant="secondary">已停用</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium">{data.orderCount}</span>
                              {timeRange !== "all" && prevData && ordersChange !== 0 && (
                                <GrowthIndicator value={Math.round(ordersChange)} showValue={false} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div>
                              <span className="font-medium">{formatCurrency(data.revenue)}</span>
                              {prevData && prevData.revenue > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  {getPreviousLabel(timeRange)}: {formatCurrency(prevData.revenue)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {timeRange !== "all" && prevData ? (
                              <div className={`flex items-center justify-end gap-1 font-medium ${
                                revenueChange > 0 ? "text-green-500" : revenueChange < 0 ? "text-destructive" : ""
                              }`}>
                                {revenueChange > 0 ? <ArrowUpRight className="h-4 w-4" /> : 
                                 revenueChange < 0 ? <ArrowDownRight className="h-4 w-4" /> : 
                                 <Minus className="h-4 w-4" />}
                                {Math.abs(Math.round(revenueChange))}%
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(data.averageOrderValue)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={data.occupancyRate >= 70 ? "default" : data.occupancyRate >= 40 ? "secondary" : "outline"}>
                              {data.occupancyRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{data.roomNights}</TableCell>
                        </TableRow>
                      );
                    })}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>合計</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {totals.totalOrders}
                        {timeRange !== "all" && <GrowthIndicator value={totals.ordersChange} showValue={false} />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalRevenue)}</TableCell>
                    <TableCell className="text-right">
                      {timeRange !== "all" && <GrowthIndicator value={totals.revenueChange} />}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.avgOrderValue)}</TableCell>
                    <TableCell className="text-right">{totals.avgOccupancy}%</TableCell>
                    <TableCell className="text-right">{totals.totalRoomNights}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
