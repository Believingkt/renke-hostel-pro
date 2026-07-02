import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { useToast } from "@/hooks/use-toast";
import { KolQuotaConfirmDialog } from "./KolQuotaConfirmDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: {
    id: string;
    order_number: string;
    order_source: string;
    payment_status: string;
    check_in_date: string;
    check_out_date: string;
  };
  mode: "kol" | "general";
  onSuccess?: () => void;
}

export function ChangeOrderDatesDialog({ open, onOpenChange, order, mode, onSuccess }: Props) {
  const { toast } = useToast();
  const [newCheckIn, setNewCheckIn] = useState(order.check_in_date);
  const [newCheckOut, setNewCheckOut] = useState(order.check_out_date);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [kolConfirm, setKolConfirm] = useState<{
    open: boolean;
    yearMonth: string;
    used: number;
    quota: number;
  } | null>(null);

  const invoke = async (force: boolean) => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-order-dates", {
        body: {
          orderId: order.id,
          newCheckIn,
          newCheckOut,
          mode,
          reason: reason || undefined,
          forceKolQuotaOverride: force || undefined,
        },
      });

      // supabase.functions.invoke: 非 2xx 會進 error，但 body 也會回傳於 error.context 或 data
      // 為了拿到 409 payload，直接用 fetch 更清楚
      if (error) {
        // 嘗試從 error 內取 body
        let bodyJson: any = null;
        try {
          bodyJson = await (error as any).context?.json?.();
        } catch (_) { /* ignore */ }
        const payload = bodyJson || data;
        if (payload?.code === "KOL_QUOTA_EXCEEDED" && payload.quota_status) {
          setKolConfirm({
            open: true,
            yearMonth: payload.quota_status.year_month,
            used: payload.quota_status.used,
            quota: payload.quota_status.quota,
          });
          return;
        }
        toast({
          title: "改期失敗",
          description: payload?.message || error.message,
          variant: "destructive",
        });
        return;
      }

      if (data?.success === false) {
        if (data.code === "KOL_QUOTA_EXCEEDED" && data.quota_status) {
          setKolConfirm({
            open: true,
            yearMonth: data.quota_status.year_month,
            used: data.quota_status.used,
            quota: data.quota_status.quota,
          });
          return;
        }
        toast({ title: "改期失敗", description: data.message, variant: "destructive" });
        return;
      }

      toast({ title: "改期成功", description: `${newCheckIn} → ${newCheckOut}` });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: any) {
      toast({ title: "改期失敗", description: e?.message ?? "未知錯誤", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!newCheckIn || !newCheckOut) {
      toast({ title: "請輸入日期", variant: "destructive" });
      return;
    }
    if (newCheckOut <= newCheckIn) {
      toast({ title: "退房日必須晚於入住日", variant: "destructive" });
      return;
    }
    if (newCheckIn === order.check_in_date && newCheckOut === order.check_out_date) {
      toast({ title: "新舊日期相同，無需改期", variant: "destructive" });
      return;
    }
    await invoke(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>訂單改期 ({mode === "kol" ? "KOL 互惠單" : "一般單"})</DialogTitle>
            <DialogDescription>
              訂單編號 {order.order_number}｜將重新驗證庫存與包棟互斥。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="text-muted-foreground">原日期</div>
              <div className="font-medium">
                {order.check_in_date} → {order.check_out_date}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">新入住日</Label>
                <Input
                  type="date"
                  value={newCheckIn}
                  onChange={(e) => setNewCheckIn(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">新退房日</Label>
                <Input
                  type="date"
                  value={newCheckOut}
                  onChange={(e) => setNewCheckOut(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">備註 (選填)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="例：客人臨時延期 / KOL 檔期調整"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "處理中…" : "確認改期"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {kolConfirm && (
        <KolQuotaConfirmDialog
          open={kolConfirm.open}
          yearMonth={kolConfirm.yearMonth}
          used={kolConfirm.used}
          quota={kolConfirm.quota}
          onCancel={() => setKolConfirm(null)}
          onConfirm={async () => {
            setKolConfirm(null);
            await invoke(true);
          }}
        />
      )}
    </>
  );
}
