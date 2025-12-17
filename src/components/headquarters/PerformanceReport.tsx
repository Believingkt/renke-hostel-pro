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
  ArrowDownRight
} from "lucide-react";
import { format, subDays, subWeeks, subMonths, subYears, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, differenceInDays } from "date-fns";
import { zhTW } from "date-fns/locale";

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

interface PerformanceReportProps {
  accommodations: { id: string; name: string; is_active?: boolean }[];
}

type TimeRange = "today" | "week" | "month" | "quarter" | "year" | "all";

export function PerformanceReport({ accommodations }: PerformanceReportProps) {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [performanceData, setPerformanceData] = useState<AccommodationPerformance[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState<AccommodationPerformance[]>([]);
  const [exporting, setExporting] = useState(false);

  // Calculate date range based on selected time range
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

      // Load previous period for comparison
      const prevRange = getDateRange(timeRange, true);
      const prevStartStr = format(prevRange.start, "yyyy-MM-dd");
      const prevEndStr = format(prevRange.end, "yyyy-MM-dd");

      const [currentData, previousData] = await Promise.all([
        loadPeriodData(startStr, endStr),
        timeRange !== "all" ? loadPeriodData(prevStartStr, prevEndStr) : Promise.resolve([]),
      ]);

      setPerformanceData(currentData);
      setPreviousPeriodData(previousData);
    } catch (error) {
      console.error("Error loading performance data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodData = async (startDate: string, endDate: string): Promise<AccommodationPerformance[]> => {
    const results = await Promise.all(
      accommodations.map(async (acc) => {
        // Get orders in date range
        const { data: orders } = await supabase
          .from("orders")
          .select("order_status, final_price, check_in_date, check_out_date")
          .eq("accommodation_id", acc.id)
          .gte("created_at", startDate)
          .lte("created_at", endDate + "T23:59:59");

        // Get room types for occupancy calculation
        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("room_count")
          .eq("accommodation_id", acc.id);

        const allOrders = orders || [];
        const validOrders = allOrders.filter((o) => o.order_status !== "cancelled");
        const cancelledOrders = allOrders.filter((o) => o.order_status === "cancelled");
        const revenue = validOrders.reduce((sum, o) => sum + (o.final_price || 0), 0);
        
        // Calculate room nights
        const roomNights = validOrders.reduce((sum, o) => {
          const checkIn = new Date(o.check_in_date);
          const checkOut = new Date(o.check_out_date);
          return sum + differenceInDays(checkOut, checkIn);
        }, 0);

        // Calculate occupancy rate
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

  // Calculate totals
  const totals = useMemo(() => {
    const totalRevenue = performanceData.reduce((sum, d) => sum + d.revenue, 0);
    const totalOrders = performanceData.reduce((sum, d) => sum + d.orderCount, 0);
    const totalRoomNights = performanceData.reduce((sum, d) => sum + d.roomNights, 0);
    const avgOccupancy = performanceData.length > 0
      ? performanceData.reduce((sum, d) => sum + d.occupancyRate, 0) / performanceData.length
      : 0;

    const prevRevenue = previousPeriodData.reduce((sum, d) => sum + d.revenue, 0);
    const prevOrders = previousPeriodData.reduce((sum, d) => sum + d.orderCount, 0);

    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersChange = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;

    return {
      totalRevenue,
      totalOrders,
      totalRoomNights,
      avgOccupancy: Math.round(avgOccupancy * 10) / 10,
      revenueChange: Math.round(revenueChange * 10) / 10,
      ordersChange: Math.round(ordersChange * 10) / 10,
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

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { start, end } = getDateRange(timeRange);
      const headers = ["民宿名稱", "狀態", "訂單數", "營收", "平均客單價", "入住率(%)", "取消訂單數", "房晚數"];
      const rows = performanceData.map((d) => [
        d.name,
        d.is_active ? "營運中" : "已停用",
        d.orderCount,
        d.revenue,
        d.averageOrderValue,
        d.occupancyRate,
        d.cancelledCount,
        d.roomNights,
      ]);

      // Add totals row
      rows.push([
        "合計",
        "",
        totals.totalOrders,
        totals.totalRevenue,
        totals.totalOrders > 0 ? Math.round(totals.totalRevenue / totals.totalOrders) : 0,
        totals.avgOccupancy,
        performanceData.reduce((sum, d) => sum + d.cancelledCount, 0),
        totals.totalRoomNights,
      ]);

      const csvContent = [
        `業績報表 - ${getTimeRangeLabel(timeRange)} (${format(start, "yyyy/MM/dd")} ~ ${format(end, "yyyy/MM/dd")})`,
        "",
        headers.join(","),
        ...rows.map((row) => row.join(",")),
      ].join("\n");

      // Add BOM for Excel UTF-8 compatibility
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
      {/* Header with Time Range Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            業績報表
          </h3>
          <p className="text-sm text-muted-foreground">
            {getTimeRangeLabel(timeRange)}業績總覽與民宿對比
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">總營收</p>
                  <p className="text-xl font-bold">{formatCurrency(totals.totalRevenue)}</p>
                </div>
              </div>
              {timeRange !== "all" && totals.revenueChange !== 0 && (
                <div className={`flex items-center text-sm ${totals.revenueChange > 0 ? "text-green-500" : "text-destructive"}`}>
                  {totals.revenueChange > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {Math.abs(totals.revenueChange)}%
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <ShoppingCart className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">訂單數</p>
                  <p className="text-xl font-bold">{totals.totalOrders}</p>
                </div>
              </div>
              {timeRange !== "all" && totals.ordersChange !== 0 && (
                <div className={`flex items-center text-sm ${totals.ordersChange > 0 ? "text-green-500" : "text-destructive"}`}>
                  {totals.ordersChange > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {Math.abs(totals.ordersChange)}%
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Percent className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">平均入住率</p>
                <p className="text-xl font-bold">{totals.avgOccupancy}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">總房晚數</p>
                <p className="text-xl font-bold">{totals.totalRoomNights}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accommodation Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            民宿業績對比
          </CardTitle>
          <CardDescription>
            比較各民宿在{getTimeRangeLabel(timeRange)}的業績表現
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
                    <TableHead className="font-semibold text-right">平均客單價</TableHead>
                    <TableHead className="font-semibold text-right">入住率</TableHead>
                    <TableHead className="font-semibold text-right">房晚數</TableHead>
                    <TableHead className="font-semibold text-right">取消數</TableHead>
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
                          <TableCell className="text-right font-medium">{data.orderCount}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium">{formatCurrency(data.revenue)}</span>
                              {timeRange !== "all" && revenueChange !== 0 && (
                                <span className={`text-xs ${revenueChange > 0 ? "text-green-500" : "text-destructive"}`}>
                                  {revenueChange > 0 ? "↑" : "↓"}{Math.abs(Math.round(revenueChange))}%
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(data.averageOrderValue)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={data.occupancyRate >= 70 ? "default" : data.occupancyRate >= 40 ? "secondary" : "outline"}>
                              {data.occupancyRate}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{data.roomNights}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{data.cancelledCount}</TableCell>
                        </TableRow>
                      );
                    })}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>合計</TableCell>
                    <TableCell className="text-right">{totals.totalOrders}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totals.totalRevenue)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.totalOrders > 0 ? Math.round(totals.totalRevenue / totals.totalOrders) : 0)}
                    </TableCell>
                    <TableCell className="text-right">{totals.avgOccupancy}%</TableCell>
                    <TableCell className="text-right">{totals.totalRoomNights}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {performanceData.reduce((sum, d) => sum + d.cancelledCount, 0)}
                    </TableCell>
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
