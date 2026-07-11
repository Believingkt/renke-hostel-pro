import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrderSourceConfig } from "@/utils/orderHelpers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { DollarSign, Wallet, Hourglass, Percent, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { OWLTING_OTA_DISPLAY_NAMES } from "@/utils/orderHelpers";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { DateRange } from "react-day-picker";


interface Props {
  accommodationId: string;
}

type RangeMode = "month" | "last3" | "last6" | "year" | "custom";

interface OrderRow {
  order_source: string | null;
  ota_channel: string | null;
  check_in_date: string;
  final_price: number | null;
  paid_amount: number | null;
  payment_status: string | null;
}

interface SourceStat {
  source: string;
  label: string;
  count: number;
  total: number;
  paid: number;
  depositPaid: number;
  fullPaid: number;
  pending: number;
  rate: number;
  breakdown?: SourceStat[];
}

const nt = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

export function OrderSourceAnalyticsTab({ accommodationId }: Props) {
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [trendOrders, setTrendOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const toggleExpand = (src: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  // Compute filter range for KPI/table/bar
  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const today = new Date();
    if (rangeMode === "month") {
      return {
        rangeStart: startOfMonth(monthCursor),
        rangeEnd: endOfMonth(monthCursor),
        rangeLabel: format(monthCursor, "yyyy年M月"),
      };
    }
    if (rangeMode === "last3") {
      return {
        rangeStart: startOfMonth(subMonths(today, 2)),
        rangeEnd: endOfMonth(today),
        rangeLabel: "近 3 個月",
      };
    }
    if (rangeMode === "last6") {
      return {
        rangeStart: startOfMonth(subMonths(today, 5)),
        rangeEnd: endOfMonth(today),
        rangeLabel: "近 6 個月",
      };
    }
    if (rangeMode === "year") {
      return {
        rangeStart: new Date(today.getFullYear(), 0, 1),
        rangeEnd: new Date(today.getFullYear(), 11, 31),
        rangeLabel: `${today.getFullYear()} 年`,
      };
    }
    // custom
    const from = customRange?.from ?? startOfMonth(today);
    const to = customRange?.to ?? customRange?.from ?? endOfMonth(today);
    return {
      rangeStart: from,
      rangeEnd: to,
      rangeLabel: `${format(from, "yyyy/MM/dd")} – ${format(to, "yyyy/MM/dd")}`,
    };
  }, [rangeMode, monthCursor, customRange]);

  // Fetch orders for KPI/table/bar
  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("order_source, ota_channel, check_in_date, final_price, paid_amount, payment_status")
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled")
        .gte("check_in_date", format(rangeStart, "yyyy-MM-dd"))
        .lte("check_in_date", format(rangeEnd, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) {
        console.error(error);
        setOrders([]);
      } else {
        setOrders((data ?? []) as OrderRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId, rangeStart, rangeEnd]);

  // Fetch trend orders (last 6 months, independent of range)
  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      const today = new Date();
      const start = startOfMonth(subMonths(today, 5));
      const end = endOfMonth(today);
      const { data, error } = await supabase
        .from("orders")
        .select("order_source, ota_channel, check_in_date, final_price, paid_amount, payment_status")
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled")
        .gte("check_in_date", format(start, "yyyy-MM-dd"))
        .lte("check_in_date", format(end, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) {
        console.error(error);
        setTrendOrders([]);
      } else {
        setTrendOrders((data ?? []) as OrderRow[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  // Aggregate per source (+ owlting/hotelnabe by ota_channel breakdown)
  const { stats, totals } = useMemo(() => {
    const map = new Map<string, SourceStat>();
    const subMap = new Map<string, Map<string, SourceStat>>();
    for (const o of orders ?? []) {
      const key = o.order_source || "unknown";
      const cfg = getOrderSourceConfig(key);
      const cur = map.get(key) ?? {
        source: key,
        label: cfg.label,
        count: 0,
        total: 0,
        paid: 0,
        depositPaid: 0,
        fullPaid: 0,
        pending: 0,
        rate: 0,
      };
      const total = Number(o.final_price) || 0;
      const paid = Number(o.paid_amount) || 0;
      const isFullPaid = o.payment_status === "paid";
      cur.count += 1;
      cur.total += total;
      cur.paid += paid;
      if (isFullPaid) cur.fullPaid += paid;
      else if (paid > 0) cur.depositPaid += paid;
      cur.pending += Math.max(0, total - paid);
      map.set(key, cur);

      if (key === "owlting" || key === "hotelnabe") {
        const ota = (o.ota_channel || "").toString().trim().toLowerCase() || "unknown";
        const subLabel =
          key === "owlting"
            ? (ota === "unknown" ? "未指定" : (OWLTING_OTA_DISPLAY_NAMES[ota] ?? ota))
            : (ota === "unknown" ? "未指定" : ota);
        if (!subMap.has(key)) subMap.set(key, new Map());
        const inner = subMap.get(key)!;
        const sub = inner.get(ota) ?? {
          source: `${key}:${ota}`,
          label: subLabel,
          count: 0,
          total: 0,
          paid: 0,
          depositPaid: 0,
          fullPaid: 0,
          pending: 0,
          rate: 0,
        };
        sub.count += 1;
        sub.total += total;
        sub.paid += paid;
        if (isFullPaid) sub.fullPaid += paid;
        else if (paid > 0) sub.depositPaid += paid;
        sub.pending += Math.max(0, total - paid);
        inner.set(ota, sub);
      }
    }
    const arr = Array.from(map.values()).map((s) => {
      const inner = subMap.get(s.source);
      const breakdown = inner
        ? Array.from(inner.values())
            .map((x) => ({ ...x, rate: x.total > 0 ? (x.paid / x.total) * 100 : 0 }))
            .sort((a, b) => b.total - a.total)
        : undefined;
      return {
        ...s,
        rate: s.total > 0 ? (s.paid / s.total) * 100 : 0,
        breakdown,
      };
    });
    arr.sort((a, b) => b.total - a.total);
    const totals = arr.reduce(
      (acc, s) => {
        acc.count += s.count;
        acc.total += s.total;
        acc.paid += s.paid;
        acc.depositPaid += s.depositPaid;
        acc.fullPaid += s.fullPaid;
        acc.pending += s.pending;
        return acc;
      },
      { count: 0, total: 0, paid: 0, depositPaid: 0, fullPaid: 0, pending: 0 },
    );
    return { stats: arr, totals };
  }, [orders]);

  const overallRate = totals.total > 0 ? (totals.paid / totals.total) * 100 : 0;

  // Monthly trend: 6 months x each source total
  const trendData = useMemo(() => {
    if (!trendOrders) return [];
    const today = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      months.push(format(subMonths(today, i), "yyyy-MM"));
    }
    // pick top 5 sources by total across whole window
    const totalsBySource = new Map<string, number>();
    for (const o of trendOrders) {
      const src = o.order_source || "unknown";
      totalsBySource.set(src, (totalsBySource.get(src) ?? 0) + (Number(o.final_price) || 0));
    }
    const topSources = Array.from(totalsBySource.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([src]) => src);

    const byMonth = new Map<string, Record<string, number>>();
    for (const m of months) byMonth.set(m, {});
    for (const o of trendOrders) {
      const m = o.check_in_date?.slice(0, 7);
      if (!m || !byMonth.has(m)) continue;
      const src = o.order_source || "unknown";
      if (!topSources.includes(src)) continue;
      const row = byMonth.get(m)!;
      row[src] = (row[src] ?? 0) + (Number(o.final_price) || 0);
    }
    return months.map((m) => {
      const row: Record<string, string | number> = { month: format(new Date(`${m}-01`), "M月") };
      for (const src of topSources) row[getOrderSourceConfig(src).label] = byMonth.get(m)?.[src] ?? 0;
      return row;
    });
  }, [trendOrders]);

  const trendKeys = useMemo(() => {
    if (trendData.length === 0) return [];
    return Object.keys(trendData[0]).filter((k) => k !== "month");
  }, [trendData]);

  const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="space-y-6">
      {/* Range controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {rangeMode === "month" && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthCursor((d) => subMonths(d, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium px-2 min-w-[90px] text-center">{format(monthCursor, "yyyy/MM")}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={endOfMonth(monthCursor) >= endOfMonth(new Date())}
                onClick={() => setMonthCursor((d) => addMonths(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex bg-muted rounded-lg p-1">
            {(
              [
                { k: "month", label: "單月" },
                { k: "last3", label: "近3月" },
                { k: "last6", label: "近6月" },
                { k: "year", label: "今年" },
                { k: "custom", label: "自訂" },
              ] as { k: RangeMode; label: string }[]
            ).map((r) => (
              <Button
                key={r.k}
                variant={rangeMode === r.k ? "secondary" : "ghost"}
                size="sm"
                className="px-3"
                onClick={() => setRangeMode(r.k)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {rangeMode === "custom" && (
            <DateRangePicker
              dateRange={customRange}
              onDateRangeChange={setCustomRange}
              allowFutureDates
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground">統計基準：入住日期</span>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {loading && !orders ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="py-6"><Skeleton className="h-8 w-32" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><DollarSign className="h-4 w-4" />訂單總額</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{nt(totals.total)}</div>
                <p className="text-xs text-muted-foreground mt-1">{rangeLabel} · {totals.count} 筆</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><Wallet className="h-4 w-4" />已收金額</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{nt(totals.paid)}</div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>已付訂金</span>
                    <span className="tabular-nums font-medium text-foreground">{nt(totals.depositPaid)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>已付清</span>
                    <span className="tabular-nums font-medium text-foreground">{nt(totals.fullPaid)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><Hourglass className="h-4 w-4" />待收尾款</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{nt(totals.pending)}</div>
                <p className="text-xs text-muted-foreground mt-1">總額 − 已收</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1"><Percent className="h-4 w-4" />收款率</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{overallRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">已收 / 總額</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Stacked bar: paid vs pending per source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">各來源收款狀況</CardTitle>
          <CardDescription>已收 vs 待收（{rangeLabel}）</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">尚無資料</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => nt(v)}
                  />
                  <Legend />
                  <Bar dataKey="paid" name="已收" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pending" name="待收" stackId="a" fill="hsl(var(--muted-foreground)/0.35)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">來源明細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>來源</TableHead>
                  <TableHead className="text-right">訂單數</TableHead>
                  <TableHead className="text-right">訂單總額</TableHead>
                  <TableHead className="text-right">已收</TableHead>
                  <TableHead className="text-right">└ 已付訂金</TableHead>
                  <TableHead className="text-right">└ 已付清</TableHead>
                  <TableHead className="text-right">待收</TableHead>
                  <TableHead className="text-right">收款率</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-6">尚無資料</TableCell>
                  </TableRow>
                ) : (
                  <>
                    {stats.map((s) => {
                      const hasBreakdown = !!s.breakdown && s.breakdown.length > 0;
                      const isOpen = expandedSources.has(s.source);
                      return (
                        <Fragment key={s.source}>
                          <TableRow>
                            <TableCell className="whitespace-nowrap">
                              {hasBreakdown ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(s.source)}
                                  className="inline-flex items-center gap-1 hover:text-primary"
                                >
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                                  />
                                  {s.label}
                                  <span className="text-xs text-muted-foreground">
                                    ({s.breakdown!.length})
                                  </span>
                                </button>
                              ) : (
                                s.label
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                            <TableCell className="text-right tabular-nums">{nt(s.total)}</TableCell>
                            <TableCell className="text-right tabular-nums text-primary">{nt(s.paid)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{nt(s.depositPaid)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">{nt(s.fullPaid)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nt(s.pending)}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.rate.toFixed(1)}%</TableCell>
                          </TableRow>
                          {hasBreakdown && isOpen &&
                            s.breakdown!.map((sub) => (
                              <TableRow key={sub.source} className="bg-muted/20">
                                <TableCell className="whitespace-nowrap pl-8 text-muted-foreground">
                                  └ {sub.label}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{sub.count}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{nt(sub.total)}</TableCell>
                                <TableCell className="text-right tabular-nums text-primary/80">{nt(sub.paid)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{nt(sub.depositPaid)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{nt(sub.fullPaid)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{nt(sub.pending)}</TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">{sub.rate.toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      );
                    })}
                    <TableRow className="font-semibold bg-muted/40">
                      <TableCell>總計</TableCell>
                      <TableCell className="text-right tabular-nums">{totals.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{nt(totals.total)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{nt(totals.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nt(totals.depositPaid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nt(totals.fullPaid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{nt(totals.pending)}</TableCell>
                      <TableCell className="text-right tabular-nums">{overallRate.toFixed(1)}%</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">月趨勢（近 6 個月，Top 5 來源）</CardTitle>
          <CardDescription>各來源訂單總額變化</CardDescription>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 || trendKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">尚無資料</p>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => nt(v)}
                  />
                  <Legend />
                  {trendKeys.map((k, i) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default OrderSourceAnalyticsTab;
