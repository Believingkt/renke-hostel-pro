import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface OccupancyChartProps {
  data: Array<{
    roomType: string;
    occupancyRate: number;
  }>;
}

export const OccupancyChart = ({ data }: OccupancyChartProps) => {
  const [selectedData, setSelectedData] = useState<{ roomType: string; occupancyRate: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  
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

  const handleBarClick = (data: any, index: number) => {
    setSelectedData(data);
    setActiveIndex(index);
  };

  return (
    <>
      <div className="animate-fade-in px-1 py-2 sm:px-2 sm:py-4">
        <ChartContainer config={chartConfig} className="h-[140px] sm:h-[180px] md:h-[220px] w-full">
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
                radius={[0, 6, 6, 0]}
                animationDuration={1000}
                animationBegin={0}
                isAnimationActive={true}
                onClick={handleBarClick}
                cursor="pointer"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={activeIndex === index 
                      ? "hsl(var(--chart-occupancy-secondary))" 
                      : "hsl(var(--chart-occupancy-primary))"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>

      <Dialog open={!!selectedData} onOpenChange={() => setSelectedData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>房型入住率詳情</DialogTitle>
          </DialogHeader>
          {selectedData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">房型</p>
                  <p className="text-lg font-semibold">{selectedData.roomType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">入住率</p>
                  <p className="text-lg font-semibold">{selectedData.occupancyRate.toFixed(1)}%</p>
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  此數據統計過去 30 天的平均入住率
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
