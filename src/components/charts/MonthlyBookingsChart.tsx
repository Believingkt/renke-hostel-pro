import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { CustomChartTooltip } from "./CustomChartTooltip";
import { useState } from "react";

interface MonthlyBookingsChartProps {
  data: Array<{
    month: string;
    bookings: number;
  }>;
}

export const MonthlyBookingsChart = ({ data }: MonthlyBookingsChartProps) => {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  
  // Check if there is actual data
  const hasRealData = data.some(d => d.bookings > 0);

  // If no actual data, show empty state
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

  // Find max value for color gradient
  const maxBookings = Math.max(...data.map(d => d.bookings));

  const chartConfig = {
    bookings: {
      label: "訂單數量",
      color: "hsl(var(--chart-booking-primary))",
    },
  };

  // Custom label renderer
  const renderCustomLabel = (props: any) => {
    const { x, y, width, value } = props;
    
    // Only show label if value > 0
    if (value === 0) return null;
    
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        fill="hsl(var(--muted-foreground))"
        textAnchor="middle"
        fontSize={10}
        fontWeight={500}
      >
        {value}
      </text>
    );
  };

  return (
    <div className="animate-fade-in px-0.5 py-1 sm:px-2 sm:py-3">
      <ChartContainer config={chartConfig} className="h-[240px] sm:h-[280px] md:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            margin={{ 
              top: 20, 
              right: 15, 
              left: 0, 
              bottom: 5 
            }}
            onMouseLeave={() => setHoveredBar(null)}
          >
            <defs>
              <linearGradient id="bookingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-booking-primary))" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(var(--chart-booking-primary))" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              className="stroke-muted/30" 
              vertical={false}
            />
            <XAxis 
              dataKey="month" 
              className="text-[10px] sm:text-[11px]"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              height={35}
              axisLine={false}
              tickLine={false}
            />
            <YAxis 
              width={45}
              className="text-[10px] sm:text-[11px]"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <ChartTooltip 
              content={
                <CustomChartTooltip 
                  valueFormatter={(value: number) => `${value} 筆訂單`}
                />
              }
              cursor={{ fill: 'hsl(var(--muted)/0.2)', radius: 6 }}
            />
            <Bar
              dataKey="bookings"
              fill="url(#bookingsGradient)"
              radius={[6, 6, 0, 0]}
              maxBarSize={60}
              animationDuration={1000}
              isAnimationActive={true}
              animationEasing="ease-out"
              onMouseEnter={(data) => setHoveredBar(data.month)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              <LabelList 
                dataKey="bookings" 
                content={renderCustomLabel}
              />
              {data.map((entry, index) => {
                const intensity = maxBookings > 0 ? entry.bookings / maxBookings : 0;
                const opacity = hoveredBar === null || hoveredBar === entry.month ? 1 : 0.4;
                
                return (
                  <Cell 
                    key={`cell-${index}`}
                    opacity={opacity}
                    style={{ 
                      transition: 'opacity 0.2s ease-in-out',
                      cursor: 'pointer'
                    }}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
