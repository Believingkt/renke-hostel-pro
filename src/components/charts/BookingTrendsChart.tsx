import { useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  Legend,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface BookingTrendsChartDatum {
  month: string;
  接單: number;
  住宿: number;
  營收: number;
  baseline: number;
  isFuture?: boolean;
}

interface BookingTrendsChartProps {
  data: BookingTrendsChartDatum[];
  baselineSource: 'lastYear' | 'recent3Months' | 'none';
  showRevenue?: boolean;
}

const baselineLabel = (source: BookingTrendsChartProps['baselineSource']) => {
  if (source === 'lastYear') return '去年月均';
  if (source === 'recent3Months') return '近 3 個月月均';
  return '基準線';
};

export const BookingTrendsChart = ({
  data,
  baselineSource,
  showRevenue = true,
}: BookingTrendsChartProps) => {
  const [selected, setSelected] = useState<BookingTrendsChartDatum | null>(null);

  const hasData = data.some(d => (d.接單 || 0) > 0 || (d.住宿 || 0) > 0 || (d.營收 || 0) > 0);
  const baseline = data[0]?.baseline ?? 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-[260px] text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">暫無訂單資料</p>
          <p className="text-xs mt-1">建立訂單後將顯示接單與住宿趨勢</p>
        </div>
      </div>
    );
  }

  const chartConfig = {
    接單: { label: "接單", color: "hsl(25, 90%, 55%)" },
    住宿: { label: "住宿", color: "hsl(210, 75%, 55%)" },
    營收: { label: "營收", color: "hsl(var(--muted-foreground))" },
  } as const;

  const formatRevenue = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1000)}k`;
    return `${v}`;
  };

  return (
    <>
      <ChartContainer config={chartConfig} className="h-[220px] sm:h-[260px] md:h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: showRevenue ? 12 : 8, left: -8, bottom: 5 }}>
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
              width={36}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            {showRevenue && (
              <YAxis
                yAxisId="right"
                orientation="right"
                width={42}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatRevenue}
              />
            )}
            <Tooltip
              cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => {
                if (name === '營收') return [`NT$ ${value.toLocaleString()}`, name];
                return [`${value} 筆`, name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
            />
            {showRevenue && (
              <Bar
                yAxisId="right"
                dataKey="營收"
                fill="hsl(var(--muted-foreground)/0.18)"
                radius={[4, 4, 0, 0]}
                barSize={14}
              />
            )}
            {baseline > 0 && (
              <ReferenceLine
                yAxisId="left"
                y={baseline}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{
                  value: `${baselineLabel(baselineSource)} ${baseline.toFixed(1)} 筆`,
                  position: 'insideTopRight',
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 10,
                }}
              />
            )}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="接單"
              stroke="hsl(25, 90%, 55%)"
              strokeWidth={2.5}
              dot={(props: any) => {
                const { cx, cy, payload, index } = props;
                return (
                  <circle
                    key={`dot-接單-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="hsl(var(--background))"
                    stroke="hsl(25, 90%, 55%)"
                    strokeWidth={2}
                    opacity={payload.isFuture ? 0.3 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(payload)}
                  />
                );
              }}
              activeDot={{ r: 6 }}
              connectNulls
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="住宿"
              stroke="hsl(210, 75%, 55%)"
              strokeWidth={2.5}
              dot={(props: any) => {
                const { cx, cy, payload, index } = props;
                return (
                  <circle
                    key={`dot-住宿-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="hsl(var(--background))"
                    stroke="hsl(210, 75%, 55%)"
                    strokeWidth={2}
                    opacity={payload.isFuture ? 0.3 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(payload)}
                  />
                );
              }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartContainer>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.month} 趨勢明細</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">接單筆數</p>
                  <p className="text-2xl font-semibold" style={{ color: 'hsl(25, 90%, 55%)' }}>
                    {selected.接單} 筆
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">以成交日期統計</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">住宿筆數</p>
                  <p className="text-2xl font-semibold" style={{ color: 'hsl(210, 75%, 55%)' }}>
                    {selected.住宿} 筆
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">以入住日期統計</p>
                </div>
              </div>
              <div className="pt-3 border-t">
                <p className="text-sm text-muted-foreground">當月營收</p>
                <p className="text-xl font-semibold">NT$ {selected.營收.toLocaleString()}</p>
              </div>
              {selected.baseline > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-sm text-muted-foreground">{baselineLabel(baselineSource)}</p>
                  <p className="text-base font-medium">{selected.baseline.toFixed(1)} 筆</p>
                  <p className={`text-xs mt-1 ${selected.接單 >= selected.baseline ? 'text-emerald-600' : 'text-red-500'}`}>
                    本月接單 {selected.接單 >= selected.baseline ? '高於' : '低於'}基準 {Math.abs(selected.接單 - selected.baseline).toFixed(1)} 筆
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
