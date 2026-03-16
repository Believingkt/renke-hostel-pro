import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildPricingMap, aggregateRevenueByMonth, type PricingMap } from "@/utils/revenueByMonth";
import { HQOverviewSkeleton } from "@/components/skeletons/HQSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  PieChart as PieChartIcon,
  ShoppingCart,
  Percent,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Target,
  Minus,
  GitCompareArrows
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subDays, subWeeks, subYears, startOfDay, endOfDay, startOfWeek, endOfWeek, eachDayOfInterval, differenceInDays, eachMonthOfInterval, getMonth, getYear } from "date-fns";
import { zhTW } from "date-fns/locale";
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
  Legend,
  ComposedChart,
  Area,
  ReferenceLine
} from "recharts";


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

interface MonthlyData {
  month: string;
  revenue: number;
  orders: number;
  prevRevenue: number;
  prevOrders: number;
}

interface OperationalOverviewProps {
  accommodations: { id: string; name: string; is_active?: boolean }[];
  selectedAccommodation: string;
  onAccommodationChange: (value: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
}

export interface OperationalOverviewRef {
  exportCSV: () => void;
}

type TimeRange = "today" | "week" | "month" | "quarter" | "year" | "all";

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

export const OperationalOverview = forwardRef<OperationalOverviewRef, OperationalOverviewProps>(({ accommodations, selectedAccommodation, onAccommodationChange, timeRange, onTimeRangeChange }, ref) => {
  const navigate = useNavigate();
  
  // Overview states
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

  // Performance states
  const [performanceLoading, setPerformanceLoading] = useState(false);
  
  const [performanceData, setPerformanceData] = useState<AccommodationPerformance[]>([]);
  const [previousPeriodData, setPreviousPeriodData] = useState<AccommodationPerformance[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [monthlyComparison, setMonthlyComparison] = useState<MonthlyComparison[]>([]);
  const [exporting, setExporting] = useState(false);
  
  // Filtered accommodations based on selection
  const filteredAccommodations = useMemo(() => {
    if (selectedAccommodation === "all") return accommodations;
    return accommodations.filter(a => a.id === selectedAccommodation);
  }, [accommodations, selectedAccommodation]);

  useImperativeHandle(ref, () => ({
    exportCSV: handleExportCSV,
  }));

  useEffect(() => {
    loadStats();
    loadPerformanceData();
  }, [accommodations, selectedAccommodation]);

  useEffect(() => {
    loadPerformanceData();
  }, [timeRange, selectedAccommodation]);

  // Overview data loading
  const loadStats = async () => {
    if (filteredAccommodations.length === 0) {
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

      // Build query for monthly trends with accommodation filter (current year and previous year)
      const accIds = filteredAccommodations.map(a => a.id);
      
      // Get orders from last 24 months for year-over-year comparison
      const [{ data: allOrders, error: allOrdersError }, { data: prevYearOrders, error: prevYearOrdersError }, { data: allRoomTypesForPricing }] = await Promise.all([
        supabase
          .from("orders")
          .select("accommodation_id, order_status, final_price, created_at, check_in_date, check_out_date, room_type_id")
          .in("accommodation_id", accIds)
          .gte("created_at", format(subMonths(now, 11), 'yyyy-MM-dd')),
        supabase
          .from("orders")
          .select("accommodation_id, order_status, final_price, created_at, check_in_date, check_out_date, room_type_id")
          .in("accommodation_id", accIds)
          .gte("created_at", format(subMonths(now, 23), 'yyyy-MM-dd'))
          .lt("created_at", format(subMonths(now, 11), 'yyyy-MM-dd')),
        supabase
          .from("room_types")
          .select("id")
          .in("accommodation_id", accIds)
      ]);

      if (allOrdersError) throw allOrdersError;
      if (prevYearOrdersError) throw prevYearOrdersError;

      // Fetch inventory pricing for daily revenue splitting
      const allRoomTypeIds = (allRoomTypesForPricing || []).map(rt => rt.id);
      let hqPricingMap: PricingMap = new Map();
      
      const allConfirmedWithDates = [
        ...(allOrders || []),
        ...(prevYearOrders || []),
      ].filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);
      
      if (allRoomTypeIds.length > 0 && allConfirmedWithDates.length > 0) {
        let minDate = allConfirmedWithDates[0].check_in_date;
        let maxDate = allConfirmedWithDates[0].check_out_date;
        allConfirmedWithDates.forEach(o => {
          if (o.check_in_date < minDate) minDate = o.check_in_date;
          if (o.check_out_date > maxDate) maxDate = o.check_out_date;
        });
        
        const { data: inventoryData } = await supabase
          .from('room_inventory_pricing')
          .select('room_type_id, date, price, price_2_meals, price_3_meals')
          .in('room_type_id', allRoomTypeIds)
          .gte('date', minDate)
          .lte('date', maxDate)
          .limit(10000);
        
        hqPricingMap = buildPricingMap(inventoryData || []);
      }

      // Compute revenueByMonth for current and previous periods
      const currentConfirmed = (allOrders || []).filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);
      const prevConfirmed = (prevYearOrders || []).filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);
      
      const currentRevenueByMonth = aggregateRevenueByMonth(
        currentConfirmed.map(o => ({ check_in_date: o.check_in_date, check_out_date: o.check_out_date, room_type_id: o.room_type_id, final_price: o.final_price || 0, meal_plan: o.meal_plan })),
        hqPricingMap
      );
      const prevRevenueByMonth = aggregateRevenueByMonth(
        prevConfirmed.map(o => ({ check_in_date: o.check_in_date, check_out_date: o.check_out_date, room_type_id: o.room_type_id, final_price: o.final_price || 0, meal_plan: o.meal_plan })),
        hqPricingMap
      );

      // 營收只計算已確認的訂單（confirmed）
      const isRevenueEligible = (status: string) => status === 'confirmed';

      const monthlyMap = new Map<string, { revenue: number; orders: number; prevRevenue: number; prevOrders: number }>();
      for (let i = 11; i >= 0; i--) {
        const date = subMonths(now, i);
        const key = format(date, 'M月');
        monthlyMap.set(key, { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 });
      }

      // Order counts by created_at month
      allOrders?.forEach(order => {
        if (order.created_at && isRevenueEligible(order.order_status)) {
          const key = format(new Date(order.created_at), 'M月');
          const current = monthlyMap.get(key);
          if (current) current.orders += 1;
        }
      });

      prevYearOrders?.forEach(order => {
        if (order.created_at && isRevenueEligible(order.order_status)) {
          const key = format(new Date(order.created_at), 'M月');
          const current = monthlyMap.get(key);
          if (current) current.prevOrders += 1;
        }
      });

      // Revenue by stay month using daily price splitting
      for (let i = 11; i >= 0; i--) {
        const date = subMonths(now, i);
        const key = format(date, 'M月');
        const yearMonthKey = format(date, 'yyyy-MM');
        const prevYearMonthKey = format(subMonths(date, 12), 'yyyy-MM');
        const current = monthlyMap.get(key);
        if (current) {
          current.revenue = currentRevenueByMonth.get(yearMonthKey) || 0;
          current.prevRevenue = prevRevenueByMonth.get(prevYearMonthKey) || 0;
        }
      }

      setMonthlyTrends(
        Array.from(monthlyMap.entries()).map(([month, data]) => ({
          month,
          revenue: data.revenue,
          orders: data.orders,
          prevRevenue: data.prevRevenue,
          prevOrders: data.prevOrders,
        }))
      );

      const statsPromises = filteredAccommodations.map(async (acc) => {
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("order_status, final_price, created_at, check_in_date, check_out_date, room_type_id")
          .eq("accommodation_id", acc.id);

        if (ordersError) throw ordersError;

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

        // Per-acc revenue using daily price splitting
        const accConfirmed = allAccOrders.filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);
        const accRevenueByMonth = aggregateRevenueByMonth(
          accConfirmed.map(o => ({ check_in_date: o.check_in_date!, check_out_date: o.check_out_date!, room_type_id: o.room_type_id, final_price: o.final_price || 0 })),
          hqPricingMap
        );
        
        const currentMonthKey = format(now, 'yyyy-MM');
        const monthlyRevenue = accRevenueByMonth.get(currentMonthKey) || 0;
        
        const yearlyRevenue = Array.from(accRevenueByMonth.entries())
          .filter(([key]) => key.startsWith(String(now.getFullYear())))
          .reduce((sum, [, rev]) => sum + rev, 0);

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

  // Performance data loading
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
    if (filteredAccommodations.length === 0) {
      setPerformanceLoading(false);
      return;
    }

    setPerformanceLoading(true);
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
      setPerformanceLoading(false);
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
    const accIds = filteredAccommodations.map(a => a.id);
    
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
    
    sampledDays.forEach((day) => {
      const dateKey = format(day, "yyyy-MM-dd");
      trendMap.set(dateKey, { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 });
    });
    
    orders.forEach(order => {
      if (order.order_status !== "confirmed") return;
      const orderDate = format(new Date(order.created_at), "yyyy-MM-dd");
      const closestDate = sampledDays.reduce((prev, curr) => {
        const currKey = format(curr, "yyyy-MM-dd");
        return currKey <= orderDate ? curr : prev;
      });
      const dateKey = format(closestDate, "yyyy-MM-dd");
      
      const existing = trendMap.get(dateKey) || { revenue: 0, orders: 0, prevRevenue: 0, prevOrders: 0 };
      existing.revenue += order.final_price || 0;
      existing.orders += 1;
      trendMap.set(dateKey, existing);
    });

    const prevStep = Math.max(1, Math.ceil(prevDays.length / maxPoints));
    const sampledPrevDays = prevDays.filter((_, i) => i % prevStep === 0 || i === prevDays.length - 1);
    
    previousOrdersList.forEach(order => {
      if (order.order_status !== "confirmed") return;
      const orderDate = format(new Date(order.created_at), "yyyy-MM-dd");
      const closestPrevDate = sampledPrevDays.reduce((prev, curr) => {
        const currKey = format(curr, "yyyy-MM-dd");
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
    const accIds = filteredAccommodations.map(a => a.id);

    const months = eachMonthOfInterval({
      start: new Date(currentYear, 0, 1),
      end: now,
    });

    const [{ data: currentYearOrders }, { data: previousYearOrders }] = await Promise.all([
      supabase
        .from("orders")
        .select("created_at, final_price, order_status, check_in_date, check_out_date, room_type_id")
        .in("accommodation_id", accIds)
        .gte("created_at", `${currentYear}-01-01`)
        .lte("created_at", format(now, "yyyy-MM-dd") + "T23:59:59"),
      supabase
        .from("orders")
        .select("created_at, final_price, order_status, check_in_date, check_out_date, room_type_id")
        .in("accommodation_id", accIds)
        .gte("created_at", `${previousYear}-01-01`)
        .lte("created_at", `${previousYear}-12-31T23:59:59`),
    ]);

    const currentConfirmedOrders = (currentYearOrders || []).filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);
    const prevConfirmedOrders = (previousYearOrders || []).filter(o => o.order_status === 'confirmed' && o.check_in_date && o.check_out_date);

    // Fetch inventory pricing for comparison
    const compOrdersAll = [...currentConfirmedOrders, ...prevConfirmedOrders];
    const compRoomTypeIds = [...new Set(compOrdersAll.map(o => o.room_type_id).filter(Boolean))] as string[];
    let compPricingMap: PricingMap = new Map();
    if (compRoomTypeIds.length > 0 && compOrdersAll.length > 0) {
      let minD = compOrdersAll[0].check_in_date!;
      let maxD = compOrdersAll[0].check_out_date!;
      compOrdersAll.forEach(o => {
        if (o.check_in_date! < minD) minD = o.check_in_date!;
        if (o.check_out_date! > maxD) maxD = o.check_out_date!;
      });
      const { data: invData } = await supabase
        .from('room_inventory_pricing')
        .select('room_type_id, date, price, price_2_meals, price_3_meals')
        .in('room_type_id', compRoomTypeIds)
        .gte('date', minD).lte('date', maxD).limit(10000);
      compPricingMap = buildPricingMap(invData || []);
    }

    const curRevByMonth = aggregateRevenueByMonth(
      currentConfirmedOrders.map(o => ({ check_in_date: o.check_in_date!, check_out_date: o.check_out_date!, room_type_id: o.room_type_id, final_price: o.final_price || 0, meal_plan: o.meal_plan })),
      compPricingMap
    );
    const prevRevByMonth = aggregateRevenueByMonth(
      prevConfirmedOrders.map(o => ({ check_in_date: o.check_in_date!, check_out_date: o.check_out_date!, room_type_id: o.room_type_id, final_price: o.final_price || 0, meal_plan: o.meal_plan })),
      compPricingMap
    );

    return months.map(month => {
      const monthNum = getMonth(month);
      const monthLabel = format(month, "M月", { locale: zhTW });
      const yearMonthKey = format(month, "yyyy-MM");
      const prevYearMonthKey = `${previousYear}-${String(monthNum + 1).padStart(2, '0')}`;

      const currentOrderCount = currentConfirmedOrders.filter(o => getMonth(new Date(o.created_at)) === monthNum).length;
      const previousOrderCount = prevConfirmedOrders.filter(o => getMonth(new Date(o.created_at)) === monthNum).length;

      const currentRevenue = curRevByMonth.get(yearMonthKey) || 0;
      const previousRevenue = prevRevByMonth.get(prevYearMonthKey) || 0;

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
    // Fetch room types and inventory pricing for daily revenue splitting
    const periodAccIds = filteredAccommodations.map(a => a.id);
    const { data: periodRoomTypes } = await supabase
      .from("room_types")
      .select("id")
      .in("accommodation_id", periodAccIds);
    
    const periodRoomTypeIds = (periodRoomTypes || []).map(rt => rt.id);
    let periodPricingMap: PricingMap = new Map();
    if (periodRoomTypeIds.length > 0) {
      const { data: invData } = await supabase
        .from('room_inventory_pricing')
        .select('room_type_id, date, price, price_2_meals, price_3_meals')
        .in('room_type_id', periodRoomTypeIds)
        .gte('date', startDate).lte('date', endDate)
        .limit(10000);
      periodPricingMap = buildPricingMap(invData || []);
    }

    const results = await Promise.all(
      filteredAccommodations.map(async (acc) => {
        const { data: orders } = await supabase
          .from("orders")
          .select("order_status, final_price, check_in_date, check_out_date, room_type_id, meal_plan")
          .eq("accommodation_id", acc.id)
          .gte("created_at", startDate)
          .lte("created_at", endDate + "T23:59:59");

        const { data: roomTypes } = await supabase
          .from("room_types")
          .select("room_count")
          .eq("accommodation_id", acc.id);

        const allOrders = orders || [];
        const confirmedOrders = allOrders.filter((o) => o.order_status === "confirmed");
        const cancelledOrders = allOrders.filter((o) => o.order_status === "cancelled");
        
        // Revenue using daily price splitting
        const confirmedWithDates = confirmedOrders.filter(o => o.check_in_date && o.check_out_date);
        const accRevByMonth = aggregateRevenueByMonth(
          confirmedWithDates.map(o => ({ check_in_date: o.check_in_date!, check_out_date: o.check_out_date!, room_type_id: o.room_type_id, final_price: o.final_price || 0, meal_plan: o.meal_plan })),
          periodPricingMap
        );
        const revenue = Array.from(accRevByMonth.values()).reduce((sum, v) => sum + v, 0);
        
        const roomNights = confirmedOrders.reduce((sum, o) => {
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
          orderCount: confirmedOrders.length,
          revenue,
          averageOrderValue: confirmedOrders.length > 0 ? Math.round(revenue / confirmedOrders.length) : 0,
          occupancyRate: Math.round(occupancyRate * 10) / 10,
          cancelledCount: cancelledOrders.length,
          roomNights,
        };
      })
    );

    return results;
  };

  // Computed values
  const performanceTotals = useMemo(() => {
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

  const formatShortCurrency = (value: number) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}萬`;
    }
    return value.toLocaleString();
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
      <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? "text-primary" : "text-destructive"}`}>
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
        performanceTotals.totalOrders,
        performanceTotals.totalRevenue,
        performanceTotals.avgOrderValue,
        performanceTotals.avgOccupancy,
        performanceData.reduce((sum, d) => sum + d.cancelledCount, 0),
        performanceTotals.totalRoomNights,
        performanceTotals.revenueChange,
      ]);

      const csvContent = [
        `營運分析 - ${getTimeRangeLabel(timeRange)} (${format(start, "yyyy/MM/dd")} ~ ${format(end, "yyyy/MM/dd")})`,
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
      link.download = `營運分析_${getTimeRangeLabel(timeRange)}_${format(new Date(), "yyyyMMdd")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setExporting(false);
    }
  };

  // Overview chart data
  const orderStatusData = [
    { name: '待確認', value: totals.pendingOrders, color: STATUS_COLORS.pending },
    { name: '已確認', value: totals.confirmedOrders, color: STATUS_COLORS.confirmed },
    { name: '入住中', value: totals.checkedInOrders, color: STATUS_COLORS.checked_in },
    { name: '已退房', value: totals.checkedOutOrders, color: STATUS_COLORS.checked_out },
    { name: '已取消', value: totals.cancelledOrders, color: STATUS_COLORS.cancelled },
  ].filter(item => item.value > 0);

  const accommodationRevenueData = performanceData
    .map((d, index) => ({
      name: d.name,
      fullName: d.name,
      營收: d.revenue,
      color: COLORS[index % COLORS.length],
    }))
    .sort((a, b) => b.營收 - a.營收);

  if (loading) {
    return <HQOverviewSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* ==================== 即時概況區塊 ==================== */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">即時概況</h2>
            <p className="text-sm text-muted-foreground">即時訂單與營收數據</p>
          </div>
        </div>

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
                  <p className="text-2xl font-bold">{filteredAccommodations.length}</p>
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
      </section>

      {/* ==================== 營運分析區塊 ==================== */}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">營運分析</h2>
              <p className="text-sm text-muted-foreground">
                {getTimeRangeLabel(timeRange)}業績總覽與民宿對比
                {timeRange !== "all" && ` (與${getPreviousLabel(timeRange)}同期比較)`}
              </p>
            </div>
          </div>
        </div>

        {performanceLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  {timeRange !== "all" && <GrowthIndicator value={performanceTotals.revenueChange} />}
                </div>
                <p className="text-sm text-muted-foreground">總營收</p>
                <p className="text-xl font-bold">{formatCurrency(performanceTotals.totalRevenue)}</p>
                {timeRange !== "all" && performanceTotals.prevRevenue > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {getPreviousLabel(timeRange)}: {formatCurrency(performanceTotals.prevRevenue)}
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
                  {timeRange !== "all" && <GrowthIndicator value={performanceTotals.ordersChange} />}
                </div>
                <p className="text-sm text-muted-foreground">訂單數</p>
                <p className="text-xl font-bold">{performanceTotals.totalOrders}</p>
                {timeRange !== "all" && performanceTotals.prevOrders > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {getPreviousLabel(timeRange)}: {performanceTotals.prevOrders} 筆
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
                  {timeRange !== "all" && <GrowthIndicator value={performanceTotals.avgOrderValueChange} />}
                </div>
                <p className="text-sm text-muted-foreground">平均客單價</p>
                <p className="text-xl font-bold">{formatCurrency(performanceTotals.avgOrderValue)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Percent className="h-5 w-5 text-amber-500" />
                  </div>
                  {timeRange !== "all" && <GrowthIndicator value={performanceTotals.occupancyChange} />}
                </div>
                <p className="text-sm text-muted-foreground">平均入住率</p>
                <p className="text-xl font-bold">{performanceTotals.avgOccupancy}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Calendar className="h-5 w-5 text-orange-500" />
                  </div>
                  {timeRange !== "all" && <GrowthIndicator value={performanceTotals.roomNightsChange} />}
                </div>
                <p className="text-sm text-muted-foreground">總房晚數</p>
                <p className="text-xl font-bold">{performanceTotals.totalRoomNights}</p>
                {timeRange !== "all" && performanceTotals.prevRoomNights > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {getPreviousLabel(timeRange)}: {performanceTotals.prevRoomNights} 晚
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      {/* ==================== 趨勢圖表區塊 ==================== */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">趨勢分析</h2>
            <p className="text-sm text-muted-foreground">營收與訂單歷史數據比較</p>
          </div>
        </div>

        {/* Monthly Revenue Trend */}
        <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">營收趨勢</CardTitle>
                  <CardDescription>近12個月營收變化（含去年同期比較）</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(203, 78%, 43%)' }} />
                    <span className="text-muted-foreground">今年</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: 'hsl(203, 78%, 43%, 0.3)' }} />
                    <span className="text-muted-foreground">去年同期</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {monthlyTrends.some(d => d.revenue > 0 || d.prevRevenue > 0) ? (
                <ResponsiveContainer width="100%" height={280}>
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
                      formatter={(value: number, name: string) => [
                        formatCurrency(value), 
                        name === 'revenue' ? '今年營收' : '去年同期'
                      ]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Bar 
                      dataKey="prevRevenue" 
                      fill="hsl(203, 78%, 43%, 0.3)" 
                      radius={[4, 4, 0, 0]}
                      maxBarSize={35}
                      name="去年同期"
                    />
                    <Bar 
                      dataKey="revenue" 
                      fill="hsl(203, 78%, 43%)" 
                      radius={[4, 4, 0, 0]}
                      maxBarSize={35}
                      name="今年營收"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                  <p className="text-sm">暫無營收數據</p>
                </div>
              )}
            </CardContent>
          </Card>

        {/* Monthly Orders Trend */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">訂單數趨勢</CardTitle>
                <CardDescription>近12個月訂單數量變化（含去年同期比較）</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'hsl(25, 90%, 60%)' }} />
                  <span className="text-muted-foreground">今年</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-0.5 rounded" style={{ backgroundColor: 'hsl(25, 90%, 60%, 0.4)' }} />
                  <span className="text-muted-foreground">去年同期</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {monthlyTrends.some(d => d.orders > 0 || d.prevOrders > 0) ? (
              <ResponsiveContainer width="100%" height={240}>
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
                    formatter={(value: number, name: string) => [
                      value, 
                      name === 'orders' ? '今年訂單' : '去年同期'
                    ]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="prevOrders" 
                    stroke="hsl(25, 90%, 60%, 0.4)" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'hsl(var(--background))', stroke: 'hsl(25, 90%, 60%, 0.4)', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: 'hsl(25, 90%, 60%, 0.4)' }}
                    name="去年同期"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="orders" 
                    stroke="hsl(25, 90%, 60%)" 
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--background))', stroke: 'hsl(25, 90%, 60%)', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'hsl(25, 90%, 60%)' }}
                    name="今年訂單"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[240px] text-muted-foreground">
                <p className="text-sm">暫無訂單數據</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accommodation Revenue Comparison */}
        {performanceData.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">各民宿營收比較</CardTitle>
                  <CardDescription>{getTimeRangeLabel(timeRange)}各民宿營收排行</CardDescription>
                </div>
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, performanceData.length * 50)}>
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
                    width={100}
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
                    dataKey="營收" 
                    radius={[0, 4, 4, 0]}
                    maxBarSize={30}
                    label={{
                      position: 'right',
                      formatter: (value: number) => formatShortCurrency(value),
                      fontSize: 11,
                      fill: 'hsl(var(--muted-foreground))',
                    }}
                    minPointSize={3}
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
      </section>
    </div>
  );
});
