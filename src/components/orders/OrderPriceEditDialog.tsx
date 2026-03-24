import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Order } from "@/types/order";

interface OrderPriceEditDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function OrderPriceEditDialog({ order, open, onOpenChange, onSuccess }: OrderPriceEditDialogProps) {
  const { toast } = useToast();
  const [editTotalPrice, setEditTotalPrice] = useState(0);
  const [editDiscountAmount, setEditDiscountAmount] = useState(0);
  const [editDepositAmount, setEditDepositAmount] = useState(0);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editReason, setEditReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editFinalPrice = editTotalPrice - editDiscountAmount;

  useEffect(() => {
    if (open && order) {
      setEditTotalPrice(order.total_price);
      setEditDiscountAmount(order.discount_amount);
      setEditDepositAmount(order.deposit_amount ?? 0);
      setEditPaidAmount(order.paid_amount);
      setEditReason("");
    }
  }, [open, order]);

  const handleOpen = (isOpen: boolean) => {
    onOpenChange(isOpen);
  };

  const handleSave = async () => {
    if (!order) return;
    if (editFinalPrice < 0) {
      toast({ title: "實收金額不可為負數", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const oldValues = {
        total_price: order.total_price,
        discount_amount: order.discount_amount,
        final_price: order.final_price,
        deposit_amount: order.deposit_amount,
        paid_amount: order.paid_amount,
      };
      const newValues = {
        total_price: editTotalPrice,
        discount_amount: editDiscountAmount,
        final_price: editFinalPrice,
        deposit_amount: editDepositAmount,
        paid_amount: editPaidAmount,
      };

      let newPaymentStatus = order.payment_status;
      if (editPaidAmount <= 0) {
        newPaymentStatus = "unpaid";
      } else if (editPaidAmount >= editFinalPrice) {
        newPaymentStatus = "paid";
      } else if (editPaidAmount > 0 && editPaidAmount < editFinalPrice) {
        newPaymentStatus = "deposit_paid";
      }

      const { error } = await supabase
        .from("orders")
        .update({
          total_price: editTotalPrice,
          discount_amount: editDiscountAmount,
          final_price: editFinalPrice,
          deposit_amount: editDepositAmount,
          paid_amount: editPaidAmount,
          payment_status: newPaymentStatus,
          ...(editReason.trim() ? {
            notes: order.notes
              ? `${order.notes}\n【金額修改】${editReason.trim()}`
              : `【金額修改】${editReason.trim()}`,
          } : {}),
        })
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
            details: { type: "price_edit", reason: editReason.trim(), old: oldValues, new: newValues } as any,
          }]);
        }
      } catch (e) {
        console.error("Audit log error:", e);
      }

      toast({ title: "金額修改成功", description: "訂單金額已更新" });
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error("修改金額失敗:", error);
      toast({ title: "修改失敗", description: "無法修改訂單金額，請稍後再試", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改訂單金額</DialogTitle>
          <DialogDescription>修改訂單 {order?.order_number} 的價格明細</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="list-edit-total-price">原始金額</Label>
            <Input
              id="list-edit-total-price"
              type="number"
              min={0}
              value={editTotalPrice}
              onChange={(e) => setEditTotalPrice(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-edit-discount">折扣金額</Label>
            <Input
              id="list-edit-discount"
              type="number"
              min={0}
              value={editDiscountAmount}
              onChange={(e) => setEditDiscountAmount(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">實收金額</span>
            <span className={`font-bold text-lg ${editFinalPrice < 0 ? 'text-destructive' : ''}`}>
              NT$ {editFinalPrice.toLocaleString()}
            </span>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="list-edit-deposit">訂金金額</Label>
            <Input
              id="list-edit-deposit"
              type="number"
              min={0}
              value={editDepositAmount}
              onChange={(e) => setEditDepositAmount(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-edit-paid">已付金額</Label>
            <Input
              id="list-edit-paid"
              type="number"
              min={0}
              value={editPaidAmount}
              onChange={(e) => setEditPaidAmount(Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="list-edit-reason">備註</Label>
            <Textarea
              id="list-edit-reason"
              placeholder="請填寫修改金額的原因..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "確認修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
