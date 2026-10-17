import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@lakeze/shared/components/ui/button";
import { Alert, AlertDescription } from "@lakeze/shared/components/ui/alert";
import { Loader2, Lock } from "lucide-react";
import {
  chargeCard, classifySdkError, getEmbedToken, loadPayuniSdk, PAYUNI_LOAD_FAIL_MESSAGE, PAYUNI_TOKEN_REFRESH_MS,
  type PayuniSession,
} from "@/lib/payuniCard";

interface Props {
  orderNumber: string;
  purpose: "booking" | "supplement";
  onPaid: (merTradeNo: string) => void;
  onPending: (merTradeNo: string) => void;
}

/** PAYUNi 信用卡欄位：進入付款步驟才取 Token；9 分鐘或過期時自動重取並重建 session */
export function PayuniCardFields({ orderNumber, purpose, onPaid, onPending }: Props) {
  const session = useRef<PayuniSession | null>(null);
  const tradeNo = useRef<string>("");
  const [amount, setAmount] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState(0);
  const refresh = useCallback(() => { setReady(false); setValid(false); setGen((g) => g + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        await loadPayuniSdk();
        const t = await getEmbedToken(orderNumber, purpose);
        if (cancelled) return;
        tradeNo.current = t.mer_trade_no;
        setAmount(t.amount);
        const s = window.UniPayment!.createSession(t.sdk_token, {
          env: t.env, useInst: false, elements: { CardNo: "payuni-card-no", CardExp: "payuni-card-exp", CardCvc: "payuni-card-cvc" },
        });
        s.onUpdate((u) => { if (u.status) setValid(Object.values(u.status).every((v) => v === true)); });
        await s.start();
        if (cancelled) return;
        session.current = s;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(classifySdkError(e) === "other" && e instanceof Error && !/SDK/.test(e.message) ? e.message : PAYUNI_LOAD_FAIL_MESSAGE);
      }
    })();
    const timer = window.setTimeout(refresh, PAYUNI_TOKEN_REFRESH_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [orderNumber, purpose, gen, refresh]);

  const pay = async () => {
    if (!session.current || !valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await session.current.getTradeResult({});
      const r = await chargeCard(tradeNo.current);
      if (r.ok && r.redirect_url) { window.location.href = r.redirect_url; return; }
      if (r.ok && r.paid) { onPaid(tradeNo.current); return; }
      if (r.ok && r.pending) { onPending(tradeNo.current); return; }
      if (!r.ok && "code" in r && r.code === "TOKEN_EXPIRED") { refresh(); setError("付款逾時，已重新載入付款元件，請再輸入一次卡片資料"); }
      else { setError(("message" in r && r.message) || "付款失敗，請確認卡片資料後重試"); refresh(); }
    } catch (e) {
      const kind = classifySdkError(e);
      if (kind === "token_expired") { refresh(); setError("付款逾時，已重新載入付款元件，請再輸入一次卡片資料"); }
      else setError(kind === "load_failed" ? PAYUNI_LOAD_FAIL_MESSAGE : (e instanceof Error ? e.message : "付款失敗，請重試"));
    }
    setSubmitting(false);
  };

  const field = "h-12 px-3 py-2 border rounded-lg bg-white";
  return (
    <div className="space-y-3" data-testid="payuni-card-fields">
      <p className="text-sm font-medium" data-testid="payuni-amount">全額付款 {amount != null ? `NT$ ${amount.toLocaleString()}` : "…"}</p>
      <div><p className="text-xs text-muted-foreground mb-1">卡號</p><div id="payuni-card-no" className={field} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-muted-foreground mb-1">有效期限</p><div id="payuni-card-exp" className={field} /></div>
        <div><p className="text-xs text-muted-foreground mb-1">安全碼</p><div id="payuni-card-cvc" className={field} /></div>
      </div>
      {error && <Alert variant="destructive" data-testid="payuni-error"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="button" className="w-full" disabled={!ready || !valid || submitting} onClick={pay} data-testid="payuni-pay-button">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
        {submitting ? "付款處理中…" : "確認付款"}
      </Button>
      <p className="text-xs text-muted-foreground">卡片資料由 PAYUNi 統一金流加密處理，本站不會保存卡號。</p>
    </div>
  );
}
