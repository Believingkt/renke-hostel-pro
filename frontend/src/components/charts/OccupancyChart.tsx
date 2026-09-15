import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { CustomChartTooltip } from "./CustomChartTooltip";
import { useState } from "react";

interface OccupancyChartProps {
  data: Array<{
    month: string;
    [roomTypeName: string]: number | string;
  }>;
  roomTypes: string[];
}

export const OccupancyChart = ({ data, roomTypes }: OccupancyChartProps) => {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  
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

  // 為每個房型配置更鮮明、易區分的顏色
  const colors = [
    "hsl(38, 92%, 50%)",   // 琥珀橙 - 明亮醒目
    "hsl(0, 80%, 60%)",    // 紅色 - 鮮豔
    "hsl(220, 85%, 55%)",  // 寶藍色 - 清晰
    "hsl(180, 70%, 50%)",  // 湖水綠 - 清爽
    "hsl(271, 81%, 56%)",  // 紫色 - 優雅
    "hsl(25, 90%, 60%)",   // 橘色 - 活潑
    "hsl(142, 76%, 36%)",  // 綠色 - 穩重
  ];

  const chartConfig = roomTypes.reduce((config, roomType, index) => {
    config[roomType] = {
      label: roomType,
      color: colors[index % colors.length],
    };
    return config;
  }, {} as Record<string, { label: string; color: string }>);

  // 自定義標籤渲染
  const renderCustomLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    
    // 只在值大於5時顯示標籤，避免擁擠
    if (value < 5) return null;
    
    return (
      <text
        x={x + width / 2}
        y={y - 4}
        fill="hsl(var(--muted-foreground))"
        textAnchor="middle"
        fontSize={9}
        fontWeight={500}
      >
        {value}%
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
            barGap={3}
            barCategoryGap="18%"
            onMouseLeave={() => setHoveredBar(null)}
          >
            <defs>
              {roomTypes.map((roomType, index) => (
                <linearGradient key={`gradient-${roomType}`} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[index % colors.length]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={colors[index % colors.length]} stopOpacity={0.6} />
                </linearGradient>
              ))}
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
              tickFormatter={(value) => `${value}%`}
              className="text-[10px] sm:text-[11px]"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
            />
            <ChartTooltip 
              content={
                <CustomChartTooltip 
                  valueFormatter={(value: number) => `${value}%`}
                />
              }
              cursor={{ fill: 'hsl(var(--muted)/0.2)', radius: 6 }}
            />
            <ChartLegend 
              content={<ChartLegendContent />}
              wrapperStyle={{ paddingTop: '12px', paddingBottom: '4px' }}
              iconType="circle"
            />
            {roomTypes.map((roomType, index) => (
              <Bar
                key={roomType}
                dataKey={roomType}
                fill={`url(#gradient-${index})`}
                radius={[6, 6, 0, 0]}
                maxBarSize={50}
                animationDuration={1000}
                animationBegin={index * 100}
                isAnimationActive={true}
                animationEasing="ease-out"
                onMouseEnter={() => setHoveredBar(roomType)}
                onMouseLeave={() => setHoveredBar(null)}
                style={{ touchAction: 'none' }}
              >
                <LabelList 
                  dataKey={roomType} 
                  content={renderCustomLabel}
                />
                {data.map((entry, entryIndex) => (
                  <Cell 
                    key={`cell-${entryIndex}`}
                    opacity={hoveredBar === null || hoveredBar === roomType ? 1 : 0.4}
                    style={{ 
                      transition: 'opacity 0.2s ease-in-out',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
