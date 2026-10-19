import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Input } from "@lakeze/shared/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import {
  GRANT_COLS, GRANT_NOTICE, GRANT_OUTFLOW_NOTICE, MATCH_LABEL, dailyTotals, grantTable, money, taipeiDate, type GrantRecord,
} from "@/lib/payuniGrant";

/** 金流稽核：PAYUNi 撥款紀錄（RLS 限本館 hotel_admin／super_admin；本館從未有撥款資料時不顯示） */
export function PayuniGrantRecordsCard({ accommodationId }: { accommodationId: string | null }) {
  const [from, setFrom] = useState(() => taipeiDate(-14));
  const [to, setTo] = useState(() => taipeiDate(0));
  const [rows, setRows] = useState<GrantRecord[] | null>(null);
  const [hasAny, setHasAny] = useState(false);
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    grantTable().select("id").eq("accommodation_id", accommodationId).limit(1)
      .then(({ data }: { data: unknown[] | null }) => setHasAny(!!data?.length));
  }, [accommodationId]);

  const load = useCallback(async () => {
    if (!accommodationId || !hasAny) return;
    setLoading(true);
    const { data } = await grantTable().select(GRANT_COLS).eq("accommodation_id", accommodationId)
      .gte("query_date", from).lte("query_date", to).order("query_date", { ascending: false }).order("row_seq").limit(2000);
    const list = (data ?? []) as GrantRecord[];
    const ids = [...new Set(list.map((r) => r.order_id).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: os } = await supabase.from("orders").select("id, order_number").in("id", ids);
      setOrders(Object.fromEntries((os ?? []).map((o) => [o.id, o.order_number])));
    }
    setRows(list);
    setLoading(false);
  }, [accommodationId, hasAny, from, to]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => dailyTotals(rows ?? []), [rows]);
  if (!accommodationId || !hasAny) return null;

  return (
    <Card data-testid="payuni-grant-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">PAYUNi 撥款紀錄</CardTitle>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="payuni-grant-from" />
            <span className="text-muted-foreground">～</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="payuni-grant-to" />
            <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="payuni-grant-reload">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <CardDescription data-testid="payuni-grant-notice">{GRANT_NOTICE}</CardDescription>
        <CardDescription>{GRANT_OUTFLOW_NOTICE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" data-testid="payuni-grant-daily">
          {totals.map((t) => (
            <div key={t.key} className="rounded-md border px-3 py-2 text-sm" data-testid={`payuni-grant-daily-${t.date}`}>
              <div className="text-muted-foreground">{t.date}・{t.count} 筆</div>
              <div className="font-medium">入帳合計 {money(t.funds)}</div>
            </div>
          ))}
          {rows && totals.length === 0 && <span className="text-sm text-muted-foreground">此期間沒有撥款紀錄</span>}
        </div>
        {rows && rows.length > 0 && <GrantDetailTable rows={rows} orders={orders} />}
      </CardContent>
    </Card>
  );
}

function GrantDetailTable({ rows, orders }: { rows: GrantRecord[]; orders: Record<string, string> }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>撥款日</TableHead><TableHead>訂單</TableHead><TableHead>付款／退款</TableHead><TableHead>付款／退款日期</TableHead>
          <TableHead className="text-right">執行金額</TableHead><TableHead className="text-right">手續費</TableHead><TableHead className="text-right">入帳金額</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-testid={`payuni-grant-row-${r.row_seq}-${r.query_date}`}>
              <TableCell className="whitespace-nowrap">{r.query_date}</TableCell>
              <TableCell className="font-mono text-sm">
                {r.order_id && orders[r.order_id]
                  ? <Link to={`/admin/orders/${r.order_id}`} className="text-primary hover:underline">{orders[r.order_id]}</Link>
                  : r.mer_trade_no ?? "—"}
                {r.match_status !== "matched" && <Badge variant={r.match_status === "unmatched" ? "destructive" : "outline"} className="ml-2">{MATCH_LABEL[r.match_status]}</Badge>}
              </TableCell>
              <TableCell>{[r.type, r.action].filter(Boolean).join("・") || "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-sm">{r.payment_date ?? "—"}</TableCell>
              <TableCell className="text-right">{money(r.execute_amt)}</TableCell>
              <TableCell className="text-right">{money(r.fee)}</TableCell>
              <TableCell className="text-right">{money(r.funds_amt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
