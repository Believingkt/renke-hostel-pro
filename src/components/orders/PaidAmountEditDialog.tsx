/**
 * 已結清訂單金額調整專用對話框（折扣 / 額外加購共用）。
 *
 * 唯一寫入路徑：
 *   折扣 → public.update_paid_order_discount
 *   加購 → public.update_paid_order_addons_v2
 * 本元件不得直接 orders.update()、不得寫 order_rooms、不得自行補寫變更紀錄。
 * 折扣碼驗證只呼叫唯讀的 public.validate_discount_code。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { calcOrderAddonTotal, extraOnSiteAddonFromNotes, pureRoomFeeOf } from "@/lib/orderAddonTotal";
import { getOrderDiscountScope } from "@/lib/discountScope";
import {
  SETTLEMENT_OPTIONS,
  settlementLabel,
  type PaidAmountRpcResult,
  type SettlementHandling,
} from "@/lib/paidAmountSettlement";
import {
  callUpdatePaidOrderDiscount,
  type PaidDiscountMode,
} from "@/lib/paidDiscountEdit";
import {
  callUpdatePaidOrderAddonsV2,
  getPaidAddonRisk,
  riskMessage,
} from "@/lib/paidAddonEdit";
import {
  buildAddonDetails,
  hasPlanChanges,
  hasPlanReduction,
  nextPlanQty,
  parseOrderAddons,
  planDiffs,
  planSubtotal,
  plansTotal,
  PAID_ADDON_PLAN_BLOCKER,
  PAID_ADDON_PLAN_RPC_SUPPORTED,
  type AddonDetailRow,
  type AddonPlanRow,
  type AddonSettingRow,
} from "@/lib/paidAddonPlans";
import {
  DISCOUNT_CODE_OVERRIDE_BLOCKER,
  DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED,
  validatePaidDiscountCode,
  type DiscountValidationState,
} from "@/lib/paidDiscountCodeValidation";

export type PaidAmountEditMode = "discount" | "addon";

interface Props {
  orderId: string | null;
  mode: PaidAmountEditMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface Snapshot {
  id: string;
  order_number: string | null;
  accommodation_id: string | null;
  updated_at: string;
  payment_status: string | null;
  order_status: string | null;
  refund_status: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;
  total_price: number | null;
  final_price: number | null;
  paid_amount: number | null;
  discount_amount: number | null;
  discount_code: string | null;
  pet_plan_price: number | null;
  custom_addon_details: unknown;
  notes: string | null;
  check_in_date: string | null;
  room_type_id: string | null;
}

const NT = (v: number | null | undefined) => `NT$ ${Number(v ?? 0).toLocaleString()}`;

const onsiteNoteFromNotes = (notes: string | null | undefined): string => {
  if (!notes) return "";
  const blocks = [
    ...notes.matchAll(
      /【(?:加購備註|額外現場加購備註)[^】]*】\n?([\s\S]*?)\n?【(?:加購備註|額外現場加購備註)END】/g,
    ),
  ];
  if (blocks.length > 0) return (blocks[blocks.length - 1][1] || "").trim();
  const line = notes.match(/^【(?:加購備註|額外現場加購備註)[^】]*】(.*)$/m);
  return line ? (line[1] || "").trim() : "";
};

export function PaidAmountEditDialog({ orderId, mode, open, onOpenChange, onSuccess }: Props) {
  const { toast } = useToast();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // 共同欄位
  const [reason, setReason] = useState("");
  const [settlement, setSettlement] = useState<SettlementHandling | "">("");

  // 折扣欄位
  const [discountMode, setDiscountMode] = useState<PaidDiscountMode>("manual");
  const [discountAmountStr, setDiscountAmountStr] = useState("0");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscountStr, setAppliedDiscountStr] = useState("");
  const [validation, setValidation] = useState<DiscountValidationState>({ status: "idle" });
  const [scopeError, setScopeError] = useState("");

  // 加購欄位
  const [planRows, setPlanRows] = useState<AddonPlanRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [preserved, setPreserved] = useState<AddonDetailRow[]>([]);
  const [onsiteAmountStr, setOnsiteAmountStr] = useState("0");
  const [onsiteNote, setOnsiteNote] = useState("");
  const [paidAmountStr, setPaidAmountStr] = useState("");
  const [reduceAck, setReduceAck] = useState(false);
  const [riskAck, setRiskAck] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setStep("form");
    setErrorMsg("");
    setReason("");
    setSettlement("");
    setReduceAck(false);
    setRiskAck(false);
    setPaidAmountStr("");
    setValidation({ status: "idle" });
    setScopeError("");
    setPlanRows([]);
    setQuantities({});
    setPreserved([]);
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, accommodation_id, updated_at, payment_status, order_status, refund_status, refunded_amount, refunded_at, total_price, final_price, paid_amount, discount_amount, discount_code, pet_plan_price, custom_addon_details, notes, check_in_date, room_type_id",
        )
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        setErrorMsg(error?.message || "找不到訂單資料");
        return;
      }
      const s = data as unknown as Snapshot;
      setSnap(s);
      setDiscountAmountStr(String(Number(s.discount_amount ?? 0)));
      setDiscountCode(s.discount_code || "");
      setAppliedDiscountStr(String(Number(s.discount_amount ?? 0)));
      setDiscountMode(s.discount_code ? "code" : "manual");
      setOnsiteAmountStr(String(extraOnSiteAddonFromNotes(s.notes)));
      setOnsiteNote(onsiteNoteFromNotes(s.notes));

      // 加購方案：單價一律取自館別 addon_settings（不使用前端硬編價格）
      const { data: settings } = await supabase
        .from("addon_settings")
        .select("id, addon_type, description, price_per_unit, unit_label, pricing_mode, enabled, min_quantity, max_quantity")
        .eq("accommodation_id", s.accommodation_id || "")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const parsed = parseOrderAddons((settings || []) as AddonSettingRow[], s.custom_addon_details);
      setPlanRows(parsed.rows);
      setQuantities(parsed.quantities);
      setPreserved(parsed.preserved);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const oldDiscount = Number(snap?.discount_amount ?? 0);
  const oldCode = (snap?.discount_code || "").toUpperCase() || null;
  const oldTotal = Number(snap?.total_price ?? 0);
  const oldFinal = Number(snap?.final_price ?? 0);
  const oldPaid = Number(snap?.paid_amount ?? 0);
  const oldAddonTotal = snap ? calcOrderAddonTotal(snap as any) : 0;
  const oldOnsite = extraOnSiteAddonFromNotes(snap?.notes);
  const oldOnsiteNote = onsiteNoteFromNotes(snap?.notes);
  const roomFee = snap ? pureRoomFeeOf(snap as any) : 0;

  const newOnsite = Math.max(0, parseInt(onsiteAmountStr, 10) || 0);
  const newDiscountInput = Math.max(0, parseInt(discountAmountStr, 10) || 0);
  const appliedDiscountInput = Math.max(0, parseInt(appliedDiscountStr, 10) || 0);

  // 折扣碼輸入改變 → 驗證結果立即失效
  useEffect(() => {
    setValidation((v) =>
      v.status === "idle" ? v : v.status === "validating" ? v : { status: "idle" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountCode, discountMode]);

  const validatedStandard = validation.status === "valid" ? validation.standardAmount : null;
  const codeOverridden =
    discountMode === "code" && validatedStandard != null && appliedDiscountInput !== validatedStandard;

  const previewDiscount =
    discountMode === "none"
      ? 0
      : discountMode === "manual"
        ? newDiscountInput
        : (validatedStandard ?? oldDiscount);
  const previewCode =
    discountMode === "code" ? (discountCode || "").trim().toUpperCase() || null : null;

  // 加購預估
  const newPlansDetails = useMemo(
    () => buildAddonDetails(planRows, quantities, preserved),
    [planRows, quantities, preserved],
  );
  const newAddonTotal = useMemo(
    () =>
      mode === "addon"
        ? calcOrderAddonTotal({
            pet_plan_price: snap?.pet_plan_price ?? 0,
            custom_addon_details: newPlansDetails,
            notes: `【額外現場加購金額】${newOnsite}【額外現場加購金額END】`,
          })
        : oldAddonTotal,
    [mode, snap?.pet_plan_price, newPlansDetails, newOnsite, oldAddonTotal],
  );
  const addonDelta = mode === "addon" ? newAddonTotal - oldAddonTotal : 0;
  const newPaidInput = paidAmountStr.trim() === "" ? undefined : Math.max(0, parseInt(paidAmountStr, 10) || 0);

  const diffs = useMemo(() => planDiffs(planRows, quantities), [planRows, quantities]);
  const planChanged = mode === "addon" && hasPlanChanges(planRows, quantities);
  const planReduced = mode === "addon" && hasPlanReduction(planRows, quantities);
  const planBlocked = planChanged && !PAID_ADDON_PLAN_RPC_SUPPORTED;
  const discountBlocked = codeOverridden && !DISCOUNT_CODE_OVERRIDE_RPC_SUPPORTED;

  const afterTotal = mode === "addon" ? oldTotal + addonDelta : oldTotal;
  const afterFinal =
    mode === "addon" ? oldFinal + addonDelta : oldFinal + (oldDiscount - previewDiscount);
  const afterPaid = mode === "addon" && newPaidInput != null ? newPaidInput : oldPaid;
  const diff = afterFinal - afterPaid;

  const risk = getPaidAddonRisk(snap || undefined);
  const riskText = riskMessage(risk);
  const showRiskBlock = mode === "addon" && risk !== "none";
  const showReduceBlock = mode === "addon" && (addonDelta < 0 || planReduced);

  const notesChanged =
    mode === "addon" && (newOnsite !== oldOnsite || onsiteNote.trim() !== oldOnsiteNote.trim());
  const isNoop =
    mode === "addon"
      ? !notesChanged && !planChanged && newPaidInput == null
      : discountMode === "code"
        ? previewCode === oldCode && previewDiscount === oldDiscount
        : previewDiscount === oldDiscount && oldCode === null;

  const reasonOk = reason.trim().length >= 2;
  const settlementOk = settlement !== "";
  const codeReady =
    mode !== "discount" || discountMode !== "code" || validation.status === "valid";
  const canProceed =
    !!snap && reasonOk && settlementOk && !isNoop && codeReady && !planBlocked && !discountBlocked;
  const canConfirm =
    canProceed && (!showReduceBlock || reduceAck) && (!showRiskBlock || riskAck) && !saving;

  const title = mode === "discount" ? "修改已結清折扣" : "修改額外加購";

  const handleValidateCode = async () => {
    if (!snap?.accommodation_id) return;
    setValidation({ status: "validating" });
    setScopeError("");
    const scope = await getOrderDiscountScope(snap.id, snap.room_type_id);
    if (scope.ambiguous) {
      setScopeError(scope.reason || "此訂單包含多個房型／房價方案，無法使用折扣碼，請改用手動折扣金額。");
      setValidation({ status: "idle" });
      return;
    }
    const result = await validatePaidDiscountCode(supabase as any, {
      code: discountCode,
      accommodationId: snap.accommodation_id,
      roomFee,
      roomTypeId: scope.roomTypeId,
      checkInDate: snap.check_in_date,
      pricingTemplateId: scope.templateId,
    });
    setValidation(result);
    if (result.status === "valid") setAppliedDiscountStr(String(result.standardAmount));
  };

  const handleSubmit = async () => {
    if (!snap || step !== "confirm" || !canConfirm) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setErrorMsg("");
    try {
      let result: PaidAmountRpcResult;
      if (mode === "discount") {
        result = await callUpdatePaidOrderDiscount(supabase as any, {
          orderId: snap.id,
          expectedUpdatedAt: snap.updated_at,
          reason,
          mode: discountMode,
          settlement,
          confirmed: true,
          discountAmount: newDiscountInput,
          discountCode,
        });
      } else {
        result = await callUpdatePaidOrderAddonsV2(supabase as any, {
          orderId: snap.id,
          expectedUpdatedAt: snap.updated_at,
          reason,
          settlement,
          confirmed: true,
          onsiteAmount: notesChanged ? newOnsite : undefined,
          onsiteNote: notesChanged ? onsiteNote.trim() : undefined,
          paidAmount: newPaidInput,
          reduceAcknowledged: reduceAck,
          riskAcknowledged: riskAck,
        });
      }
      if (result?.changed === false) {
        toast({ title: "沒有任何變更", description: "本次未修改任何金額。" });
      } else {
        toast({
          title: "已儲存",
          description:
            mode === "discount"
              ? `折扣已更新，應收金額 ${NT(result?.final_price)}`
              : `加購已更新，應收金額 ${NT(result?.final_price)}`,
        });
      }
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      setErrorMsg(e?.message || "儲存失敗");
      setStep("form");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const setQty = (row: AddonPlanRow, delta: number) => {
    if (row.legacyOnly) return;
    setQuantities((prev) => ({ ...prev, [row.key]: nextPlanQty(row, prev[row.key] || 0, delta) }));
  };

  const Row = ({ label, before, after }: { label: string; before: string; after: string }) => (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-right tabular-nums">
        <span className="text-muted-foreground line-through">{before}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-semibold">{after}</span>
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => (!saving ? onOpenChange(v) : undefined)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {snap?.order_number ? `訂單 ${snap.order_number}｜` : ""}
            本流程不會自動收款或退款，僅調整訂單金額並留下變更紀錄。
          </DialogDescription>
        </DialogHeader>

        {loading ? null : !snap ? (
          errorMsg ? <Alert variant="destructive"><AlertDescription>{errorMsg}</AlertDescription></Alert> : null
        ) : step === "form" ? (
          <div className="space-y-4">
            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription className="whitespace-pre-wrap">{errorMsg}</AlertDescription>
              </Alert>
            )}
            {riskText && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{riskText}</AlertDescription>
              </Alert>
            )}

            {mode === "discount" ? (
              <div className="space-y-3">
                <Label className="text-sm">折扣方式</Label>
                <RadioGroup
                  value={discountMode}
                  onValueChange={(v) => setDiscountMode(v as PaidDiscountMode)}
                  className="grid gap-2"
                >
                  {[
                    { v: "manual", l: "手動折扣金額" },
                    { v: "code", l: "使用折扣碼" },
                    { v: "none", l: "取消折扣" },
                  ].map((o) => (
                    <div key={o.v} className="flex items-center gap-2">
                      <RadioGroupItem value={o.v} id={`dmode-${o.v}`} />
                      <Label htmlFor={`dmode-${o.v}`} className="text-sm font-normal">{o.l}</Label>
                    </div>
                  ))}
                </RadioGroup>
                {discountMode === "manual" && (
                  <div className="space-y-1">
                    <Label className="text-sm" htmlFor="paid-discount-amount">折扣金額</Label>
                    <Input
                      id="paid-discount-amount"
                      inputMode="numeric"
                      className="h-11 text-base md:h-9 md:text-sm"
                      value={discountAmountStr}
                      onChange={(e) => setDiscountAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                    />
                    <p className="text-xs text-muted-foreground">手動折扣不會保留折扣碼。</p>
                  </div>
                )}
                {discountMode === "code" && (
                  <div className="space-y-2">
                    <Label className="text-sm" htmlFor="paid-discount-code">折扣碼</Label>
                    <div className="flex gap-2">
                      <Input
                        id="paid-discount-code"
                        className="h-11 text-base md:h-9 md:text-sm uppercase"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 md:h-9 flex-shrink-0"
                        disabled={validation.status === "validating" || !discountCode.trim()}
                        onClick={handleValidateCode}
                      >
                        {validation.status === "validating" ? "驗證中..." : "驗證折扣碼"}
                      </Button>
                    </div>
                    {scopeError && (
                      <p className="text-xs text-destructive">{scopeError}</p>
                    )}
                    {validation.status === "idle" && (
                      <p className="text-xs text-muted-foreground">尚未驗證，請先驗證折扣碼。</p>
                    )}
                    {validation.status === "invalid" && (
                      <p className="text-xs text-destructive">折扣碼無效：{validation.message}</p>
                    )}
                    {validation.status === "valid" && (
                      <>
                        <p className="text-xs text-emerald-600">
                          驗證成功｜系統計算標準折扣金額 {NT(validation.standardAmount)}
                        </p>
                        <div className="space-y-1">
                          <Label className="text-sm" htmlFor="paid-applied-discount">實際套用折扣金額</Label>
                          <Input
                            id="paid-applied-discount"
                            inputMode="numeric"
                            className="h-11 text-base md:h-9 md:text-sm"
                            value={appliedDiscountStr}
                            onChange={(e) => setAppliedDiscountStr(e.target.value.replace(/[^\d]/g, ""))}
                          />
                          {codeOverridden && (
                            <p className="text-xs text-amber-600">已人工調整折扣金額（與系統標準金額不同）</p>
                          )}
                        </div>
                      </>
                    )}
                    {discountBlocked && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">{DISCOUNT_CODE_OVERRIDE_BLOCKER}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">加購方案</Label>
                  {planRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">此館別目前沒有加購方案。</p>
                  ) : (
                    <div className="rounded-md border divide-y">
                      {planRows.map((r) => {
                        const qty = quantities[r.key] || 0;
                        return (
                          <div key={r.key} className="p-3 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {r.name}
                                  {r.legacyOnly && <span className="ml-1 text-xs text-muted-foreground">（已停用）</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {NT(r.pricePerUnit)} / {r.unitLabel}・適用 {r.nights} 晚
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9"
                                  disabled={r.legacyOnly || qty <= 0}
                                  onClick={() => setQty(r, -1)}
                                  aria-label={`減少 ${r.name}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center tabular-nums text-sm">{qty}</span>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-9 w-9"
                                  disabled={r.legacyOnly}
                                  onClick={() => setQty(r, 1)}
                                  aria-label={`增加 ${r.name}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-right tabular-nums text-muted-foreground">
                              小計 {NT(planSubtotal(r, qty))}
                            </p>
                          </div>
                        );
                      })}
                      <div className="flex justify-between p-3 text-sm">
                        <span className="text-muted-foreground">全部加購方案合計</span>
                        <span className="font-semibold tabular-nums">{NT(plansTotal(planRows, quantities))}</span>
                      </div>
                    </div>
                  )}
                  {planBlocked && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">{PAID_ADDON_PLAN_BLOCKER}</AlertDescription>
                    </Alert>
                  )}
                </div>

                <Separator />

                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="paid-onsite-amount">額外現場加購金額</Label>
                  <Input
                    id="paid-onsite-amount"
                    inputMode="numeric"
                    className="h-11 text-base md:h-9 md:text-sm"
                    value={onsiteAmountStr}
                    onChange={(e) => setOnsiteAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="paid-onsite-note">額外現場加購備註</Label>
                  <Textarea
                    id="paid-onsite-note"
                    className="min-h-[60px] text-base md:text-sm"
                    placeholder="例如：加購早餐2份500元"
                    value={onsiteNote}
                    onChange={(e) => setOnsiteNote(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm" htmlFor="paid-paid-amount">已收金額（留空表示不變更）</Label>
                  <Input
                    id="paid-paid-amount"
                    inputMode="numeric"
                    placeholder={String(oldPaid)}
                    className="h-11 text-base md:h-9 md:text-sm"
                    value={paidAmountStr}
                    onChange={(e) => setPaidAmountStr(e.target.value.replace(/[^\d]/g, ""))}
                  />
                </div>
              </div>
            )}

            <Separator />
            <div className="space-y-1">
              <Label className="text-sm" htmlFor="paid-reason">修改原因（必填）</Label>
              <Textarea
                id="paid-reason"
                className="min-h-[60px] text-base md:text-sm"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">差額處理方式（必選）</Label>
              <RadioGroup
                value={settlement}
                onValueChange={(v) => setSettlement(v as SettlementHandling)}
                className="grid gap-2"
              >
                {SETTLEMENT_OPTIONS.map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <RadioGroupItem value={o.value} id={`settle-${o.value}`} />
                    <Label htmlFor={`settle-${o.value}`} className="text-sm font-normal">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {isNoop && (
              <p className="text-xs text-muted-foreground">目前沒有任何變更，無法送出。</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {riskText && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{riskText}</AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border p-3 space-y-2">
              {mode === "discount" ? (
                <>
                  <Row label="折扣碼" before={oldCode || "—"} after={previewCode || "—"} />
                  {discountMode === "code" && validatedStandard != null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">系統計算標準折扣</span>
                      <span className="tabular-nums">{NT(validatedStandard)}</span>
                    </div>
                  )}
                  <Row label="實際套用折扣" before={NT(oldDiscount)} after={NT(previewDiscount)} />
                  {codeOverridden && (
                    <p className="text-xs text-amber-600">已人工調整折扣金額</p>
                  )}
                </>
              ) : (
                <>
                  {diffs.length > 0 && (
                    <div className="space-y-1">
                      {diffs.map((d) => (
                        <div key={d.key} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground truncate">{d.name}</span>
                            <span className="tabular-nums">
                              {d.beforeQty} → {d.afterQty} {d.unitLabel}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground text-right">
                            {NT(d.pricePerUnit)} / {d.unitLabel}／{d.nights} 晚・小計 {NT(d.beforeSubtotal)} → {NT(d.afterSubtotal)}
                          </p>
                        </div>
                      ))}
                      <Separator />
                    </div>
                  )}
                  <Row label="額外現場加購金額" before={NT(oldOnsite)} after={NT(newOnsite)} />
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-muted-foreground flex-shrink-0">額外現場加購備註</span>
                    <span className="text-right whitespace-pre-wrap break-words">
                      {(oldOnsiteNote || "—")} → {(onsiteNote.trim() || "—")}
                    </span>
                  </div>
                  <Row label="加購合計" before={NT(oldAddonTotal)} after={NT(newAddonTotal)} />
                </>
              )}
              <Separator />
              <Row label="訂單總額" before={NT(oldTotal)} after={NT(afterTotal)} />
              <Row label="應收金額" before={NT(oldFinal)} after={NT(afterFinal)} />
              <Row label="已付金額" before={NT(oldPaid)} after={NT(afterPaid)} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">應收與已付差額</span>
                <span className={`font-semibold tabular-nums ${diff !== 0 ? "text-destructive" : ""}`}>
                  {NT(diff)}
                </span>
              </div>
              {mode === "discount" && discountMode === "code" && (
                <p className="text-xs text-muted-foreground">
                  折扣碼的實際折抵金額由後端重新驗證與計算，以儲存後的結果為準。
                </p>
              )}
            </div>

            <div className="rounded-md border p-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground flex-shrink-0">修改原因</span>
                <span className="text-right whitespace-pre-wrap break-words">{reason.trim()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground flex-shrink-0">差額處理方式</span>
                <span className="text-right">{settlementLabel(settlement)}</span>
              </div>
            </div>

            {showReduceBlock && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>此操作會降低訂單應收金額，屬高風險調整。</p>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={reduceAck} onCheckedChange={(v) => setReduceAck(v === true)} />
                      <span className="text-sm">我確認相關退款、折抵或結算已完成</span>
                    </label>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {showRiskBlock && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p>{riskText}</p>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={riskAck} onCheckedChange={(v) => setRiskAck(v === true)} />
                      <span className="text-sm">我已了解風險，仍要修改</span>
                    </label>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {errorMsg && (
              <Alert variant="destructive">
                <AlertDescription className="whitespace-pre-wrap">{errorMsg}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">本次不會自動收款或退款，付款狀態不會改變。</p>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {step === "form" ? (
            <>
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button className="h-11" disabled={!canProceed} onClick={() => setStep("confirm")}>
                下一步：核對金額
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-11" disabled={saving} onClick={() => setStep("form")}>
                返回檢查
              </Button>
              <Button className="h-11" disabled={!canConfirm} onClick={handleSubmit}>
                {saving ? "儲存中..." : "確認已核對，儲存修改"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaidAmountEditDialog;
