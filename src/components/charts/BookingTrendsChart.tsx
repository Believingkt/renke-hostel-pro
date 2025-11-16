import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

interface BookingTrendsChartProps {
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

export const BookingTrendsChart = ({ data, comparisonMode, isCustomRange }: BookingTrendsChartProps) => {
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
    今年: {
      label: "今年",
      color: "hsl(var(--chart-booking-primary))",
    },
    去年: {
      label: "去年",
      color: "hsl(var(--chart-booking-secondary))",
    },
  } : {
    本月: {
      label: "本月",
      color: "hsl(var(--chart-booking-primary))",
    },
    上月: {
      label: "上月",
      color: "hsl(var(--chart-booking-secondary))",
    },
  };

  return (
    <div className="animate-fade-in px-2 py-4" key={`booking-chart-${comparisonMode}`}>
      <ChartContainer config={chartConfig} className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
            />
            <YAxis 
              width={100}
              tickFormatter={(value) => `${value} 筆`}
              className="text-xs"
            />
            <ChartTooltip 
              content={<ChartTooltipContent />}
              formatter={(value: number) => [`${value} 筆`]}
            />
            {!isCustomRange && <ChartLegend content={<ChartLegendContent />} />}
            {categories.map((category, index) => (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                stroke={index === 0 ? "hsl(var(--chart-booking-primary))" : "hsl(var(--chart-booking-secondary))"}
                strokeWidth={2.5}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
