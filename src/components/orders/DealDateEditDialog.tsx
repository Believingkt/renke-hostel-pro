import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  composeDealDate,
  isCommissionPeriodSettled,
  isFutureTaipeiDate,
  taipeiDateStr,
  taipeiMonthOf,
  taipeiTimeStr,
} from "@/lib/dealDate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  accommodationId?: string | null;
  currentOrderDate: string;
  onSaved?: () => void;
}

export function DealDateEditDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  accommodationId,
  currentOrderDate,
  onSaved,
}: Props) {
  const [dateValue, setDateValue] = useState(() => taipeiDateStr(currentOrderDate));
  const [saving, setSaving] = useState(false);
  const [crossPeriodAck, setCrossPeriodAck] = useState(false);

  useEffect(() => {
    if (open) {
      setDateValue(taipeiDateStr(currentOrderDate));
      setCrossPeriodAck(false);
    }
  }, [open, currentOrderDate]);

  const oldMonth = taipeiMonthOf(currentOrderDate);
  const newMonth = dateValue.slice(0, 7);
  const isCrossPeriod = !!dateValue && newMonth !== oldMonth;
  const changed = !!dateValue && dateValue !== taipeiDateStr(currentOrderDate);

  const handleSave = async () => {
    if (!changed) {
      onOpenChange(false);
      return;
    }
    if (isFutureTaipeiDate(dateValue)) {
      toast.error("成交日不得填未來日期");
      return;
    }
    if (isCrossPeriod && !crossPeriodAck) {
      setCrossPeriodAck(true);
      return;
    }

    setSaving(true);
    try {
      // 已結算期閘門：原期別或新期別任一已發放即擋下
      for (const m of new Set([oldMonth, newMonth])) {
        const settled = await isCommissionPeriodSettled(m);
        if (settled) {
          toast.error(`${m} 期別獎金已結算／已發放，無法變更成交日`, {
            description: "請聯繫財務走人工調整流程。",
          });
          setSaving(false);
          return;
        }
      }

      const newIso = composeDealDate(currentOrderDate, dateValue);
      const { error } = await supabase
        .from("orders")
        .update({ order_date: newIso })
        .eq("id", orderId);
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
            entity_id: orderId,
            entity_name: orderNumber,
            accommodation_id: accommodationId ?? null,
            details: {
              type: "order_deal_date_change",
              field: "order_date",
              before: currentOrderDate,
              after: newIso,
              before_month: oldMonth,
              after_month: newMonth,
              cross_period: isCrossPeriod,
            },
          }]);
        }
      } catch (e) {
        console.error("audit log failed", e);
      }

      toast.success("成交日已更新", {
        description: isCrossPeriod
          ? `期別由 ${oldMonth} 改為 ${newMonth}，請至「行銷／獎金」重算該期快照。`
          : `${dateValue}（時分秒保留 ${taipeiTimeStr(currentOrderDate)}）`,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知錯誤";
      toast.error(`更新失敗：${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改成交日（訂購日期）</DialogTitle>
          <DialogDescription>
            只調整日期，時分秒沿用原本的 {taipeiTimeStr(currentOrderDate)}。此欄位是全站業績與獎金的採計基準。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="deal-date">成交日</Label>
            <Input
              id="deal-date"
              type="date"
              value={dateValue}
              max={taipeiDateStr()}
              onChange={(e) => { setDateValue(e.target.value); setCrossPeriodAck(false); }}
            />
            <p className="text-xs text-muted-foreground">
              目前期別 {oldMonth}
              {isCrossPeriod && ` → 變更後 ${newMonth}`}
            </p>
          </div>

          {isCrossPeriod && (
            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium">跨期別變更</p>
                <p className="text-muted-foreground">
                  這筆訂單的業績會從 {oldMonth} 移到 {newMonth}，兩個月份的成交統計與獎金都需重算。
                  {crossPeriodAck ? "再按一次「確認變更」即會寫入。" : "按「確認變更」後會再次要求確認。"}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || !changed}>
            {saving ? "處理中..." : crossPeriodAck ? "我確定，寫入變更" : "確認變更"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DealDateEditDialog;
