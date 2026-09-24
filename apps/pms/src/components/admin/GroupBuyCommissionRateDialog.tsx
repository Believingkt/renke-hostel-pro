import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@lakeze/shared/components/ui/dialog";
import { Button } from "@lakeze/shared/components/ui/button";
import { Label } from "@lakeze/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@lakeze/shared/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import type { GroupBuyAnalyticsRow } from "@/lib/groupBuyAnalytics";
import { commissionsAdjustable, twdPlain } from "@/lib/groupBuyAnalytics";

export type CommissionRateApplyMode = "future_only" | "sync_pending";

interface Props {
  open: boolean;
  oldRate: number;
  newRate: number;
  rows: GroupBuyAnalyticsRow[];
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (mode: CommissionRateApplyMode) => void;
}

/** 修改活動分潤比例前的確認：預設僅套用新訂單，歷史訂單比例鎖定 */
export function GroupBuyCommissionRateDialog({
  open,
  oldRate,
  newRate,
  rows,
  saving,
  onCancel,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<CommissionRateApplyMode>("future_only");

  const impact = useMemo(() => {
    const targets = commissionsAdjustable(rows);
    const before = targets.reduce((s, r) => s + Math.round(Number(r.commission?.commission_amount) || 0), 0);
    const after = targets.reduce((s, r) => s + Math.round((r.revenueBase * newRate) / 100), 0);
    return { count: targets.length, before, after, diff: after - before };
  }, [rows, newRate]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>調整網紅分潤比例</DialogTitle>
          <DialogDescription>
            網紅分潤比例將由 {oldRate}% 調整為 {newRate}%。
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as CommissionRateApplyMode)} className="space-y-3">
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3">
            <RadioGroupItem value="future_only" className="mt-1" />
            <span className="text-sm">
              <span className="font-medium">僅套用之後的新訂單</span>
              <span className="mt-1 block text-muted-foreground">已建立訂單維持原本分潤比例。</span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3">
            <RadioGroupItem value="sync_pending" className="mt-1" />
            <span className="text-sm">
              <span className="font-medium">同步調整尚未結算的歷史訂單</span>
              <span className="mt-1 block text-muted-foreground">
                符合條件的歷史訂單重新套用 {newRate}%（不含已取消、已結算、人工排除分潤的訂單）。
              </span>
            </span>
          </label>
        </RadioGroup>

        {mode === "sync_pending" && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">受影響訂單</span>
              <span className="font-medium tabular-nums">{impact.count} 筆</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">原分潤總額</span>
              <span className="tabular-nums">{twdPlain(impact.before)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">調整後分潤總額</span>
              <span className="tabular-nums">{twdPlain(impact.after)}</span>
            </div>
            <div className="flex justify-between border-t pt-1.5">
              <span className="text-muted-foreground">差額</span>
              <Label className="tabular-nums font-semibold">
                {impact.diff >= 0 ? "+ " : "- "}
                {twdPlain(Math.abs(impact.diff))}
              </Label>
            </div>
            {impact.count === 0 && (
              <p className="pt-1 text-xs text-muted-foreground">目前沒有可同步調整的歷史訂單。</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            返回
          </Button>
          <Button onClick={() => onConfirm(mode)} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}確認調整
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GroupBuyCommissionRateDialog;
