import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Filter } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type QStatus = "pending" | "sending" | "sent" | "failed" | "skipped";
type ResStatus = "Commit" | "Modify" | "Cancel";

interface ConfigRow {
  accommodation_id: string;
  owlting_hotel_code: string | null;
}
interface AccRow { id: string; name: string }
interface OrderRow { id: string; order_number: string | null }

interface QueueRow {
  id: string;
  accommodation_id: string;
  order_id: string;
  res_status: ResStatus;
  status: QStatus;
  attempt_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  sent_at: string | null;
}

interface LogRow {
  id: string;
  queue_id: string | null;
  http_status: number | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<QStatus, string> = {
  pending: "待送",
  sending: "送出中",
  sent: "已送達",
  failed: "失敗",
  skipped: "略過",
};

const STATUS_VARIANT: Record<QStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  sending: "secondary",
  sent: "default",
  failed: "destructive",
  skipped: "outline",
};

export function OwlTingPushMonitor() {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [accs, setAccs] = useState<AccRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [overview, setOverview] = useState({
    total: 0, successRate: 0, retrying: 0, permFailed: 0, skipped: 0,
  });
  const [accFilter, setAccFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Overview (aggregate over full queue + log tables)
      const [
        { count: totalQ },
        { count: successQ },
        { count: retryingQ },
        { count: permQ },
        { count: skippedQ },
      ] = await Promise.all([
        supabase.from("owlting_order_push_queue").select("id", { count: "exact", head: true }),
        supabase.from("owlting_order_push_queue").select("id", { count: "exact", head: true }).eq("status", "sent"),
        supabase.from("owlting_order_push_queue").select("id", { count: "exact", head: true }).eq("status", "failed").lt("attempt_count", 5),
        supabase.from("owlting_order_push_queue").select("id", { count: "exact", head: true }).gte("attempt_count", 5),
        supabase.from("owlting_order_push_queue").select("id", { count: "exact", head: true }).eq("status", "skipped"),
      ]);

      const total = totalQ ?? 0;
      const sent = successQ ?? 0;
      setOverview({
        total,
        successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 0,
        retrying: retryingQ ?? 0,
        permFailed: permQ ?? 0,
        skipped: skippedQ ?? 0,
      });

      // Latest 100 queue rows
      const { data: qData, error: qErr } = await supabase
        .from("owlting_order_push_queue")
        .select("id, accommodation_id, order_id, res_status, status, attempt_count, last_error, next_retry_at, created_at, sent_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (qErr) throw qErr;
      const qRows = (qData || []) as QueueRow[];
      setQueue(qRows);

      // Related logs (most recent per queue_id)
      const qIds = qRows.map(q => q.id);
      const orderIds = Array.from(new Set(qRows.map(q => q.order_id)));
      const accIds = Array.from(new Set(qRows.map(q => q.accommodation_id)));

      const [{ data: lData }, { data: oData }, { data: cData }, { data: aData }] = await Promise.all([
        qIds.length
          ? supabase.from("owlting_order_push_log")
              .select("id, queue_id, http_status, success, error_message, created_at")
              .in("queue_id", qIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as LogRow[] }),
        orderIds.length
          ? supabase.from("orders").select("id, order_number").in("id", orderIds)
          : Promise.resolve({ data: [] as OrderRow[] }),
        accIds.length
          ? supabase.from("accommodation_owlting_config")
              .select("accommodation_id, owlting_hotel_code")
              .in("accommodation_id", accIds)
          : Promise.resolve({ data: [] as ConfigRow[] }),
        supabase.from("accommodation_info").select("id, name"),
      ]);

      setLogs((lData || []) as LogRow[]);
      setOrders((oData || []) as OrderRow[]);
      setConfigs((cData || []) as ConfigRow[]);
      setAccs((aData || []) as AccRow[]);
    } catch (e: any) {
      toast.error("載入失敗：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const accName = (id: string) => accs.find(a => a.id === id)?.name || "—";
  const hotelCode = (id: string) => configs.find(c => c.accommodation_id === id)?.owlting_hotel_code || "—";
  const orderNo = (id: string | null | undefined) => {
    if (!id) return "—";
    return orders.find(o => o.id === id)?.order_number || id.slice(0, 8);
  };
  const latestLogFor = (qid: string) => logs.find(l => l.queue_id === qid);

  const filtered = useMemo(() => {
    return queue.filter(q =>
      (accFilter === "all" || q.accommodation_id === accFilter) &&
      (statusFilter === "all" || q.status === statusFilter)
    );
  }, [queue, accFilter, statusFilter]);

  const handleRetry = async (q: QueueRow) => {
    const { error } = await supabase
      .from("owlting_order_push_queue")
      .update({ status: "pending", next_retry_at: new Date().toISOString(), last_error: null })
      .eq("id", q.id);
    if (error) {
      toast.error("重推失敗：" + error.message);
      return;
    }
    toast.success(`已重設為 pending，等待下次推送：${orderNo(q.order_id)}`);
    loadAll();
  };

  const accOptions = useMemo(() => {
    const ids = Array.from(new Set(queue.map(q => q.accommodation_id)));
    return ids.map(id => ({ id, name: accName(id) }));
  }, [queue, accs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>奧丁丁訂單同步監控</CardTitle>
            <CardDescription>推送 queue 概覽（唯讀，重推僅重設 queue 狀態）</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="總推送筆數" value={overview.total} />
            <StatCard label="成功率" value={`${overview.successRate}%`} />
            <StatCard label="待重試" value={overview.retrying} tone="warn" />
            <StatCard label="永久失敗" value={overview.permFailed} tone="danger" />
            <StatCard label="略過 (skipped)" value={overview.skipped} tone="muted" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />篩選
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">物業</div>
              <Select value={accFilter} onValueChange={setAccFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部物業</SelectItem>
                  {accOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">狀態</div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {(Object.keys(STATUS_LABEL) as QStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">近 100 筆推送</CardTitle>
          <CardDescription>顯示 queue 最新 100 筆，含對應最新 log。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">時間</TableHead>
                <TableHead className="whitespace-nowrap">物業 (HotelCode)</TableHead>
                <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                <TableHead className="whitespace-nowrap">操作</TableHead>
                <TableHead className="whitespace-nowrap">狀態</TableHead>
                <TableHead className="whitespace-nowrap">嘗試</TableHead>
                <TableHead className="whitespace-nowrap">HTTP</TableHead>
                <TableHead>錯誤摘要</TableHead>
                <TableHead className="whitespace-nowrap text-right">動作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {loading ? "載入中…" : "沒有資料"}
                </TableCell></TableRow>
              ) : filtered.map(q => {
                const log = latestLogFor(q.id);
                const err = (q.last_error || log?.error_message || "").slice(0, 120);
                return (
                  <TableRow key={q.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {format(new Date(q.created_at), "MM/dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {accName(q.accommodation_id)} <span className="text-muted-foreground">({hotelCode(q.accommodation_id)})</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono">{orderNo(q.order_id)}</TableCell>
                    <TableCell className="whitespace-nowrap">{q.res_status}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={STATUS_VARIANT[q.status]}>{STATUS_LABEL[q.status]}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{q.attempt_count}</TableCell>
                    <TableCell className="tabular-nums">{log?.http_status ?? "—"}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={q.last_error || log?.error_message || ""}>
                      {err || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {q.status === "failed" ? (
                        <Button size="sm" variant="outline" onClick={() => handleRetry(q)}>重推</Button>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "danger" | "muted" }) {
  const color =
    tone === "danger" ? "text-destructive" :
    tone === "warn" ? "text-amber-600" :
    tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
