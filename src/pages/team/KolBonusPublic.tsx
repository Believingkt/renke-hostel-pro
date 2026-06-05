import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo.png";

interface KolInfo {
  id: string;
  name: string | null;
  cid_code: string | null;
  venue_name: string | null;
  accommodation_id: string | null;
  token_expires_at: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  discount_code: string | null;
  check_in_date: string;
  check_out_date: string | null;
  order_date: string | null;
  total_price: number | null;
  final_price: number | null;
  order_status: string;
  accommodation_id: string | null;
}

interface CommissionSetting {
  accommodation_id: string;
  effective_from: string;
  rate: number | null;
}

const fmtMoney = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;

export default function KolBonusPublic() {
  const { token } = useParams<{ token: string }>();

  const twNow = (() => {
    const now = new Date();
    const twOffset = 8 * 60;
    return new Date(now.getTime() + (twOffset + now.getTimezoneOffset()) * 60000);
  })();
  const currentYear = twNow.getUTCFullYear();
  const currentMonthNum = twNow.getUTCMonth() + 1;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kol, setKol] = useState<KolInfo | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionSetting[]>([]);
  const [accNames, setAccNames] = useState<Record<string, string>>({});
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonthNum));

  useEffect(() => {
    if (!token) {
      setError("invalid");
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const { data, error: fnErr } = await supabase.functions.invoke("kol-bonus-public", {
        body: { token },
      });
      if (fnErr || !data) {
        setError("invalid");
        setLoading(false);
        return;
      }
      if ((data as any).error) {
        setError((data as any).error);
        setLoading(false);
        return;
      }
      setKol((data as any).kol);
      setOrders((data as any).orders ?? []);
      setCommissions((data as any).commissions ?? []);

      // Fetch accommodation names (public table)
      const accIds = Array.from(
        new Set(
          [
            ...((data as any).orders ?? []).map((o: OrderRow) => o.accommodation_id),
            (data as any).kol?.accommodation_id,
          ].filter(Boolean),
        ),
      ) as string[];
      if (accIds.length > 0) {
        const { data: accs } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", accIds);
        const map: Record<string, string> = {};
        (accs ?? []).forEach((a: any) => {
          map[a.id] = a.name;
        });
        setAccNames(map);
      }
      setLoading(false);
    })();
  }, [token]);

  const settingsByAcc = useMemo(() => {
    const map = new Map<string, CommissionSetting[]>();
    for (const c of commissions) {
      const arr = map.get(c.accommodation_id) ?? [];
      arr.push(c);
      map.set(c.accommodation_id, arr);
    }
    return map;
  }, [commissions]);

  const getRate = useCallback(
    (accommodationId: string | null, refDate?: string | null): number => {
      if (!accommodationId) return 0;
      const list = settingsByAcc.get(accommodationId);
      if (!list || list.length === 0) return 0;
      if (!refDate) return Number(list[0]?.rate ?? 0);
      const ref = refDate.slice(0, 10);
      const hit = list.find((s) => s.effective_from <= ref);
      return Number(hit?.rate ?? 0);
    },
    [settingsByAcc],
  );

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const o of orders) {
      if (o.order_date) set.add(Number(o.order_date.slice(0, 4)));
      if (o.check_out_date) set.add(Number(o.check_out_date.slice(0, 4)));
    }
    set.add(currentYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [orders, currentYear]);

  const isYearAll = filterMonth === "all";
  const prefix = isYearAll
    ? `${filterYear}-`
    : `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;

  const orderList = useMemo(
    () => orders.filter((o) => o.order_date?.startsWith(prefix)),
    [orders, prefix],
  );
  const completedList = useMemo(
    () => orders.filter((o) => o.check_out_date?.startsWith(prefix)),
    [orders, prefix],
  );

  const orderTotals = useMemo(() => {
    let count = 0;
    let revenue = 0;
    for (const o of orderList) {
      count += 1;
      revenue += Number(o.final_price ?? o.total_price ?? 0);
    }
    return { count, revenue };
  }, [orderList]);

  const completedTotals = useMemo(() => {
    let count = 0;
    let revenue = 0;
    let commission = 0;
    for (const o of completedList) {
      const r = Number(o.final_price ?? o.total_price ?? 0);
      const rate = getRate(o.accommodation_id, o.check_out_date);
      count += 1;
      revenue += r;
      commission += r * (rate / 100);
    }
    return { count, revenue, commission: Math.round(commission) };
  }, [completedList, getRate]);

  const computePayoutDate = (checkOut: string | null | undefined): string => {
    if (!checkOut) return "—";
    const [ys, ms] = checkOut.slice(0, 10).split("-");
    const y = Number(ys);
    const m = Number(ms);
    if (!y || !m) return "—";
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, "0")}-10`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        載入中...
      </div>
    );
  }

  if (error || !kol) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-background/95 backdrop-blur px-4 md:px-6 h-14 md:h-16 flex items-center">
          <img src={lokezeLogo} alt="Lakeze" className="h-8 md:h-9 w-auto" />
        </header>
        <main className="max-w-2xl mx-auto px-4 py-12">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>連結已失效</AlertTitle>
            <AlertDescription>
              此查詢連結已失效或不存在，請聯繫星探重新取得連結。
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40 px-4 md:px-6 h-14 md:h-16 flex items-center gap-3">
        <img src={lokezeLogo} alt="Lakeze" className="h-8 md:h-9 w-auto" />
        <h1 className="text-base md:text-lg font-semibold">KOL 業績查詢</h1>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{kol.name || "—"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              折扣碼 / CID：<span className="font-mono">{kol.cid_code || "—"}</span>
              {kol.venue_name ? `　|　館別：${kol.venue_name}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">期間</span>
              <Select
                value={String(filterYear)}
                onValueChange={(v) => setFilterYear(Number(v))}
              >
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y} 年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">整年</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m} 月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              訂單筆數依訂單日期統計，完成業績依退房日期統計
            </p>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-semibold">訂單明細（依訂單日期統計）</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">館別</TableHead>
                      <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                      <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                      <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                      <TableHead className="whitespace-nowrap">退房日期</TableHead>
                      <TableHead className="whitespace-nowrap text-right">訂單金額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                          此月份無資料
                        </TableCell>
                      </TableRow>
                    ) : (
                      orderList.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="whitespace-nowrap">
                            {accNames[o.accommodation_id ?? ""] || kol.venue_name || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{o.discount_code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {fmtMoney(Number(o.final_price ?? o.total_price ?? 0))}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                小計：{orderTotals.count} 筆｜總金額 {fmtMoney(orderTotals.revenue)}
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="text-sm font-semibold">完成業績明細（依退房日期統計）</div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">館別</TableHead>
                      <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                      <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                      <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                      <TableHead className="whitespace-nowrap">退房日期</TableHead>
                      <TableHead className="whitespace-nowrap text-right">金額</TableHead>
                      <TableHead className="whitespace-nowrap text-right">分潤%</TableHead>
                      <TableHead className="whitespace-nowrap text-right">分潤金額</TableHead>
                      <TableHead className="whitespace-nowrap">預計發放日</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                          此月份無資料
                        </TableCell>
                      </TableRow>
                    ) : (
                      completedList.map((o) => {
                        const rate = getRate(o.accommodation_id, o.check_out_date);
                        const revenue = Number(o.final_price ?? o.total_price ?? 0);
                        const amount = Math.round(revenue * (rate / 100));
                        return (
                          <TableRow key={o.id}>
                            <TableCell className="whitespace-nowrap">
                              {accNames[o.accommodation_id ?? ""] || kol.venue_name || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono">{o.discount_code}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(revenue)}</TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{rate}%</TableCell>
                            <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(amount)}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{computePayoutDate(o.check_out_date)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                小計：{completedTotals.count} 筆｜總完成業績 {fmtMoney(completedTotals.revenue)}｜總分潤 {fmtMoney(completedTotals.commission)}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
