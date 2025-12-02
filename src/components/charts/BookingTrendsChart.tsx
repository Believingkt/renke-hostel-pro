import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomChartTooltip } from "./CustomChartTooltip";

interface BookingTrendsChartProps {
  data: Array<{
    month: string;
    今年?: number;
    去年?: number;
    本月?: number;
    上月?: number;
    本期?: number;
    isFuture?: boolean;
  }>;
  comparisonMode: 'lastYear' | 'lastMonth';
  isCustomRange?: boolean;
}

export const BookingTrendsChart = ({ data, comparisonMode, isCustomRange }: BookingTrendsChartProps) => {
  const [selectedData, setSelectedData] = useState<any>(null);
  
  // 根據比較模式決定顯示的資料欄位
  const categories = isCustomRange 
    ? ['本期']
    : comparisonMode === 'lastYear' 
      ? ['去年', '今年'] 
      : ['本月', '上月'];

  // 檢查是否有實際數據
  const hasRealData = data.some(d => 
    categories.some(cat => (d[cat as keyof typeof d] as number || 0) > 0)
  );

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無訂單數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = isCustomRange ? {
    本期: {
      label: "本期",
      color: "hsl(var(--chart-booking-primary))",
    },
  } : comparisonMode === 'lastYear' ? {
    去年: {
      label: "去年",
      color: "hsl(0, 0%, 60%)",
    },
    今年: {
      label: "今年",
      color: "hsl(25, 90%, 60%)",
    },
  } : {
    上月: {
      label: "上月",
      color: "hsl(var(--chart-booking-secondary))",
    },
    本月: {
      label: "本月",
      color: "hsl(var(--chart-booking-primary))",
    },
  };

  const handleDotClick = (data: any) => {
    setSelectedData(data);
  };

  return (
    <>
      <div key={`booking-chart-${comparisonMode}`}>
        <ChartContainer config={chartConfig} className="h-[180px] sm:h-[220px] md:h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={data} 
              margin={{ 
                top: 5, 
                right: 10, 
                left: -5, 
                bottom: 5 
              }}
            >
              <defs>
                {categories.map((category, index) => {
                  const color = index === 0 ? "hsl(0, 0%, 60%)" : "hsl(25, 90%, 60%)";
                  return (
                    <linearGradient key={`gradient-${category}`} id={`gradient-${category}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={color} stopOpacity={0}/>
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                className="stroke-muted/50" 
                vertical={false}
              />
              <XAxis 
                dataKey="month" 
                className="text-[9px] sm:text-[10px]"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                height={30}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                width={40}
                tickFormatter={(value) => `${value}`}
                className="text-[9px] sm:text-[10px]"
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip 
                content={
                  <CustomChartTooltip 
                    valueFormatter={(value: number) => `${value} 筆`}
                    comparisonMode={comparisonMode}
                    isCustomRange={isCustomRange}
                  />
                }
                cursor={{ 
                  stroke: 'hsl(var(--muted))', 
                  strokeWidth: 1,
                  strokeDasharray: '3 3'
                }}
                animationDuration={200}
                animationEasing="ease-out"
              />
              {!isCustomRange && <ChartLegend content={<ChartLegendContent />} />}
              {categories.map((category, index) => (
                <Line
                  key={category}
                  type="monotone"
                  dataKey={category}
                  stroke={index === 0 ? "hsl(0, 0%, 60%)" : "hsl(25, 90%, 60%)"}
                  strokeWidth={2}
                  fill={`url(#gradient-${category})`}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="hsl(var(--background))"
                      stroke={index === 0 ? "hsl(0, 0%, 60%)" : "hsl(25, 90%, 60%)"}
                      strokeWidth={2}
                      opacity={payload.isFuture ? 0.3 : 1}
                      style={{ cursor: 'pointer', touchAction: 'none' }}
                      className="hover:scale-125 transition-transform duration-200"
                      onClick={() => handleDotClick(payload)}
                    />
                    );
                  }}
                  activeDot={(props: any) => {
                    const { cx, cy, payload } = props;
                    return (
                      <g>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={13}
                          fill={index === 0 ? "hsl(var(--chart-booking-secondary))" : "hsl(var(--chart-booking-primary))"}
                          opacity={0.1}
                          className="animate-scale-in"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={9}
                          fill="hsl(var(--background))"
                          stroke={index === 0 ? "hsl(0, 0%, 60%)" : "hsl(25, 90%, 60%)"}
                          strokeWidth={2}
                          opacity={payload.isFuture ? 0.3 : 1}
                          style={{ cursor: 'pointer', touchAction: 'none' }}
                          onClick={() => handleDotClick(payload)}
                          className="animate-scale-in"
                        />
                      </g>
                    );
                  }}
                  connectNulls
                  animationDuration={2000}
                  animationBegin={0}
                  isAnimationActive={true}
                  animationEasing="ease-in-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>


      <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>訂單詳情</DialogTitle>
          </DialogHeader>
          {selectedData && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">月份</p>
                <p className="text-lg font-semibold">{selectedData.month}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {categories.map((category) => (
                  <div key={category}>
                    <p className="text-sm text-muted-foreground">{category}</p>
                    <p className="text-lg font-semibold">
                      {selectedData[category] || 0} 筆
                    </p>
                  </div>
                ))}
              </div>
              {!isCustomRange && categories.length === 2 && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">差異</p>
                  <p className={`text-lg font-semibold ${
                    (selectedData[categories[0]] || 0) >= (selectedData[categories[1]] || 0) 
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {((selectedData[categories[0]] || 0) - (selectedData[categories[1]] || 0)) >= 0 ? '+' : ''}
                    {(selectedData[categories[0]] || 0) - (selectedData[categories[1]] || 0)} 筆
                    {selectedData[categories[1]] > 0 && 
                      ` (${(((selectedData[categories[0]] || 0) / selectedData[categories[1]] - 1) * 100).toFixed(1)}%)`
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
