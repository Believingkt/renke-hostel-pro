import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalyticsData } from '@/hooks/use-analytics-data';
import { BarChart3, Users, Eye, Globe, RefreshCw, Calendar } from 'lucide-react';
import { format, subDays, startOfYear, endOfYear, min } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface AnalyticsDashboardProps {
  accommodationId: string;
}

type DateRange = '7' | '14' | '30' | 'year';

export const AnalyticsDashboard = ({ accommodationId }: AnalyticsDashboardProps) => {
  const currentYear = new Date().getFullYear();
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  
  const startDate = dateRange === 'year' 
    ? startOfYear(new Date(selectedYear, 0, 1))
    : subDays(new Date(), parseInt(dateRange));
  const endDate = dateRange === 'year'
    ? min([endOfYear(new Date(selectedYear, 0, 1)), new Date()])
    : new Date();
  
  const { data, isLoading, refetch, isFetching } = useAnalyticsData({
    accommodationId,
    startDate,
    endDate,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartData = data?.daily_views?.map((item) => ({
    date: format(new Date(item.date), 'MM/dd', { locale: zhTW }),
    瀏覽量: item.views,
    訪客數: item.visitors,
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-wrap justify-end items-center gap-2">
        {/* Year switcher */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => { setSelectedYear(y => y - 1); setDateRange('year'); }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={dateRange === 'year' ? 'secondary' : 'ghost'}
            size="sm"
            className="px-3 min-w-[60px]"
            onClick={() => setDateRange('year')}
          >
            {selectedYear}年
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            
            onClick={() => { setSelectedYear(y => y + 1); setDateRange('year'); }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Day range buttons */}
        <div className="flex bg-muted rounded-lg p-1">
          {(['7', '14', '30'] as DateRange[]).map((range) => (
            <Button
              key={range}
              variant={dateRange === range ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setDateRange(range)}
              className="px-3"
            >
              {range}天
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              總瀏覽量
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {data?.total_pageviews?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dateRange === 'year' ? `${selectedYear} 年` : `過去 ${dateRange} 天`}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              獨立訪客
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {data?.unique_visitors?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              依 Session 計算
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              每日趨勢
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="瀏覽量"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary)/0.2)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="訪客數"
                    stroke="hsl(var(--chart-2))"
                    fill="hsl(var(--chart-2)/0.2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Traffic sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              流量來源
            </CardTitle>
            <CardDescription>來源網站/UTM</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.top_referrers && data.top_referrers.length > 0 ? (
              <div className="space-y-3">
                {data.top_referrers.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm truncate max-w-[180px]" title={item.source}>
                      {item.source}
                    </span>
                    <span className="text-sm font-medium">{item.views}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚無資料</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              熱門頁面
            </CardTitle>
            <CardDescription>最多瀏覽的頁面</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.top_pages && data.top_pages.length > 0 ? (
              <div className="space-y-3">
                {data.top_pages.slice(0, 5).map((item, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm truncate max-w-[180px]" title={item.page_path}>
                      {item.page_path === '/' ? '首頁' : item.page_path}
                    </span>
                    <span className="text-sm font-medium">{item.views}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚無資料</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {(!data?.total_pageviews || data.total_pageviews === 0) && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">尚無流量資料</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              當訪客瀏覽您的網站時，流量資料將會自動記錄並顯示在這裡。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
