import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatChangeValue, getFieldLabel, type OrderFieldChange } from "@/utils/orderAuditDiff";

interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  details: any;
  created_at: string;
  user_name?: string | null;
}

interface OrderAuditLogCardProps {
  orderId: string;
}

const ACTION_LABEL: Record<string, { text: string; tone: string }> = {
  update: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  price_edit: { text: "金額修改", tone: "bg-amber-100 text-amber-700" },
  cancel: { text: "取消訂單", tone: "bg-red-100 text-red-700" },
  checkin: { text: "辦理入住", tone: "bg-green-100 text-green-700" },
  checkout: { text: "辦理退房", tone: "bg-emerald-100 text-emerald-700" },
  undo_checkin: { text: "取消入住", tone: "bg-zinc-100 text-zinc-700" },
  undo_checkout: { text: "取消退房", tone: "bg-zinc-100 text-zinc-700" },
  inline_edit: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  meta_edit: { text: "行銷資訊修改", tone: "bg-purple-100 text-purple-700" },
};

function getActionLabel(details: any, action_type: string) {
  const subtype = details?.type;
  if (subtype && ACTION_LABEL[subtype]) return ACTION_LABEL[subtype];
  return ACTION_LABEL[action_type] || { text: action_type, tone: "bg-zinc-100 text-zinc-700" };
}

export default function OrderAuditLogCard({ orderId }: OrderAuditLogCardProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, user_email, action_type, details, created_at")
        .in("entity_type", ["order", "order_meta"])
        .eq("entity_id", orderId)
        .order("created_at", { ascending: false });
      if (error || cancelled) {
        setLoading(false);
        return;
      }
      const rows = (data || []) as AuditLogRow[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
      let nameMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds);
        nameMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name]));
      }
      if (cancelled) return;
      setLogs(
        rows.map((r) => ({
          ...r,
          user_name: (r.user_id && nameMap[r.user_id]) || r.user_email || "未知使用者",
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displayed = showAll ? logs : logs.slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-lg md:text-lg">變更紀錄</CardTitle>
        {!loading && (
          <span className="ml-auto text-xs text-muted-foreground">共 {logs.length} 筆</span>
        )}
      </CardHeader>
      <CardContent>
        {loading ? null : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">尚無變更紀錄</p>
        ) : (
          <div className="space-y-2">
            {displayed.map((log) => {
              const meta = getActionLabel(log.details, log.action_type);
              const changes: OrderFieldChange[] = Array.isArray(log.details?.changes)
                ? log.details.changes
                : [];
              const hasDetail =
                changes.length > 0 ||
                log.details?.reason ||
                log.details?.old ||
                log.details?.new;
              const isOpen = expanded.has(log.id);
              const ts = new Date(log.created_at).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
                hour12: false,
              });
              return (
                <div key={log.id} className="border rounded-md">
                  <button
                    type="button"
                    onClick={() => hasDetail && toggle(log.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                      hasDetail ? "hover:bg-muted/50" : "cursor-default"
                    }`}
                  >
                    {hasDetail ? (
                      isOpen ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <span className="w-4 flex-shrink-0" />
                    )}
                    <Badge className={`${meta.tone} hover:${meta.tone} flex-shrink-0`}>
                      {meta.text}
                    </Badge>
                    <span className="text-sm font-medium truncate">{log.user_name}</span>
                    {changes.length > 0 && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        · 變更 {changes.length} 項
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 tabular-nums">
                      {ts}
                    </span>
                  </button>
                  {isOpen && hasDetail && (
                    <div className="border-t bg-muted/30 px-3 py-2 space-y-1.5">
                      {changes.map((c, i) => (
                        <div key={i} className="text-xs flex flex-wrap items-center gap-1.5">
                          <span className="text-muted-foreground">{c.label || getFieldLabel(c.field)}：</span>
                          <span className="line-through text-muted-foreground break-all">
                            {formatChangeValue(c.field, c.before)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-medium break-all">
                            {formatChangeValue(c.field, c.after)}
                          </span>
                        </div>
                      ))}
                      {log.details?.old && log.details?.new && changes.length === 0 && (
                        <div className="text-xs space-y-1">
                          {Object.keys(log.details.new).map((k) => {
                            const oldV = log.details.old?.[k];
                            const newV = log.details.new?.[k];
                            if (oldV === newV) return null;
                            return (
                              <div key={k} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground">{getFieldLabel(k)}：</span>
                                <span className="line-through text-muted-foreground">{formatChangeValue(k, oldV)}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">{formatChangeValue(k, newV)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {log.details?.reason && (
                        <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                          原因：{log.details.reason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {logs.length > 10 && (
              <div className="text-center pt-1">
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "收合" : `顯示全部 ${logs.length} 筆`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
