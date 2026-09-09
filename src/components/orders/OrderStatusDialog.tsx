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
import { isHoldOrder } from "@/lib/holdOrder";
import { buildAmenityRestoreError, type AmenityRestoreError } from "@/lib/amenityRescheduleGuard";
import { AlertTriangle } from "lucide-react";

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
  { value: "cancelled", label: "已取消" },
];

export function OrderStatusDialog({ order, open, onOpenChange, onSuccess }: OrderStatusDialogProps) {
  const { toast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [amenityError, setAmenityError] = useState<AmenityRestoreError | null>(null);

  useEffect(() => {
    if (open && order) {
      setSelectedStatus(order.order_status);
      setReason("");
      setAmenityError(null);
    }
  }, [open, order]);

  const handleSave = async () => {
    if (!order || selectedStatus === order.order_status) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    setAmenityError(null);
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
        const confirmedAt = new Date().toISOString();
        updateData.confirmed_at = confirmedAt;
        // 保留單轉正：成交日改為轉正當下
        if (isHoldOrder(order)) {
          updateData.order_date = confirmedAt;
        }
      } else if (selectedStatus === "checked_in") {
        updateData.checked_in_at = new Date().toISOString();
      } else if (selectedStatus === "checked_out") {
        updateData.checked_out_at = new Date().toISOString();
      } else if (selectedStatus === "cancelled") {
        updateData.cancelled_at = new Date().toISOString();
      }

      const { error } = await supabase.rpc("update_order_fields_v1", {
        p_order_id: order.id,
        p_patch: updateData,
        p_source: "admin_order_status_dialog",
        p_reason: reason.trim() || null,
      });

      if (error) throw error;

      // 變更紀錄由 zzz_order_change_log trigger 統一寫入；原因已併入 notes（V5.5C.2）



      toast({ title: "訂單狀態已更新" });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("更新訂單狀態失敗:", error);
      const restoreError = buildAmenityRestoreError({
        fromStatus: order.order_status,
        toStatus: selectedStatus,
        message: error instanceof Error ? error.message : (error as any)?.message,
      });
      if (restoreError) {
        setAmenityError(restoreError);
        toast({ title: restoreError.title, description: restoreError.description, variant: "destructive" });
      } else {
        toast({ title: "更新失敗", description: "無法更新訂單狀態，請稍後再試", variant: "destructive" });
      }
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
          {amenityError && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-destructive">{amenityError.title}</p>
                  <p className="text-muted-foreground leading-relaxed">{amenityError.description}</p>
                </div>
              </div>
            </div>
          )}
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
