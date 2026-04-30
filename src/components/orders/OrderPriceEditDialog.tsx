import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Order } from "@/types/order";
import { Minus, Plus, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OrderPriceEditDialogProps {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface AddonSetting {
  id: string;
  addon_type: string;
  description: string | null;
  price_per_unit: number;
  unit_label: string;
  max_quantity: number;
}

interface AddonDetail {
  addon_type: string;
  count: number;
  price_per_unit: number;
  total: number;
  unit_label: string;
}

export function OrderPriceEditDialog({ order, open, onOpenChange, onSuccess }: OrderPriceEditDialogProps) {
  const { toast } = useToast();
  const { currentAccommodationId } = useAccommodation();
  const [editTotalPriceStr, setEditTotalPriceStr] = useState("0");
  const [editDiscountAmountStr, setEditDiscountAmountStr] = useState("0");
  const editTotalPrice = Math.max(0, parseInt(editTotalPriceStr) || 0);
  const editDiscountAmount = Math.max(0, parseInt(editDiscountAmountStr) || 0);
  const [editDepositAmountStr, setEditDepositAmountStr] = useState("0");
  const [editPaidAmountStr, setEditPaidAmountStr] = useState("0");
  const editDepositAmount = Math.max(0, parseInt(editDepositAmountStr) || 0);
  const editPaidAmount = Math.max(0, parseInt(editPaidAmountStr) || 0);
  const [editReason, setEditReason] = useState("");
  const [editDiscountCode, setEditDiscountCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Addon settings & editable addon quantities
  const [addonSettings, setAddonSettings] = useState<AddonSetting[]>([]);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});

  // Compute addon total from editable quantities
  const addonTotal = addonSettings.reduce((sum, s) => {
    const qty = addonQuantities[s.addon_type] || 0;
    return sum + s.price_per_unit * qty;
  }, 0);

  const editFinalPrice = editTotalPrice - editDiscountAmount + addonTotal;

  // Lock amount fields once payment has started (deposit_paid / paid / fully_paid)
  const isAmountLocked = !!order && ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status);

  // Permission: can current user unlock discount fields on already-paid orders?
  const [canUnlockDiscount, setCanUnlockDiscount] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!isAmountLocked || !currentAccommodationId) {
        setCanUnlockDiscount(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // super_admin?
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
      if (isSuper) {
        if (!cancelled) setCanUnlockDiscount(true);
        return;
      }
      const { data: perm } = await supabase
        .from("paid_order_discount_unlock_permissions")
        .select("id")
        .eq("user_id", user.id)
        .eq("accommodation_id", currentAccommodationId)
        .maybeSingle();
      if (!cancelled) setCanUnlockDiscount(!!perm);
    };
    check();
    return () => { cancelled = true; };
  }, [isAmountLocked, currentAccommodationId, order?.id]);

  // Discount fields are only locked when amount-locked AND user has no unlock permission
  const isDiscountLocked = isAmountLocked && !canUnlockDiscount;

  // Fetch addon settings once
  useEffect(() => {
    if (!currentAccommodationId) return;
    supabase
      .from("addon_settings")
      .select("id, addon_type, description, price_per_unit, unit_label, max_quantity")
      .eq("accommodation_id", currentAccommodationId)
      .eq("enabled", true)
      .then(({ data }) => {
        if (data) setAddonSettings(data);
      });
  }, [currentAccommodationId]);

  useEffect(() => {
    if (open && order) {
      setEditTotalPriceStr(String(order.total_price));
      setEditDiscountAmountStr(String(order.discount_amount));
      setEditDepositAmountStr(String(order.deposit_amount ?? 0));
      setEditPaidAmountStr(String(order.paid_amount ?? 0));
      setEditReason("");
      setEditDiscountCode(order.discount_code || "");

      // Fetch existing addon data from the order
      supabase
        .from("orders")
        .select("custom_addon_details")
        .eq("id", order.id)
        .single()
        .then(({ data }) => {
          const quantities: Record<string, number> = {};
          if (data?.custom_addon_details && Array.isArray(data.custom_addon_details)) {
            for (const a of data.custom_addon_details as any[]) {
              if (a?.addon_type && a.count > 0) {
                quantities[a.addon_type] = a.count;
              }
            }
          }
          setAddonQuantities(quantities);
        });
    }
  }, [open, order]);

  const updateAddonQty = (addonType: string, delta: number, max: number) => {
    setAddonQuantities(prev => {
      const current = prev[addonType] || 0;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [addonType]: next };
    });
  };

  const handleSave = async () => {
    if (!order) return;
    if (editFinalPrice < 0) {
      toast({ title: "實收金額不可為負數", variant: "destructive" });
      return;
    }
    // Safety: enforce locked fields server-truth even if UI was bypassed
    const safeTotalPrice = isAmountLocked ? order.total_price : editTotalPrice;
    const safeDiscountAmount = isDiscountLocked ? order.discount_amount : editDiscountAmount;
    const safeDepositAmount = isAmountLocked ? (order.deposit_amount ?? 0) : editDepositAmount;
    const safeDiscountCode = isDiscountLocked ? (order.discount_code || "") : editDiscountCode;
    const safeFinalPrice = safeTotalPrice - safeDiscountAmount + addonTotal;
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
        total_price: safeTotalPrice,
        discount_amount: safeDiscountAmount,
        final_price: safeFinalPrice,
        deposit_amount: safeDepositAmount,
        paid_amount: editPaidAmount,
      };

      // Build custom_addon_details from current quantities
      const newCustomAddonDetails: AddonDetail[] = addonSettings
        .filter(s => (addonQuantities[s.addon_type] || 0) > 0)
        .map(s => {
          const qty = addonQuantities[s.addon_type] || 0;
          return {
            addon_type: s.addon_type,
            count: qty,
            price_per_unit: s.price_per_unit,
            total: s.price_per_unit * qty,
            unit_label: s.unit_label,
          };
        });

      // Also build meal_plan_details format for EditOrderDialog sync
      const newMealPlanDetails = addonSettings
        .filter(s => (addonQuantities[s.addon_type] || 0) > 0)
        .map(s => ({
          addon_id: s.id,
          quantity: addonQuantities[s.addon_type] || 0,
        }));

      let newPaymentStatus = order.payment_status;
      if (editPaidAmount <= 0) {
        newPaymentStatus = "unpaid";
      } else if (editPaidAmount >= safeFinalPrice) {
        newPaymentStatus = "paid";
      } else if (editPaidAmount > 0 && editPaidAmount < safeFinalPrice) {
        newPaymentStatus = "deposit_paid";
      }

      // Detect amount changes for the locked audit-line
      const wasPaidOrDeposit = ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status);
      const amountChanged =
        Number(safeTotalPrice) !== Number(order.total_price ?? 0) ||
        Number(safeDiscountAmount) !== Number(order.discount_amount ?? 0) ||
        Number(safeDepositAmount) !== Number(order.deposit_amount ?? 0) ||
        Number(editPaidAmount) !== Number(order.paid_amount ?? 0) ||
        Number(safeFinalPrice) !== Number(order.final_price ?? 0);

      let nextNotes: string | null = order.notes ?? null;
      if (wasPaidOrDeposit && amountChanged) {
        const { data: { user } } = await supabase.auth.getUser();
        let who = user?.email || user?.id || "unknown";
        if (user?.id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();
          if (prof?.name) who = prof.name;
        }
        const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
        const parts: string[] = [];
        if (Number(safeTotalPrice) !== Number(order.total_price ?? 0)) parts.push(`房費 ${order.total_price}→${safeTotalPrice}`);
        if (Number(safeDiscountAmount) !== Number(order.discount_amount ?? 0)) parts.push(`折扣 ${order.discount_amount}→${safeDiscountAmount}`);
        if (Number(safeDepositAmount) !== Number(order.deposit_amount ?? 0)) parts.push(`訂金 ${order.deposit_amount ?? 0}→${safeDepositAmount}`);
        if (Number(editPaidAmount) !== Number(order.paid_amount ?? 0)) parts.push(`已付 ${order.paid_amount ?? 0}→${editPaidAmount}`);
        if (Number(safeFinalPrice) !== Number(order.final_price ?? 0)) parts.push(`實收 ${order.final_price}→${safeFinalPrice}`);
        const reasonStr = editReason.trim() ? `｜原因：${editReason.trim()}` : "";
        const auditLine = `🔒[金額異動 ${ts} by ${who}] ${parts.join("、")}${reasonStr}`;
        nextNotes = nextNotes ? `${nextNotes}\n${auditLine}` : auditLine;
      } else if (editReason.trim()) {
        // Non-locked path: keep original behaviour for plain reason note
        nextNotes = order.notes
          ? `${order.notes}\n【金額修改】${editReason.trim()}`
          : `【金額修改】${editReason.trim()}`;
      }

      const { error } = await supabase
        .from("orders")
        .update({
          total_price: safeTotalPrice,
          discount_amount: safeDiscountAmount,
          final_price: safeFinalPrice,
          deposit_amount: safeDepositAmount,
          paid_amount: editPaidAmount,
          payment_status: newPaymentStatus,
          custom_addon_details: newCustomAddonDetails as any,
          discount_code: safeDiscountCode.trim() || null,
          meal_plan_details: newMealPlanDetails.length > 0 ? newMealPlanDetails as any : null,
          notes: nextNotes,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>修改訂單金額</DialogTitle>
          <DialogDescription>修改訂單 {order?.order_number} 的價格明細</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {isAmountLocked && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                {canUnlockDiscount
                  ? "已付款訂單僅鎖定房費與訂金。您具有「修改已結清折扣」權限，可調整折扣金額與折扣碼以補登折扣券。"
                  : "已付款後無法修改房費、折扣、折扣碼、訂金，僅可調整加購方案與已付金額。"}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="list-edit-total-price">房費金額</Label>
            <Input
              id="list-edit-total-price"
              type="text" inputMode="numeric"
              disabled={isAmountLocked}
              value={editTotalPriceStr}
              onChange={(e) => setEditTotalPriceStr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-edit-discount">折扣金額</Label>
            <Input
              id="list-edit-discount"
              type="text" inputMode="numeric"
              disabled={isDiscountLocked}
              value={editDiscountAmountStr}
              onChange={(e) => setEditDiscountAmountStr(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-edit-discount-code">折扣碼</Label>
            <Input
              id="list-edit-discount-code"
              type="text"
              placeholder="選填"
              disabled={isDiscountLocked}
              value={editDiscountCode}
              onChange={(e) => setEditDiscountCode(e.target.value)}
            />
          </div>

          {/* Editable addon section */}
          {addonSettings.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <span className="text-sm font-medium text-muted-foreground">加購方案</span>
                {addonSettings.map((addon) => {
                  const qty = addonQuantities[addon.addon_type] || 0;
                  return (
                    <div key={addon.id} className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{addon.addon_type}</p>
                        <p className="text-xs text-muted-foreground">
                          NT$ {addon.price_per_unit.toLocaleString()} / {addon.unit_label}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={qty <= 0}
                          onClick={() => updateAddonQty(addon.addon_type, -1, addon.max_quantity)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm font-medium">{qty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={qty >= addon.max_quantity}
                          onClick={() => updateAddonQty(addon.addon_type, 1, addon.max_quantity)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        {qty > 0 && (
                          <span className="text-sm w-20 text-right">
                            NT$ {(addon.price_per_unit * qty).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {addonTotal > 0 && (
                  <div className="flex justify-between text-sm font-medium pt-1">
                    <span>加購小計</span>
                    <span>NT$ {addonTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">實收金額</span>
            <span className={`font-bold text-lg ${editFinalPrice < 0 ? 'text-destructive' : ''}`}>
              NT$ {editFinalPrice.toLocaleString()}
            </span>
          </div>
          {addonTotal > 0 && (
            <p className="text-xs text-muted-foreground">= 房費 {editTotalPrice.toLocaleString()} - 折扣 {editDiscountAmount.toLocaleString()} + 加購 {addonTotal.toLocaleString()}</p>
          )}
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="list-edit-deposit">訂金金額</Label>
            <Input
              id="list-edit-deposit"
              type="text"
              inputMode="numeric"
              disabled={isAmountLocked}
              value={editDepositAmountStr}
              onChange={(e) => setEditDepositAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="list-edit-paid">已付金額</Label>
            <Input
              id="list-edit-paid"
              type="text"
              inputMode="numeric"
              value={editPaidAmountStr}
              onChange={(e) => setEditPaidAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
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
