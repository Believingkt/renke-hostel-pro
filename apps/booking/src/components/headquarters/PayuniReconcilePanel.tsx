import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Textarea } from "@lakeze/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@lakeze/shared/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";

export const DIFF_LABEL: Record<string, string> = {
  amount_mismatch: "金額不符", not_found: "PAYUNi 查無", local_paid_remote_unpaid: "本地已付、PAYUNi 未付", refund_mismatch: "退款不一致",
};
interface Run { id: string; run_date: string; completed: boolean; queried: number; matched: number; processing: number; status_fixed: number; diff_counts: Record<string, number>; note: string | null }
interface Diff { id: string; mer_trade_no: string; diff_type: string; accommodation_id: string | null; accommodation_name: string | null; order_number: string | null; local_value: unknown; payuni_value: unknown; last_seen_at: string }

const ALL = "all";
const sumDiffs = (r: Run) => Object.values(r.diff_counts ?? {}).reduce((a, n) => a + Number(n), 0);

/** HQ「PAYUNi 金流 → 對帳」：最近 30 天執行結果、未解決差異（super_admin；資料只經 payuni-reconcile） */
export function PayuniReconcilePanel() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [acc, setAcc] = useState(ALL);
  const [type, setType] = useState(ALL);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Diff | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("payuni-reconcile", {
      body: { action: "list", ...(acc !== ALL ? { accommodation_id: acc } : {}), ...(type !== ALL ? { diff_type: type } : {}) },
    });
    setLoading(false);
    if (error || !data?.ok) { toast.error("載入對帳資料失敗"); return; }
    setRuns(data.runs);
    setDiffs(data.diffs);
  }, [acc, type]);
  useEffect(() => { load(); }, [load]);

  const accOptions = useMemo(() => {
    const m = new Map<string, string>();
    diffs.forEach((d) => d.accommodation_id && m.set(d.accommodation_id, d.accommodation_name ?? d.accommodation_id));
    if (acc !== ALL && !m.has(acc)) m.set(acc, acc);
    return [...m.entries()];
  }, [diffs, acc]);

  const requery = async (d: Diff) => {
    setBusy(d.id);
    const { data, error } = await supabase.functions.invoke("payuni-trade-query", { body: { mer_trade_no: d.mer_trade_no } });
    setBusy(null);
    if (error || data?.error) toast.error(data?.error ?? "重新查詢失敗");
    else toast.success(`重新查詢完成：${data?.status ?? ""}`);
  };

  const resolve = async () => {
    if (!resolving || note.trim().length < 2) return;
    setBusy(resolving.id);
    const { data, error } = await supabase.functions.invoke("payuni-reconcile", { body: { action: "resolve", diff_id: resolving.id, note: note.trim() } });
    setBusy(null);
    if (error || !data?.ok) { toast.error(data?.error ?? "標記失敗"); return; }
    toast.success("已標記處理");
    setResolving(null);
    setNote("");
    load();
  };

  return (
    <div className="space-y-4" data-testid="payuni-reconcile-panel">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">每日對帳結果（最近 30 天）</CardTitle>
            <CardDescription>每天台北 03:30 起對帳前一日的 PAYUNi 交易；未查完會在 03:45、04:00 接續</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} data-testid="payuni-reconcile-reload">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>日期</TableHead><TableHead className="text-right">查詢</TableHead><TableHead className="text-right">一致</TableHead>
              <TableHead className="text-right">處理中</TableHead><TableHead className="text-right">自動補入帳</TableHead><TableHead className="text-right">差異</TableHead><TableHead>狀態</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} data-testid={`payuni-reconcile-run-${r.run_date}`}>
                  <TableCell>{r.run_date}</TableCell>
                  <TableCell className="text-right">{r.queried}</TableCell>
                  <TableCell className="text-right">{r.matched}</TableCell>
                  <TableCell className="text-right">{r.processing}</TableCell>
                  <TableCell className="text-right">{r.status_fixed}</TableCell>
                  <TableCell className="text-right">{sumDiffs(r)}</TableCell>
                  <TableCell>{r.completed ? <Badge variant="outline">完成</Badge> : <Badge variant="destructive" title={r.note ?? ""}>未查完</Badge>}</TableCell>
                </TableRow>
              ))}
              {runs.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">尚無對帳紀錄</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">未解決差異（{diffs.length}）</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <Select value={acc} onValueChange={setAcc}>
              <SelectTrigger className="w-48" data-testid="payuni-reconcile-filter-acc"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部館別</SelectItem>
                {accOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-48" data-testid="payuni-reconcile-filter-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部類型</SelectItem>
                {Object.entries(DIFF_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>館別</TableHead><TableHead>訂單</TableHead><TableHead>商店訂單編號</TableHead><TableHead>類型</TableHead>
              <TableHead>本地／PAYUNi</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {diffs.map((d) => (
                <TableRow key={d.id} data-testid={`payuni-reconcile-diff-${d.id}`}>
                  <TableCell>{d.accommodation_name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{d.order_number ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{d.mer_trade_no}</TableCell>
                  <TableCell><Badge variant="outline">{DIFF_LABEL[d.diff_type] ?? d.diff_type}</Badge></TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    <div>本地 {JSON.stringify(d.local_value)}</div><div>PAYUNi {JSON.stringify(d.payuni_value)}</div>
                  </TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <Button size="sm" variant="outline" disabled={busy === d.id} onClick={() => requery(d)} data-testid={`payuni-reconcile-requery-${d.id}`}>重新查詢</Button>
                    <Button size="sm" disabled={busy === d.id} onClick={() => { setResolving(d); setNote(""); }} data-testid={`payuni-reconcile-resolve-${d.id}`}>標記已處理</Button>
                  </TableCell>
                </TableRow>
              ))}
              {diffs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">沒有未解決差異</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>標記已處理：{resolving?.mer_trade_no}</DialogTitle></DialogHeader>
          <Textarea placeholder="處理備註（必填）" value={note} onChange={(e) => setNote(e.target.value)} data-testid="payuni-reconcile-resolve-note" />
          <DialogFooter>
            <Button disabled={note.trim().length < 2 || busy === resolving?.id} onClick={resolve} data-testid="payuni-reconcile-resolve-confirm">確認</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
