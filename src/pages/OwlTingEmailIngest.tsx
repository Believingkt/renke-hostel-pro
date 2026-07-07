import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
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
import { Send, Loader2, ClipboardEdit, FileCode } from "lucide-react";
import { OwlTingRawEmailDialog } from "@/components/OwlTingRawEmailDialog";

interface RawEmail {
  id: string;
  received_at: string;
  from_email: string | null;
  from_domain: string | null;
  subject: string | null;
  message_type: string | null;
  obe_number: string | null;
  accommodation_name: string | null;
  accommodation_id: string | null;
  status: string;
  notes: string | null;
}

interface StagingLite {
  id: string;
  raw_email_id: string;
  pii_status: string;
  accommodation_id: string | null;
  accommodation_name: string | null;
  channel_source: string | null;
  promoted_order_id: string | null;
  review_notes: string | null;
  notified_at: string | null;
  pii_due_at: string | null;
  matched_acc_id: string | null;
  match_reason: string | null;
  unmatch_reason: string | null;
  last_send_status: string | null;
  last_send_message: string | null;
  last_send_at: string | null;
  last_send_attempts: number | null;
}

// Channel sources that indicate the OTA email was triggered by our own push
// (PMS → OwlNest → email back). These rows must NOT go through the fillup flow.
function isSelfPushSource(source: string | null | undefined): boolean {
  if (!source) return false;
  const s = source.trim().toLowerCase();
  return s.includes("人客多") || s.includes("lakeze");
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
  self_pushed: "自家訂單、無需補單",
  manual_review: "待人工確認",
  expired: "已過期",
  skipped: "已略過",
};

const PII_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending_pii_fillup: "destructive",
  pii_filled: "secondary",
  promoted_to_booking: "default",
  self_pushed: "secondary",
  manual_review: "destructive",
};

const TYPE_LABEL: Record<string, string> = {
  new_order: "新訂單",
  modified: "修改",
  cancelled: "取消",
  unknown: "未知",
};

