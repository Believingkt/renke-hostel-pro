import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PreloadLink } from "@/components/PreloadLink";
import { Mail, ExternalLink, FileCode, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { OwlTingRawEmailDialog } from "@/components/OwlTingRawEmailDialog";

type CategoryKey =
  | "total"
  | "parsed"
  | "pendingPii"
  | "overduePii"
  | "quarantined"
  | "ignored";

interface CategoryRow {
  id: string;                // row id (raw email id when possible)
  raw_email_id: string | null;
  received_at: string | null;
  from_email: string | null;
  subject: string | null;
  obe_number: string | null;
  message_type: string | null;
  accommodation_name: string | null;
  status: string | null;
  extra?: string | null;     // eg. pii_due_at, failure reason
}

interface Buckets {
  total: CategoryRow[];
  parsed: CategoryRow[];
  pendingPii: CategoryRow[];
  overduePii: CategoryRow[];
  quarantined: CategoryRow[];
  ignored: CategoryRow[];
}

const EMPTY_BUCKETS: Buckets = {
  total: [], parsed: [], pendingPii: [], overduePii: [], quarantined: [], ignored: [],
};

interface Props {
  showDetailLink?: boolean;
  showHeader?: boolean;
  refreshKey?: number | string;
  accommodationId?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  new_order: "新訂單",
  modified: "修改",
  cancelled: "取消",
  unknown: "未知",
};

const CATEGORY_TITLE: Record<CategoryKey, string> = {
  total: "總收件數",
  parsed: "成功解析",
  pendingPii: "待補 PII",
  overduePii: "逾期未補",
  quarantined: "隔離區（需人工）",
  ignored: "已忽略（非信任）",
};

const FETCH_LIMIT = 300;

export function OwlTingEmailStatsCards({ showDetailLink = true, showHeader = true, refreshKey, accommodationId }: Props) {
  const [buckets, setBuckets] = useState<Buckets>(EMPTY_BUCKETS);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryKey | null>(null);
  const [rawEmailId, setRawEmailId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const scope = (q: any) => (accommodationId ? q.eq("accommodation_id", accommodationId) : q);

    // Raw email lists (total / parsed / ignored)
    const rawSelect = "id,received_at,from_email,subject,obe_number,message_type,accommodation_name,status";

    const [
      totalRes,
      parsedRes,
      ignoredRes,
      stagingRes,
      quarantineRes,
    ] = await Promise.all([
      scope(supabase.from("owlting_email_orders_raw").select(rawSelect).order("received_at", { ascending: false }).limit(FETCH_LIMIT)),
      scope(supabase.from("owlting_email_orders_raw").select(rawSelect).eq("status", "parsed").order("received_at", { ascending: false }).limit(FETCH_LIMIT)),
      scope(supabase.from("owlting_email_orders_raw").select(rawSelect).eq("status", "ignored").order("received_at", { ascending: false }).limit(FETCH_LIMIT)),
      // Staging with pending_pii_fillup — for pending & overdue. Filter cancelled OBE client-side.
      scope(
        supabase
          .from("owlting_email_parsed_staging")
          .select("id,raw_email_id,obe_number,accommodation_name,message_type,pii_due_at,created_at,channel_source")
          .eq("pii_status", "pending_pii_fillup")
          .order("created_at", { ascending: false })
          .limit(FETCH_LIMIT)
      ),
      accommodationId
        ? Promise.resolve({ data: [] as any[], error: null })
        : supabase
            .from("owlting_email_parse_failures")
            .select("id,raw_email_id,failure_stage,error_message,created_at")
            .eq("resolved", false)
            .eq("failure_stage", "subject_parse")
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT),
    ]);

    const mapRaw = (r: any): CategoryRow => ({
      id: r.id,
      raw_email_id: r.id,
      received_at: r.received_at,
      from_email: r.from_email,
      subject: r.subject,
      obe_number: r.obe_number,
      message_type: r.message_type,
      accommodation_name: r.accommodation_name,
      status: r.status,
    });

    const totalRows: CategoryRow[] = (totalRes.data ?? []).map(mapRaw);
    const parsedRows: CategoryRow[] = (parsedRes.data ?? []).map(mapRaw);
    const ignoredRows: CategoryRow[] = (ignoredRes.data ?? []).map(mapRaw);

    // Build set of OBE numbers that have a cancellation email (from total raw list).
    const cancelledObes = new Set<string>();
    for (const r of totalRows) {
      if (r.message_type === "cancelled" && r.obe_number) cancelledObes.add(r.obe_number);
    }

    // Pending / overdue from staging — exclude cancelled-type staging AND
    // any staging whose OBE appears in a cancellation email.
    const stagingRows = (stagingRes.data ?? []) as any[];
    const filteredStaging = stagingRows.filter(
      (s) =>
        s.message_type !== "cancelled" &&
        !(s.obe_number && cancelledObes.has(s.obe_number)),
    );

    const pendingRows: CategoryRow[] = filteredStaging.map((s) => ({
      id: s.id,
      raw_email_id: s.raw_email_id,
      received_at: s.created_at,
      from_email: null,
      subject: null,
      obe_number: s.obe_number,
      message_type: s.message_type,
      accommodation_name: s.accommodation_name,
      status: "pending_pii_fillup",
      extra: s.pii_due_at ? `截止 ${format(new Date(s.pii_due_at), "MM/dd HH:mm")}` : null,
    }));

    const overdueRows: CategoryRow[] = filteredStaging
      .filter((s) => s.pii_due_at && s.pii_due_at < nowIso)
      .map((s) => ({
        id: s.id,
        raw_email_id: s.raw_email_id,
        received_at: s.created_at,
        from_email: null,
        subject: null,
        obe_number: s.obe_number,
        message_type: s.message_type,
        accommodation_name: s.accommodation_name,
        status: "overdue",
        extra: s.pii_due_at ? `已逾期（${format(new Date(s.pii_due_at), "MM/dd HH:mm")}）` : null,
      }));

    const quarantineRows: CategoryRow[] = ((quarantineRes as any).data ?? []).map((f: any) => ({
      id: f.id,
      raw_email_id: f.raw_email_id ?? null,
      received_at: f.created_at,
      from_email: null,
      subject: null,
      obe_number: null,
      message_type: null,
      accommodation_name: null,
      status: f.failure_stage,
      extra: f.error_message ?? null,
    }));

    setBuckets({
      total: totalRows,
      parsed: parsedRows,
      pendingPii: pendingRows,
      overduePii: overdueRows,
      quarantined: quarantineRows,
      ignored: ignoredRows,
    });
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [refreshKey, accommodationId]);

  const openRaw = (rid: string | null) => {
    if (!rid) return;
    setRawEmailId(rid);
    setRawOpen(true);
  };

  return (
    <Card>
      {showHeader && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">奧丁丁訂單收件監控</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              重新整理
            </Button>
            {showDetailLink && (
              <Button variant="outline" size="sm" asChild>
                <PreloadLink to="/admin/owlting-email-ingest">
                  詳細記錄
                  <ExternalLink className="h-3.5 w-3.5 ml-1" />
                </PreloadLink>
              </Button>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatBox label="總收件數" value={buckets.total.length} onClick={() => setActiveCategory("total")} />
          <StatBox label="成功解析" value={buckets.parsed.length} tone="primary" onClick={() => setActiveCategory("parsed")} />
          <StatBox
            label="待補 PII"
            value={buckets.pendingPii.length}
            tone={buckets.pendingPii.length > 0 ? "warning" : "muted"}
            hint="業主尚未補齊住客資料"
            onClick={() => setActiveCategory("pendingPii")}
          />
          <StatBox
            label="逾期未補"
            value={buckets.overduePii.length}
            tone={buckets.overduePii.length > 0 ? "destructive" : "muted"}
            hint="超過補單截止時間（不含已取消）"
            onClick={() => setActiveCategory("overduePii")}
          />
          <StatBox
            label="隔離區(需人工)"
            value={buckets.quarantined.length}
            tone={buckets.quarantined.length > 0 ? "destructive" : "muted"}
            hint="信任來源但無法解析"
            onClick={() => setActiveCategory("quarantined")}
          />
          <StatBox
            label="已忽略(非信任)"
            value={buckets.ignored.length}
            tone="muted"
            hint="非白名單寄件者"
            onClick={() => setActiveCategory("ignored")}
          />
        </div>
      </CardContent>

      <Dialog open={!!activeCategory} onOpenChange={(o) => !o && setActiveCategory(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {activeCategory ? CATEGORY_TITLE[activeCategory] : ""}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {activeCategory ? `共 ${buckets[activeCategory].length} 筆` : ""}
                {activeCategory && buckets[activeCategory].length >= FETCH_LIMIT && (
                  <span className="ml-1">（僅顯示最近 {FETCH_LIMIT} 筆）</span>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時間</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>OBE</TableHead>
                  <TableHead>民宿</TableHead>
                  <TableHead>寄件者 / 主旨</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead className="text-right">動作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCategory && buckets[activeCategory].length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      無資料
                    </TableCell>
                  </TableRow>
                )}
                {activeCategory && buckets[activeCategory].map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.received_at ? format(new Date(r.received_at), "MM/dd HH:mm") : "—"}
                    </TableCell>
                    <TableCell>
                      {r.message_type ? (
                        <Badge variant={r.message_type === "cancelled" ? "destructive" : "secondary"}>
                          {TYPE_LABEL[r.message_type] ?? r.message_type}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.obe_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.accommodation_name ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[280px]">
                      {r.from_email && <div className="truncate" title={r.from_email}>{r.from_email}</div>}
                      {r.subject && <div className="truncate text-muted-foreground" title={r.subject}>{r.subject}</div>}
                      {!r.from_email && !r.subject && "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={r.extra ?? ""}>
                      {r.extra ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!r.raw_email_id}
                        onClick={() => openRaw(r.raw_email_id)}
                      >
                        <FileCode className="h-3.5 w-3.5 mr-1" />信件原文
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

function StatBox({
  label,
  value,
  tone = "default",
  hint,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "primary" | "destructive" | "muted" | "warning";
  hint?: string;
  onClick?: () => void;
}) {
  const colorClass =
    tone === "primary"
      ? "text-primary"
      : tone === "destructive"
      ? "text-destructive"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border p-4 text-left hover:bg-muted/50 hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </button>
  );
}
