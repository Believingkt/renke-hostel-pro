import { useState } from "react";
import { Badge } from "@lakeze/shared/components/ui/badge";
import { Button } from "@lakeze/shared/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@lakeze/shared/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import {
  COMMISSION_STATE_VARIANT,
  twdPlain,
  type GroupBuyAnalyticsRow,
} from "@/lib/groupBuyAnalytics";

interface Props {
  row: GroupBuyAnalyticsRow | null;
  onSetManual?: (value: "include" | "exclude") => Promise<void> | void;
}

/** 訂單稽核彈窗中的「網紅分潤」區塊：狀態、比例、基準、金額、特例退款人工判定 */
export function GroupBuyCommissionStatusPanel({ row, onSetManual }: Props) {
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<"include" | "exclude" | null>(null);

  if (!row) return null;
  const showManual = row.isSpecialRefund || row.manual !== null;
  const current = choice ?? row.manual ?? (row.eligible ? "include" : "exclude");

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">網紅分潤</p>
        <Badge variant={COMMISSION_STATE_VARIANT[row.state]}>{row.stateLabel}</Badge>
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {row.stateReason && <div>原因：{row.stateReason}</div>}
        <div>分潤比例：{row.commissionRate != null ? `${row.commissionRate}%` : "—"}</div>
        <div>分潤基準：{twdPlain(row.revenueBase)}</div>
        <div>分潤金額：{row.state === "pending" ? "—" : twdPlain(row.commissionAmount)}</div>
      </div>

      {showManual && onSetManual && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-xs font-medium">此訂單是否列入網紅分潤</p>
          <RadioGroup
            value={current}
            onValueChange={(v) => setChoice(v as "include" | "exclude")}
            className="flex gap-4"
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="include" /> 列入分潤
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="exclude" /> 不列入分潤
            </label>
          </RadioGroup>
          <Button
            size="sm"
            className="mt-2"
            disabled={saving || current === row.manual}
            onClick={async () => {
              setSaving(true);
              try {
                await onSetManual(current);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}儲存分潤判定
          </Button>
        </div>
      )}
    </div>
  );
}

export default GroupBuyCommissionStatusPanel;
