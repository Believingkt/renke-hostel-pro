import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { CustomChartTooltip } from "./CustomChartTooltip";

interface MonthlyOccupancyRateChartProps {
  data: Array<{
    month: string;
    occupancyRate: number;
    lastYearOccupancyRate?: number;
    isFuture?: boolean;
  }>;
}

export const MonthlyOccupancyRateChart = ({ data }: MonthlyOccupancyRateChartProps) => {
  // 檢查是否有實際數據
  const hasRealData = data.some(d => d.occupancyRate > 0);

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無住房率數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    occupancyRate: {
      label: "今年住房率",
      color: "hsl(142, 76%, 36%)",
    },
    lastYearOccupancyRate: {
      label: "去年住房率",
      color: "hsl(210, 76%, 56%)",
    },
  };

  return (
    <div className="animate-fade-in">
      <ChartContainer config={chartConfig} className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart 
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              className="stroke-muted/30" 
              vertical={false}
            />
            <XAxis 
              dataKey="month"
              className="text-xs"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={45}
              tickFormatter={(value) => `${value}%`}
              className="text-xs"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
            />
            <ChartTooltip 
              content={
                <CustomChartTooltip 
                  valueFormatter={(value: number) => `${value}%`}
                  comparisonMode="lastYear"
                />
              }
            />
            
            {/* 去年同期 - 虛線 */}
            <Line
              type="monotone"
              dataKey="lastYearOccupancyRate"
              stroke="hsl(210, 76%, 56%)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, fill: "hsl(210, 76%, 56%)" }}
              animationDuration={1000}
              isAnimationActive={true}
            />
            
            {/* 今年 - 實線 + 漸層填充 */}
            <Area
              type="monotone"
              dataKey="occupancyRate"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2.5}
              fill="url(#occupancyGradient)"
              dot={{ r: 4, fill: "hsl(142, 76%, 36%)", strokeWidth: 0 }}
              animationDuration={1000}
              isAnimationActive={true}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
