import { useEffect, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export const PAYUNI_POLL_INTERVAL_MS = 2000;
export const PAYUNI_POLL_MAX_MS = 60000;
type View = "checking" | "paid" | "pending" | "failed" | "error";

/** 由 tx／payment_status 判斷畫面；逾時視為確認中 */
export function resolvePayuniView(s: { tx_status?: string; payment_status?: string } | null, timedOut: boolean): View {
  if (s?.tx_status === "paid" || s?.payment_status === "paid" || s?.payment_status === "deposit_paid") return "paid";
  if (s?.tx_status === "failed" || s?.tx_status === "cancelled" || s?.tx_status === "expired") return "failed";
  if (s?.tx_status === "unknown" || timedOut) return "pending";
  return "checking";
}

export function PayuniPaymentResult({ orderNumber, tx, error }: { orderNumber: string | null; tx: string | null; error: boolean }) {
  const [view, setView] = useState<View>(error || !orderNumber || !tx ? "error" : "checking");
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  useEffect(() => {
    if (error || !orderNumber || !tx) return;
    const started = Date.now();
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.functions.invoke("payuni-trade-query", { body: { action: "status", mer_trade_no: tx, order_number: orderNumber } });
      const timedOut = Date.now() - started >= PAYUNI_POLL_MAX_MS;
      const v = resolvePayuniView(data ?? null, timedOut);
      if (stop) return;
      setView(v);
      if (data?.accommodation_id && Number(data?.amount_due) > 0) {
        setRetryUrl(`/pay/order?order_number=${encodeURIComponent(orderNumber)}&acc=${encodeURIComponent(data.accommodation_id)}&amount=${Number(data.amount_due)}`);
      }
      if (v === "checking") window.setTimeout(tick, PAYUNI_POLL_INTERVAL_MS);
    };
    tick();
    return () => { stop = true; };
  }, [orderNumber, tx, error]);

  const box = "flex flex-col items-center text-center gap-3 py-16 px-6";
  if (view === "checking") return <div className={box} data-testid="payuni-result-checking"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p>正在確認付款結果…</p></div>;
  if (view === "paid") return <div className={box} data-testid="payuni-result-paid"><CheckCircle2 className="h-12 w-12 text-green-600" /><h1 className="text-xl font-semibold">付款成功</h1><p className="text-sm text-muted-foreground">訂單 {orderNumber} 已完成付款，確認信將寄到您的 Email。</p></div>;
  if (view === "pending") return <div className={box} data-testid="payuni-result-pending"><Clock className="h-12 w-12 text-amber-500" /><h1 className="text-xl font-semibold">付款確認中</h1><p className="text-sm text-muted-foreground">結果會以 Email 通知，請勿重複付款。</p></div>;
  return (
    <div className={box} data-testid="payuni-result-failed">
      <XCircle className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-semibold">付款未完成</h1>
      <p className="text-sm text-muted-foreground">{orderNumber ? `訂單 ${orderNumber} 尚未付款成功，訂單會保留 30 分鐘。` : "無法確認付款結果，請聯繫民宿或客服。"}</p>
      {retryUrl && <Button data-testid="payuni-result-retry" onClick={() => window.location.assign(retryUrl)}>重新付款</Button>}
    </div>
  );
}
