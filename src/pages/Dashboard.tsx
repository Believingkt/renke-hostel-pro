import { Hotel, Users, Calendar, DollarSign, Radio, Zap, X, BarChart3 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
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
import { OccupancyChart } from "@/components/charts/OccupancyChart";
import { PageHeader } from "@/components/PageHeader";

const Dashboard = () => {
  const { accommodationId } = useSubdomain();
  const isMobile = useIsMobile();
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [isGenerating, setIsGenerating] = useState(false);
  const [testDataCount, setTestDataCount] = useState(20);
  const [useLastYear, setUseLastYear] = useState(false);
  
  // 使用 React Query hook 獲取儀表板資料
  const { 
    data: dashboardData, 
    isLoading, 
    error, 
    refreshData 
  } = useDashboardData(accommodationId, 'lastYear', undefined);

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
      const requestBody: any = {
        accommodationId,
        count: testDataCount,
      };
      
      if (useLastYear) {
        requestBody.year = new Date().getFullYear() - 1;
      }
      
      const { data, error } = await supabase.functions.invoke('generate-test-orders', {
        body: requestBody,
      });

      if (error) throw error;

      toast.success(data.message || '成功生成測試數據');
      refreshData();
    } catch (error) {
      console.error('Error generating test data:', error);
      toast.error('生成測試數據失敗');
    } finally {
      setIsGenerating(false);
    }
  };

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

  const { stats, revenueData = [], bookingData = [], occupancyData = [] } = dashboardData;

  // 檢查是否完全沒有數據（真正的空狀態）
  const isEmptyState = stats.totalRooms === 0 && 
                       stats.monthlyBookings === 0 && 
                       stats.totalGuests === 0 && 
                       stats.monthlyRevenue === 0;

  // 如果是空狀態，顯示引導頁面
  if (isEmptyState) {
    return <EmptyDashboard onGenerateData={handleGenerateTestData} />;
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
  
  const safeOccupancyData = occupancyData || [];
  
  // 从数据中提取所有房型名称（排除 'month' 字段）
  const roomTypes = safeOccupancyData.length > 0 
    ? Object.keys(safeOccupancyData[0]).filter(key => key !== 'month')
    : [];

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
  const finalOccupancyData = safeOccupancyData.length > 0 ? safeOccupancyData : [{ month: '暫無數據' }];

  const dashboardContent = (
    <div className="space-y-6 md:space-y-8">
      <PageHeader
        title="營運分析"
        icon={BarChart3}
        action={
          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
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
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useLastYear"
                    checked={useLastYear}
                    onChange={(e) => setUseLastYear(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="useLastYear" className="text-sm font-normal cursor-pointer">
                    生成去年（{new Date().getFullYear() - 1}）的資料
                  </Label>
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

      <div className="grid gap-6 md:grid-cols-2 px-2 md:px-0">
        {isLoading ? (
          <>
            <ChartSkeleton showLegend={false} />
            <ChartSkeleton />
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      房型入住率
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">今年每月趨勢</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Hotel className="h-4 w-4 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <OccupancyChart data={finalOccupancyData} roomTypes={roomTypes} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      訂單趨勢
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-medium">年度對比</p>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                    <Calendar className="h-4 w-4 text-accent" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <BookingTrendsChart 
                  key="booking-lastYear-standard"
                  data={finalBookingData}
                  comparisonMode="lastYear"
                  isCustomRange={false}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {isLoading ? (
        <ChartSkeleton />
      ) : (
        <Card className="px-2 md:px-0">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  營收統計
                </CardTitle>
                <p className="text-sm text-muted-foreground font-medium">年度對比</p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                <DollarSign className="h-4 w-4 text-green-600" />
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
