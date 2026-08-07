import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  DEPOSIT_STATUS_OPTIONS,
  buildDepositPatch,
  depositStatusCls,
  depositStatusLabel,
  normalizeDepositStatus,
  type DepositStatus,
} from "@/lib/deposit";

interface Props {
  orderId: string;
  requiredAmount: number;
  status: string | null | undefined;
  chargedAmount?: number;
  refundedAmount?: number;
  disabled?: boolean;
  /** 儲存成功後回傳寫入 DB 的欄位，供呼叫端就地更新 */
  onSaved?: (patch: Record<string, unknown>) => void;
  triggerClassName?: string;
}

export function DepositQuickEdit({
  orderId,
  requiredAmount,
  status,
  chargedAmount = 0,
  refundedAmount = 0,
  disabled,
  onSaved,
  triggerClassName,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(String(requiredAmount ?? 0));
  const [nextStatus, setNextStatus] = useState<DepositStatus>(normalizeDepositStatus(status));
  const [retained, setRetained] = useState(String(Math.max(0, chargedAmount - refundedAmount)));

  // 只在「打開」的當下重設一次，避免輸入中因父層重新渲染而清掉游標選取
  useEffect(() => {
    if (!open) return;
    setAmount(String(requiredAmount ?? 0));
    setNextStatus(normalizeDepositStatus(status));
    setRetained(String(Math.max(0, chargedAmount - refundedAmount)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const digitsOnly = (v: string) => v.replace(/[^\d]/g, "");
  const selectOnFocus = (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select();

  const parsed = Number(amount);
  const parsedRetained = Number(retained);
  const MAX_DEPOSIT = 1000000;

  const amountError = (() => {
    if (amount.trim() === "") return "請輸入押金金額";
    if (!Number.isFinite(parsed)) return "押金金額必須是數字";
    if (parsed < 0) return "押金金額不可為負數";
    if (!Number.isInteger(parsed)) return "押金金額必須為整數（不可有小數）";
    if (parsed > MAX_DEPOSIT) return `押金金額不可超過 NT$${MAX_DEPOSIT.toLocaleString()}`;
    return null;
  })();

  const retainedError = (() => {
    if (nextStatus !== "partially_refunded") return null;
    if (retained.trim() === "") return "請輸入扣押金額";
    if (!Number.isFinite(parsedRetained)) return "扣押金額必須是數字";
    if (!Number.isInteger(parsedRetained)) return "扣押金額必須為整數（不可有小數）";
    if (parsedRetained <= 0) return "扣押金額必須大於 0";
    if (amountError) return null;
    if (parsedRetained >= parsed)
      return `扣押金額必須小於已收押金 NT$${parsed.toLocaleString()}（全額扣押請改選「已收押金」）`;
    return null;
  })();

  const hasError = Boolean(amountError || retainedError);

  const save = async () => {
    if (hasError) {
      toast({ variant: "destructive", title: "資料有誤", description: amountError ?? retainedError ?? "" });
      return;
    }
    setSaving(true);
    try {
      const patch = buildDepositPatch({ amount: parsed, status: nextStatus, retainedAmount: parsedRetained });
      const { error } = await supabase.from("orders").update(patch as any).eq("id", orderId);
      if (error) throw error;
      toast({ title: "押金已更新", description: `${depositStatusLabel(nextStatus)}．NT$${parsed.toLocaleString()}` });
      setOpen(false);
      onSaved?.(patch);
    } catch (e: any) {
      toast({ variant: "destructive", title: "更新失敗", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const isPartial = normalizeDepositStatus(status) === "partially_refunded";
  const retainedAmount = Math.max(0, (chargedAmount ?? 0) - (refundedAmount ?? 0));
  const displayAmount = isPartial ? retainedAmount : requiredAmount ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="inline-flex flex-col items-start gap-0.5">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={`h-8 gap-1.5 text-xs font-medium ${depositStatusCls(status)} ${triggerClassName ?? ""}`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            {depositStatusLabel(status)}
            <span className="tabular-nums">NT${displayAmount.toLocaleString()}</span>
          </Button>
        </PopoverTrigger>
        {isPartial && (
          <span className="text-xs text-muted-foreground tabular-nums">
            ${retainedAmount.toLocaleString()} / ${(requiredAmount ?? 0).toLocaleString()}
          </span>
        )}
      </div>
      <PopoverContent className="w-64 space-y-3 z-50" align="start" collisionPadding={12}>
        <div className="text-sm font-medium">押金管理</div>
        <div className="space-y-1.5">
          <Label className="text-xs">押金金額 (NT$)</Label>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onFocus={selectOnFocus}
            onChange={(e) => setAmount(digitsOnly(e.target.value))}
            aria-invalid={Boolean(amountError)}
            className={amountError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {amountError && <p className="text-[11px] text-destructive">{amountError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">押金狀態</Label>
          <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as DepositStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[60]">
              {DEPOSIT_STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {nextStatus === "partially_refunded" && (
          <div className="space-y-1.5">
            <Label className="text-xs">扣押金額 (NT$)</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={retained}
              onFocus={selectOnFocus}
              onChange={(e) => setRetained(digitsOnly(e.target.value))}
              aria-invalid={Boolean(retainedError)}
              className={retainedError ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {retainedError ? (
              <p className="text-[11px] text-destructive">{retainedError}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">其餘金額視為已退還給客人。</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving || hasError}>
            {saving ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
