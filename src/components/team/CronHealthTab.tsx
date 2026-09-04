import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface CronHealthRow {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string | null;
  last_message: string | null;
  runs_24h: number;
  failures_24h: number;
}

/** 重點關注的排程（排在最前面） */
const PRIORITY_JOBS = ["send-daily-performance", "notify-order-status-change"];

const fmt = (v: string | null) => {
  if (!v) return "—";
  return new Date(v).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const hoursSince = (v: string | null) =>
  v ? (Date.now() - new Date(v).getTime()) / 3_600_000 : null;

export default function CronHealthTab() {
  const [rows, setRows] = useState<CronHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("team_cron_health");
    setLoading(false);
    setLoaded(true);
    if (error) {
      toast.error("讀取排程狀態失敗：" + error.message);
      return;
    }
    const list = ((data ?? []) as CronHealthRow[]).slice().sort((a, b) => {
      const ai = PRIORITY_JOBS.findIndex((k) => a.jobname.includes(k));
      const bi = PRIORITY_JOBS.findIndex((k) => b.jobname.includes(k));
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return a.jobname.localeCompare(b.jobname);
    });
    setRows(list);
  };

  useEffect(() => {
    void load();
  }, []);

  const statusOf = (r: CronHealthRow) => {
    if (!r.active) return { label: "已停用", variant: "secondary" as const };
    if (r.failures_24h > 0) return { label: "近期失敗", variant: "destructive" as const };
    const h = hoursSince(r.last_start);
    if (h === null) return { label: "從未執行", variant: "destructive" as const };
    if (h > 48) return { label: "疑似中斷", variant: "destructive" as const };
    if (h > 26) return { label: "逾期未跑", variant: "outline" as const };
    return { label: "正常", variant: "default" as const };
  };

  if (!loaded && loading) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">排程健康檢查</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          重新整理
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          時間為台北時間。「疑似中斷」表示超過 48 小時未執行，通常代表排程曾被暫停。
        </p>
        <div className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[280px]">排程</TableHead>
                <TableHead className="w-[140px]">週期</TableHead>
                <TableHead className="w-[110px]">狀態</TableHead>
                <TableHead className="w-[170px]">最後執行</TableHead>
                <TableHead className="w-[120px]">結果</TableHead>
                <TableHead className="w-[140px]">24 小時內</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const s = statusOf(r);
                return (
                  <TableRow key={r.jobid}>
                    <TableCell className="font-medium whitespace-nowrap">{r.jobname}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {r.schedule}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {fmt(r.last_start)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.last_status ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-sm">
                      {r.runs_24h} 次
                      {r.failures_24h > 0 ? `（失敗 ${r.failures_24h}）` : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
