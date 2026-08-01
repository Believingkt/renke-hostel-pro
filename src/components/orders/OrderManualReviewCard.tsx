import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/use-audit-log";

export interface ManualReviewTask {
  id: string;
  order_id: string;
  accommodation_id: string;
  task_type: string;
  reason_code: string;
  requested_guest_count: number | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  quote_snapshot: Record<string, unknown> | null;
  requester_note: string | null;
  status: string;
  resolution_note: string | null;
  resolved_amount: number | null;
  resolved_at: string | null;
  created_at: string;
}

interface Props {
  orderId: string;
  orderNumber: string;
  onResolved?: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待處理",
  in_progress: "處理中",
  resolved: "已完成",
  dismissed: "無需處理",
};

const typeLabel = (t: string) =>
  t === "date_change_request" ? "客人申請改期" : "客人變更人數，需重新計價";

export default function OrderManualReviewCard({ orderId, orderNumber, onResolved }: Props) {
  const { logAction } = useAuditLog();
  const [tasks, setTasks] = useState<ManualReviewTask[]>([]);
  const [active, setActive] = useState<ManualReviewTask | null>(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("order_manual_review_tasks")
      .select("*")
      .eq("order_id", orderId)
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: false });
    setTasks((data ?? []) as unknown as ManualReviewTask[]);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTask = (t: ManualReviewTask) => {
    setActive(t);
    setNote("");
    const snap = (t.quote_snapshot ?? {}) as Record<string, any>;
    const suggested =
      t.task_type === "guest_count_repricing"
        ? snap?.priceQuote?.newFinalPrice ?? snap?.finalPrice
        : snap?.finalPrice;
    setAmount(suggested != null ? String(Math.round(Number(suggested))) : "");
  };

  const closeTask = async (
    status: "resolved" | "dismissed",
    applyChange: boolean,
  ) => {
    if (!active) return;
    setSubmitting(true);
    try {
      const stamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const operator = user?.email ?? "系統";
      const noteLines: string[] = [];

      if (applyChange) {
        if (active.task_type === "date_change_request") {
          if (!active.requested_check_in || !active.requested_check_out) {
            toast.error("此待辦沒有申請日期，無法套用");
            return;
          }
          const { error: rpcErr } = await supabase.rpc("change_order_dates", {
            _order_id: active.order_id,
            _new_check_in: active.requested_check_in,
            _new_check_out: active.requested_check_out,
          });
          if (rpcErr) {
            toast.error(
              /Inventory exceeded|Room not available|包棟/i.test(rpcErr.message)
                ? "新日期已無空房，無法套用改期"
                : rpcErr.message,
            );
            return;
          }
          noteLines.push(
            `🔒 [${stamp}] 客服核准改期：→ ${active.requested_check_in} ~ ${active.requested_check_out}｜操作：${operator}`,
          );
        } else if (active.requested_guest_count != null) {
          const { error } = await supabase
            .from("orders")
            .update({ guest_count: active.requested_guest_count })
            .eq("id", active.order_id);
          if (error) {
            toast.error(error.message);
            return;
          }
          noteLines.push(
            `🔒 [${stamp}] 客服核准人數變更：→ ${active.requested_guest_count} 人｜操作：${operator}`,
          );
        }

        const finalAmount = Number(amount);
        if (amount !== "" && Number.isFinite(finalAmount)) {
          const { error: amtErr } = await supabase
            .from("orders")
            .update({ final_price: finalAmount })
            .eq("id", active.order_id);
          if (amtErr) {
            toast.error(amtErr.message);
            return;
          }
          noteLines.push(
            `🔒 [${stamp}] 客服重新計價：訂單總額調整為 NT$${finalAmount.toLocaleString()}｜操作：${operator}`,
          );
        }
      } else {
        noteLines.push(
          `🔒 [${stamp}] 客服${status === "dismissed" ? "判定無需處理" : "維持原訂單內容"}並結案｜操作：${operator}`,
        );
      }
      if (note.trim()) noteLines.push(`🔒 [${stamp}] 客服說明：${note.trim()}`);

      // 追加訂單備註
      const { data: cur } = await supabase
        .from("orders")
        .select("notes")
        .eq("id", active.order_id)
        .maybeSingle();
      await supabase
        .from("orders")
        .update({
          notes: cur?.notes ? `${cur.notes}\n${noteLines.join("\n")}` : noteLines.join("\n"),
        })
        .eq("id", active.order_id);

      const { error: taskErr } = await supabase
        .from("order_manual_review_tasks")
        .update({
          status,
          resolution_note: note.trim() || null,
          resolved_amount: amount !== "" && Number.isFinite(Number(amount)) ? Number(amount) : null,
          resolved_by: user?.id ?? null,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", active.id);
      if (taskErr) {
        toast.error(taskErr.message);
        return;
      }

      await logAction({
        actionType: "update",
        actionCategory: "order",
        entityType: "order_manual_review_task",
        entityId: active.id,
        entityName: orderNumber,
        accommodationId: active.accommodation_id,
        details: {
          task_type: active.task_type,
          status,
          applied: applyChange,
          resolution_note: note.trim() || null,
          resolved_amount: amount || null,
        },
      });

      toast.success(status === "dismissed" ? "已結案（無需處理）" : "已處理並結案");
      setActive(null);
      await load();
      onResolved?.();
    } finally {
      setSubmitting(false);
    }
  };

  if (tasks.length === 0) return null;

  const snap = (active?.quote_snapshot ?? {}) as Record<string, any>;
  const pq = snap?.priceQuote as Record<string, any> | undefined;

  return (
    <>
      {tasks.map((t) => (
        <Card key={t.id} className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="font-medium">{typeLabel(t.task_type)}</span>
              <Badge variant="outline">{STATUS_LABEL[t.status] ?? t.status}</Badge>
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              {t.task_type === "date_change_request" ? (
                <p>
                  申請日期：{t.requested_check_in} ~ {t.requested_check_out}
                  {(t.quote_snapshot as any)?.currentCheckIn && (
                    <>
                      （原：{(t.quote_snapshot as any).currentCheckIn} ~{" "}
                      {(t.quote_snapshot as any).currentCheckOut}）
                    </>
                  )}
                </p>
              ) : (
                <p>
                  申請人數：{(t.quote_snapshot as any)?.currentGuestCount ?? "-"} →{" "}
                  {t.requested_guest_count} 人
                </p>
              )}
              {t.requester_note && <p>客人備註：{t.requester_note}</p>}
              <p>申請時間：{new Date(t.created_at).toLocaleString("zh-TW")}</p>
            </div>
            <Button size="sm" onClick={() => openTask(t)}>
              <UserCog className="h-4 w-4 mr-1" /> 處理
            </Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>處理客服待辦</DialogTitle>
            <DialogDescription>
              訂單 {orderNumber}　{active ? typeLabel(active.task_type) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              {active?.task_type === "date_change_request" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">原日期</span>
                    <span>
                      {snap.currentCheckIn} ~ {snap.currentCheckOut}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">申請日期</span>
                    <span>
                      {active?.requested_check_in} ~ {active?.requested_check_out}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">人數</span>
                    <span>
                      {snap.currentGuestCount ?? "-"} → {active?.requested_guest_count}
                    </span>
                  </div>
                  {pq && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">系統試算房費</span>
                      <span className="tabular-nums">
                        NT$ {Number(pq.currentRoomTotal || 0).toLocaleString()} → NT${" "}
                        {Number(pq.newRoomTotal || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">已付金額</span>
                <span className="tabular-nums">
                  NT$ {Number(pq?.paidAmount ?? snap.paidAmount ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">目前訂單總額</span>
                <span className="tabular-nums">
                  NT$ {Number(pq?.currentFinalPrice ?? snap.finalPrice ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="review-amount">確認後訂單總額（NT$，留空表示不調整）</Label>
              <Input
                id="review-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="review-note">處理說明（會寫入訂單備註與稽核紀錄）</Label>
              <Textarea
                id="review-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：已與客人電話確認補差 3,000 元，改期日期有空房"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" disabled={submitting} onClick={() => closeTask("dismissed", false)}>
              無需處理，直接結案
            </Button>
            <Button variant="outline" disabled={submitting} onClick={() => closeTask("resolved", false)}>
              維持原訂單並結案
            </Button>
            <Button disabled={submitting} onClick={() => closeTask("resolved", true)}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              套用變更並結案
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
