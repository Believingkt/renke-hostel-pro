import { BarChart, Card } from "@tremor/react";

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

  // 使用 Tremor 預設顏色名稱
  const chartColors = isCustomRange 
    ? ["blue"]
    : ["blue", "orange"];

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
      <div className="flex items-center justify-center h-[280px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無營收數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <BarChart
        className="h-[300px]"
        data={data}
        index="month"
        categories={categories}
        colors={chartColors}
        valueFormatter={valueFormatter}
        yAxisWidth={72}
        showLegend={!isCustomRange}
        showGridLines={true}
        showXAxis={true}
        showYAxis={true}
        animationDuration={800}
        showAnimation={true}
      />
    </div>
  );
};
