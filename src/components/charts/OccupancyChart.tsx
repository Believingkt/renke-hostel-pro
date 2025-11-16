import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface OccupancyChartProps {
  data: Array<{
    roomType: string;
    occupancyRate: number;
  }>;
}

export const OccupancyChart = ({ data }: OccupancyChartProps) => {
  // 檢查是否有實際數據
  const hasRealData = data.some(d => d.occupancyRate > 0 && d.roomType !== '暫無數據');

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無入住數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    occupancyRate: {
      label: "入住率",
      color: "hsl(var(--chart-occupancy-primary))",
    },
  };

  return (
    <div className="animate-fade-in px-1 py-2 sm:px-2 sm:py-4">
      <ChartContainer config={chartConfig} className="h-[240px] sm:h-[280px] md:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical" 
            margin={{ 
              top: 5, 
              right: 10, 
              left: 10, 
              bottom: 5 
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              type="number" 
              tickFormatter={(value) => `${value}%`}
              className="text-[10px] sm:text-xs"
              tick={{ fontSize: 10 }}
            />
            <YAxis 
              type="category" 
              dataKey="roomType" 
              width={60}
              className="text-[10px] sm:text-xs"
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip 
              content={<ChartTooltipContent />}
              formatter={(value: number) => [`${value.toFixed(1)}%`, "入住率"]}
            />
            <Bar 
              dataKey="occupancyRate" 
              fill="hsl(var(--chart-occupancy-primary))" 
              radius={[0, 6, 6, 0]}
              animationDuration={1000}
              animationBegin={0}
              isAnimationActive={true}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
