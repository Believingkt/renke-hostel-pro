import { Hotel, Users, Calendar, DollarSign, Radio, X, BarChart3, Home, ChevronLeft, ChevronRight } from "lucide-react";
import { OccupancyRevenueTable } from "@/components/charts/OccupancyRevenueTable";
import { Link } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { ChartSkeleton } from "@/components/skeletons/ChartSkeleton";
import { StatCardSkeleton } from "@/components/skeletons/StatCardSkeleton";
import { EmptyDashboard } from "@/components/EmptyDashboard";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import PullToRefresh from "react-simple-pull-to-refresh";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { BookingTrendsChart } from "@/components/charts/BookingTrendsChart";
import { MonthlyOccupancyRateChart } from "@/components/charts/MonthlyOccupancyRateChart";
import { MonthlyAveragePriceChart } from "@/components/charts/MonthlyAveragePriceChart";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type ChartKey = 'trends' | 'revenue' | 'occupancy' | 'avgPrice';
const CHART_LABELS: Record<ChartKey, string> = {
  trends: '接單 & 住宿趨勢',
  revenue: '營收統計',
  occupancy: '住房率',
  avgPrice: '平均房價',
};
const VISIBILITY_KEY = 'dashboard-chart-visibility';

const Dashboard = () => {
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const isMobile = useIsMobile();
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [chartVisibility, setChartVisibility] = useState<Record<ChartKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem(VISIBILITY_KEY);
      if (raw) return { trends: true, revenue: true, occupancy: true, avgPrice: true, ...JSON.parse(raw) };
    } catch {}
    return { trends: true, revenue: true, occupancy: true, avgPrice: true };
  });

  const toggleChart = (key: ChartKey) => {
    setChartVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  
  // 使用 React Query hook 獲取儀表板資料
  const { 
    data: dashboardData, 
    isLoading, 
    error, 
    refreshData 
  } = useDashboardData(accommodationId, 'lastYear', undefined, selectedYear);

  useEffect(() => {
    if (!accommodationId) return;

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
          setIsLiveUpdating(true);
          setLastUpdateTime(new Date());
          
          if (payload.eventType === 'INSERT') {
            toast.success('新訂單已加入', {
              description: '儀表板數據已自動更新'
            });
          } else if (payload.eventType === 'UPDATE') {
            toast.info('訂單已更新', {
              description: '儀表板數據已自動更新'
            });
          }
          
          refreshData();
          setTimeout(() => setIsLiveUpdating(false), 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId, refreshData]);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <ErrorState
        title="無法載入儀表板"
        message={error instanceof Error ? error.message : "載入數據時發生錯誤"}
        onRetry={() => refreshData()}
      />
    );
  }

  if (!dashboardData) {
    return <DashboardSkeleton />;
  }

  const { 
    stats, 
    revenueData = [], 
    bookingData = [], 
    occupancyData = [],
    monthlyOccupancyRate = [],
    monthlyAveragePrice = []
  } = dashboardData;

  // 檢查是否完全沒有數據（真正的空狀態）
  const isEmptyState = stats.totalRooms === 0 && 
                       stats.monthlyBookings === 0 && 
                       stats.totalGuests === 0 && 
                       stats.monthlyRevenue === 0;

  // 如果是空狀態，顯示引導頁面
  if (isEmptyState) {
    return <EmptyDashboard />;
  }

  // Sanitize all chart data to prevent NaN values - only include properties that are actually numbers
  const safeRevenueData = (revenueData || []).map(item => {
    const sanitized: any = { 
      month: item.month || '',
      今年: 0,
      去年: 0,
      本月: 0,
      上月: 0,
      本期: 0
    };
    // Only override with actual values if they exist and are finite
    if (item.今年 !== undefined) sanitized.今年 = Number.isFinite(Number(item.今年)) ? Number(item.今年) : 0;
    if (item.去年 !== undefined) sanitized.去年 = Number.isFinite(Number(item.去年)) ? Number(item.去年) : 0;
    if (item.本月 !== undefined) sanitized.本月 = Number.isFinite(Number(item.本月)) ? Number(item.本月) : 0;
    if (item.上月 !== undefined) sanitized.上月 = Number.isFinite(Number(item.上月)) ? Number(item.上月) : 0;
    if (item.本期 !== undefined) sanitized.本期 = Number.isFinite(Number(item.本期)) ? Number(item.本期) : 0;
    return sanitized;
  });
  
  const safeBookingData = (bookingData || []).map(item => {
    const sanitized: any = { 
      month: item.month || '',
      今年: 0,
      去年: 0,
      本月: 0,
      上月: 0,
      本期: 0
    };
    // Only override with actual values if they exist and are finite
    if (item.今年 !== undefined) sanitized.今年 = Number.isFinite(Number(item.今年)) ? Number(item.今年) : 0;
    if (item.去年 !== undefined) sanitized.去年 = Number.isFinite(Number(item.去年)) ? Number(item.去年) : 0;
    if (item.本月 !== undefined) sanitized.本月 = Number.isFinite(Number(item.本月)) ? Number(item.本月) : 0;
    if (item.上月 !== undefined) sanitized.上月 = Number.isFinite(Number(item.上月)) ? Number(item.上月) : 0;
    if (item.本期 !== undefined) sanitized.本期 = Number.isFinite(Number(item.本期)) ? Number(item.本期) : 0;
    return sanitized;
  });
  
  const handleRefresh = async () => {
    await refreshData();
    toast.success('數據已更新', {
      description: '已載入最新資料'
    });
  };
  
  // 檢查是否有數據，如果沒有則提供最小有效數據集
  const hasData = safeRevenueData.length > 0 && (
    safeRevenueData.some(d => (d['今年'] || d['本月'] || d['本期'] || 0) > 0) ||
    safeRevenueData.some(d => (d['去年'] || d['上月'] || 0) > 0)
  );
  
  // Ensure we always have at least one valid data point for charts with ALL keys initialized
  const finalRevenueData = safeRevenueData.length > 0 ? safeRevenueData : [{ 
    month: format(new Date(), 'M月'), 
    今年: 0, 
    去年: 0, 
    本月: 0, 
    上月: 0, 
    本期: 0 
  }];
  const finalBookingData = safeBookingData.length > 0 ? safeBookingData : [{ 
    month: format(new Date(), 'M月'), 
    今年: 0, 
    去年: 0, 
    本月: 0, 
    上月: 0, 
    本期: 0 
  }];

  const dashboardContent = (
    <div className="space-y-6 md:space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>營運分析</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="營運分析"
        icon={BarChart3}
        action={
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            {/* Year Switcher */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedYear(y => y - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-sm min-w-[52px] text-center">{selectedYear}年</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={selectedYear >= currentYear}
                onClick={() => setSelectedYear(y => y + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge
              variant={isLiveUpdating ? "default" : "secondary"} 
              className={`transition-all touch-manipulation select-none h-8 px-3 ${isLiveUpdating ? 'animate-pulse' : ''}`}
            >
              <Radio className={`w-3 h-3 mr-1 ${isLiveUpdating ? 'animate-spin' : ''}`} />
              {isLiveUpdating ? '更新中...' : '即時監控'}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              最後更新: {format(lastUpdateTime, 'HH:mm:ss')}
            </span>
          </div>
        }
      />

      {/* 統計卡片 */}
      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-4 px-2 md:px-0">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title="總房間數"
              value={stats.totalRooms.toString()}
              change="+0%"
              icon={Hotel}
              variant="coral"
              isUpdating={isLiveUpdating}
            />
            <StatCard
              title="本月訂單"
              value={stats.monthlyBookings.toString()}
              change={stats.bookingsChange}
              icon={Calendar}
              variant="purple"
              isUpdating={isLiveUpdating}
            />
            <StatCard
              title="總入住人數"
              value={stats.totalGuests.toString()}
              change={stats.guestsChange}
              icon={Users}
              variant="blue"
              isUpdating={isLiveUpdating}
            />
            <StatCard
              title="本月營收"
              value={`NT$ ${stats.monthlyRevenue.toLocaleString()}`}
              change={stats.revenueChange}
              icon={DollarSign}
              variant="cyan"
              isUpdating={isLiveUpdating}
            />
          </>
        )}
      </div>

      {/* 圖表顯示切換 */}
      {!isLoading && (
        <div className="flex flex-wrap items-center gap-2 px-2 md:px-0">
          <span className="text-xs text-muted-foreground mr-1">顯示圖表：</span>
          {(Object.keys(CHART_LABELS) as ChartKey[]).map((key) => {
            const active = chartVisibility[key];
            return (
              <Button
                key={key}
                variant={active ? "secondary" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => toggleChart(key)}
              >
                {CHART_LABELS[key]}
              </Button>
            );
          })}
        </div>
      )}

      {/* 圖表區域 - 手機垂直堆疊，平板以上 2x2 排列 */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2 px-2 md:px-0">
        {isLoading ? (
          <>
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </>
        ) : (
          <>
            {/* 接單 & 住宿趨勢 */}
            {chartVisibility.trends && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      接單 & 住宿趨勢
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">
                      接單以成交日期、住宿以入住日期計算，並疊加當月營收
                    </p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <BookingTrendsChart 
                  data={dashboardData?.bookingTrendsData || []}
                  baselineSource={dashboardData?.bookingTrendsBaselineSource || 'none'}
                  showRevenue
                />
              </CardContent>
            </Card>
            )}

            {/* 營收統計 */}
            {chartVisibility.revenue && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      營收統計
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">每月總營收金額</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <RevenueChart 
                  key="revenue-lastYear-standard"
                  data={finalRevenueData}
                  comparisonMode="lastYear"
                  isCustomRange={false}
                />
              </CardContent>
            </Card>
            )}

            {/* 住房率 */}
            {chartVisibility.occupancy && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      住房率
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">每月入住率統計，可疊加當月營收</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Hotel className="h-4 w-4 text-emerald-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MonthlyOccupancyRateChart data={monthlyOccupancyRate} />
              </CardContent>
            </Card>
            )}

            {/* 平均房價 */}
            {chartVisibility.avgPrice && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      平均房價
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">訂單總金額 / 總訂單數</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                    <DollarSign className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <MonthlyAveragePriceChart data={monthlyAveragePrice} />
              </CardContent>
            </Card>
            )}
          </>
        )}
      </div>

      {/* 住房率與營業分析報表 */}
      <div className="px-2 md:px-0">
        <OccupancyRevenueTable accommodationId={accommodationId!} selectedYear={selectedYear} />
      </div>

    </div>
  );

  return (
    <PullToRefresh
      onRefresh={handleRefresh}
      pullingContent={
        <div className="flex justify-center py-4">
          <div className="text-sm text-muted-foreground">下拉刷新...</div>
        </div>
      }
      refreshingContent={
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-primary">
            <Radio className="w-4 h-4 animate-spin" />
            更新中...
          </div>
        </div>
      }
      pullDownThreshold={80}
      maxPullDownDistance={120}
      resistance={2}
    >
      {dashboardContent}
    </PullToRefresh>
  );
};

export default Dashboard;
