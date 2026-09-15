import { useState } from "react";
import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

interface MonthlyOccupancyRateChartProps {
  data: Array<{
    month: string;
    occupancyRate: number;
    lastYearOccupancyRate?: number;
    revenue?: number;
    isFuture?: boolean;
  }>;
}

const COLORS = {
  thisYear: "hsl(142, 80%, 40%)",
  lastYear: "hsl(0, 0%, 60%)",
  revenue: "hsl(210, 80%, 55%)",
};

const formatRevenue = (v: number) => {
  if (!v) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1000)}k`;
  return `${v}`;
};

interface OccTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  showRevenue: boolean;
}

const OccTooltip = ({ active, payload, label, showRevenue }: OccTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 min-w-[180px] text-sm">
      <div className="font-semibold text-foreground mb-2 pb-2 border-b border-border">{label}</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.thisYear }} />
            <span className="text-muted-foreground">今年</span>
          </div>
          <span className="font-semibold text-foreground">{datum.occupancyRate}%</span>
        </div>
        {datum.lastYearOccupancyRate !== undefined && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS.lastYear }} />
              <span className="text-muted-foreground">去年</span>
            </div>
            <span className="font-semibold text-foreground">{datum.lastYearOccupancyRate}%</span>
          </div>
        )}
        {showRevenue && datum.revenue !== undefined && (
          <div className="flex items-center justify-between gap-4 pt-1.5 border-t border-border/60">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.revenue }} />
              <span className="text-muted-foreground">營收</span>
            </div>
            <span className="font-semibold text-foreground">NT$ {Number(datum.revenue).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

type SeriesKey = "thisYear" | "lastYear" | "revenue";

export const MonthlyOccupancyRateChart = ({ data }: MonthlyOccupancyRateChartProps) => {
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    thisYear: true,
    lastYear: true,
    revenue: false,
  });

  const toggle = (key: SeriesKey) =>
    setVisible(v => ({ ...v, [key]: !v[key] }));

  const hasRealData = data.some(d => d.occupancyRate > 0);

  if (!hasRealData) {
    return (
      <div className="flex items-center justify-center h-[180px] sm:h-[220px] md:h-[260px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無住房率數據</p>
          <p className="text-xs mt-1">請新增訂單後查看統計</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    occupancyRate: { label: "今年", color: COLORS.thisYear },
    lastYearOccupancyRate: { label: "去年", color: COLORS.lastYear },
    revenue: { label: "營收", color: COLORS.revenue },
  };

  const dataKeyToSeries: Record<string, SeriesKey> = {
    occupancyRate: "thisYear",
    lastYearOccupancyRate: "lastYear",
    revenue: "revenue",
  };

  return (
    <div className="animate-fade-in">
      <ChartContainer config={chartConfig} className="h-[200px] sm:h-[240px] md:h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: visible.revenue ? 12 : 8, left: -8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              height={28}
            />
            <YAxis
              yAxisId="left"
              width={40}
              tickFormatter={(value) => `${value}%`}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={visible.revenue ? 42 : 0}
              tickFormatter={formatRevenue}
              tick={visible.revenue ? { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } : false}
              axisLine={false}
              tickLine={false}
              hide={!visible.revenue}
            />
            <Tooltip
              content={<OccTooltip showRevenue={visible.revenue} />}
              cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4, cursor: 'pointer' }}
              iconType="circle"
              onClick={(e: any) => {
                const key = dataKeyToSeries[e?.dataKey as string];
                if (key) toggle(key);
              }}
              formatter={(value: string, entry: any) => {
                const key = dataKeyToSeries[entry?.dataKey as string];
                const active = key ? visible[key] : true;
                return (
                  <span style={{ color: active ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', opacity: active ? 1 : 0.5 }}>
                    {value}
                  </span>
                );
              }}
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              name="營收"
              fill="hsl(210, 80%, 55%, 0.25)"
              radius={[4, 4, 0, 0]}
              barSize={14}
              hide={!visible.revenue}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="lastYearOccupancyRate"
              name="去年"
              stroke={COLORS.lastYear}
              strokeWidth={2}
              dot={{ r: 4, fill: "hsl(var(--background))", stroke: COLORS.lastYear, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              hide={!visible.lastYear}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="occupancyRate"
              name="今年"
              stroke={COLORS.thisYear}
              strokeWidth={2.5}
              dot={{ r: 4, fill: "hsl(var(--background))", stroke: COLORS.thisYear, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              hide={!visible.thisYear}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};
