import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { CustomChartTooltip } from "./CustomChartTooltip";

interface OccupancyChartProps {
  data: Array<{
    month: string;
    [roomTypeName: string]: number | string;
  }>;
  roomTypes: string[];
}

export const OccupancyChart = ({ data, roomTypes }: OccupancyChartProps) => {
  // 檢查是否有實際數據
  const hasRealData = data.some(d => 
    roomTypes.some(roomType => {
      const value = d[roomType];
      return typeof value === 'number' && value > 0;
    })
  );

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData || roomTypes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[320px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無入住數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  // 為每個房型配置顏色 - 使用更鮮明的顏色
  const colors = [
    "hsl(var(--chart-occupancy-primary))", // 琥珀色
    "hsl(var(--chart-booking-primary))", // 紅色
    "hsl(var(--chart-revenue-primary))", // 寶藍色
    "hsl(var(--chart-revenue-secondary))", // 湖水綠
    "hsl(var(--chart-5))", // 紫色
    "hsl(var(--chart-booking-secondary))", // 橘色
    "hsl(var(--chart-1))", // 綠色
  ];

  const chartConfig = roomTypes.reduce((config, roomType, index) => {
    config[roomType] = {
      label: roomType,
      color: colors[index % colors.length],
    };
    return config;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <div className="animate-fade-in px-0.5 py-1 sm:px-2 sm:py-3">
      <ChartContainer config={chartConfig} className="h-[220px] sm:h-[260px] md:h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            margin={{ 
              top: 5, 
              right: 10, 
              left: -5, 
              bottom: 5 
            }}
            barGap={2}
            barCategoryGap="20%"
          >
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
              tickFormatter={(value) => `${value}%`}
              className="text-[9px] sm:text-[10px]"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
            />
            <ChartTooltip 
              content={
                <CustomChartTooltip 
                  valueFormatter={(value: number) => `${value}%`}
                />
              }
              cursor={{ fill: 'hsl(var(--muted)/0.3)', radius: 4 }}
            />
            <ChartLegend 
              content={<ChartLegendContent />}
              wrapperStyle={{ paddingTop: '10px' }}
            />
            {roomTypes.map((roomType, index) => (
              <Bar
                key={roomType}
                dataKey={roomType}
                fill={colors[index % colors.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={45}
                animationDuration={1000}
                animationBegin={index * 100}
                isAnimationActive={true}
                animationEasing="ease-in-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
