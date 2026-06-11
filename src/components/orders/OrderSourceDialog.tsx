import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Order } from "@/types/order";
import { getOrderSourceConfig } from "@/utils/orderHelpers";
import { Globe, UserPlus } from "lucide-react";
import { useOrderSources } from "@/hooks/use-order-sources";

interface OrderSourceDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  accommodationId?: string | null;
}

export function OrderSourceDialog({ order, open, onOpenChange, onSuccess }: OrderSourceDialogProps) {
  const { toast } = useToast();
  const [selectedSource, setSelectedSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      setSelectedSource(order.order_source || "manual");
    }
  }, [open, order]);

  const handleSave = async () => {
    if (!order || selectedSource === (order.order_source || "manual")) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      const oldLabel = getOrderSourceConfig(order.order_source).label;
      const newLabel = getOrderSourceConfig(selectedSource).label;

      const noteAppend = `\n【來源變更】${oldLabel} → ${newLabel}`;

      const updatePayload: any = {
        order_source: selectedSource,
        notes: order.notes ? `${order.notes}${noteAppend}` : noteAppend.trim(),
      };
      if (selectedSource === "owner_provided") {
        updatePayload.owner_direct = true;
      }

      const { error } = await supabase
        .from("orders")
        .update(updatePayload)
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
              type: "order_source_change",
              old_source: order.order_source,
              new_source: selectedSource,
            } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "訂單來源已更新" });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("更新訂單來源失敗:", error);
      toast({ title: "更新失敗", description: "無法更新訂單來源，請稍後再試", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const currentConfig = order ? getOrderSourceConfig(order.order_source) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>變更訂單來源</DialogTitle>
          <DialogDescription>
            訂單 {order?.order_number}
            {currentConfig && (
              <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${currentConfig.className}`}>
                {currentConfig.label}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RadioGroup value={selectedSource} onValueChange={setSelectedSource}>
            {ORDER_SOURCES.map((source) => {
              const config = getOrderSourceConfig(source.value);
              return (
                <div key={source.value} className="flex items-center space-x-3 py-1.5">
                  <RadioGroupItem value={source.value} id={`src-${source.value}`} />
                  <Label htmlFor={`src-${source.value}`} className="cursor-pointer flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
                      {source.value === 'website' ? <Globe className="w-3 h-3" /> : source.value === 'manual' ? <UserPlus className="w-3 h-3" /> : null}
                      {source.label}
                    </span>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || selectedSource === (order?.order_source || "manual")}
          >
            {isSaving ? "儲存中..." : "確認變更"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
