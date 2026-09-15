import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    order_source?: string | null;
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
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const suggestedRefund = Number.isFinite(quote?.suggestedRefund) ? Number(quote.suggestedRefund) : null;
  const actualRefund = action === "no_refund" ? 0 : parseInt(refundAmount || "0", 10) || 0;
  const isOverride = suggestedRefund !== null && actualRefund !== suggestedRefund;
  /** 人工覆寫退款金額時原因必填（server 端 cancel-order-with-refund 同步檢核） */
  const reasonRequired = isOverride && overrideReason.trim().length < 2;


  // 建議退款金額一律由 server 依訂單付款制度 + 法規級距計算，前端只顯示與預填
  useEffect(() => {
    if (!open || !order.id) return;
    let cancelled = false;
    setQuoteLoading(true);
    setQuote(null);
    supabase.functions
      .invoke("cancel-order-with-refund", { body: { orderId: order.id, mode: "quote" } })
      .then(({ data }) => {
        if (cancelled || !data?.success) return;
        setQuote(data);
        if (Number.isFinite(data.suggestedRefund)) setRefundAmount(String(data.suggestedRefund));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setQuoteLoading(false); });
    return () => { cancelled = true; };
  }, [open, order.id]);

  // Reset when dialog opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setAction(defaultAction);
      setOverrideReason("");
    }
    onOpenChange(o);
  };

  const handleSubmit = async () => {
    if (reasonRequired) {
      toast({
        title: "請填寫調整原因",
        description: `實際退款金額與系統建議（NT$${(suggestedRefund ?? 0).toLocaleString()}）不同，原因為必填。`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const amt = parseInt(refundAmount || "0", 10);
      const { data, error } = await supabase.functions.invoke("cancel-order-with-refund", {
        body: {
          orderId: order.id,
          refundAction: action,
          refundAmount: amt,
          overrideReason: overrideReason.trim() || undefined,
        },
      });

      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        toast({ title: "取消失敗", description: parsed.backendError || parsed.message || "請稍後再試", variant: "destructive" });
        return;
      }
      if (!data?.success) {
        toast({ title: "取消失敗", description: data?.message || "請稍後再試", variant: "destructive" });
        return;
      }
      toast({ title: "已取消訂單", description: data.message });
      onOpenChange(false);
      onCancelled();
    } catch (e: any) {
      console.error("cancel-order-with-refund error", e);
      const parsed = await parseFunctionInvokeError(e);
      toast({ title: "取消失敗", description: parsed.backendError || parsed.message || "請稍後再試", variant: "destructive" });
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
      <DialogContent className="!flex max-h-[90dvh] max-w-md flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>取消訂單 {order.order_number}</DialogTitle>
          <DialogDescription>
            付款方式：<span className="font-medium text-foreground">{methodLabel}</span>
            ｜ 已收金額：<span className="font-medium text-foreground">NT${paidAmount.toLocaleString()}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {order.order_source === "group_buy" && (
          <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            這是團購訂單（銀行匯款人工對帳）。請改到「訂單資訊 → 網紅團購」的訂單列使用「取消／退款」與「處理退款」，
            才會同步寫入團購稽核紀錄與分潤狀態。
          </div>
        )}



        {!hasPayment ? (
          <div className="text-sm text-muted-foreground py-2">
            此訂單尚未收款，取消後不涉及退款。
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {quote?.quote && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
                <div className="font-medium text-foreground">
                  取消政策：{quote.quote.policy === "full_prepayment"
                    ? "預收房價總額制"
                    : quote.quote.policy === "deposit"
                      ? "收取訂金制"
                      : quote.quote.policy === "guarantee"
                        ? "綁卡擔保（尚未收款）"
                        : "無法判定（需人工確認）"}
                </div>
                <div className="mt-1 text-muted-foreground">
                  距入住 {quote.quote.daysBefore} 天｜{quote.quote.label}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span className="text-muted-foreground">已付款金額</span>
                  <span className="text-right tabular-nums">NT${Number(quote.paidAmount ?? paidAmount).toLocaleString()}</span>
                  <span className="text-muted-foreground">已退款金額</span>
                  <span className="text-right tabular-nums">NT${Number(quote.alreadyRefunded ?? 0).toLocaleString()}</span>
                  <span className="text-muted-foreground">最高可退</span>
                  <span className="text-right tabular-nums">NT${Number(quote.remainingRefundable ?? paidAmount).toLocaleString()}</span>
                  <span className="text-muted-foreground">建議退款金額</span>
                  <span className="text-right font-semibold tabular-nums text-primary">
                    NT${Number(quote.suggestedRefund || 0).toLocaleString()}
                  </span>
                </div>
                {quote.requiresManualReview && (
                  <div className="mt-1 text-destructive">
                    ⚠️ 此訂單無法自動判定付款制度，請人工確認後再輸入退款金額。
                  </div>
                )}
              </div>
            )}

            {quoteLoading && <div className="text-xs text-muted-foreground">計算建議退款金額中…</div>}

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
                <p className="text-xs text-muted-foreground">
                  最高可退 NT${paidAmount.toLocaleString()}
                  {quote?.suggestedRefund !== undefined && (
                    <> ｜法規建議 NT${Number(quote.suggestedRefund || 0).toLocaleString()}</>
                  )}
                </p>
                {isOverride && (
                  <p className="text-xs text-amber-600">
                    ⚠️ 已人工調整退款金額，系統會於訂單備註與稽核紀錄留存。
                  </p>
                )}
              </div>
            )}

            {isOverride && (
              <div className="space-y-1.5">
                <Label htmlFor="overrideReason" className="text-sm">
                  調整原因<span className="ml-1 text-destructive">＊必填</span>
                </Label>
                <Textarea
                  id="overrideReason"
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="請說明為何調整退款金額（會寫入訂單備註與稽核紀錄）"
                />
                {reasonRequired && (
                  <p className="text-xs text-destructive">
                    實際退款金額與系統建議（NT${(suggestedRefund ?? 0).toLocaleString()}）不同，請填寫調整原因。
                  </p>
                )}
              </div>
            )}

          </div>
        )}

        </div>

        <DialogFooter className="safe-bottom shrink-0 gap-2 border-t pt-3 [&>button]:min-h-[44px] [&>button]:flex-1 sm:[&>button]:min-h-0 sm:[&>button]:flex-none">
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
