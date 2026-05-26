import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CreditCard, Banknote } from "lucide-react";

type RefundAction = "auto_refund" | "mark_manual_refund" | "no_refund";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    paid_amount: number | null;
    payment_method: string | null;
    deposit_payment_method: string | null;
    balance_payment_method: string | null;
  };
  onCancelled: () => void;
}

const CARD_METHODS = new Set(["credit_card", "credit_card_3ds"]);
const ATM_METHODS = new Set(["atm"]);

export function CancelOrderDialog({ open, onOpenChange, order, onCancelled }: Props) {
  const { toast } = useToast();
  const paidAmount = order.paid_amount || 0;

  // Identify the dominant payment method: balance > payment > deposit
  const method = order.balance_payment_method || order.payment_method || order.deposit_payment_method || "";
  const isCard = CARD_METHODS.has(method);
  const isAtm = ATM_METHODS.has(method);
  const hasPayment = paidAmount > 0;

  // Default action by scenario
  const defaultAction: RefundAction = useMemo(() => {
    if (!hasPayment) return "no_refund";
    if (isCard) return "auto_refund";
    if (isAtm) return "mark_manual_refund";
    return "mark_manual_refund";
  }, [hasPayment, isCard, isAtm]);

  const [action, setAction] = useState<RefundAction>(defaultAction);
  const [refundAmount, setRefundAmount] = useState<string>(String(paidAmount));
  const [submitting, setSubmitting] = useState(false);

  // Reset when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setAction(defaultAction);
      setRefundAmount(String(paidAmount));
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const amt = parseInt(refundAmount || "0", 10);
      const { data, error } = await supabase.functions.invoke("cancel-order-with-refund", {
        body: {
          orderId: order.id,
          refundAction: action,
          refundAmount: amt,
        },
      });
      if (error) throw error;
      if (!data?.success) {
        toast({ title: "取消失敗", description: data?.message || "請稍後再試", variant: "destructive" });
        return;
      }
      toast({ title: "已取消訂單", description: data.message });
      onOpenChange(false);
      onCancelled();
    } catch (e: any) {
      console.error("cancel-order-with-refund error", e);
      toast({ title: "取消失敗", description: e?.message || "請稍後再試", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const methodLabel =
    method === "credit_card" || method === "credit_card_3ds"
      ? "線上刷卡"
      : method === "atm"
        ? "ATM 虛擬帳號"
        : method === "bank_transfer" || method === "轉帳"
          ? "銀行轉帳"
          : method === "cash" || method === "現金"
            ? "現金"
            : method || "未付款";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>取消訂單 {order.order_number}</DialogTitle>
          <DialogDescription>
            付款方式：<span className="font-medium text-foreground">{methodLabel}</span>
            ｜ 已收金額：<span className="font-medium text-foreground">NT${paidAmount.toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        {!hasPayment ? (
          <div className="text-sm text-muted-foreground py-2">
            此訂單尚未收款，取消後不涉及退款。
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <RadioGroup value={action} onValueChange={(v) => setAction(v as RefundAction)} className="space-y-2">
              {isCard && (
                <label
                  className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <RadioGroupItem value="auto_refund" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <CreditCard className="h-4 w-4" />
                      取消並自動退刷
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      系統將即時呼叫 TapPay 退款至原刷卡
                    </div>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="mark_manual_refund" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Banknote className="h-4 w-4" />
                    取消並標記手動退款
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {isAtm
                      ? "ATM 款項需自行匯回客人帳戶，系統會記錄於備註"
                      : "由民宿主自行退款，系統會於備註留下提醒"}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <RadioGroupItem value="no_refund" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    取消但不退款
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    保留已收金額（例：違約金、不可退方案）
                  </div>
                </div>
              </label>
            </RadioGroup>

            {action !== "no_refund" && (
              <div className="space-y-1.5">
                <Label htmlFor="refundAmount" className="text-sm">退款金額（NT$）</Label>
                <Input
                  id="refundAmount"
                  type="number"
                  min={0}
                  max={paidAmount}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">最高可退 NT${paidAmount.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            返回
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "處理中..." : "確認取消"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
