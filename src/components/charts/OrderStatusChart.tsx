import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from "recharts";
import { OrderStatusData } from "@/hooks/use-dashboard-data";
import { useState } from "react";
import { CustomChartTooltip } from "./CustomChartTooltip";

interface OrderStatusChartProps {
  data: OrderStatusData[];
}

const statusColors: Record<string, string> = {
  pending: "hsl(48, 96%, 53%)",      // Yellow
  confirmed: "hsl(217, 91%, 60%)",   // Blue
  checked_in: "hsl(271, 91%, 65%)",  // Purple
  checked_out: "hsl(0, 0%, 60%)",    // Gray
  cancelled: "hsl(0, 84%, 60%)",     // Red
};

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chartData = data.filter(item => item.count > 0);
  const totalOrders = chartData.reduce((sum, item) => sum + item.count, 0);

  if (chartData.length === 0) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>訂單狀態分布</CardTitle>
          <CardDescription>目前沒有訂單資料</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
          暫無資料
        </CardContent>
      </Card>
    );
  }

  const chartConfig = chartData.reduce((config, item) => {
    config[item.status] = {
      label: item.label,
      color: statusColors[item.status] || "hsl(var(--chart-1))",
    };
    return config;
  }, {} as Record<string, { label: string; color: string }>);

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader>
        <CardTitle>訂單狀態分布</CardTitle>
        <CardDescription>各狀態訂單數量統計</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={statusColors[entry.status] || "hsl(var(--chart-1))"}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.4}
                    style={{
                      transition: "opacity 0.3s ease",
                      cursor: "pointer",
                    }}
                  />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {totalOrders}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground text-sm"
                          >
                            總訂單數
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
              <CustomChartTooltip />
              <ChartLegend
                content={<ChartLegendContent nameKey="label" />}
                className="flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
