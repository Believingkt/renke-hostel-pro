import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { OwlTingEmailStatsCards } from "@/components/OwlTingEmailStatsCards";
import { OwlTingFillupDialog } from "@/components/OwlTingFillupDialog";
import { toast } from "sonner";
import { Send, Loader2, ClipboardEdit } from "lucide-react";

interface RawEmail {
  id: string;
  received_at: string;
  from_email: string | null;
  from_domain: string | null;
  subject: string | null;
  message_type: string | null;
  obe_number: string | null;
  accommodation_name: string | null;
  status: string;
  notes: string | null;
}

interface StagingLite {
  id: string;
  raw_email_id: string;
  pii_status: string;
  accommodation_id: string | null;
  accommodation_name: string | null;
  notified_at: string | null;
  pii_due_at: string | null;
  matched_acc_id: string | null;
  match_reason: string | null;
  unmatch_reason: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  parsed: "default",
  received: "secondary",
  matched: "default",
  ignored: "outline",
  failed: "destructive",
};

const PII_LABEL: Record<string, string> = {
  pending_pii_fillup: "待補 PII",
  pii_filled: "已補齊",
  promoted_to_booking: "已建單",
};

const PII_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_pii_fillup: "destructive",
  pii_filled: "secondary",
  promoted_to_booking: "default",
};

const TYPE_LABEL: Record<string, string> = {
  new_order: "新訂單",
  modified: "修改",
  cancelled: "取消",
  unknown: "未知",
};

