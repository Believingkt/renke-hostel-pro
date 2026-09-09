import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatChangeValue, getFieldLabel, type OrderFieldChange } from "@/utils/orderAuditDiff";
import { settlementLabel } from "@/lib/paidAmountSettlement";

interface AuditLogRow {
  id: string;
  origin?: "audit" | "change_log";
  entity_type?: string;
  user_id: string | null;
  user_email: string | null;
  action_type: string;
  details: any;
  created_at: string;
  user_name?: string | null;
}

const SYSTEM_LABELS: Record<string, string> = {
  owlting_webhook: "OwlTing 同步",
  owlting_auto_order: "OwlTing 自動建單",
  hotelnabe_sync: "HotelNabe 同步",
  tappay_notify: "金流通知",
  refund: "退款流程",
  room_charge: "自動收款",
  unmarked_system: "系統（未標記來源）",
};

// 舊 audit_logs 沒有 changes 陣列時，用 details.type 推測它對應的欄位，
// 避免與新機制的紀錄配錯對。沒有列在這裡的 type 一律不合併（保守策略：
// 寧可多顯示一筆，也不要冒藏起合法紀錄的風險）。
const AUDIT_SUBTYPE_FIELD_HINT: Record<string, string[]> = {
  payment_status_change: ["payment_status"],
  order_status_change: ["order_status"],
  order_source_change: ["order_source"],
  order_deal_date_change: ["deal_date", "deal_closed_at"],
  order_date_change: ["check_in_date", "check_out_date"],
  price_edit: ["final_price", "total_price", "discount_amount"],
};

const DEDUP_TIME_WINDOW_MS = 3000;

function auditFieldHints(details: any): string[] | null {
  const t = details?.type;
  if (typeof t === "string" && AUDIT_SUBTYPE_FIELD_HINT[t]) return AUDIT_SUBTYPE_FIELD_HINT[t];
  return null;
}

function auditHasDisplayableDetail(details: any): boolean {
  if (!details || typeof details !== "object") return false;
  if (Array.isArray(details.changes) && details.changes.length > 0) return true;
  const keys = Object.keys(details).filter((k) => !["type", "order_id", "order_number"].includes(k));
  return keys.length > 0;
}


interface OrderAuditLogCardProps {
  orderId: string;
  refreshKey?: string | number;
}

const ACTION_LABEL: Record<string, { text: string; tone: string }> = {
  update: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  price_edit: { text: "金額修改", tone: "bg-amber-100 text-amber-700" },
  paid_discount_edit: { text: "已結清折扣修改", tone: "bg-amber-100 text-amber-700" },
  paid_addon_edit: { text: "已付款加購修改", tone: "bg-amber-100 text-amber-700" },
  cancel: { text: "取消訂單", tone: "bg-red-100 text-red-700" },
  checkin: { text: "辦理入住", tone: "bg-green-100 text-green-700" },
  checkout: { text: "辦理退房", tone: "bg-emerald-100 text-emerald-700" },
  undo_checkin: { text: "取消入住", tone: "bg-zinc-100 text-zinc-700" },
  undo_checkout: { text: "取消退房", tone: "bg-zinc-100 text-zinc-700" },
  inline_edit: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  meta_edit: { text: "行銷資訊修改", tone: "bg-purple-100 text-purple-700" },
  order_source_change: { text: "來源變更", tone: "bg-indigo-100 text-indigo-700" },
  kol_quota_override: { text: "KOL額度覆寫", tone: "bg-orange-100 text-orange-700" },
  order_date_change: { text: "訂單改期", tone: "bg-fuchsia-100 text-fuchsia-700" },
  system_update: { text: "系統自動變更", tone: "bg-slate-100 text-slate-700" },
  system_create: { text: "系統建立訂單", tone: "bg-green-100 text-green-700" },
  user_create: { text: "建立訂單", tone: "bg-green-100 text-green-700" },
};

function getActionLabel(details: any, action_type: string) {
  const subtype = details?.type;
  if (subtype && ACTION_LABEL[subtype]) return ACTION_LABEL[subtype];
  return ACTION_LABEL[action_type] || { text: action_type, tone: "bg-zinc-100 text-zinc-700" };
}

