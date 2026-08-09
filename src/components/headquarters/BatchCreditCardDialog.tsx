import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invalidateAccommodationCache } from "@/hooks/use-accommodation-cache";
import { toast } from "sonner";

interface AccommodationLite {
  id: string;
  name: string;
  allow_credit_card_payment?: boolean;
}

interface BatchCreditCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodations: AccommodationLite[];
  onDone: () => void;
}

export function BatchCreditCardDialog({
  open,
  onOpenChange,
  accommodations,
  onDone,
}: BatchCreditCardDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setSaving(false);
    }
  }, [open]);

  const allSelected = useMemo(
    () => accommodations.length > 0 && selected.length === accommodations.length,
    [accommodations.length, selected.length]
  );

  const toggleOne = (id: string, next: boolean) => {
    setSelected((prev) => (next ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const applyBatch = async (next: boolean) => {
    if (selected.length === 0) {
      toast.error("請先勾選要套用的館別");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("accommodation_info")
        .update({ allow_credit_card_payment: next } as any)
        .in("id", selected);
      if (error) throw error;

      selected.forEach((id) => invalidateAccommodationCache(id));
      toast.success(
        next ? `已開啟 ${selected.length} 間館別的信用卡付款` : `已關閉 ${selected.length} 間館別的信用卡付款`
      );
      onDone();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("批次設定失敗", { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            批次設定信用卡付款
          </DialogTitle>
          <DialogDescription>
            勾選館別後，一次開啟或關閉前台結帳頁的信用卡付款選項（關閉後客人只能使用 ATM 虛擬帳號）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between border-b pb-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) =>
                setSelected(v ? accommodations.map((a) => a.id) : [])
              }
            />
            全選
          </label>
          <span className="text-xs text-muted-foreground">
            已選 {selected.length} / {accommodations.length}
          </span>
        </div>

        <div className="max-h-[45vh] overflow-y-auto space-y-1 py-1">
          {accommodations.map((acc) => {
            const on = acc.allow_credit_card_payment !== false;
            return (
              <label
                key={acc.id}
                className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selected.includes(acc.id)}
                  onCheckedChange={(v) => toggleOne(acc.id, !!v)}
                />
                <span className="flex-1 text-sm">{acc.name}</span>
                <Badge variant={on ? "default" : "secondary"}>
                  {on ? "開放" : "關閉"}
                </Badge>
              </label>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => applyBatch(false)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            批次關閉
          </Button>
          <Button onClick={() => applyBatch(true)} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            批次開啟
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