export default function OwlTingEmailIngest() {
  const [rows, setRows] = useState<RawEmail[]>([]);
  const [stagingMap, setStagingMap] = useState<Record<string, StagingLite>>({});
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [fillupStagingId, setFillupStagingId] = useState<string | null>(null);
  const [fillupOpen, setFillupOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const load = async () => {
    setLoading(true);
    const { data: list } = await supabase
      .from("owlting_email_orders_raw")
      .select("id,received_at,from_email,from_domain,subject,message_type,obe_number,accommodation_name,status,notes")
      .order("received_at", { ascending: false })
      .limit(50);
    const rawRows = (list as RawEmail[]) ?? [];
    setRows(rawRows);

    if (rawRows.length > 0) {
      const [{ data: staging }, { data: accs }] = await Promise.all([
        supabase
          .from("owlting_email_parsed_staging")
          .select("id,raw_email_id,pii_status,accommodation_id,accommodation_name,notified_at,pii_due_at")
          .in("raw_email_id", rawRows.map((r) => r.id)),
        supabase.from("accommodation_info").select("id,name"),
      ]);
      const accList = (accs ?? []) as { id: string; name: string | null }[];
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
      const accByNorm = new Map<string, string>();
      accList.forEach((a) => { if (a.name) accByNorm.set(norm(a.name), a.id); });

      // Owner email → accommodation_id (for from_email fallback match)
      const fromEmails = Array.from(new Set(rawRows.map((r) => (r.from_email ?? "").toLowerCase()).filter(Boolean)));
      const ownerMap = new Map<string, string>();
      if (fromEmails.length > 0) {
        const { data: owners } = await supabase
          .from("accommodation_owners")
          .select("email,accommodation_id")
          .in("email", fromEmails)
          .eq("is_active", true);
        (owners ?? []).forEach((o: any) => {
          if (o.email && o.accommodation_id) ownerMap.set(String(o.email).toLowerCase(), o.accommodation_id);
        });
      }

      const rawById = new Map(rawRows.map((r) => [r.id, r]));
      const map: Record<string, StagingLite> = {};
      (staging ?? []).forEach((s: any) => {
        let matched: string | null = s.accommodation_id ?? null;
        let matchReason: string | null = matched ? "已綁定 accommodation_id" : null;
        let unmatchReason: string | null = null;
        const raw = rawById.get(s.raw_email_id);
        const name = (s.accommodation_name ?? "").trim();
        const fe = (raw?.from_email ?? "").toLowerCase();

        if (!matched) {
          if (name) {
            const target = norm(name);
            if (accByNorm.has(target)) {
              matched = accByNorm.get(target)!;
              matchReason = `民宿名稱完全相符：「${name}」`;
            } else {
              for (const [k, id] of accByNorm) {
                if (k.includes(target) || target.includes(k)) {
                  matched = id;
                  matchReason = `民宿名稱模糊相符：「${name}」`;
                  break;
                }
              }
            }
          }
        }
        if (!matched) {
          if (fe && ownerMap.has(fe)) {
            matched = ownerMap.get(fe)!;
            matchReason = `寄件者 Email 對應業主：${fe}`;
          }
        }
        if (!matched) {
          const parts: string[] = [];
          if (!name) parts.push("民宿名稱：（空）");
          else parts.push(`民宿名稱「${name}」找不到對應`);
          if (!fe) parts.push("寄件者 Email：（空）");
          else parts.push(`寄件者 ${fe} 未綁定業主`);
          unmatchReason = parts.join("；");
        }
        map[s.raw_email_id] = { ...s, matched_acc_id: matched, match_reason: matchReason, unmatch_reason: unmatchReason };
      });
      setStagingMap(map);
    } else {
      setStagingMap({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sendFillupNotification = async (stagingId: string) => {
    setSendingId(stagingId);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-fillup-issue", {
        body: { staging_id: stagingId },
      });
      if (error) throw error;
      const emailed = (data as any)?.emailed_to?.length ?? 0;
      const owners = (data as any)?.owners_count ?? 0;
      if (owners === 0) {
        toast.warning("尚未設定業主聯絡人，請先到 HQ → 系統管理 → 業主聯絡人 新增");
      } else if (emailed === 0) {
        toast.warning(`連結已產生但 Email 發送失敗，請檢查 Resend 設定`);
      } else {
        toast.success(`已寄送補單通知給 ${emailed} 位業主`);
      }
      await load();
    } catch (e: any) {
      toast.error(`發送失敗：${e.message ?? e}`);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        title="奧丁丁訂單收件監控"
        action={<Button variant="outline" onClick={() => { load(); setRefreshTick((t) => t + 1); }} disabled={loading}>重新整理</Button>}
      />


      <OwlTingEmailStatsCards showDetailLink={false} refreshKey={refreshTick} />

      <Card>
        <CardHeader><CardTitle>最近 50 筆 Email</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>類型</TableHead>
                <TableHead>OBE</TableHead>
                <TableHead>來源</TableHead>
                <TableHead>主旨</TableHead>
                <TableHead>補單狀態</TableHead>
                <TableHead className="text-right">動作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const st = stagingMap[r.id];
                const canSend = st && st.pii_status === "pending_pii_fillup";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {format(new Date(r.received_at), "MM/dd HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.message_type ? TYPE_LABEL[r.message_type] ?? r.message_type : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.obe_number ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.from_domain ?? r.from_email ?? "—"}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-xs" title={r.subject ?? ""}>{r.subject ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {st ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={PII_VARIANT[st.pii_status] ?? "outline"}>
                            {PII_LABEL[st.pii_status] ?? st.pii_status}
                          </Badge>
                          {st.notified_at && (
                            <span className="text-[10px] text-muted-foreground">
                              已通知 {format(new Date(st.notified_at), "MM/dd HH:mm")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canSend && (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex justify-end gap-1.5">
                            {st.matched_acc_id ? (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => { setFillupStagingId(st.id); setFillupOpen(true); }}
                                title={st.match_reason ?? undefined}
                              >
                                <ClipboardEdit className="h-3.5 w-3.5 mr-1" />補單
                              </Button>
                            ) : (
                              <span
                                className="text-[10px] text-amber-600 dark:text-amber-400 max-w-[220px] text-right leading-tight"
                                title={st.unmatch_reason ?? "無法自動匹配民宿"}
                              >
                                ⚠ 無法自動匹配民宿
                                {st.unmatch_reason && (
                                  <span className="block text-muted-foreground">{st.unmatch_reason}</span>
                                )}
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendFillupNotification(st.id)}
                              disabled={sendingId === st.id}
                            >
                              {sendingId === st.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Send className="h-3.5 w-3.5 mr-1" />
                                  {st.notified_at ? "重發通知" : "發送通知"}
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">尚無收件記錄</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OwlTingFillupDialog
        open={fillupOpen}
        onOpenChange={setFillupOpen}
        stagingId={fillupStagingId}
        onSubmitted={() => { load(); setRefreshTick((t) => t + 1); }}
      />

    </div>
  );
}
