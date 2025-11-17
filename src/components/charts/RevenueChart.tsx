import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface RevenueChartProps {
  data: Array<{
    month: string;
    今年?: number;
    去年?: number;
    本月?: number;
    上月?: number;
    本期?: number;
  }>;
  comparisonMode: 'lastYear' | 'lastMonth';
  isCustomRange?: boolean;
}

export const RevenueChart = ({ data, comparisonMode, isCustomRange }: RevenueChartProps) => {
  const [selectedData, setSelectedData] = useState<any>(null);
  
  // 根據比較模式決定顯示的資料欄位
  const categories = isCustomRange 
    ? ['本期']
    : comparisonMode === 'lastYear' 
      ? ['今年', '去年'] 
      : ['本月', '上月'];

  // 檢查是否有實際數據
  const hasRealData = data.some(d => 
    categories.some(cat => (d[cat as keyof typeof d] as number || 0) > 0)
  );

  // 數值格式化函數 - 優化顯示
  const valueFormatter = (value: number) => {
    if (!Number.isFinite(value) || value === 0) return 'NT$ 0';
    // 簡化大數字顯示，提高可讀性
    if (value >= 1000000) {
      return `NT$ ${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 100000) {
      return `NT$ ${(value / 10000).toFixed(1)}萬`;
    }
    if (value >= 10000) {
      return `NT$ ${Math.round(value / 10000)}萬`;
    }
    return `NT$ ${value.toLocaleString('zh-TW')}`;
  };

  // Y軸格式化 - 更簡潔
  const yAxisFormatter = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 100000) return `${(value / 10000).toFixed(0)}萬`;
    if (value >= 10000) return `${Math.round(value / 10000)}萬`;
    return value.toLocaleString('zh-TW');
  };

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無營收數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = isCustomRange ? {
    本期: {
      label: "本期",
      color: "hsl(var(--chart-revenue-primary))",
    },
  } : comparisonMode === 'lastYear' ? {
    今年: {
      label: "今年",
      color: "hsl(var(--chart-revenue-primary))",
    },
    去年: {
      label: "去年",
      color: "hsl(var(--chart-revenue-secondary))",
    },
  } : {
    本月: {
      label: "本月",
      color: "hsl(var(--chart-revenue-primary))",
    },
    上月: {
      label: "上月",
      color: "hsl(var(--chart-revenue-secondary))",
    },
  };

  const handleBarClick = (data: any) => {
    setSelectedData(data);
  };

  return (
    <>
      <div className="animate-fade-in px-1 py-2 sm:px-2 sm:py-4" key={`revenue-chart-${comparisonMode}`}>
        <ChartContainer config={chartConfig} className="h-[240px] sm:h-[280px] md:h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              margin={{ 
                top: 10, 
                right: 15, 
                left: 0, 
                bottom: 10 
              }}
              barGap={4}
              barCategoryGap="20%"
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                className="stroke-muted/50" 
                vertical={false}
              />
              <XAxis 
                dataKey="month" 
                className="text-[10px] sm:text-xs"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                height={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                width={55}
                tickFormatter={yAxisFormatter}
                className="text-[10px] sm:text-xs"
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip 
                content={<ChartTooltipContent className="rounded-lg shadow-lg" />}
                formatter={(value: number) => [valueFormatter(value)]}
                cursor={{ fill: 'hsl(var(--muted)/0.3)', radius: 4 }}
              />
              {!isCustomRange && (
                <ChartLegend 
                  content={<ChartLegendContent className="flex-wrap justify-center gap-3" />}
                  wrapperStyle={{ paddingTop: '10px' }}
                />
              )}
              {categories.map((category, index) => (
                <Bar
                  key={category}
                  dataKey={category}
                  fill={index === 0 ? "hsl(var(--chart-revenue-primary))" : "hsl(var(--chart-revenue-secondary))"}
                  radius={[8, 8, 0, 0]}
                  animationDuration={1000}
                  animationBegin={index * 100}
                  isAnimationActive={true}
                  animationEasing="ease-in-out"
                  onClick={handleBarClick}
                  cursor="pointer"
                  maxBarSize={60}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">營收詳情</DialogTitle>
          </DialogHeader>
          {selectedData && (
            <div className="space-y-6">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground mb-1">月份</p>
                <p className="text-2xl font-bold">{selectedData.month}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isCustomRange ? (
                  <div className="col-span-full rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground mb-2">本期營收</p>
                    <p className="text-2xl font-bold text-primary">
                      {valueFormatter(selectedData.本期 || 0)}
                    </p>
                  </div>
                ) : comparisonMode === 'lastYear' ? (
                  <>
                    <div className="rounded-lg border p-4 bg-primary/5">
                      <p className="text-sm text-muted-foreground mb-2">今年營收</p>
                      <p className="text-xl font-bold text-primary">
                        {valueFormatter(selectedData.今年 || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground mb-2">去年營收</p>
                      <p className="text-xl font-bold text-chart-revenue-secondary">
                        {valueFormatter(selectedData.去年 || 0)}
                      </p>
                    </div>
                    <div className="col-span-full rounded-lg border-2 border-dashed p-4">
                      <p className="text-sm text-muted-foreground mb-2">年度差異</p>
                      <div className="flex items-baseline gap-2">
                        {(() => {
                          const diff = (selectedData.今年 || 0) - (selectedData.去年 || 0);
                          const percentage = selectedData.去年 
                            ? ((diff / selectedData.去年) * 100).toFixed(1)
                            : '0';
                          return (
                            <>
                              <span className={`text-xl font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{valueFormatter(diff)}
                              </span>
                              <span className={`text-base font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ({diff >= 0 ? '+' : ''}{percentage}%)
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg border p-4 bg-primary/5">
                      <p className="text-sm text-muted-foreground mb-2">本月營收</p>
                      <p className="text-xl font-bold text-primary">
                        {valueFormatter(selectedData.本月 || 0)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-sm text-muted-foreground mb-2">上月營收</p>
                      <p className="text-xl font-bold text-chart-revenue-secondary">
                        {valueFormatter(selectedData.上月 || 0)}
                      </p>
                    </div>
                    <div className="col-span-full rounded-lg border-2 border-dashed p-4">
                      <p className="text-sm text-muted-foreground mb-2">月度差異</p>
                      <div className="flex items-baseline gap-2">
                        {(() => {
                          const diff = (selectedData.本月 || 0) - (selectedData.上月 || 0);
                          const percentage = selectedData.上月
                            ? ((diff / selectedData.上月) * 100).toFixed(1)
                            : '0';
                          return (
                            <>
                              <span className={`text-xl font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{valueFormatter(diff)}
                              </span>
                              <span className={`text-base font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ({diff >= 0 ? '+' : ''}{percentage}%)
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <div className="pt-4 border-t text-center">
                <p className="text-xs text-muted-foreground">
                  💡 點擊圖表柱狀圖可查看詳細營收資訊
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
