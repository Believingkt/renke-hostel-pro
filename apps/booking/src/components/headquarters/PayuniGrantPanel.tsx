import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Input } from "@lakeze/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { GRANT_COLS, GRANT_NOTICE, dailyTotals, fmtTime, grantTable, money, taipeiDate, type GrantRecord } from "@/lib/payuniGrant";

const ALL = "all";

/** HQ「PAYUNi 金流 → 撥款」：跨館每日入帳合計、對不到交易的列（只顯示）、補跑某日（super_admin） */
export function PayuniGrantPanel() {
  const [from, setFrom] = useState(() => taipeiDate(-14));
  const [to, setTo] = useState(() => taipeiDate(0));
  const [rows, setRows] = useState<GrantRecord[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await grantTable().select(GRANT_COLS).gte("query_date", from).lte("query_date", to)
      .order("query_date", { ascending: false }).limit(5000);
    const { data: accs } = await supabase.from("accommodation_info").select("id, name").not("payuni_mer_id", "is", null);
    setLoading(false);
    if (error) { toast.error("載入撥款資料失敗"); return; }
    setRows((data ?? []) as GrantRecord[]);
    setNames(Object.fromEntries((accs ?? []).map((a) => [a.id, a.name])));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => dailyTotals(rows), [rows]);
  const unmatched = useMemo(() => rows.filter((r) => r.match_status === "unmatched"), [rows]);
  const name = (id: string) => names[id] ?? id;

  return (
    <div className="space-y-4" data-testid="payuni-grant-panel">
      <GrantRerunCard names={names} onDone={load} />
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">每日入帳合計（依館）</CardTitle>
            <CardDescription>每天台北 10:00 同步前一日撥款明細；{GRANT_NOTICE}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="payuni-grant-hq-from" />
            <span className="text-muted-foreground">～</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="payuni-grant-hq-to" />
            <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="payuni-grant-hq-reload">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>撥款日</TableHead><TableHead>館別</TableHead><TableHead className="text-right">筆數</TableHead>
              <TableHead className="text-right">手續費</TableHead><TableHead className="text-right">入帳合計</TableHead>
              <TableHead className="text-right">對不到</TableHead><TableHead>最後同步</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {totals.map((t) => (
                <TableRow key={t.key} data-testid={`payuni-grant-total-${t.date}-${t.accommodation_id}`}>
                  <TableCell>{t.date}</TableCell><TableCell>{name(t.accommodation_id)}</TableCell>
                  <TableCell className="text-right">{t.count}</TableCell><TableCell className="text-right">{money(t.fee)}</TableCell>
                  <TableCell className="text-right">{money(t.funds)}</TableCell>
                  <TableCell className={`text-right ${t.unmatched ? "text-destructive font-medium" : ""}`}>{t.unmatched}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{fmtTime(t.lastSynced)}</TableCell>
                </TableRow>
              ))}
              {totals.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">此期間沒有撥款紀錄</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">對不到交易（{unmatched.length}）</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>撥款日</TableHead><TableHead>館別</TableHead><TableHead>商店訂單編號</TableHead><TableHead>入帳／出帳</TableHead>
              <TableHead className="text-right">執行金額</TableHead><TableHead className="text-right">入帳金額</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {unmatched.map((r) => (
                <TableRow key={r.id} data-testid={`payuni-grant-unmatched-${r.id}`}>
                  <TableCell>{r.query_date}</TableCell><TableCell>{name(r.accommodation_id)}</TableCell>
                  <TableCell className="font-mono text-sm">{r.mer_trade_no ?? "—"}</TableCell>
                  <TableCell>{[r.type, r.action].filter(Boolean).join("・") || "—"}</TableCell>
                  <TableCell className="text-right">{money(r.execute_amt)}</TableCell><TableCell className="text-right">{money(r.funds_amt)}</TableCell>
                </TableRow>
              ))}
              {unmatched.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">沒有對不到的撥款列</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function GrantRerunCard({ names, onDone }: { names: Record<string, string>; onDone: () => void }) {
  const [date, setDate] = useState(() => taipeiDate(-1));
  const [acc, setAcc] = useState(ALL);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("payuni-grant-sync", {
      body: { action: "run", date, ...(acc !== ALL ? { accommodation_id: acc } : {}) },
    });
    setBusy(false);
    if (error || !data?.ok) { toast.error(data?.error ?? "補跑失敗"); return; }
    const msg = `${date} 補跑完成：${data.accommodations} 館、${data.fetched} 筆，失敗 ${data.failed} 館、對不到 ${data.unmatched} 筆`;
    if (data.failed || data.shrink?.length) toast.warning(msg); else toast.success(msg);
    onDone();
  };
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">補跑某日</CardTitle>
        <CardDescription>只能查今天往前 30 天內；重跑同一天會覆蓋同一列，不會重複</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} min={taipeiDate(-30)} max={taipeiDate(0)} onChange={(e) => setDate(e.target.value)} className="w-40" data-testid="payuni-grant-rerun-date" />
        <Select value={acc} onValueChange={setAcc}>
          <SelectTrigger className="w-48" data-testid="payuni-grant-rerun-acc"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部 PAYUNi 館</SelectItem>
            {Object.entries(names).map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={run} disabled={busy || !date} data-testid="payuni-grant-rerun-btn">
          {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}補跑
        </Button>
      </CardContent>
    </Card>
  );
}
