import { BarChart } from "@tremor/react";

interface OccupancyChartProps {
  data: Array<{
    roomType: string;
    occupancyRate: number;
  }>;
}

export const OccupancyChart = ({ data }: OccupancyChartProps) => {
  // 檢查是否有實際數據
  const hasRealData = data.some(d => d.occupancyRate > 0 && d.roomType !== '暫無數據');

  // 數值格式化函數
  const valueFormatter = (value: number) => {
    if (!Number.isFinite(value)) return '0%';
    return `${value.toFixed(1)}%`;
  };

  // 如果沒有實際數據，顯示空狀態
  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[280px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無入住數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <BarChart
        className="h-[280px]"
        data={data}
        index="roomType"
        categories={["occupancyRate"]}
        colors={["amber"]}
        valueFormatter={valueFormatter}
        yAxisWidth={80}
        showLegend={false}
        showGridLines={false}
        showXAxis={true}
        showYAxis={true}
        layout="vertical"
        animationDuration={800}
        showAnimation={true}
        autoMinValue={true}
        showTooltip={true}
      />
    </div>
  );
};
