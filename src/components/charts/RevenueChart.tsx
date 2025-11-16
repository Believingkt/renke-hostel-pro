import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";

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
    // 簡化大數字顯示
    if (value >= 1000000) {
      return `NT$ ${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 10000) {
      return `NT$ ${(value / 1000).toFixed(0)}K`;
    }
    return `NT$ ${value.toLocaleString()}`;
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

  return (
    <div className="animate-fade-in px-1 py-2 sm:px-2 sm:py-4" key={`revenue-chart-${comparisonMode}`}>
      <ChartContainer config={chartConfig} className="h-[240px] sm:h-[280px] md:h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            margin={{ 
              top: 5, 
              right: 10, 
              left: 5, 
              bottom: 5 
            }}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-[10px] sm:text-xs"
              tick={{ fontSize: 10 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              width={50}
              tickFormatter={valueFormatter}
              className="text-[10px] sm:text-xs"
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip 
              content={<ChartTooltipContent />}
              formatter={(value: number) => [valueFormatter(value)]}
            />
            {!isCustomRange && <ChartLegend content={<ChartLegendContent />} />}
            {categories.map((category, index) => (
              <Bar
                key={category}
                dataKey={category}
                fill={index === 0 ? "hsl(var(--chart-revenue-primary))" : "hsl(var(--chart-revenue-secondary))"}
                radius={[6, 6, 0, 0]}
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
