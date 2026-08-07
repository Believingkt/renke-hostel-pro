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

  useEffect(() => {
    if (!open) return;
    setAmount(String(requiredAmount ?? 0));
    setNextStatus(normalizeDepositStatus(status));
    setRetained(String(Math.max(0, chargedAmount - refundedAmount)));
  }, [open, requiredAmount, status, chargedAmount, refundedAmount]);

  const save = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast({ variant: "destructive", title: "請輸入有效的押金金額" });
      return;
    }
    const ret = Number(retained);
    if (nextStatus === "partially_refunded" && (!Number.isFinite(ret) || ret <= 0 || ret > amt)) {
      toast({ variant: "destructive", title: `扣押金額需介於 1 ~ ${amt}` });
      return;
    }
    setSaving(true);
    try {
      const patch = buildDepositPatch({ amount: amt, status: nextStatus, retainedAmount: ret });
      const { error } = await supabase.from("orders").update(patch as any).eq("id", orderId);
      if (error) throw error;
      toast({ title: "押金已更新", description: `${depositStatusLabel(nextStatus)}．NT$${amt.toLocaleString()}` });
      setOpen(false);
      onSaved?.(patch);
    } catch (e: any) {
      toast({ variant: "destructive", title: "更新失敗", description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          <span className="tabular-nums">NT${(requiredAmount ?? 0).toLocaleString()}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="start">
        <div className="text-sm font-medium">押金管理</div>
        <div className="space-y-1.5">
          <Label className="text-xs">押金金額 (NT$)</Label>
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">押金狀態</Label>
          <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as DepositStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
            <Input type="number" min={1} value={retained} onChange={(e) => setRetained(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">其餘金額視為已退還給客人。</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
