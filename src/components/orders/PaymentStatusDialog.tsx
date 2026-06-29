import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Order } from "@/types/order";
import { getPaymentStatusConfig } from "@/utils/orderHelpers";

interface PaymentStatusDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const BASE_PAYMENT_STATUSES = [
  { value: "unpaid", label: "未付款" },
  { value: "deposit_paid", label: "已付訂金" },
  { value: "paid", label: "已付清" },
  { value: "refunded", label: "已退款" },
  { value: "partial_refunded", label: "部分退款" },
];

export function PaymentStatusDialog({ order, open, onOpenChange, onSuccess }: PaymentStatusDialogProps) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setSelectedStatus(order.payment_status);
      setReason("");
    }
  }, [open, order]);

  const handleSave = async () => {
    if (!order || selectedStatus === order.payment_status) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      // Update paid_amount based on status change
      let paidAmount = order.paid_amount;
      if (selectedStatus === "paid") {
        paidAmount = order.final_price;
      } else if (selectedStatus === "deposit_paid") {
        paidAmount = order.deposit_amount ?? 0;
      } else if (selectedStatus === "unpaid") {
        paidAmount = 0;
      }

      const noteAppend = reason.trim()
        ? `\n【付款狀態變更】${getPaymentStatusConfig(order.payment_status).label} → ${getPaymentStatusConfig(selectedStatus).label}：${reason.trim()}`
        : `\n【付款狀態變更】${getPaymentStatusConfig(order.payment_status).label} → ${getPaymentStatusConfig(selectedStatus).label}`;

      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: selectedStatus,
          paid_amount: paidAmount,
          notes: order.notes ? `${order.notes}${noteAppend}` : noteAppend.trim(),
        })
        .eq("id", order.id);

      if (error) throw error;

      // 若狀態改為「已付訂金」且 order_meta.deposit_confirm_date 為空，
      // 自動帶入今日 (Asia/Taipei) 並標記為未確認，待人工進入訂單詳情/成交大師確認。
      if (selectedStatus === "deposit_paid") {
        try {
          const { data: metaRow } = await supabase
            .from("order_meta")
            .select("order_id, deposit_confirm_date")
            .eq("order_id", order.id)
            .maybeSingle();
          const existingDate = (metaRow as any)?.deposit_confirm_date ?? null;
          if (!existingDate) {
            const todayTW = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Taipei",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date());
            if (metaRow) {
              await supabase
                .from("order_meta")
                .update({
                  deposit_confirm_date: todayTW,
                  deposit_confirm_date_verified: false,
                })
                .eq("order_id", order.id);
            } else {
              await supabase
                .from("order_meta")
                .insert({
                  order_id: order.id,
                  accommodation_id: order.accommodation_id ?? null,
                  deposit_confirm_date: todayTW,
                  deposit_confirm_date_verified: false,
                } as any);
            }
          }
        } catch (e) {
          console.error("[PaymentStatusDialog] auto-fill deposit date error:", e);
        }
      }

      // Audit log
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("audit_logs").insert([{
            user_id: user.id,
            user_email: user.email,
            action_type: "update",
            action_category: "order",
            entity_type: "order",
            entity_id: order.id,
            entity_name: order.order_number,
            details: {
              type: "payment_status_change",
              old_status: order.payment_status,
              new_status: selectedStatus,
              reason: reason.trim(),
            } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "付款狀態已更新" });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("更新付款狀態失敗:", error);
      toast({ title: "更新失敗", description: "無法更新付款狀態，請稍後再試", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const currentConfig = order ? getPaymentStatusConfig(order.payment_status) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>變更付款狀態</DialogTitle>
          <DialogDescription>
            訂單 {order?.order_number}
            {currentConfig && (
              <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${currentConfig.className}`}>
                {currentConfig.label}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RadioGroup value={selectedStatus} onValueChange={setSelectedStatus}>
            {BASE_PAYMENT_STATUSES.map((status) => {
              const config = getPaymentStatusConfig(status.value);
              return (
                <div key={status.value} className="flex items-center space-x-3 py-1.5">
                  <RadioGroupItem value={status.value} id={`ps-${status.value}`} />
                  <Label htmlFor={`ps-${status.value}`} className="cursor-pointer flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                      {status.label}
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="ps-reason">備註（選填）</Label>
            <Textarea
              id="ps-reason"
              placeholder="例如：客人已匯款確認..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || selectedStatus === order?.payment_status}
          >
            {isSaving ? "儲存中..." : "確認變更"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
