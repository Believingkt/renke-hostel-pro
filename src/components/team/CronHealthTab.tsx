import { Fragment, useEffect, useState } from "react";
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
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
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

interface CronHistoryRow {
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  return_message: string | null;
}

/** 只顯示與「業績通報」相關的功能；其他系統排程一律不在此頁呈現 */
const FEATURE_LABELS: Array<{ match: string; label: string; desc: string }> = [
  {
    match: "send-daily-performance",
    label: "每日業績通報",
    desc: "每天定時把各館業績整理後推播到 LINE 群",
  },
  {
    match: "notify-order-status-change",
    label: "訂單狀態即時通報",
    desc: "訂單成立、付款或取消時即時推播通知",
  },
];

const featureOf = (jobname: string) => FEATURE_LABELS.find((f) => jobname.includes(f.match));

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

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

const pad = (n: string) => n.padStart(2, "0");

const formatScheduleChinese = (cron: string): string => {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, day, month, weekday] = parts;
  const isStar = (v: string) => v === "*";
  const isStep = (v: string) => v.startsWith("*/");

  if (isStep(min) && isStar(hour) && isStar(day) && isStar(month) && isStar(weekday)) {
    return `每 ${min.slice(2)} 分鐘`;
  }
  if (min === "0" && isStep(hour) && isStar(day) && isStar(month) && isStar(weekday)) {
    return `每 ${hour.slice(2)} 小時`;
  }
  if (!isStar(min) && isStar(hour) && isStar(day) && isStar(month) && isStar(weekday)) {
    return `每小時 ${pad(min)} 分`;
  }
  if (!isStar(min) && !isStar(hour) && isStar(day) && isStar(month) && isStar(weekday)) {
    return `每天 ${pad(hour)}:${pad(min)}`;
  }
  if (!isStar(min) && !isStar(hour) && isStar(day) && isStar(month) && !isStar(weekday)) {
    const w = weekday
      .split(",")
      .map((d) => WEEKDAY_NAMES[parseInt(d, 10)] ?? d)
      .join("、");
    return `每週${w} ${pad(hour)}:${pad(min)}`;
  }
  if (!isStar(min) && !isStar(hour) && !isStar(day) && isStar(month) && isStar(weekday)) {
    return `每月 ${day} 日 ${pad(hour)}:${pad(min)}`;
  }
  if (isStar(min) && isStar(hour) && !isStar(day) && isStar(month) && isStar(weekday)) {
    return `每月 ${day} 日`;
  }
  return cron;
};

export default function CronHealthTab() {
  const [rows, setRows] = useState<CronHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<number, CronHistoryRow[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("team_cron_health");
    setLoading(false);
    setLoaded(true);
    if (error) {
      toast.error("讀取功能狀態失敗：" + error.message);
      return;
    }
    const list = ((data ?? []) as CronHealthRow[])
      .filter((r) => !!featureOf(r.jobname))
      .slice()
      .sort((a, b) => {
        const ai = FEATURE_LABELS.findIndex((f) => a.jobname.includes(f.match));
        const bi = FEATURE_LABELS.findIndex((f) => b.jobname.includes(f.match));
        return ai - bi;
      });
    setRows(list);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleHistory = async (r: CronHealthRow) => {
    if (expanded === r.jobid) {
      setExpanded(null);
      return;
    }
    setExpanded(r.jobid);
    if (history[r.jobid]) return;
    setHistoryLoading(true);
    const { data, error } = await (supabase as any).rpc("team_cron_history", {
      _jobid: r.jobid,
      _limit: 20,
    });
    setHistoryLoading(false);
    if (error) {
      setHistoryUnavailable(true);
      return;
    }
    setHistory((prev) => ({ ...prev, [r.jobid]: (data ?? []) as CronHistoryRow[] }));
  };

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
        <CardTitle className="text-base">功能狀態查詢</CardTitle>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          重新整理
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          時間為台北時間。此處僅顯示與業績通報相關的功能。點開任一列可查看過去的執行紀錄，功能即使被關閉，先前的紀錄仍會保留。
        </p>
        <div className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">功能項目</TableHead>
                <TableHead className="w-[140px]">週期</TableHead>
                <TableHead className="w-[110px]">狀態</TableHead>
                <TableHead className="w-[170px]">最後執行</TableHead>
                <TableHead className="w-[120px]">結果</TableHead>
                <TableHead className="w-[140px]">24 小時內</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    目前沒有可顯示的業績通報功能
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const s = statusOf(r);
                const f = featureOf(r.jobname);
                const isOpen = expanded === r.jobid;
                const rec = history[r.jobid];
                return (
                  <Fragment key={r.jobid}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => void toggleHistory(r)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-start gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="min-w-0">
                            <div>{f?.label ?? r.jobname}</div>
                            <div className="text-xs text-muted-foreground break-words">
                              {f?.desc}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-sm">{formatScheduleChinese(r.schedule)}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {r.schedule}
                        </div>
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
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          {historyLoading && !rec ? (
                            <span className="text-sm text-muted-foreground">載入紀錄中…</span>
                          ) : historyUnavailable && !rec ? (
                            <span className="text-sm text-muted-foreground">
                              歷史紀錄查詢將於此次調整套用後開放。
                            </span>
                          ) : rec && rec.length > 0 ? (
                            <div className="space-y-1">
                              {rec.map((h, i) => (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
                                >
                                  <span className="tabular-nums">{fmt(h.start_time)}</span>
                                  <Badge
                                    variant={
                                      h.status === "succeeded" ? "secondary" : "destructive"
                                    }
                                  >
                                    {h.status === "succeeded" ? "成功" : h.status ?? "未知"}
                                  </Badge>
                                  {h.return_message && (
                                    <span className="text-xs text-muted-foreground break-all">
                                      {h.return_message}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">尚無執行紀錄</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
