import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Order } from "@/types/order";

interface EditOrderDialogProps {
  open: boolean;
  order: Order | null;
  onOpenChange: (open: boolean) => void;
  onSave: (form: { order_status: string; payment_status: string; notes: string }) => Promise<void>;
}

export function EditOrderDialog({ open, order, onOpenChange, onSave }: EditOrderDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    order_status: "",
    payment_status: "",
    notes: "",
  });

  // 當 order 變化時更新表單
  useEffect(() => {
    if (order) {
      setEditForm({
        order_status: order.order_status,
        payment_status: order.payment_status,
        notes: order.notes || "",
      });
    }
  }, [order]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editForm);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯訂單</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>訂單編號</Label>
            <Input value={order.order_number} disabled />
          </div>
          <div className="space-y-2">
            <Label>訂購人</Label>
            <Input value={order.guest_name} disabled />
          </div>
          <div className="space-y-2">
            <Label>訂單狀態</Label>
            <Select value={editForm.order_status} onValueChange={(value) => setEditForm({...editForm, order_status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">待確認</SelectItem>
                <SelectItem value="confirmed">已確認</SelectItem>
                <SelectItem value="checked_in">已入住</SelectItem>
                <SelectItem value="checked_out">已退房</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>付款狀態</Label>
            <Select value={editForm.payment_status} onValueChange={(value) => setEditForm({...editForm, payment_status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="deposit_paid">已付訂金</SelectItem>
                <SelectItem value="paid">已付清</SelectItem>
                <SelectItem value="overdue">已逾期</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>備註</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
              rows={4}
              placeholder="輸入訂單備註..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
