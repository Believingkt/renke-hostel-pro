import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
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
      <div className="flex items-center justify-center h-[180px] sm:h-[220px] md:h-[260px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無住房率數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    lastYearOccupancyRate: {
      label: "去年",
      color: "hsl(0, 0%, 60%)",
    },
    occupancyRate: {
      label: "今年",
      color: "hsl(142, 80%, 40%)",
    },
  };

  return (
    <div className="animate-fade-in">
      <ChartContainer config={chartConfig} className="h-[180px] sm:h-[220px] md:h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart 
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
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
                  chartConfig={chartConfig}
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
              dataKey="lastYearOccupancyRate"
              stroke="hsl(0, 0%, 60%)"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill="hsl(0, 0%, 100%)"
                    fillOpacity={1}
                    stroke="hsl(0, 0%, 60%)"
                    strokeWidth={2}
                    className="hover:scale-125 transition-transform duration-200"
                  />
                );
              }}
              activeDot={(props: any) => {
                const { cx, cy } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    fill="hsl(0, 0%, 100%)"
                    fillOpacity={1}
                    stroke="hsl(0, 0%, 60%)"
                    strokeWidth={3}
                    className="animate-scale-in"
                  />
                );
              }}
              animationDuration={2000}
              animationBegin={0}
              isAnimationActive={true}
              animationEasing="ease-in-out"
            />
            
            {/* 今年 - 實線 */}
            <Line
              type="monotone"
              dataKey="occupancyRate"
              stroke="hsl(142, 80%, 40%)"
              strokeWidth={3}
              dot={(props: any) => {
                const { cx, cy } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill="hsl(0, 0%, 100%)"
                    fillOpacity={1}
                    stroke="hsl(142, 80%, 40%)"
                    strokeWidth={2}
                    className="hover:scale-125 transition-transform duration-200"
                  />
                );
              }}
              activeDot={(props: any) => {
                const { cx, cy } = props;
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9}
                    fill="hsl(0, 0%, 100%)"
                    fillOpacity={1}
                    stroke="hsl(142, 80%, 40%)"
                    strokeWidth={3}
                    className="animate-scale-in"
                  />
                );
              }}
              animationDuration={2000}
              animationBegin={0}
              isAnimationActive={true}
              animationEasing="ease-in-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