export default function OrderAuditLogCard({ orderId, refreshKey }: OrderAuditLogCardProps) {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [auditRes, changeRes] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("id, user_id, user_email, action_type, details, created_at, entity_type")
          .in("entity_type", ["order", "order_meta"])
          .eq("entity_id", orderId)
          .order("created_at", { ascending: false }),
        supabase
          .from("order_change_log")
          .select(
            "id, op, actor_type, actor_id, actor_email, actor_label, reason, source, changed_fields, txid, changed_at",
          )
          .eq("order_id", orderId)
          .order("changed_at", { ascending: false }),
      ]);
      if (cancelled) {
        return;
      }
      if (auditRes.error && changeRes.error) {
        setLoading(false);
        return;
      }

      const auditRows: AuditLogRow[] = ((auditRes.data || []) as any[]).map((r) => ({
        id: `a_${r.id}`,
        origin: "audit" as const,
        entity_type: r.entity_type,
        user_id: r.user_id,
        user_email: r.user_email,
        action_type: r.action_type,
        details: r.details,
        created_at: r.created_at,
      }));

      // 同交易（txid）收斂為一筆
      const grouped = new Map<string, any[]>();
      for (const r of (changeRes.data || []) as any[]) {
        const key = `${r.txid}|${r.actor_id ?? r.actor_label ?? ""}|${r.source ?? ""}`;
        grouped.set(key, [...(grouped.get(key) || []), r]);
      }
      const changeRows: AuditLogRow[] = [...grouped.values()].map((group) => {
        const first = group[group.length - 1];
        const merged = new Map<string, any>();
        for (const r of [...group].reverse()) {
          for (const c of ((r.changed_fields || []) as any[])) {
            const prev = merged.get(c.field);
            merged.set(c.field, prev ? { ...c, from: prev.from } : c);
          }
        }
        const changes: OrderFieldChange[] = [...merged.values()].map((c: any) => ({
          field: c.field,
          label: getFieldLabel(c.field),
          before: "changed" in c ? "（有更動）" : c.from,
          after: "changed" in c ? "（已更新）" : c.to,
        })) as OrderFieldChange[];
        return {
          id: `c_${first.id}`,
          origin: "change_log" as const,
          user_id: first.actor_id,
          user_email: first.actor_email,
          // 系統標籤以 actor_type 判斷：真人（user）一律顯示姓名＋「編輯/建立訂單」，
          // 只有 system/unknown 才帶「系統」字樣，避免真人編輯被誤標為系統自動變更。
          action_type:
            first.actor_type === "user"
              ? first.op === "insert"
                ? "user_create"
                : "update"
              : first.op === "insert"
                ? "system_create"
                : "system_update",
          details: {
            changes,
            source: first.source === "unmarked" ? undefined : first.source,
            reason: first.reason || undefined,
            actor_type: first.actor_type,
            actor_label: first.actor_label,
          },
          created_at: first.changed_at,
        };
      });

      // 顯示層去重：舊寫入路徑（audit_logs）與新 trigger（order_change_log）會對同一次
      // 操作各寫一筆。當舊紀錄「沒有可展開內容」、且與某筆新紀錄是同一操作者、
      // 時間相差 3 秒內、欄位可對應時，只保留內容完整的新紀錄。
      // 無法確認欄位對應（hints 為 null）時一律不合併，避免藏起合法紀錄。
      const dedupedAuditRows = auditRows.filter((a) => {
        if (a.entity_type !== "order") return true;
        if (auditHasDisplayableDetail(a.details)) return true;
        const hints = auditFieldHints(a.details);
        if (!hints) return true; // 保守：無法確認欄位就不合併
        const aTime = +new Date(a.created_at);
        return !changeRows.some((c) => {
          if (a.user_id && c.user_id && a.user_id !== c.user_id) return false;
          if (Math.abs(+new Date(c.created_at) - aTime) > DEDUP_TIME_WINDOW_MS) return false;
          const cFields = (Array.isArray(c.details?.changes) ? c.details.changes : []).map(
            (x: any) => x?.field,
          );
          return hints.some((f) => cFields.includes(f));
        });
      });

      const rows = [...dedupedAuditRows, ...changeRows].sort(
        (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
      );
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
          user_name:
            (r.user_id && nameMap[r.user_id]) ||
            r.user_email ||
            (r.details?.actor_type && r.details.actor_type !== "user"
              ? `系統・${SYSTEM_LABELS[r.details.actor_label] ?? r.details.actor_label ?? "自動處理"}`
              : "未知使用者"),
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, refreshKey]);

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
      <CardHeader
        className={`flex flex-row items-center gap-2 cursor-pointer select-none hover:bg-muted/30 transition-colors py-3 ${cardOpen ? "pb-3" : ""}`}
        onClick={() => setCardOpen((v) => !v)}
      >
        {cardOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <History className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-lg md:text-lg">變更紀錄</CardTitle>
        {!loading && (
          <span className="ml-auto text-xs text-muted-foreground">共 {logs.length} 筆</span>
        )}
      </CardHeader>
      {cardOpen && (
      <CardContent>
        {loading ? null : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">尚無變更紀錄</p>
        ) : (
          <div className="space-y-2">
            {displayed.map((log) => {
              const meta = getActionLabel(log.details, log.action_type);
              const isPaidAmountEdit =
                log.details?.type === "paid_discount_edit" || log.details?.type === "paid_addon_edit";
              const changes: OrderFieldChange[] = (
                Array.isArray(log.details?.changes) ? log.details.changes : []
              ).filter((c: OrderFieldChange) =>
                // 已結清金額調整：不顯示 raw JSON 或備註全文
                !(isPaidAmountEdit && ["custom_addon_details", "notes", "__notes_visible"].includes(c.field)),
              ).filter((c: OrderFieldChange) =>
                // 舊紀錄：addon_note_changed=false 代表備註未變更，不顯示
                !(c.field === "addon_note_changed" && c.after !== true),
              );

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
                      {(log.details?.type === "paid_discount_edit" || log.details?.type === "paid_addon_edit") && (
                        <div className="text-xs space-y-1 pb-1">
                          {log.details?.source && (
                            <div><span className="text-muted-foreground">來源：</span>{String(log.details.source)}</div>
                          )}
                          {log.details?.settlement_handling && (
                            <div>
                              <span className="text-muted-foreground">差額處理方式：</span>
                              {settlementLabel(String(log.details.settlement_handling))}
                            </div>
                          )}
                          {log.details?.difference_note && (
                            <div className="text-muted-foreground">{String(log.details.difference_note)}</div>
                          )}
                          {(log.details?.payment_status_before || log.details?.order_status || log.details?.refund_status) && (
                            <div className="text-muted-foreground">
                              當時狀態：付款 {String(log.details?.payment_status_before ?? "—")}
                              ／訂單 {String(log.details?.order_status ?? "—")}
                              ／退款 {String(log.details?.refund_status ?? "none")}
                            </div>
                          )}
                        </div>
                      )}
                      {changes.map((c, i) => {
                        // 舊紀錄相容：當時未保存備註文字，只能顯示「有更動」
                        if (c.field === "addon_note_changed") {
                          return (
                            <div key={i} className="text-xs flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground">額外現場加購備註：</span>
                              <span className="break-words">有更動（舊紀錄未保存內容）</span>
                            </div>
                          );
                        }
                        const isDetailedText = ["__notes_visible", "notes", "meal_plan_details", "custom_addon_details", "addon_note", "extra_addon_note"].includes(c.field);
                        if (isDetailedText) {

                          return (
                            <div key={i} className="text-xs space-y-1 pt-1">
                              <div className="text-muted-foreground font-medium">{c.label || getFieldLabel(c.field)}</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="rounded border bg-background/60 p-2">
                                  <div className="text-[10px] text-muted-foreground mb-1">變更前</div>
                                  <pre className="whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground line-through decoration-muted-foreground/40">
{formatChangeValue(c.field, c.before) || "(空)"}
                                  </pre>
                                </div>
                                <div className="rounded border bg-background p-2">
                                  <div className="text-[10px] text-muted-foreground mb-1">變更後</div>
                                  <pre className="whitespace-pre-wrap break-words font-sans text-xs font-medium">
{formatChangeValue(c.field, c.after) || "(空)"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
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
                        );
                      })}
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
                      {log.details?.source && (
                        <div className="text-xs text-muted-foreground pt-1">
                          來源：{log.details.source}
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
      )}
    </Card>
  );
}
