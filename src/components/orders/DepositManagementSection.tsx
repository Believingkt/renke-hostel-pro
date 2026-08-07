import { useEffect, useState } from "react";
import { CreditCard, RefreshCw, AlertCircle, CheckCircle2, Banknote } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface Props {
  orderId: string;
  refreshKey?: number;
  onRefresh?: () => void;
}

interface DepositSummary {
  deposit_required_amount: number;
  deposit_method: string | null;
  deposit_status: string;
  deposit_charged_amount: number;
  deposit_refunded_amount: number;
  deposit_charged_at: string | null;
  deposit_refunded_at: string | null;
  order_number: string;
  accommodation_id: string;
  check_in_date: string | null;
}

interface ChargeLog {
  id: string;
  action: string;
  amount: number;
  status: string;
  trigger_source: string;
  rec_trade_id: string | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "待設定", variant: "outline" },
  cash: { label: "現場現金", variant: "secondary" },
  card_bound: { label: "已綁卡", variant: "default" },
  charged: { label: "已扣款", variant: "default" },
  partially_refunded: { label: "部分退款", variant: "secondary" },
  refunded: { label: "已退款", variant: "secondary" },
  failed: { label: "扣款失敗", variant: "destructive" },
};

export function DepositManagementSection({ orderId, refreshKey, onRefresh }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [deposit, setDeposit] = useState<DepositSummary | null>(null);
  const [logs, setLogs] = useState<ChargeLog[]>([]);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: order }, { data: logData }] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "deposit_required_amount, deposit_method, deposit_status, deposit_charged_amount, deposit_refunded_amount, deposit_charged_at, deposit_refunded_at, order_number, accommodation_id, check_in_date",
          )
          .eq("id", orderId)
          .single(),
        supabase
          .from("deposit_charges")
          .select("id, action, amount, status, trigger_source, rec_trade_id, error_message, created_at")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      setDeposit(order as DepositSummary | null);
      setLogs((logData as ChargeLog[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orderId, refreshKey]);

  if (loading || !deposit) return null;

  const refundable =
    deposit.deposit_charged_amount - deposit.deposit_refunded_amount;
  const statusInfo = STATUS_LABEL[deposit.deposit_status] ?? {
    label: deposit.deposit_status,
    variant: "outline" as const,
  };

  const handleRefund = async () => {
    const amount = Number(refundAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "請輸入有效的退款金額" });
      return;
    }
    if (amount > refundable) {
      toast({ variant: "destructive", title: `退款金額不可超過 NT$${refundable}` });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("refund-deposit", {
        body: { orderId, amount },
      });
      if (error) throw error;
      if (!data?.success) {
        toast({ variant: "destructive", title: "退款失敗", description: data?.message });
      } else {
        toast({ title: "退款成功", description: `已退款 NT$${amount}` });
        setRefundOpen(false);
        await load();
        onRefresh?.();
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "退款失敗", description: e?.message });
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          押金管理
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <DepositQuickEdit
            orderId={orderId}
            requiredAmount={deposit.deposit_required_amount}
            status={deposit.deposit_status}
            chargedAmount={deposit.deposit_charged_amount}
            refundedAmount={deposit.deposit_refunded_amount}
            onSaved={async () => {
              await load();
              onRefresh?.();
            }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">應收押金</div>
            <div className="font-medium tabular-nums">NT${deposit.deposit_required_amount.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">已扣款</div>
            <div className="font-medium tabular-nums">NT${deposit.deposit_charged_amount.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">已退款</div>
            <div className="font-medium tabular-nums">NT${deposit.deposit_refunded_amount.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-muted-foreground">支付方式</div>
            <div className="font-medium flex items-center gap-1">
              {deposit.deposit_method === "cash" ? (
                <><Banknote className="h-3.5 w-3.5" />現場現金</>
              ) : deposit.deposit_method === "card" ? (
                <><Banknote className="h-3.5 w-3.5" />現場現金<span className="text-xs text-muted-foreground">(綁卡已停用)</span></>
              ) : (
                <span className="text-muted-foreground">未設定</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {refundable > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRefundAmount(String(refundable));
                setRefundOpen(true);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              退款
            </Button>
          )}
        </div>

        {logs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">操作紀錄</div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 text-xs border-l-2 pl-2 py-1"
                  style={{ borderLeftColor: log.status === "success" ? "hsl(var(--primary))" : "hsl(var(--destructive))" }}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {log.status === "success" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div>
                        {log.action === "charge" ? "扣款" : "退款"} NT${log.amount.toLocaleString()}
                        <span className="text-muted-foreground ml-2">
                          {log.trigger_source === "scheduled" ? "(自動排程)" : "(手動)"}
                        </span>
                      </div>
                      {log.error_message && (
                        <div className="text-destructive break-words">{log.error_message}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-muted-foreground shrink-0">
                    {format(new Date(log.created_at), "MM/dd HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardContent>

      {/* Refund dialog */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>退還押金</DialogTitle>
            <DialogDescription>
              可退款金額：NT${refundable.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>退款金額 (NT$)</Label>
            <Input
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              min={1}
              max={refundable}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleRefund} disabled={submitting}>
              {submitting ? "處理中..." : "確認退款"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
