import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
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

  // 為每個房型配置顏色
  const colors = [
    "hsl(var(--chart-occupancy-primary))",
    "hsl(var(--chart-occupancy-secondary))",
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
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
              cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }}
            />
            <ChartLegend 
              content={<ChartLegendContent />}
              wrapperStyle={{ paddingTop: '10px' }}
            />
            {roomTypes.map((roomType, index) => (
              <Line
                key={roomType}
                type="monotone"
                dataKey={roomType}
                stroke={colors[index % colors.length]}
                strokeWidth={2.5}
                dot={{
                  r: 4,
                  fill: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
                activeDot={{
                  r: 6,
                  strokeWidth: 2,
                }}
                connectNulls
                animationDuration={1000}
                animationBegin={index * 100}
                isAnimationActive={true}
                animationEasing="ease-in-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
