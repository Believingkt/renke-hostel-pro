import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export interface ResolveTarget {
  id: string;
  action: string;
  amount: number;
  rec_trade_id: string | null;
  error_message: string | null;
  orderNumber?: string | null;
  guestName?: string | null;
}

interface Verification {
  queried: boolean;
  found: boolean;
  recordedAmount: number;
  actualAmount: number | null;
  actualRefunded: number | null;
  recordStatus: number | null;
  bankTransactionId: string | null;
  amountMatches: boolean | null;
  suggestion: string;
}

interface Props {
  target: ResolveTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function PaymentAuditResolveDialog({ target, onOpenChange, onDone }: Props) {
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!target) {
      setVerification(null);
      setNote("");
      return;
    }
    setAmount(String(target.amount ?? 0));
    (async () => {
      setVerifying(true);
      const { data, error } = await supabase.functions.invoke("payment-audit-resolve", {
        body: { chargeId: target.id, action: "verify" },
      });
      setVerifying(false);
      if (error) {
        toast.error("向金流查詢失敗，請改以人工核對後結案");
        return;
      }
      const v = (data as { verification: Verification })?.verification;
      if (v) {
        setVerification(v);
        if (v.actualAmount != null) setAmount(String(v.actualAmount));
      }
    })();
  }, [target]);

  const submit = async (action: "resolve" | "dismiss", finalStatus?: "success" | "failed") => {
    if (!target) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("payment-audit-resolve", {
      body: {
        chargeId: target.id,
        action,
        finalStatus,
        verifiedAmount: action === "resolve" ? Number(amount) : undefined,
        note: note || undefined,
      },
    });
    setSubmitting(false);
    if (error || !(data as { success?: boolean })?.success) {
      toast.error("處理失敗，請稍後再試");
      return;
    }
    toast.success(action === "dismiss" ? "已結案（無需處理）" : "已回寫正確狀態並結案");
    onOpenChange(false);
    onDone();
  };

  const mismatch = verification?.amountMatches === false;

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> 人工處理金流事件
          </DialogTitle>
          <DialogDescription>
            訂單 {target?.orderNumber ?? "—"}　交易編號 {target?.rec_trade_id ?? "（無）"}
          </DialogDescription>
        </DialogHeader>

        {verifying ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在向金流查詢實際交易狀態…
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">系統紀錄金額</span>
                <span className="tabular-nums">NT$ {Number(target?.amount || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">金流實際金額</span>
                <span className="tabular-nums">
                  {verification?.actualAmount != null
                    ? `NT$ ${verification.actualAmount.toLocaleString()}`
                    : "查無資料"}
                </span>
              </div>
              {verification?.actualRefunded != null && verification.actualRefunded > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">已退款金額</span>
                  <span className="tabular-nums">NT$ {verification.actualRefunded.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">核對結果</span>
                {verification?.amountMatches == null ? (
                  <Badge variant="outline">未能核對</Badge>
                ) : verification.amountMatches ? (
                  <Badge variant="secondary">金額相符</Badge>
                ) : (
                  <Badge variant="destructive">金額不符</Badge>
                )}
              </div>
            </div>

            {verification?.suggestion && (
              <div className="flex gap-2 rounded-md bg-muted p-3 text-muted-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{verification.suggestion}</span>
              </div>
            )}

            {target?.error_message && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive text-xs">
                {target.error_message}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="verified-amount">確認回寫金額（NT$）</Label>
              <Input
                id="verified-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={mismatch ? "border-destructive" : undefined}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="resolve-note">處理說明（會寫入稽核紀錄與訂單備註）</Label>
              <Textarea
                id="resolve-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例：已於金流後台確認實際請款成功，回寫已付款"
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" disabled={submitting} onClick={() => submit("dismiss")}>
            無需處理，直接結案
          </Button>
          <Button variant="outline" disabled={submitting || verifying} onClick={() => submit("resolve", "failed")}>
            確認為失敗
          </Button>
          <Button disabled={submitting || verifying} onClick={() => submit("resolve", "success")}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            確認為成功並回寫
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
