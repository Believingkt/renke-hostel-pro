import { useState, useEffect } from "react";
import { getOrderDiscountScope, getOrderCodeCoverage } from "@/lib/discountScope";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { addonPricingSuffix, addonStepUp, addonStepDown } from "@/lib/addonLabels";
import { resolveAddonSetting } from "@/lib/addonAliases";
import { calcOrderAddonTotal, pureRoomFeeOf } from "@/lib/orderAddonTotal";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { Order } from "@/types/order";
import { Minus, Plus, Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import {
  canEditPaidDiscount,
  buildPaidDiscountChanges,
  PAID_DISCOUNT_SOURCE,
  type PaidDiscountOrderLike,
} from "@/lib/paidDiscountEdit";

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
  pricing_mode?: string | null;
  min_quantity?: number | null;
  max_quantity: number;
}

interface AddonDetail {
  addon_id?: string;
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

  // 歷史訂單不重算加購晚數，保留原金額
  const addonNights = 1;

  // 可編輯加購項目金額（僅 addon_settings 內的項目）
  const editableAddonTotal = addonSettings.reduce((sum, s) => {
    const qty = addonQuantities[s.addon_type] || 0;
    return sum + s.price_per_unit * qty * addonNights;
  }, 0);


  // Total/discount fields lock only when fully paid; deposit locks once any payment received
  const isAmountLocked = !!order && ["paid", "fully_paid"].includes(order.payment_status);
  const isDepositLocked = !!order && ["deposit_paid", "paid", "fully_paid"].includes(order.payment_status);

