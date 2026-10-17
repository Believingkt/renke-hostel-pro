import { useEffect, useRef, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Card, CardContent } from "@lakeze/shared/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@lakeze/shared/components/ui/alert";
import { AlertTriangle, Building2, CheckCircle2, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export interface PayuniAtmInfo {
  bank_code: string;
  bank_name: string | null;
  pay_no: string;
  amount: number;
  expire_at: string;
  balance_on_site: number;
}

interface Props {
  orderNumber: string;
  purpose: "deposit" | "supplement" | "final";
  amountLabel?: string;
  paid?: boolean;
  onCreated?: (info: PayuniAtmInfo) => void;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });

/** PAYUNi ATM：後端取號（payuni-atm-create），版型同 AtmPaymentPanel */
export function PayuniAtmPanel({ orderNumber, purpose, amountLabel = "轉帳金額", paid = false, onCreated }: Props) {
  const [info, setInfo] = useState<PayuniAtmInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  const create = async () => {
    setLoading(true);
    setError(null);
    const { data, error: invErr } = await supabase.functions.invoke("payuni-atm-create", { body: { order_number: orderNumber, purpose } });
    let body: any = data;
    if (invErr) { try { body = await (invErr as any)?.context?.json?.(); } catch { body = null; } }
    setLoading(false);
    if (!body?.ok) { setError(body?.message || body?.error || "取得虛擬帳號失敗"); return; }
    setInfo(body);
    onCreated?.(body);
  };
  useEffect(() => {
    if (started.current || paid) return;
    started.current = true;
    create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success("已複製"));

  if (!info && paid) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-4 py-4 text-emerald-800 font-semibold" data-testid="payuni-atm-paid">
        <CheckCircle2 className="inline h-5 w-5 mr-2" />款項已入帳，無需再匯款
      </div>
    );
  }
  if (!info) {
    return (
      <div className="space-y-3" data-testid="payuni-atm-panel">
        {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在開立虛擬帳號...</div>}
        {error && (
          <Alert variant="destructive" data-testid="payuni-atm-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{error}</AlertTitle>
            <AlertDescription className="pt-2">
              <Button size="sm" variant="outline" onClick={create} disabled={loading} data-testid="payuni-atm-retry">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />重新取得虛擬帳號
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  const field = (label: string, value: string, testid: string, copyable = true) => (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-mono text-base font-semibold tracking-wider" data-testid={testid}>{value}</div>
      </div>
      {copyable && <Button size="sm" variant="ghost" onClick={() => copy(value.replace(/^NT\$ /, "").replace(/,/g, ""))} data-testid={`${testid}-copy`}><Copy className="h-4 w-4" /></Button>}
    </div>
  );
  return (
    <Card className={paid ? "border-emerald-500/50" : "border-primary/30"} data-testid="payuni-atm-panel">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-base">{paid ? "款項已入帳，無需再匯款" : "虛擬帳號已開立"}</div>
            {!paid && <p className="text-sm text-muted-foreground mt-1">請以 ATM、網路銀行或臨櫃匯款。</p>}
          </div>
        </div>
        <div className={`grid gap-3 text-sm ${paid ? "opacity-70" : ""}`}>
          {field(`銀行代碼${info.bank_name ? `（${info.bank_name}）` : ""}`, info.bank_code, "payuni-atm-bank")}
          {field("虛擬帳號", info.pay_no, "payuni-atm-payno")}
          {field(amountLabel, `NT$ ${info.amount.toLocaleString()}`, "payuni-atm-amount")}
          {!paid && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" data-testid="payuni-atm-deadline">
              <div className="text-xs text-amber-800">繳費期限</div>
              <div className="font-semibold text-amber-900">請於 {hhmm(info.expire_at)} 前完成轉帳，逾時訂單自動取消</div>
              <div className="text-xs text-amber-700 mt-1">{new Date(info.expire_at).toLocaleString("zh-TW", { dateStyle: "long", timeStyle: "short" })}</div>
            </div>
          )}
          {info.balance_on_site > 0 && (
            <div className="rounded-lg border px-4 py-3 text-sm" data-testid="payuni-atm-balance">
              <Building2 className="inline h-4 w-4 mr-1 text-primary" />尾款 NT$ {info.balance_on_site.toLocaleString()} 入住時付給民宿
            </div>
          )}
        </div>
        {!paid && <p className="text-xs text-muted-foreground">系統收到入帳通知後將自動更新訂單狀態，無需另行通知。</p>}
      </CardContent>
    </Card>
  );
}
