import { LineChart } from "@tremor/react";

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

  // 使用 Tremor 預設顏色名稱
  const chartColors = isCustomRange 
    ? ["purple"]
    : ["purple", "orange"];

  // 檢查是否有實際數據
  const hasRealData = data.some(d => 
    categories.some(cat => (d[cat as keyof typeof d] as number || 0) > 0)
  );

  // 數值格式化函數
  const valueFormatter = (value: number) => {
    if (!Number.isFinite(value)) return '0';
    return `${value} 筆`;
  };

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[280px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無訂單數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <LineChart
        className="h-[300px]"
        data={data}
        index="month"
        categories={categories}
        colors={chartColors}
        valueFormatter={valueFormatter}
        yAxisWidth={90}
        showLegend={!isCustomRange}
        showGridLines={true}
        showXAxis={true}
        showYAxis={true}
        curveType="natural"
        animationDuration={600}
        connectNulls={true}
        showAnimation={true}
        autoMinValue={true}
        allowDecimals={false}
        showTooltip={true}
      />
    </div>
  );
};