export default function OwlTingEmailIngest() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<RawEmail[]>([]);
  const [stagingMap, setStagingMap] = useState<Record<string, StagingLite>>({});
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [fillupStagingId, setFillupStagingId] = useState<string | null>(null);
  const [fillupOpen, setFillupOpen] = useState(false);
  const [rawEmailId, setRawEmailId] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [reparsing, setReparsing] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showSelfPush, setShowSelfPush] = useState(false);

  const load = async () => {
    if (!currentAccommodationId) {
      setRows([]);
      setStagingMap({});
      setLoading(false);
      return;
    }
    setLoading(true);
    // Tenant-scoped: only rows already matched to current accommodation.
    // RLS additionally enforces this at the database layer.
    const { data: list } = await supabase
      .from("owlting_email_orders_raw")
      .select("id,received_at,from_email,from_domain,subject,message_type,obe_number,accommodation_name,accommodation_id,status,notes")
      .eq("accommodation_id", currentAccommodationId)
      .order("received_at", { ascending: false })
      .limit(50);
    const rawRows = (list as RawEmail[]) ?? [];
    setRows(rawRows);

    if (rawRows.length > 0) {
      const { data: staging } = await supabase
        .from("owlting_email_parsed_staging")
        .select("id,raw_email_id,pii_status,accommodation_id,accommodation_name,channel_source,promoted_order_id,review_notes,notified_at,pii_due_at,last_send_status,last_send_message,last_send_at,last_send_attempts")
        .eq("accommodation_id", currentAccommodationId)
        .in("raw_email_id", rawRows.map((r) => r.id));

      const map: Record<string, StagingLite> = {};
      (staging ?? []).forEach((s: any) => {
        map[s.raw_email_id] = {
          ...s,
          matched_acc_id: s.accommodation_id ?? null,
          match_reason: s.accommodation_id ? "已綁定本民宿" : null,
          unmatch_reason: s.accommodation_id ? null : "尚未匹配",
        };
      });
      setStagingMap(map);
    } else {
      setStagingMap({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentAccommodationId]);

  const sendFillupNotification = async (stagingId: string) => {
    setSendingId(stagingId);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-fillup-issue", {
        body: { staging_id: stagingId },
      });
      if (error) throw error;
      const emailed = (data as any)?.emailed_to?.length ?? 0;
      const owners = (data as any)?.owners_count ?? 0;
      const emailErrors = (data as any)?.email_errors as string[] | undefined;
      if (owners === 0) {
        toast.warning("尚未設定業主聯絡人，請先到 HQ → 系統管理 → 業主聯絡人 新增");
      } else if (emailed === 0) {
        toast.warning(`連結已產生但 Email 發送失敗：${emailErrors?.[0] ?? "請檢查寄信設定"}`);
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

  const linkSelfPush = async (stagingId: string) => {
    setLinkingId(stagingId);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-selfpush-link", {
        body: { staging_id: stagingId },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.ok && d?.matched_order_number) {
        toast.success(`已連結至本站訂單 ${d.matched_order_number}`);
      } else if (d?.ambiguous) {
        toast.warning(`找到 ${d.candidates?.length ?? 0} 筆候選訂單，已標記待人工確認`);
      } else if (d?.not_found) {
        toast.warning("找不到對應本站訂單，已標記待人工確認");
      } else if (d?.is_self_push === false) {
        toast.error("此非自家來源，無需連結");
      } else {
        toast.error("連結失敗");
      }
      await load();
    } catch (e: any) {
      toast.error(`連結失敗：${e.message ?? e}`);
    } finally {
      setLinkingId(null);
    }
  };


  const reparseDates = async () => {
    if (!currentAccommodationId) return;
    setReparsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-email-reparse-dates", {
        body: { accommodation_id: currentAccommodationId, overwrite: true },
      });
      if (error) throw error;
      const d = data as any;
      toast.success(`已回填 ${d?.updated ?? 0} 筆入住/退房日期（掃描 ${d?.scanned ?? 0} 筆）`);
      await load();
      setRefreshTick((t) => t + 1);
    } catch (e: any) {
      toast.error(`回填失敗：${e.message ?? e}`);
    } finally {
      setReparsing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        title="奧丁丁訂單收件監控"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={reparseDates} disabled={reparsing || loading}>
              {reparsing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              回填入住/退房日期
            </Button>
            <Button variant="outline" onClick={() => { load(); setRefreshTick((t) => t + 1); }} disabled={loading}>重新整理</Button>
          </div>
        }
      />


      <OwlTingEmailStatsCards
        showDetailLink={false}
        refreshKey={refreshTick}
        accommodationId={currentAccommodationId}
      />

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
                
                <TableHead>補單狀態</TableHead>
                <TableHead className="text-right pr-[5.5rem]">動作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const st = stagingMap[r.id];
                const selfPush = isSelfPushSource(st?.channel_source);
                const alreadyLinked = st?.pii_status === "self_pushed";
                const canSend = st && st.pii_status === "pending_pii_fillup" && r.message_type !== "cancelled" && !selfPush;
                const isSending = st && sendingId === st.id;
                const sendStatus = st?.last_send_status ?? null;
                const hasLegacyNotified = st && !sendStatus && !!st.notified_at;
                const sendVariant: "default" | "secondary" | "destructive" | "outline" =
                  isSending ? "secondary"
                  : sendStatus === "success" ? "default"
                  : sendStatus === "partial" ? "secondary"
                  : sendStatus === "failed" ? "destructive"
                  : hasLegacyNotified ? "secondary"
                  : "outline";
                const sendLabel =
                  isSending ? "重試中"
                  : sendStatus === "success" ? "成功"
                  : sendStatus === "partial" ? "部分成功"
                  : sendStatus === "failed" ? "失敗"
                  : hasLegacyNotified ? "已寄送（歷史）"
                  : "未寄送";
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
                
                    <TableCell className="text-xs">
                      {st ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant={PII_VARIANT[selfPush && !alreadyLinked ? "self_pushed" : st.pii_status] ?? "outline"}>
                            {selfPush && !alreadyLinked
                              ? "自家訂單、無需補單"
                              : PII_LABEL[st.pii_status] ?? st.pii_status}
                          </Badge>
                          {st.channel_source && (
                            <span className="text-[10px] text-muted-foreground">
                              來源：{st.channel_source}
                            </span>
                          )}
                          {st.review_notes && (
                            <span className="text-[10px] text-muted-foreground line-clamp-2" title={st.review_notes}>
                              {st.review_notes}
                            </span>
                          )}
                          {!selfPush && st.notified_at && (
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
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRawEmailId(r.id); setRawOpen(true); }}
                        >
                          <FileCode className="h-3.5 w-3.5 mr-1" />信件原文
                        </Button>
                        {selfPush ? (
                          !alreadyLinked && st ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => linkSelfPush(st.id)}
                              disabled={linkingId === st.id}
                            >
                              {linkingId === st.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <ClipboardEdit className="h-3.5 w-3.5 mr-1" />
                              )}
                              連結自家訂單
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" aria-hidden tabIndex={-1} className="invisible pointer-events-none">
                              <ClipboardEdit className="h-3.5 w-3.5 mr-1" />補單
                            </Button>
                          )
                        ) : canSend ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => sendFillupNotification(st.id)}
                              disabled={sendingId === st.id}
                            >
                              {sendingId === st.id ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Send className="h-3.5 w-3.5 mr-1" />
                              )}
                              重發通知信
                            </Button>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => { setFillupStagingId(st.id); setFillupOpen(true); }}
                            >
                              <ClipboardEdit className="h-3.5 w-3.5 mr-1" />補單
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" aria-hidden tabIndex={-1} className="invisible pointer-events-none">
                              <Send className="h-3.5 w-3.5 mr-1" />重發通知信
                            </Button>
                            <Button size="sm" variant="default" aria-hidden tabIndex={-1} className="invisible pointer-events-none">
                              <ClipboardEdit className="h-3.5 w-3.5 mr-1" />補單
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">尚無收件記錄</TableCell></TableRow>
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

      <OwlTingRawEmailDialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        rawEmailId={rawEmailId}
      />

    </div>
  );
}
