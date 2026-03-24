import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Order } from "@/types/order";
import { getOrderStatusConfig } from "@/utils/orderHelpers";

interface OrderStatusDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ORDER_STATUSES = [
  { value: "hold", label: "保留中" },
  { value: "pending", label: "待確認" },
  { value: "confirmed", label: "已確認" },
  { value: "checked_in", label: "已入住" },
  { value: "checked_out", label: "已退房" },
  { value: "cancelled", label: "已取消" },
];

export function OrderStatusDialog({ order, open, onOpenChange, onSuccess }: OrderStatusDialogProps) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setSelectedStatus(order.order_status);
      setReason("");
    }
  }, [open, order]);

  const handleSave = async () => {
    if (!order || selectedStatus === order.order_status) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      const oldLabel = getOrderStatusConfig(order.order_status).label;
      const newLabel = getOrderStatusConfig(selectedStatus).label;

      const noteAppend = reason.trim()
        ? `\n【訂單狀態變更】${oldLabel} → ${newLabel}：${reason.trim()}`
        : `\n【訂單狀態變更】${oldLabel} → ${newLabel}`;

      const updateData: any = {
        order_status: selectedStatus,
        notes: order.notes ? `${order.notes}${noteAppend}` : noteAppend.trim(),
      };

      // Set timestamps for status transitions
      if (selectedStatus === "confirmed" && order.order_status !== "confirmed") {
        updateData.confirmed_at = new Date().toISOString();
      } else if (selectedStatus === "checked_in") {
        updateData.checked_in_at = new Date().toISOString();
      } else if (selectedStatus === "checked_out") {
        updateData.checked_out_at = new Date().toISOString();
      } else if (selectedStatus === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id);

      if (error) throw error;

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
              type: "order_status_change",
              old_status: order.order_status,
              new_status: selectedStatus,
              reason: reason.trim(),
            } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "訂單狀態已更新" });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("更新訂單狀態失敗:", error);
      toast({ title: "更新失敗", description: "無法更新訂單狀態，請稍後再試", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const currentConfig = order ? getOrderStatusConfig(order.order_status) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>變更訂單狀態</DialogTitle>
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
            {ORDER_STATUSES.map((status) => {
              const config = getOrderStatusConfig(status.value);
              return (
                <div key={status.value} className="flex items-center space-x-3 py-1.5">
                  <RadioGroupItem value={status.value} id={`os-${status.value}`} />
                  <Label htmlFor={`os-${status.value}`} className="cursor-pointer flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                      {status.label}
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="os-reason">備註（選填）</Label>
            <Textarea
              id="os-reason"
              placeholder="例如：客人來電確認..."
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
            disabled={isSaving || selectedStatus === order?.order_status}
          >
            {isSaving ? "儲存中..." : "確認變更"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