  // 權限唯一來源：/admin 同館「訂單」模組 = editable
  const { getLevel, isLoading: isPermissionLoading } = useStaffPermissions();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  // 退款／取消等保護欄位（Order 型別未帶，另外讀取）
  const [discountGuard, setDiscountGuard] = useState<PaidDiscountOrderLike | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
      if (!cancelled) setIsSuperAdmin(isSuper);
    };
    check();
    return () => { cancelled = true; };
  }, [order?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!order?.id) {
      setDiscountGuard(null);
      return;
    }
    supabase
      .from("orders")
      .select("accommodation_id, payment_status, order_status, refund_status, refunded_amount, refunded_at, paid_amount")
      .eq("id", order.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDiscountGuard((data as any) ?? null);
      });
    return () => { cancelled = true; };
  }, [order?.id]);

  const discountPermission = canEditPaidDiscount({
    ordersLevel: getLevel("orders"),
    currentAccommodationId,
    order: discountGuard,
  });
  const canUnlockDiscount = !isPermissionLoading && discountPermission.allowed;

  // Discount fields are only locked when amount-locked AND user has no unlock permission
  const isDiscountLocked = isAmountLocked && !canUnlockDiscount;
  // super_admin 可修改已結清訂單的房費（DB trigger 亦放行）
  const isRoomPriceLocked = isAmountLocked && !isSuperAdmin;

  // Fetch addon settings once
  useEffect(() => {
    if (!currentAccommodationId) return;
    supabase
      .from("addon_settings")
      .select("id, addon_type, description, price_per_unit, unit_label, pricing_mode, min_quantity, max_quantity")
      .eq("accommodation_id", currentAccommodationId)
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setAddonSettings(data);
      });
  }, [currentAccommodationId]);

  const [originalAddons, setOriginalAddons] = useState<AddonDetail[]>([]);

  const [originalAddonTotal, setOriginalAddonTotal] = useState(0);

  // 訂單上與 addon_settings 無關的加購欄位（寵物 / 備註現場加購），
  // 必須原樣保留並納入 DB 口徑計算，否則已付款訂單的「純房費」會被算錯而擋下儲存。
  const [addonCtx, setAddonCtx] = useState<{
    pet_plan_price: number;
    notes: string | null;
    preserved: any[];
  }>({ pet_plan_price: 0, notes: null, preserved: [] });

  const [savedRoomFee, setSavedRoomFee] = useState(0);

  // 儲存後的 custom_addon_details（可編輯項目 + 原樣保留項目）
  const buildNewAddonDetails = (): AddonDetail[] => [
    ...(addonCtx.preserved as AddonDetail[]),
    ...addonSettings
      .filter((s) => (addonQuantities[s.addon_type] || 0) > 0)
      .map((s) => {
        const qty = addonQuantities[s.addon_type] || 0;
        return {
          addon_id: s.id,
          addon_type: s.addon_type,
          count: qty,
          price_per_unit: s.price_per_unit,
          total: s.price_per_unit * qty * addonNights,
          unit_label: s.unit_label,
        };
      }),
  ];

  // 加購總額一律以 DB calc_order_addon_total 口徑計算，確保房費比對一致
  const addonTotal = calcOrderAddonTotal({
    pet_plan_price: addonCtx.pet_plan_price,
    custom_addon_details: buildNewAddonDetails(),
    notes: addonCtx.notes,
  });

  const editFinalPrice = editTotalPrice - editDiscountAmount + addonTotal;



  useEffect(() => {
    if (open && order) {
      setEditTotalPriceStr(String(order.total_price));
      setEditDiscountAmountStr(String(order.discount_amount));
      setEditDepositAmountStr(String(order.deposit_amount ?? 0));
      setEditPaidAmountStr(String(order.paid_amount ?? 0));
      setEditReason("");
      setEditDiscountCode(order.discount_code || "");

      // Fetch existing addon data from the order
      (async () => {
        const [{ data }, { data: settings }] = await Promise.all([
          supabase
            .from("orders")
            .select("custom_addon_details, pet_plan_price, notes")
            .eq("id", order.id)
            .single(),
          supabase
            .from("addon_settings")
            .select("id, addon_type")
            .eq("accommodation_id", currentAccommodationId || ""),
        ]);

        const quantities: Record<string, number> = {};
        const orig: AddonDetail[] = [];
        const preserved: any[] = [];
        let origTotal = 0;
        if (data?.custom_addon_details && Array.isArray(data.custom_addon_details)) {
          for (const a of data.custom_addon_details as any[]) {
            if (a?.addon_type && a.count > 0) {
              // 舊訂單可能保留改名前的名稱，改以 addon_id／別名對應到現行設定
              const matched = resolveAddonSetting(a, settings || []);
              if (!matched) {
                // 對應不到現行設定（已停用／寵物／bbq 等）→ 原樣保留，不在此畫面編輯
                preserved.push(a);
                continue;
              }
              const key = matched.addon_type;
              quantities[key] = (quantities[key] || 0) + a.count;
              origTotal += Number(a.total ?? 0) || 0;
              orig.push({
                addon_type: key,
                count: a.count,
                price_per_unit: a.price_per_unit ?? 0,
                total: a.total ?? 0,
                unit_label: a.unit_label ?? "",
              });
            }
          }
        }
        setAddonQuantities(quantities);
        setOriginalAddons(orig);
        setOriginalAddonTotal(origTotal);
        const ctx = {
          pet_plan_price: Number((data as any)?.pet_plan_price ?? 0) || 0,
          notes: ((data as any)?.notes ?? null) as string | null,
          preserved,
        };
        setAddonCtx(ctx);
        // orders.total_price 已包含加購金額，此欄位為「房費」；口徑與 DB calc_order_addon_total 一致
        const roomFee = pureRoomFeeOf({
          total_price: order.total_price,
          final_price: order.final_price,
          discount_amount: order.discount_amount,
          pet_plan_price: ctx.pet_plan_price,
          custom_addon_details: data?.custom_addon_details ?? null,
          notes: ctx.notes,
        });
        setSavedRoomFee(roomFee);
        setEditTotalPriceStr(String(roomFee));
      })();

    }
  }, [open, order, currentAccommodationId]);



  const updateAddonQty = (addonType: string, delta: number, max: number, min = 0) => {
    setAddonQuantities(prev => {
      const current = prev[addonType] || 0;
      const next = delta > 0 ? addonStepUp(current, min, max) : addonStepDown(current, min);
      return { ...prev, [addonType]: next };
    });
  };

  // 自動驗證並帶入折扣金額（折扣碼變更後失焦觸發）
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const handleValidateDiscountCode = async () => {
    if (!order || isDiscountLocked) return;
    const code = editDiscountCode.trim().toUpperCase();
    if (!code) return;
    // 與訂單原有折扣碼相同 → 一律不重新驗證（沿用原碼，只調整金額；折扣碼與分潤記錄保留）
    if (code === (order.discount_code || "").toUpperCase()) {
      return;
    }
    setIsValidatingCode(true);
    try {
      const scope = await getOrderDiscountScope(order.id, order.room_types?.id || null);
      let effTemplateId = scope.templateId;
      if (scope.ambiguous) {
        const cov = await getOrderCodeCoverage({
          orderId: order.id,
          accommodationId: currentAccommodationId || "",
          code,
        });
        if (cov.coverage !== "full") {
          toast({
            title: "無法套用折扣碼",
            description:
              cov.coverage === "none"
                ? "此折扣碼不適用於本訂單的任何房價方案，請確認是否用錯折扣碼；若仍要調整金額，請改填手動折扣金額（會清空折扣碼並刪除分潤／業績歸屬記錄）。"
                : cov.coverage === "partial"
                  ? "此折扣碼只適用於本訂單的部分房價方案，系統無法自動決定折扣分攤方式。請改填手動折扣金額（會清空折扣碼並刪除分潤／業績歸屬記錄）。"
                  : scope.reason ||
                    "此訂單包含多個房型，無法自動判斷折扣碼適用範圍。改填手動折扣金額會清空折扣碼並刪除此訂單的分潤／業績歸屬記錄。",
            variant: "destructive",
          });
          return;
        }
        effTemplateId = cov.representativeTemplateId;
      }
      const { data, error } = await supabase.rpc('validate_discount_code', {
        p_code: code,
        p_accommodation_id: currentAccommodationId,
        p_order_amount: editTotalPrice,
        p_room_type_id: scope.roomTypeId,
        p_check_in_date: order.check_in_date || null,
        p_pricing_template_id: effTemplateId,
      });
      if (error) throw error;
      const result = (data as any[])?.[0];
      if (result?.is_valid) {
        const calc = result.discount_type === "percentage"
          ? Math.round(editTotalPrice * (Number(result.discount_value) / 100))
          : Number(result.discount_value);
        setEditDiscountAmountStr(String(calc));
        setEditDiscountCode(code);
        toast({
          title: "折扣碼已套用",
          description: result.discount_type === "percentage"
            ? `${result.discount_value}% 折扣（NT$ ${calc.toLocaleString()}）`
            : `NT$ ${calc.toLocaleString()} 折扣`,
        });
      } else {
        toast({
          title: "折扣碼無效",
          description: result?.message || "請確認代碼或有效期限",
          variant: "destructive",
        });
      }
    } catch (e) {
      console.error("validate discount code failed", e);
    } finally {
      setIsValidatingCode(false);
    }
  };


  const handleSave = async () => {
    if (!order) return;
    if (editFinalPrice < 0) {
      toast({ title: "實收金額不可為負數", variant: "destructive" });
      return;
    }
    // Safety: enforce locked fields server-truth even if UI was bypassed
    // 房費（不含加購，與 DB 觸發器同口徑）
    const safeRoomPrice = isRoomPriceLocked ? savedRoomFee : editTotalPrice;
    const safeDiscountAmount = isDiscountLocked ? order.discount_amount : editDiscountAmount;
    const safeDepositAmount = isDepositLocked ? (order.deposit_amount ?? 0) : editDepositAmount;
    const safeDiscountCode = isDiscountLocked ? (order.discount_code || "") : editDiscountCode;
    // orders.total_price 口徑：房費 + 加購
    const safeTotalPrice = safeRoomPrice + addonTotal;
    const safeFinalPrice = safeTotalPrice - safeDiscountAmount;
    // 已結清訂單修改折扣：必須填寫原因
    const paidDiscountChanges = isAmountLocked
      ? buildPaidDiscountChanges(
          {
            discount_amount: order.discount_amount ?? 0,
            discount_code: order.discount_code ?? null,
            final_price: order.final_price ?? 0,
          },
          {
            discount_amount: safeDiscountAmount,
            discount_code: safeDiscountCode.trim() || null,
            final_price: safeFinalPrice,
          },
        )
      : [];
    const paidDiscountEdited =
      isAmountLocked &&
      paidDiscountChanges.some((c) => c.field === "discount_amount" || c.field === "discount_code");
    if (paidDiscountEdited && !editReason.trim()) {
      toast({
        title: "請填寫修改原因",
        description: "修改已結清訂單的折扣必須填寫原因。",
        variant: "destructive",
      });
      return;
    }
    setIsSaving(true);
    try {

      // Build custom_addon_details（含原樣保留的非設定項目）
      const newCustomAddonDetails: AddonDetail[] = buildNewAddonDetails();


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
      const wasPaidOrDeposit = ["paid", "fully_paid"].includes(order.payment_status);
      const amountChanged =
        Number(safeTotalPrice) !== Number(order.total_price ?? 0) ||
        Number(safeDiscountAmount) !== Number(order.discount_amount ?? 0) ||
        Number(safeDepositAmount) !== Number(order.deposit_amount ?? 0) ||
        Number(editPaidAmount) !== Number(order.paid_amount ?? 0) ||
        Number(safeFinalPrice) !== Number(order.final_price ?? 0);

      let nextNotes: string | null = order.notes ?? null;
      if (wasPaidOrDeposit && amountChanged) {
        const { data: { user } } = await supabase.auth.getUser();
        let who = "unknown";
        if (user) {
          const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
          who = (prof?.name && prof.name.trim()) || user.email || user.id;
        }
        const ts = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" }).slice(0, 16);
        const parts: string[] = [];
        if (Number(safeTotalPrice) !== Number(order.total_price ?? 0)) parts.push(`房費 ${order.total_price}→${safeTotalPrice}`);
        if (Number(safeDiscountAmount) !== Number(order.discount_amount ?? 0)) parts.push(`折扣 ${order.discount_amount}→${safeDiscountAmount}`);
        if (Number(safeDepositAmount) !== Number(order.deposit_amount ?? 0)) parts.push(`訂金 ${order.deposit_amount ?? 0}→${safeDepositAmount}`);
        // Per-addon diffs (寵物/餐食/自訂加購) — explain why 實收 changed
        const addonKeys = Array.from(new Set([
          ...originalAddons.map(a => a.addon_type),
          ...newCustomAddonDetails.map(a => a.addon_type),
        ]));
        for (const k of addonKeys) {
          const o = originalAddons.find(a => a.addon_type === k);
          const n = newCustomAddonDetails.find(a => a.addon_type === k);
          const oc = o?.count || 0, ot = o?.total || 0;
          const nc = n?.count || 0, nt = n?.total || 0;
          if (oc !== nc || ot !== nt) {
            parts.push(`${k} ${oc}/${ot}→${nc}/${nt}`);
          }
        }
        if (Number(editPaidAmount) !== Number(order.paid_amount ?? 0)) parts.push(`已付 ${order.paid_amount ?? 0}→${editPaidAmount}`);
        if (Number(safeFinalPrice) !== Number(order.final_price ?? 0)) parts.push(`實收 ${order.final_price}→${safeFinalPrice}`);
        const reasonStr = editReason.trim() ? `｜原因：${editReason.trim()}` : "";
        // 已結清折扣修改：來源標記改寫入 notes 稽核行（V5.5C.2；舊 audit_logs 寫入已停用）
        const sourceStr = paidDiscountEdited ? `｜paid_discount_edit（${PAID_DISCOUNT_SOURCE}）` : "";
        const auditLine = `🔒[金額異動 ${ts} by ${who}] ${parts.join("、")}${reasonStr}${sourceStr}`;
        nextNotes = nextNotes ? `${nextNotes}\n${auditLine}` : auditLine;
      } else if (editReason.trim()) {
        // Non-locked path: keep original behaviour for plain reason note
        nextNotes = order.notes
          ? `${order.notes}\n【金額修改】${editReason.trim()}`
          : `【金額修改】${editReason.trim()}`;
      }

      const { error } = await supabase.rpc("update_order_fields_v1", {
        p_order_id: order.id,
        p_patch: {
          total_price: safeTotalPrice,
          discount_amount: safeDiscountAmount,
          final_price: safeFinalPrice,
          deposit_amount: safeDepositAmount,
          paid_amount: editPaidAmount,
          payment_status: newPaymentStatus,
          custom_addon_details: newCustomAddonDetails as any,
          discount_code: safeDiscountCode.trim() || null,
          meal_plan_details: newMealPlanDetails.length > 0 ? (newMealPlanDetails as any) : null,
          notes: nextNotes,
        } as any,
        p_source: paidDiscountEdited ? "paid_discount_edit" : "admin_price_edit_dialog",
        p_reason: editReason.trim() || null,
      });
      if (error) throw error;

      // 變更紀錄由 zzz_order_change_log trigger 統一寫入；原因已寫入 notes（V5.5C.2）



      toast({ title: "金額修改成功", description: "訂單金額已更新" });

      // Notify kol-webhook of potential discount-code change
      try {
        await supabase.functions.invoke('kol-webhook', {
          body: {
            order_id: order.id,
            trigger_type: "update",
            previous_discount_code: order.discount_code ?? null,
          },
        });
      } catch (e) {
        console.error("kol-webhook invoke (update) error:", e);
      }

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
      <DialogContent className="!flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>修改訂單金額</DialogTitle>
          <DialogDescription>修改訂單 {order?.order_number} 的價格明細</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-2">
          {isAmountLocked && (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                {canUnlockDiscount
                  ? "已付款訂單僅鎖定房費與訂金。您可調整折扣金額與折扣碼補登折扣券，並必須填寫修改原因。"
                  : (discountPermission.reason || "已付款後無法修改房費、折扣、折扣碼、訂金，僅可調整加購方案與已付金額。")}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="list-edit-total-price">房費金額</Label>
            <Input
              id="list-edit-total-price"
              type="text" inputMode="numeric"
              disabled={isRoomPriceLocked}
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
              placeholder="選填，輸入後失焦自動套用"
              disabled={isDiscountLocked || isValidatingCode}
              value={editDiscountCode}
              onChange={(e) => setEditDiscountCode(e.target.value)}
              onBlur={handleValidateDiscountCode}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
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
                          NT$ {addon.price_per_unit.toLocaleString()} / {addon.unit_label} {addonPricingSuffix(addon.pricing_mode)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={qty <= 0}
                          onClick={() => updateAddonQty(addon.addon_type, -1, addon.max_quantity, addon.min_quantity ?? 0)}
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
                          onClick={() => updateAddonQty(addon.addon_type, 1, addon.max_quantity, addon.min_quantity ?? 0)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        {qty > 0 && (
                          <span className="text-sm w-20 text-right">
                            NT$ {(addon.price_per_unit * qty * addonNights).toLocaleString()}
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
              disabled={isDepositLocked}
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
        <DialogFooter className="safe-bottom shrink-0 gap-2 border-t pt-3 [&>button]:min-h-[44px] [&>button]:flex-1 sm:[&>button]:min-h-0 sm:[&>button]:flex-none">
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "儲存中..." : "確認修改"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
