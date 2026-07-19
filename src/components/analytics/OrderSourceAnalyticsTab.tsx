import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrderSourceConfig } from "@/utils/orderHelpers";
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { DollarSign, ChevronLeft, ChevronRight, ChevronDown, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { OWLTING_OTA_DISPLAY_NAMES } from "@/utils/orderHelpers";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { DateRange } from "react-day-picker";
import { TRAVELDAYS_ACC_ID } from "@/lib/currency";
import { accrueOrderAmount, accrueOrderNightlyShares, isRevenueOrder } from "@/lib/revenueAccrual";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";


interface Props {
  accommodationId: string;
}

type RangeMode = "month" | "last3" | "last6" | "year" | "custom";

interface OrderRow {
  id: string;
  order_number: string | null;
  guest_name: string | null;
  order_source: string | null;
  order_status: string | null;
  ota_channel: string | null;
  check_in_date: string;
  check_out_date: string | null;
  final_price: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  currency: string; // "TWD" | "JPY" | ...
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

const CURRENCY_LABEL: Record<string, { label: string; symbol: string }> = {
  TWD: { label: "台幣營收", symbol: "NT$" },
  JPY: { label: "日幣營收（純記帳）", symbol: "¥" },
};

const fmt = (n: number, symbol: string) => `${symbol}${Math.round(n).toLocaleString()}`;
const nt = (n: number) => fmt(n, "NT$");

export function OrderSourceAnalyticsTab({ accommodationId }: Props) {
  const isTraveldays = accommodationId === TRAVELDAYS_ACC_ID;
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

  // Traveldays 專屬：檢視模式與匯率
  const [viewMode, setViewMode] = useState<"separate" | "consolidated">("separate");
  const [selectedCurrency, setSelectedCurrency] = useState<string>("TWD");
  const [exchangeRate, setExchangeRate] = useState<number>(0.21); // 1 JPY = 0.21 TWD 預設
  const [rateInput, setRateInput] = useState<string>("0.21");
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
  // Overlap filter: any order whose stay intersects [rangeStart, rangeEnd].
  // Cancelled + KOL are excluded at query level (revenue caliber).
  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("order_source, order_status, ota_channel, check_in_date, check_out_date, final_price, paid_amount, payment_status, order_meta(display_currency)")
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled")
        .neq("order_source", "kol")
        .lte("check_in_date", format(rangeEnd, "yyyy-MM-dd"))
        .gte("check_out_date", format(rangeStart, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) {
        console.error(error);
        setOrders([]);
      } else {
        setOrders(((data ?? []) as any[]).map((r) => ({
          order_source: r.order_source,
          order_status: r.order_status,
          ota_channel: r.ota_channel,
          check_in_date: r.check_in_date,
          check_out_date: r.check_out_date,
          final_price: r.final_price,
          paid_amount: r.paid_amount,
          payment_status: r.payment_status,
          currency: (r.order_meta?.display_currency || "TWD").toUpperCase(),
        })) as OrderRow[]);
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
        .select("order_source, order_status, ota_channel, check_in_date, check_out_date, final_price, paid_amount, payment_status, order_meta(display_currency)")
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled")
        .neq("order_source", "kol")
        .lte("check_in_date", format(end, "yyyy-MM-dd"))
        .gte("check_out_date", format(start, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) {
        console.error(error);
        setTrendOrders([]);
      } else {
        setTrendOrders(((data ?? []) as any[]).map((r) => ({
          order_source: r.order_source,
          order_status: r.order_status,
          ota_channel: r.ota_channel,
          check_in_date: r.check_in_date,
          check_out_date: r.check_out_date,
          final_price: r.final_price,
          paid_amount: r.paid_amount,
          payment_status: r.payment_status,
          currency: (r.order_meta?.display_currency || "TWD").toUpperCase(),
        })) as OrderRow[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  // Aggregate per source (+ owlting/hotelnabe by ota_channel breakdown).
  // Revenue caliber: nightly accrual within [rangeStart, rangeEnd], excluding
  // cancelled + KOL. `total` is the accrued in-range revenue; paid/deposit/
  // pending are pro-rated by the same nightly fraction to keep 收款率一致.
  const aggregate = (rows: OrderRow[], winStart: Date, winEnd: Date) => {
    const map = new Map<string, SourceStat>();
    const subMap = new Map<string, Map<string, SourceStat>>();
    for (const o of rows) {
      // Query already filters cancelled/KOL, but guard defensively so the
      // caliber matches OccupancyRevenueTable even for mutated data.
      if (!isRevenueOrder(o)) continue;
      const total = accrueOrderAmount(o, o.final_price, winStart, winEnd);
      if (total === 0) continue; // no in-range nights
      const paid = accrueOrderAmount(o, o.paid_amount, winStart, winEnd);
      const isFullPaid = o.payment_status === "paid";

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
  };

  // 依 viewMode 決定要進入計算的訂單集合
  // - separate: 只取 selectedCurrency（TWD 或 JPY）
  // - consolidated: 全部訂單，JPY 依匯率換算成 TWD
  const transformRows = (rows: OrderRow[] | null): OrderRow[] => {
    if (!rows) return [];
    if (!isTraveldays) {
      // 非旅行日：維持原本行為 (TWD 主 bucket)
      return rows.filter((o) => (o.currency || "TWD").toUpperCase() === "TWD");
    }
    if (viewMode === "separate") {
      return rows.filter((o) => (o.currency || "TWD").toUpperCase() === selectedCurrency);
    }
    // consolidated：JPY → TWD (乘以匯率)
    return rows.map((o) => {
      const cur = (o.currency || "TWD").toUpperCase();
      if (cur === "TWD") return o;
      const mult = cur === "JPY" ? exchangeRate : 1;
      return {
        ...o,
        currency: "TWD",
        final_price: (Number(o.final_price) || 0) * mult,
        paid_amount: (Number(o.paid_amount) || 0) * mult,
      };
    });
  };

  const activeRows = useMemo(() => transformRows(orders), [orders, isTraveldays, viewMode, selectedCurrency, exchangeRate]);
  const activeTrendRows = useMemo(() => transformRows(trendOrders), [trendOrders, isTraveldays, viewMode, selectedCurrency, exchangeRate]);

  const activeAggregate = useMemo(() => aggregate(activeRows, rangeStart, rangeEnd), [activeRows, rangeStart, rangeEnd]);
  const stats = activeAggregate.stats;
  const totals = activeAggregate.totals;

  // 旅行日 separate 模式下：計算另一幣別的總覽（並排顯示用）
  const separateBuckets = useMemo(() => {
    if (!isTraveldays || viewMode !== "separate") return [] as Array<{ currency: string; total: number; count: number }>;
    const map = new Map<string, { total: number; count: number }>();
    for (const o of orders ?? []) {
      const c = (o.currency || "TWD").toUpperCase();
      const cur = map.get(c) ?? { total: 0, count: 0 };
      cur.total += Number(o.final_price) || 0;
      cur.count += 1;
      map.set(c, cur);
    }
    return Array.from(map.entries())
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => (a.currency === "TWD" ? -1 : b.currency === "TWD" ? 1 : a.currency.localeCompare(b.currency)));
  }, [orders, isTraveldays, viewMode]);

  // 顯示幣別符號：consolidated 一律 NT$，separate 依 selectedCurrency
  const activeSymbol = (!isTraveldays || viewMode === "consolidated")
    ? "NT$"
    : (CURRENCY_LABEL[selectedCurrency]?.symbol ?? selectedCurrency);
  const f = (n: number) => fmt(n, activeSymbol);

  const overallRate = totals.total > 0 ? (totals.paid / totals.total) * 100 : 0;

  // Monthly trend helper — accrues each order's revenue nightly, then buckets
  // per calendar month. Same caliber as `aggregate` above.
  const buildTrend = (rows: OrderRow[]) => {
    const today = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(format(subMonths(today, i), "yyyy-MM"));
    const trendStart = startOfMonth(subMonths(today, 5));
    const trendEnd = endOfMonth(today);

    // First pass: compute in-window totals per source (for top-5 ranking).
    const totalsBySource = new Map<string, number>();
    for (const o of rows) {
      if (!isRevenueOrder(o)) continue;
      const t = accrueOrderAmount(o, o.final_price, trendStart, trendEnd);
      if (t === 0) continue;
      const src = o.order_source || "unknown";
      totalsBySource.set(src, (totalsBySource.get(src) ?? 0) + t);
    }
    const topSources = Array.from(totalsBySource.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([src]) => src);

    const byMonth = new Map<string, Record<string, number>>();
    for (const m of months) byMonth.set(m, {});
    for (const o of rows) {
      const src = o.order_source || "unknown";
      if (!topSources.includes(src)) continue;
      const shares = accrueOrderNightlyShares(o, trendStart, trendEnd);
      for (const s of shares) {
        const m = s.date.slice(0, 7);
        if (!byMonth.has(m)) continue;
        const row = byMonth.get(m)!;
        row[src] = (row[src] ?? 0) + s.amount;
      }
    }
    const data = months.map((m) => {
      const row: Record<string, string | number> = { month: format(new Date(`${m}-01`), "M月") };
      for (const src of topSources) row[getOrderSourceConfig(src).label] = byMonth.get(m)?.[src] ?? 0;
      return row;
    });
    const keys = data.length === 0 ? [] : Object.keys(data[0]).filter((k) => k !== "month");
    return { data, keys };
  };

  const activeTrend = useMemo(() => buildTrend(activeTrendRows), [activeTrendRows]);
  const trendData = activeTrend.data;
  const trendKeys = activeTrend.keys;




  const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  return (
    <div className="space-y-6">
      {/* 旅行日專屬：檢視模式切換 */}
      {isTraveldays && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm">檢視模式</Label>
                <div className="flex bg-muted rounded-lg p-1">
                  <Button
                    variant={viewMode === "separate" ? "secondary" : "ghost"}
                    size="sm"
                    className="px-3"
                    onClick={() => setViewMode("separate")}
                  >
                    分開顯示
                  </Button>
                  <Button
                    variant={viewMode === "consolidated" ? "secondary" : "ghost"}
                    size="sm"
                    className="px-3"
                    onClick={() => setViewMode("consolidated")}
                  >
                    合併估算總額
                  </Button>
                </div>
              </div>
              {viewMode === "separate" ? (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">幣別</Label>
                  <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
                    <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TWD">TWD (NT$)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Label className="text-sm whitespace-nowrap">匯率 1 JPY =</Label>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onBlur={() => {
                      const n = Number(rateInput);
                      if (Number.isFinite(n) && n > 0) setExchangeRate(n);
                      else setRateInput(String(exchangeRate));
                    }}
                    className="h-9 w-24"
                  />
                  <span className="text-sm text-muted-foreground">TWD</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground ml-auto">
                {viewMode === "separate"
                  ? "TWD 與 JPY 分開統計，不相加"
                  : `JPY 依匯率 ${exchangeRate} 換算為 TWD 後合併計算`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Range controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {rangeMode === "month" && (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthCursor((d) => subMonths(d, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="text-sm font-medium px-3 h-7 min-w-[92px] text-center rounded hover:bg-background/60 transition-colors"
                  >
                    {format(monthCursor, "yyyy-MM")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
                  <div className="flex items-center justify-between mb-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setMonthCursor((d) => new Date(d.getFullYear() - 1, d.getMonth(), 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-sm font-semibold tabular-nums">{monthCursor.getFullYear()}</div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setMonthCursor((d) => new Date(d.getFullYear() + 1, d.getMonth(), 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 12 }, (_, i) => i).map((mIdx) => {
                      const isActive = monthCursor.getMonth() === mIdx;
                      return (
                        <button
                          key={mIdx}
                          type="button"
                          onClick={() =>
                            setMonthCursor(new Date(monthCursor.getFullYear(), mIdx, 1))
                          }
                          className={`h-9 rounded-md text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/70 text-foreground"
                          }`}
                        >
                          {mIdx + 1}月
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setMonthCursor(startOfMonth(new Date()))}
                    >
                      回到本月
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                
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
        <span className="text-xs text-muted-foreground">統計基準：夜次均攤（排除取消／KOL）</span>
      </div>

      {/* KPI card + Pie charts */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {loading && !orders ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="py-6"><Skeleton className="h-8 w-32" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <DollarSign className="h-4 w-4" />
                  </span>
                  訂單總額
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl md:text-4xl font-bold tabular-nums tracking-tight">{f(totals.total)}</div>
                <p className="text-sm text-muted-foreground mt-2">{rangeLabel} · <span className="tabular-nums font-medium text-foreground/80">{totals.count}</span> 筆</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">訂單總額來源占比</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">尚無資料</p>
                ) : (
                  <PieWithLegend
                    data={stats}
                    dataKey="total"
                    formatValue={(v) => f(v)}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">訂單數來源占比</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">尚無資料</p>
                ) : (
                  <PieWithLegend
                    data={stats}
                    dataKey="count"
                    formatValue={(v) => `${v} 筆`}
                  />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>


      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">來源明細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">來源</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">訂單數</TableHead>
                  <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">訂單總額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">尚無資料</TableCell>
                  </TableRow>
                ) : (
                  <>
                    {stats.map((s) => {
                      const hasBreakdown = !!s.breakdown && s.breakdown.length > 0;
                      const isOpen = expandedSources.has(s.source);
                      return (
                        <Fragment key={s.source}>
                          <TableRow>
                            <TableCell className="whitespace-nowrap py-3 font-medium">
                              {hasBreakdown ? (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(s.source)}
                                  className="inline-flex items-center gap-1.5 hover:text-primary"
                                >
                                  <ChevronDown
                                    className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                                  />
                                  {s.label}
                                  <span className="text-xs text-muted-foreground font-normal">
                                    ({s.breakdown!.length})
                                  </span>
                                </button>
                              ) : (
                                s.label
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums py-3">{s.count}</TableCell>
                            <TableCell className="text-right tabular-nums py-3 font-medium">{f(s.total)}</TableCell>
                          </TableRow>
                          {hasBreakdown && isOpen &&
                            s.breakdown!.map((sub) => (
                              <TableRow key={sub.source} className="bg-muted/20">
                                <TableCell className="whitespace-nowrap pl-10 text-sm text-muted-foreground">
                                  └ {sub.label}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{sub.count}</TableCell>
                                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{f(sub.total)}</TableCell>
                              </TableRow>
                            ))}
                        </Fragment>
                      );
                    })}
                    <TableRow className="font-semibold bg-muted/40 border-t-2">
                      <TableCell className="py-3">總計</TableCell>
                      <TableCell className="text-right tabular-nums py-3">{totals.count}</TableCell>
                      <TableCell className="text-right tabular-nums py-3">{f(totals.total)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 分開檢視模式下，顯示另一幣別的並排總覽 (旅行日專屬) */}
      {isTraveldays && viewMode === "separate" && separateBuckets.length > 1 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {separateBuckets.map((b) => {
            const meta = CURRENCY_LABEL[b.currency] ?? { label: `${b.currency} 營收`, symbol: b.currency };
            const isActive = b.currency === selectedCurrency;
            return (
              <button
                key={b.currency}
                type="button"
                onClick={() => setSelectedCurrency(b.currency)}
                className={`rounded-lg border p-4 text-left transition ${isActive ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
              >
                <div className="text-xs text-muted-foreground">{meta.label}</div>
                <div className="text-2xl font-bold tabular-nums mt-1">{fmt(b.total, meta.symbol)}</div>
                <div className="text-xs text-muted-foreground mt-1">{b.count} 筆 {isActive && "· 目前檢視"}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function PieWithLegend<T extends { label: string }>({
  data,
  dataKey,
  formatValue,
}: {
  data: T[];
  dataKey: keyof T;
  formatValue: (v: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [width, setWidth] = useState<number>(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const isNarrow = width < 640;
  const chartHeight = isNarrow ? 220 : 240;
  const outerRadius = isNarrow ? 78 : 90;
  const legendTextSize = "text-xs";

  const total = data.reduce((s, d) => s + Number(d[dataKey] ?? 0), 0) || 1;

  const activeItem = active !== null ? data[active] : null;
  const activeValue = activeItem ? Number(activeItem[dataKey] ?? 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full relative" style={{ height: chartHeight, minHeight: chartHeight }}>

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey={dataKey as string}
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={outerRadius}
              innerRadius={Math.round(outerRadius * 0.62)}
              paddingAngle={0.5}
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                  fillOpacity={active === null || active === i ? 1 : 0.25}
                  stroke="hsl(var(--background))"
                  strokeWidth={0.5}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {activeItem && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 shadow-sm text-xs whitespace-nowrap">
            <span className="text-muted-foreground">{activeItem.label}：</span>
            <span className="font-medium tabular-nums">{formatValue(activeValue)}</span>
          </div>
        )}
      </div>
      <ul
        className={`w-full space-y-0.5 ${legendTextSize}`}
        onMouseLeave={() => setActive(null)}
      >
        {data.map((d, i) => {
          const v = Number(d[dataKey] ?? 0);
          const p = (v / total) * 100;
          const selected = active === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => setActive(selected ? null : i)}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left transition-colors ${
                  selected ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="flex-1 min-w-0 truncate">{d.label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 font-medium">{p.toFixed(0)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default OrderSourceAnalyticsTab;
