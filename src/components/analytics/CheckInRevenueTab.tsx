import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getOrderSourceConfig, OWLTING_OTA_DISPLAY_NAMES } from "@/utils/orderHelpers";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { DateRangePicker } from "@/components/DateRangePicker";
import type { DateRange } from "react-day-picker";
import { TRAVELDAYS_ACC_ID } from "@/lib/currency";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  accommodationId: string;
  viewMode?: "separate" | "consolidated";
  selectedCurrency?: string;
  exchangeRate?: number;
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
  currency: string;
}

interface SourceStat {
  source: string;
  label: string;
  count: number;
  total: number;
  paid: number;
  pending: number;
  rate: number;
  breakdown?: SourceStat[];
}

const nt = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

export function CheckInRevenueTab({
  accommodationId,
  viewMode: viewModeProp,
  selectedCurrency: selectedCurrencyProp,
  exchangeRate: exchangeRateProp,
}: Props) {
  const isTraveldays = accommodationId === TRAVELDAYS_ACC_ID;
  const [rangeMode, setRangeMode] = useState<RangeMode>("month");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [customRange, setCustomRange] = useState<DateRange | undefined>(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const viewMode = viewModeProp ?? "separate";
  const selectedCurrency = selectedCurrencyProp ?? "TWD";
  const exchangeRate = exchangeRateProp ?? 0.21;

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
      return { rangeStart: startOfMonth(subMonths(today, 2)), rangeEnd: endOfMonth(today), rangeLabel: "近 3 個月" };
    }
    if (rangeMode === "last6") {
      return { rangeStart: startOfMonth(subMonths(today, 5)), rangeEnd: endOfMonth(today), rangeLabel: "近 6 個月" };
    }
    if (rangeMode === "year") {
      return {
        rangeStart: new Date(today.getFullYear(), 0, 1),
        rangeEnd: new Date(today.getFullYear(), 11, 31),
        rangeLabel: `${today.getFullYear()} 年`,
      };
    }
    const from = customRange?.from ?? startOfMonth(today);
    const to = customRange?.to ?? customRange?.from ?? endOfMonth(today);
    return {
      rangeStart: from,
      rangeEnd: to,
      rangeLabel: `${format(from, "yyyy/MM/dd")} – ${format(to, "yyyy/MM/dd")}`,
    };
  }, [rangeMode, monthCursor, customRange]);

  // 依「入住日」篩選：check_in_date 落在區間內的訂單，全額計入該日
  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, guest_name, order_source, order_status, ota_channel, check_in_date, check_out_date, final_price, paid_amount, payment_status, order_meta(display_currency)",
        )
        .eq("accommodation_id", accommodationId)
        .neq("order_status", "cancelled")
        .neq("order_source", "kol")
        .gte("check_in_date", format(rangeStart, "yyyy-MM-dd"))
        .lte("check_in_date", format(rangeEnd, "yyyy-MM-dd"));
      if (cancelled) return;
      if (error) {
        console.error(error);
        setOrders([]);
      } else {
        setOrders(
          ((data ?? []) as any[]).map((r) => ({
            id: r.id,
            order_number: r.order_number,
            guest_name: r.guest_name,
            order_source: r.order_source,
            order_status: r.order_status,
            ota_channel: r.ota_channel,
            check_in_date: r.check_in_date,
            check_out_date: r.check_out_date,
            final_price: r.final_price,
            paid_amount: r.paid_amount,
            payment_status: r.payment_status,
            currency: (r.order_meta?.display_currency || "TWD").toUpperCase(),
          })) as OrderRow[],
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId, rangeStart, rangeEnd]);

  const activeRows = useMemo(() => {
    const rows = orders ?? [];
    if (!isTraveldays) return rows.filter((o) => (o.currency || "TWD").toUpperCase() === "TWD");
    if (viewMode === "separate") return rows.filter((o) => (o.currency || "TWD").toUpperCase() === selectedCurrency);
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
  }, [orders, isTraveldays, viewMode, selectedCurrency, exchangeRate]);

  const { stats, totals } = useMemo(() => {
    const map = new Map<string, SourceStat>();
    const subMap = new Map<string, Map<string, SourceStat>>();
    for (const o of activeRows) {
      const total = Number(o.final_price) || 0;
      const paid = Number(o.paid_amount) || 0;
      const key = o.order_source || "unknown";
      const cfg = getOrderSourceConfig(key);
      const cur = map.get(key) ?? { source: key, label: cfg.label, count: 0, total: 0, paid: 0, pending: 0, rate: 0 };
      cur.count += 1;
      cur.total += total;
      cur.paid += paid;
      cur.pending += Math.max(0, total - paid);
      map.set(key, cur);

      if (key === "owlting" || key === "hotelnabe") {
        const ota = (o.ota_channel || "").toString().trim().toLowerCase() || "unknown";
        const subLabel =
          key === "owlting"
            ? ota === "unknown"
              ? "未指定"
              : OWLTING_OTA_DISPLAY_NAMES[ota] ?? ota
            : ota === "unknown"
              ? "未指定"
              : ota;
        if (!subMap.has(key)) subMap.set(key, new Map());
        const inner = subMap.get(key)!;
        const sub = inner.get(ota) ?? {
          source: `${key}:${ota}`,
          label: subLabel,
          count: 0,
          total: 0,
          paid: 0,
          pending: 0,
          rate: 0,
        };
        sub.count += 1;
        sub.total += total;
        sub.paid += paid;
        sub.pending += Math.max(0, total - paid);
        inner.set(ota, sub);
      }
    }
    const arr = Array.from(map.values()).map((s) => {
      const inner = subMap.get(s.source);
      return {
        ...s,
        rate: s.total > 0 ? (s.paid / s.total) * 100 : 0,
        breakdown: inner
          ? Array.from(inner.values())
              .map((x) => ({ ...x, rate: x.total > 0 ? (x.paid / x.total) * 100 : 0 }))
              .sort((a, b) => b.total - a.total)
          : undefined,
      };
    });
    arr.sort((a, b) => b.total - a.total);
    const t = arr.reduce(
      (acc, s) => {
        acc.count += s.count;
        acc.total += s.total;
        acc.paid += s.paid;
        acc.pending += s.pending;
        return acc;
      },
      { count: 0, total: 0, paid: 0, pending: 0 },
    );
    return { stats: arr, totals: t };
  }, [activeRows]);

  // 依入住日彙總
  const dailyRows = useMemo(() => {
    const map = new Map<string, { date: string; count: number; total: number; paid: number }>();
    for (const o of activeRows) {
      const d = (o.check_in_date || "").slice(0, 10);
      if (!d) continue;
      const cur = map.get(d) ?? { date: d, count: 0, total: 0, paid: 0 };
      cur.count += 1;
      cur.total += Number(o.final_price) || 0;
      cur.paid += Number(o.paid_amount) || 0;
      map.set(d, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [activeRows]);

  const detailOrders = useMemo(() => {
    if (!detailKey) return [];
    return activeRows
      .filter((o) => (o.check_in_date || "").slice(0, 10) === detailKey)
      .sort((a, b) => (Number(b.final_price) || 0) - (Number(a.final_price) || 0));
  }, [detailKey, activeRows]);

  const toggle = (src: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(src) ? next.delete(src) : next.add(src);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* 區間控制 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">入住收款統計</CardTitle>
          <CardDescription>
            以「入住日」為基準：跨日訂單不做平均分配，整筆訂單金額全數計入入住當天。目前區間：{rangeLabel}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { setMonthCursor((m) => subMonths(m, 1)); setRangeMode("month"); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="text-sm font-medium px-3 h-7 min-w-[92px] text-center rounded hover:bg-background/60 transition-colors tabular-nums"
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
                        onClick={() => {
                          setMonthCursor(new Date(monthCursor.getFullYear(), mIdx, 1));
                          setRangeMode("month");
                        }}
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
                    onClick={() => { setMonthCursor(startOfMonth(new Date())); setRangeMode("month"); }}
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
              onClick={() => { setMonthCursor((m) => subMonths(m, -1)); setRangeMode("month"); }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {([
              ["month", "單月"],
              ["last3", "近3月"],
              ["last6", "近6月"],
              ["year", "今年"],
            ] as [RangeMode, string][]).map(([m, label]) => (
              <Button
                key={m}
                variant={rangeMode === m ? "default" : "ghost"}
                size="sm"
                className={`px-3 h-7 ${rangeMode === m ? "" : "text-muted-foreground hover:bg-background"}`}
                onClick={() => setRangeMode(m)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker
              dateRange={customRange}
              allowFutureDates
              restartOnComplete
              onDateRangeChange={(r) => {
                setCustomRange(r);
                if (r?.from) setRangeMode("custom");
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "訂單數", value: totals.count.toLocaleString() },
          { label: "訂單總金額", value: nt(totals.total) },
          { label: "已收金額", value: nt(totals.paid) },
          { label: "未收金額", value: nt(totals.pending) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="pb-2">
              <CardDescription>{kpi.label}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-bold tabular-nums">{kpi.value}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 來源彙總 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">依訂單來源</CardTitle>
          <CardDescription>以入住日落在區間內的訂單全額計算</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">來源</TableHead>
                <TableHead className="text-right whitespace-nowrap">訂單數</TableHead>
                <TableHead className="text-right whitespace-nowrap">總金額</TableHead>
                <TableHead className="text-right whitespace-nowrap">已收</TableHead>
                <TableHead className="text-right whitespace-nowrap">未收</TableHead>
                <TableHead className="text-right whitespace-nowrap">收款率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    此區間尚無入住訂單
                  </TableCell>
                </TableRow>
              )}
              {stats.map((s) => (
                <Fragment key={s.source}>
                  <TableRow className={s.breakdown ? "cursor-pointer" : undefined} onClick={() => s.breakdown && toggle(s.source)}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {s.breakdown && (
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded.has(s.source) ? "" : "-rotate-90"}`} />
                        )}
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(s.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(s.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(s.pending)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.rate.toFixed(0)}%</TableCell>
                  </TableRow>
                  {s.breakdown &&
                    expanded.has(s.source) &&
                    s.breakdown.map((b) => (
                      <TableRow key={b.source} className="bg-muted/40">
                        <TableCell className="pl-8 text-sm whitespace-nowrap">{b.label}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{b.count}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{nt(b.total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{nt(b.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{nt(b.pending)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{b.rate.toFixed(0)}%</TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              ))}
              {stats.length > 0 && (
                <TableRow className="font-semibold">
                  <TableCell>合計</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{nt(totals.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nt(totals.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{nt(totals.pending)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.total > 0 ? ((totals.paid / totals.total) * 100).toFixed(0) : 0}%
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 每日入住彙總 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">每日入住金額</CardTitle>
          <CardDescription>點選日期可展開該日入住的訂單明細</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">入住日</TableHead>
                <TableHead className="text-right whitespace-nowrap">訂單數</TableHead>
                <TableHead className="text-right whitespace-nowrap">晚數</TableHead>
                <TableHead className="text-right whitespace-nowrap">總金額</TableHead>
                <TableHead className="text-right whitespace-nowrap">已收</TableHead>
                <TableHead className="text-right whitespace-nowrap">未收</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyRows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    此區間尚無入住訂單
                  </TableCell>
                </TableRow>
              )}
              {dailyRows.map((d) => (
                <Fragment key={d.date}>
                  <TableRow className="cursor-pointer" onClick={() => setDetailKey(detailKey === d.date ? null : d.date)}>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailKey === d.date ? "" : "-rotate-90"}`} />
                        {d.date}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                    <TableCell className="text-right tabular-nums">—</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(d.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(d.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{nt(Math.max(0, d.total - d.paid))}</TableCell>
                  </TableRow>
                  {detailKey === d.date &&
                    detailOrders.map((o) => {
                      const nights =
                        o.check_in_date && o.check_out_date
                          ? Math.max(
                              1,
                              Math.round(
                                (new Date(o.check_out_date).getTime() - new Date(o.check_in_date).getTime()) /
                                  86400000,
                              ),
                            )
                          : null;
                      return (
                      <TableRow key={o.id} className="bg-muted/40 text-sm">
                        <TableCell className="pl-8 whitespace-nowrap">
                          {o.order_number || o.id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-right truncate">{o.guest_name || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {nights ? `${nights} 晚` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{nt(Number(o.final_price) || 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{nt(Number(o.paid_amount) || 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {nt(Math.max(0, (Number(o.final_price) || 0) - (Number(o.paid_amount) || 0)))}
                        </TableCell>
                      </TableRow>
                      );
                    })}

                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default CheckInRevenueTab;
