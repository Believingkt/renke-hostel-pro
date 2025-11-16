import { Hotel, Users, Calendar, DollarSign, Radio, Zap, X } from "lucide-react";
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
import { format, startOfMonth, endOfMonth } from "date-fns";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import PullToRefresh from "react-simple-pull-to-refresh";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DateRange } from "react-day-picker";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { BookingTrendsChart } from "@/components/charts/BookingTrendsChart";
import { OccupancyChart } from "@/components/charts/OccupancyChart";

const Dashboard = () => {
  const { accommodationId } = useSubdomain();
  const isMobile = useIsMobile();
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());
  const [comparisonMode, setComparisonMode] = useState<'lastYear' | 'lastMonth'>('lastYear');
  const [isGenerating, setIsGenerating] = useState(false);
  const [testDataCount, setTestDataCount] = useState(20);
  const [useLastYear, setUseLastYear] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  }));
  
  // 將 DateRange 轉換為 hook 需要的格式
  const customDateRange = dateRange?.from && dateRange?.to 
    ? { from: dateRange.from, to: dateRange.to }
    : undefined;
  
  // 響應式字體大小
  const chartFontSize = isMobile ? 10 : 12;
  const tooltipFontSize = isMobile ? 11 : 13;
  const legendFontSize = isMobile ? 10 : 12;
  
  // 響應式邊距
  const chartMargin = isMobile 
    ? { top: 5, right: 5, left: -10, bottom: 0 }
    : { top: 15, right: 20, left: 0, bottom: 5 };
  const occupancyChartMargin = isMobile
    ? { top: 5, right: 5, left: -10, bottom: 15 }
    : { top: 15, right: 20, left: 0, bottom: 25 };
  
  // 響應式高度
  const chartHeight = isMobile ? 250 : 320;
  
  // 使用 React Query hook 獲取儀表板資料
  const { 
    data: dashboardData, 
    isLoading, 
    error, 
    refreshData 
  } = useDashboardData(accommodationId, comparisonMode, customDateRange);

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
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      console.log('Cleaning up realtime subscription');
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
  
  const safeOccupancyData = (occupancyData || []).map(item => ({
    roomType: item.roomType || '未知',
    occupancyRate: Number.isFinite(Number(item.occupancyRate)) ? Math.min(100, Math.max(0, Number(item.occupancyRate))) : 0,
  }));

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
  const finalOccupancyData = safeOccupancyData.length > 0 ? safeOccupancyData : [{ roomType: '暫無數據', occupancyRate: 0 }];
  
  // Check if there's any real data (not all zeros)
  const hasRealRevenueData = finalRevenueData.some(d => 
    (d['今年'] || 0) > 0 || (d['去年'] || 0) > 0 || 
    (d['本月'] || 0) > 0 || (d['上月'] || 0) > 0 || 
    (d['本期'] || 0) > 0
  );
  const hasRealBookingData = finalBookingData.some(d => 
    (d['今年'] || 0) > 0 || (d['去年'] || 0) > 0 || 
    (d['本月'] || 0) > 0 || (d['上月'] || 0) > 0 || 
    (d['本期'] || 0) > 0
  );
  
  // Calculate max values for domains
  const maxRevenue = Math.max(
    0, // Add 0 as minimum baseline
    ...finalRevenueData.flatMap(d => [
      d['今年'] || 0,
      d['去年'] || 0,
      d['本月'] || 0,
      d['上月'] || 0,
      d['本期'] || 0
    ].filter(v => Number.isFinite(v) && v > 0))
  );
  const maxBookings = Math.max(
    0, // Add 0 as minimum baseline
    ...finalBookingData.flatMap(d => [
      d['今年'] || 0,
      d['去年'] || 0,
      d['本月'] || 0,
      d['上月'] || 0,
      d['本期'] || 0
    ].filter(v => Number.isFinite(v) && v > 0))
  );
  
  // Set safe domain values - ensure they're always valid positive numbers
  const revenueDomain = (Number.isFinite(maxRevenue) && maxRevenue > 0) ? Math.ceil(maxRevenue * 1.2) : 10000;
  const bookingDomain = (Number.isFinite(maxBookings) && maxBookings > 0) ? Math.ceil(maxBookings * 1.2) : 50;
  
  // Extra validation - ensure domains are truly safe integers
  const safeRevenueDomain = Number.isFinite(revenueDomain) && revenueDomain > 0 ? Math.floor(revenueDomain) : 10000;
  const safeBookingDomain = Number.isFinite(bookingDomain) && bookingDomain > 0 ? Math.floor(bookingDomain) : 50;
  
  // Validate that domains are safe for recharts AND there's real data
  const isRevenueChartSafe = hasRealRevenueData && Number.isFinite(safeRevenueDomain) && safeRevenueDomain > 0;
  const isBookingChartSafe = hasRealBookingData && Number.isFinite(safeBookingDomain) && safeBookingDomain > 0;
  
  // Debug: Log the final data being passed to charts
  console.log('Final chart data:', {
    revenueData: finalRevenueData,
    bookingData: finalBookingData,
    occupancyData: finalOccupancyData,
    maxRevenue,
    maxBookings,
    revenueDomain,
    bookingDomain,
    safeRevenueDomain,
    safeBookingDomain,
    isRevenueChartSafe,
    isBookingChartSafe,
    revenueDataKeys: finalRevenueData.length > 0 ? Object.keys(finalRevenueData[0]) : [],
    bookingDataKeys: finalBookingData.length > 0 ? Object.keys(finalBookingData[0]) : [],
  });

  const dashboardContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="px-2 md:px-0 flex items-start md:items-center justify-between flex-col md:flex-row gap-3">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">營運分析</h1>
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          <DateRangePicker 
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            className="flex-1 md:flex-initial"
          />
          {dateRange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateRange({
                from: startOfMonth(new Date()),
                to: endOfMonth(new Date())
              })}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              本月
            </Button>
          )}
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
      </div>

      {!hasData && dateRange && (
        <Card className="mx-2 md:mx-0 p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">所選日期範圍內沒有數據</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {dateRange.from && dateRange.to && (
                  <>
                    {format(dateRange.from, 'yyyy年MM月dd日')} 至 {format(dateRange.to, 'yyyy年MM月dd日')} 期間沒有訂單記錄
                  </>
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDateRange(undefined)}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              清除日期篩選
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 px-2 md:px-0">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">營收統計</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <RevenueChart 
              data={finalRevenueData}
              comparisonMode={comparisonMode}
              isCustomRange={!!customDateRange}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">訂單趨勢</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <BookingTrendsChart 
              data={finalBookingData}
              comparisonMode={comparisonMode}
              isCustomRange={!!customDateRange}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden px-2 md:px-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">房型入住率 (過去 30 天)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <OccupancyChart data={finalOccupancyData} />
        </CardContent>
      </Card>

      {/* Charts temporarily disabled due to recharts NaN error with zero data
      <div className="grid gap-6 md:grid-cols-2 px-2 md:px-0">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">營收統計</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isRevenueChartSafe ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={finalRevenueData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: chartFontSize, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  tick={{ fontSize: chartFontSize, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  tickFormatter={(value) => {
                    if (typeof value !== 'number' || !Number.isFinite(value)) return '0';
                    return value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toString();
                  }}
                  domain={[0, Number(safeRevenueDomain)]}
                  type="number"
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: `${tooltipFontSize}px`,
                    padding: isMobile ? '12px' : '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                  cursor={{ fill: 'hsl(var(--accent) / 0.1)' }}
                  wrapperStyle={{ outline: 'none' }}
                  formatter={(value: number) => [`NT$ ${value.toLocaleString()}`, '']}
                  allowEscapeViewBox={{ x: true, y: true }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: `${legendFontSize}px`, paddingTop: isMobile ? '8px' : '12px' }}
                  iconType="rect"
                />
                <Bar 
                  dataKey={dateRange ? "本期" : (comparisonMode === 'lastYear' ? "今年" : "本月")} 
                  fill="hsl(var(--chart-1))" 
                  radius={[8, 8, 0, 0]}
                  maxBarSize={isMobile ? 40 : 60}
                  minPointSize={5}
                  isAnimationActive={false}
                />
                {!dateRange && (
                  <Bar 
                    dataKey={comparisonMode === 'lastYear' ? "去年" : "上月"} 
                    fill="hsl(var(--chart-2))" 
                    radius={[8, 8, 0, 0]}
                    maxBarSize={isMobile ? 40 : 60}
                    minPointSize={5}
                    isAnimationActive={false}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <p className="text-sm">暫無營收數據</p>
                  <p className="text-xs mt-1">請新增訂單後查看統計</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">訂單趨勢</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isBookingChartSafe ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={finalBookingData} margin={chartMargin}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: chartFontSize, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                />
                <YAxis 
                  tick={{ fontSize: chartFontSize, fill: 'hsl(var(--muted-foreground))' }}
                  stroke="hsl(var(--border))"
                  domain={[0, Number(safeBookingDomain)]}
                  type="number"
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    fontSize: `${tooltipFontSize}px`,
                    padding: isMobile ? '12px' : '10px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                  }}
                  cursor={{ stroke: 'hsl(var(--accent))', strokeWidth: 2, strokeDasharray: '5 5' }}
                  wrapperStyle={{ outline: 'none' }}
                  formatter={(value: number) => [`${value} 筆訂單`, '']}
                  allowEscapeViewBox={{ x: true, y: true }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: `${legendFontSize}px`, paddingTop: isMobile ? '8px' : '12px' }}
                  iconType="circle"
                />
                <Line 
                  type="monotone" 
                  dataKey={dateRange ? "本期" : (comparisonMode === 'lastYear' ? "今年" : "本月")} 
                  stroke="hsl(var(--chart-3))" 
                  strokeWidth={isMobile ? 3 : 2}
                  dot={{ r: isMobile ? 5 : 4, fill: 'hsl(var(--chart-3))', strokeWidth: 2 }}
                  activeDot={{ r: isMobile ? 8 : 6, strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {!dateRange && (
                  <Line 
                    type="monotone" 
                    dataKey={comparisonMode === 'lastYear' ? "去年" : "上月"} 
                    stroke="hsl(var(--chart-4))" 
                    strokeWidth={isMobile ? 3 : 2}
                    dot={{ r: isMobile ? 5 : 4, fill: 'hsl(var(--chart-4))', strokeWidth: 2 }}
                    activeDot={{ r: isMobile ? 8 : 6, strokeWidth: 2 }}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <p className="text-sm">暫無訂單數據</p>
                  <p className="text-xs mt-1">請新增訂單後查看統計</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden px-2 md:px-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">房型入住率 (過去 30 天)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center h-[250px] text-muted-foreground">
            <div className="text-center">
              <p className="text-sm">暫無入住數據</p>
              <p className="text-xs mt-1">請新增訂單後查看統計</p>
            </div>
          </div>
        </CardContent>
      </Card>
      */}
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
