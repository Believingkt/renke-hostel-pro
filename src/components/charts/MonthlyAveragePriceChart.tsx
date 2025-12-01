import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ComposedChart } from "recharts";
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { CustomChartTooltip } from "./CustomChartTooltip";

interface MonthlyAveragePriceChartProps {
  data: Array<{
    month: string;
    averagePrice: number;
    lastYearAveragePrice?: number;
    isFuture?: boolean;
  }>;
}

export const MonthlyAveragePriceChart = ({ data }: MonthlyAveragePriceChartProps) => {
  // 檢查是否有實際數據
  const hasRealData = data.some(d => d.averagePrice > 0);

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[180px] sm:h-[220px] md:h-[260px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無平均房價數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    averagePrice: {
      label: "今年",
      color: "hsl(271, 85%, 48%)",
    },
    lastYearAveragePrice: {
      label: "去年",
      color: "hsl(0, 0%, 60%)",
    },
  };

  const valueFormatter = (value: number) => `NT$ ${value.toLocaleString()}`;

  return (
    <div className="animate-fade-in">
      <ChartContainer config={chartConfig} className="h-[180px] sm:h-[220px] md:h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(271, 85%, 48%)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="hsl(271, 85%, 48%)" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              className="stroke-muted/20" 
              vertical={false}
              strokeWidth={0.5}
            />
            <XAxis 
              dataKey="month"
              className="text-xs"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={60}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              className="text-xs"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <ChartTooltip 
              content={
                <CustomChartTooltip 
                  valueFormatter={valueFormatter}
                  comparisonMode="lastYear"
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
            <ChartLegend content={<ChartLegendContent />} />
            
            {/* 去年同期 - 實線 */}
            <Line
              type="monotone"
              dataKey="lastYearAveragePrice"
              stroke="hsl(0, 0%, 60%)"
              strokeWidth={2}
              dot={{ 
                r: 7, 
                fill: "hsl(var(--background))",
                stroke: "hsl(0, 0%, 60%)",
                strokeWidth: 2,
                className: "hover:scale-125 transition-transform duration-200"
              }}
              activeDot={{ 
                r: 10,
                fill: "hsl(var(--background))",
                stroke: "hsl(0, 0%, 60%)",
                strokeWidth: 3,
                className: "animate-scale-in"
              }}
              animationDuration={2000}
              animationBegin={0}
              isAnimationActive={true}
              animationEasing="ease-in-out"
            />
            
            {/* 今年 - 實線 */}
            <Line
              type="monotone"
              dataKey="averagePrice"
              stroke="url(#priceGradient)"
              strokeWidth={3}
              dot={{ 
                r: 7, 
                fill: "hsl(var(--background))",
                stroke: "hsl(271, 85%, 48%)",
                strokeWidth: 2,
                className: "hover:scale-125 transition-transform duration-200"
              }}
              activeDot={{ 
                r: 10,
                fill: "hsl(var(--background))",
                stroke: "hsl(271, 85%, 48%)",
                strokeWidth: 3,
                className: "animate-scale-in"
              }}
              animationDuration={2000}
              animationBegin={0}
              isAnimationActive={true}
              animationEasing="ease-in-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
