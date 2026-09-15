import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, FileCode, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { OwlTingRawEmailDialog } from "@/components/OwlTingRawEmailDialog";

type OutcomeKey =
  | "order_created"
  | "order_updated"
  | "noop_modification"
  | "order_cancelled"
  | "apply_failed"
  | "parse_failed"
  | "ignored_untrusted"
  | "staged"
  | "unknown";

const OUTCOME_META: Record<
  OutcomeKey,
  { label: string; hint: string; tone: "primary" | "success" | "warning" | "destructive" | "muted" }
> = {
  order_created: { label: "新建訂單", hint: "自動建立補單佔位", tone: "primary" },
  order_updated: { label: "更新既有訂單", hint: "依 diff 更新，不重複佔位", tone: "success" },
  noop_modification: { label: "空修改（忽略）", hint: "逐欄比對後無實質變更", tone: "muted" },
  order_cancelled: { label: "取消同步", hint: "取消通知已同步 PMS", tone: "warning" },
  apply_failed: { label: "處理失敗", hint: "建單/更新流程發生錯誤", tone: "destructive" },
  parse_failed: { label: "解析失敗", hint: "缺 OBE 或主旨無法辨識", tone: "destructive" },
  ignored_untrusted: { label: "已忽略（非信任）", hint: "非白名單寄件者", tone: "muted" },
  staged: { label: "僅入庫待處理", hint: "已解析但未觸發自動動作", tone: "muted" },
  unknown: { label: "未標記", hint: "舊資料或尚未寫入結果", tone: "muted" },
};

const ORDER: OutcomeKey[] = [
  "order_created",
  "order_updated",
  "noop_modification",
  "order_cancelled",
  "apply_failed",
  "parse_failed",
  "ignored_untrusted",
  "staged",
  "unknown",
];

interface Row {
  id: string;
  received_at: string | null;
  obe_number: string | null;
  message_type: string | null;
  accommodation_name: string | null;
  subject: string | null;
  ingest_outcome: string | null;
  ingest_outcome_at: string | null;
  ingest_outcome_detail: Record<string, unknown> | null;
}

const FETCH_LIMIT = 300;

interface Props {
  refreshKey?: number | string;
  accommodationId?: string | null;
}

export function OwlTingIngestOutcomeBoard({ refreshKey, accommodationId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<OutcomeKey | null>(null);
  const [rawEmailId, setRawEmailId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("owlting_email_orders_raw")
      .select(
        "id,received_at,obe_number,message_type,accommodation_name,subject,ingest_outcome,ingest_outcome_at,ingest_outcome_detail",
      )
      .order("received_at", { ascending: false })
      .limit(FETCH_LIMIT);
    if (accommodationId) q = q.eq("accommodation_id", accommodationId);
    const { data } = await q;
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [refreshKey, accommodationId]);

  const bucket = (r: Row): OutcomeKey => {
    const k = (r.ingest_outcome ?? "unknown") as OutcomeKey;
    return OUTCOME_META[k] ? k : "unknown";
  };

  const grouped = ORDER.reduce<Record<OutcomeKey, Row[]>>((acc, k) => {
    acc[k] = rows.filter((r) => bucket(r) === k);
    return acc;
  }, {} as Record<OutcomeKey, Row[]>);

  const detailText = (d: Record<string, unknown> | null): string => {
    if (!d) return "—";
    const diff = Array.isArray(d.diff) ? (d.diff as any[]) : [];
    if (diff.length) {
      return diff
        .map((c) => `${c.label}：${c.before ?? "—"} → ${c.after ?? "—"}`)
        .join("；");
    }
    if (d.reason) return String(d.reason);
    if (d.order_number) return `訂單 ${d.order_number}`;
    if (d.diff_status) return `差異判定：${d.diff_status}`;
    return "—";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">收件處理結果看板</CardTitle>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          重新整理
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {ORDER.map((k) => {
            const meta = OUTCOME_META[k];
            const count = grouped[k].length;
            const color =
              meta.tone === "primary"
                ? "text-primary"
                : meta.tone === "success"
                ? "text-emerald-600"
                : meta.tone === "warning"
                ? "text-amber-600"
                : meta.tone === "destructive"
                ? count > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
                : "text-muted-foreground";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setActive(k)}
                className="rounded-lg border p-4 text-left hover:bg-muted/50 hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="text-xs text-muted-foreground">{meta.label}</div>
                <div className={`text-2xl font-bold mt-1 ${color}`}>{count}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{meta.hint}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          統計最近 {FETCH_LIMIT} 封信件，點擊卡片可查看對應 OBE 與差異摘要。
        </p>
      </CardContent>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {active ? OUTCOME_META[active].label : ""}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {active ? `共 ${grouped[active].length} 筆` : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>處理時間</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>OBE</TableHead>
                  <TableHead>民宿</TableHead>
                  <TableHead>差異 / 原因</TableHead>
                  <TableHead className="text-right">動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active && grouped[active].length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      無資料
                    </TableCell>
                  </TableRow>
                )}
                {active &&
                  grouped[active].map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {r.ingest_outcome_at || r.received_at
                          ? format(new Date(r.ingest_outcome_at ?? r.received_at!), "MM/dd HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {r.message_type ? (
                          <Badge variant={r.message_type === "cancelled" ? "destructive" : "secondary"}>
                            {r.message_type}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.obe_number ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.accommodation_name ?? "—"}</TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground max-w-[360px] truncate"
                        title={detailText(r.ingest_outcome_detail)}
                      >
                        {detailText(r.ingest_outcome_detail)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRawEmailId(r.id);
                            setRawOpen(true);
                          }}
                        >
                          <FileCode className="h-3.5 w-3.5 mr-1" />
                          信件原文
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <OwlTingRawEmailDialog open={rawOpen} onOpenChange={setRawOpen} rawEmailId={rawEmailId} />
    </Card>
  );
}
