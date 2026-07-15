import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { DollarSign, Users, Calendar } from "lucide-react";

interface Props {
  accommodationId: string;
}

interface Row {
  order_date: string;
  check_in_date: string | null;
  check_out_date: string | null;
  final_price: number | null;
  currency: string | null;
  order_status: string | null;
  order_source: string | null;
  guest_count: number | null;
}

const EXCLUDED = new Set(["cancelled", "reserved"]);

export function TraveldaysOverviewPanel({ accommodationId }: Props) {
  const [viewMode, setViewMode] = useState<"separate" | "consolidated">("separate");
  const [selectedCurrency, setSelectedCurrency] = useState<"TWD" | "JPY">("TWD");
  const [exchangeRate, setExchangeRate] = useState<number>(0.21);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const from = format(startOfMonth(subMonths(new Date(), 5)), "yyyy-MM-dd");
      const { data } = await supabase
        .from("orders")
        .select("order_date, check_in_date, check_out_date, final_price, currency, order_status, order_source, guest_count")
        .eq("accommodation_id", accommodationId)
        .gte("order_date", from);
      if (cancelled) return;
      setRows((data || []) as Row[]);
    })();
    return () => { cancelled = true; };
  }, [accommodationId]);

  const {
    curMonthTwd, curMonthJpy, curMonthOrdersTwd, curMonthOrdersJpy,
    curMonthGuestsTwd, curMonthGuestsJpy, trend,
  } = useMemo(() => {
    const list = (rows || []).filter(r => !EXCLUDED.has((r.order_status || "").toLowerCase()));
    const monthKey = (d: string) => format(new Date(d), "yyyy-MM");
    const cur = format(startOfMonth(new Date()), "yyyy-MM");

    let ctwd = 0, cjpy = 0, otwd = 0, ojpy = 0, gtwd = 0, gjpy = 0;
    const map = new Map<string, { twd: number; jpy: number }>();

    list.forEach(r => {
      const k = monthKey(r.order_date);
      const price = Number(r.final_price) || 0;
      const isJpy = (r.currency || "TWD").toUpperCase() === "JPY";
      const entry = map.get(k) || { twd: 0, jpy: 0 };
      if (isJpy) entry.jpy += price; else entry.twd += price;
      map.set(k, entry);
      if (k === cur) {
        if (isJpy) { cjpy += price; ojpy += 1; gjpy += Number(r.guest_count) || 0; }
        else { ctwd += price; otwd += 1; gtwd += Number(r.guest_count) || 0; }
      }
    });

    const months: string[] = [];
    for (let i = 5; i >= 0; i--) months.push(format(subMonths(new Date(), i), "yyyy-MM"));
    const trend = months.map(m => {
      const e = map.get(m) || { twd: 0, jpy: 0 };
      return {
        month: format(new Date(m + "-01"), "M月"),
        TWD: Math.round(e.twd),
        JPY: Math.round(e.jpy),
        合併TWD: Math.round(e.twd + e.jpy * exchangeRate),
      };
    });

    return {
      curMonthTwd: ctwd, curMonthJpy: cjpy,
      curMonthOrdersTwd: otwd, curMonthOrdersJpy: ojpy,
      curMonthGuestsTwd: gtwd, curMonthGuestsJpy: gjpy,
      trend,
    };
  }, [rows, exchangeRate]);

  if (rows === null) return null;

  const consolidatedRevenue = curMonthTwd + curMonthJpy * exchangeRate;
  const consolidatedOrders = curMonthOrdersTwd + curMonthOrdersJpy;
  const avgPrice = consolidatedOrders > 0 ? consolidatedRevenue / consolidatedOrders : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">旅行日 · 雙幣別總覽</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              以訂單成交日期（order_date）計算，已排除取消 / 保留。JPY 訂單不套用系統匯率，僅在合併估算時使用你輸入的匯率。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "separate" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("separate")}
            >
              分開顯示
            </Button>
            <Button
              variant={viewMode === "consolidated" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("consolidated")}
            >
              合併估算總額
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {viewMode === "separate" ? (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">圖表 / 表格幣別：</Label>
              <Select value={selectedCurrency} onValueChange={(v) => setSelectedCurrency(v as any)}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TWD">TWD (NT$)</SelectItem>
                  <SelectItem value="JPY">JPY (¥)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat icon={DollarSign} label="本月營收 (TWD)" value={`NT$ ${curMonthTwd.toLocaleString()}`} />
              <MiniStat icon={DollarSign} label="本月營收 (JPY)" value={`¥ ${curMonthJpy.toLocaleString()}`} />
              <MiniStat icon={Calendar} label={`本月訂單 (${selectedCurrency})`} value={String(selectedCurrency === "TWD" ? curMonthOrdersTwd : curMonthOrdersJpy)} />
              <MiniStat icon={Users} label={`入住人數 (${selectedCurrency})`} value={String(selectedCurrency === "TWD" ? curMonthGuestsTwd : curMonthGuestsJpy)} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => (selectedCurrency === "TWD" ? `NT$ ${Number(v).toLocaleString()}` : `¥ ${Number(v).toLocaleString()}`)} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={selectedCurrency}
                    stroke={selectedCurrency === "TWD" ? "hsl(var(--primary))" : "#e11d48"}
                    strokeWidth={2}
                    name={selectedCurrency === "TWD" ? "TWD 營收" : "JPY 營收"}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">自訂匯率 1 JPY =</Label>
              <Input
                type="number"
                step="0.001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value) || 0)}
                className="h-8 w-28"
              />
              <span className="text-xs text-muted-foreground">TWD</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MiniStat icon={DollarSign} label="預估總營收 (TWD)" value={`NT$ ${Math.round(consolidatedRevenue).toLocaleString()}`} />
              <MiniStat icon={Calendar} label="本月訂單" value={String(consolidatedOrders)} />
              <MiniStat icon={DollarSign} label="平均房價 (TWD)" value={`NT$ ${Math.round(avgPrice).toLocaleString()}`} />
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => `NT$ ${Number(v).toLocaleString()}`} />
                  <Legend />
                  <Line type="monotone" dataKey="合併TWD" stroke="hsl(var(--primary))" strokeWidth={2} name="合併估算 (TWD)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}
