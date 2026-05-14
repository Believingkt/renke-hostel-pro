import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Building2, Copy, CheckCircle2, AlertTriangle, ShieldCheck, RotateCcw, RefreshCw, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTapPayConfig } from "@/hooks/use-tappay-config";

const TP = (): any => (typeof window !== "undefined" ? (window as any).TPDirect : undefined);

/** 把 TapPay / Edge Function 錯誤訊息轉成友善文案 + 建議行動 */
function classifyAtmError(raw: string): { title: string; suggestion: string; canRetrySamePrime: boolean } {
  const m = (raw || "").toLowerCase();
  if (/timeout|逾時/.test(m)) {
    return { title: "連線逾時", suggestion: "請檢查網路後重試。", canRetrySamePrime: false };
  }
  if (/prime/.test(m)) {
    return { title: "付款授權失效", suggestion: "請重新選擇銀行後再試。", canRetrySamePrime: false };
  }
  if (/bank|銀行/.test(m)) {
    return { title: "銀行資訊有誤", suggestion: "請重新選擇銀行。", canRetrySamePrime: false };
  }
  if (/network|fetch|failed to fetch/.test(m)) {
    return { title: "網路連線異常", suggestion: "請確認網路後重試。", canRetrySamePrime: true };
  }
  if (/amount|金額/.test(m)) {
    return { title: "金額異常", suggestion: "請聯繫客服協助處理。", canRetrySamePrime: false };
  }
  if (/未啟用|not enabled|disabled/.test(m)) {
    return { title: "付款方式尚未啟用", suggestion: "請聯繫業者開通 ATM 收款。", canRetrySamePrime: false };
  }
  return { title: raw || "建立虛擬帳號失敗", suggestion: "請重新選擇銀行後再試一次，若仍失敗請聯繫客服。", canRetrySamePrime: false };
}

interface AtmInfo {
  vaccNo: string;
  bankCode?: string | null;
  expireAt: string;
  amount: number;
}

interface Props {
  orderId: string;
  orderNumber: string;
  amount: number;
  cardholder: { name: string; email: string; phoneNumber: string };
  /** 已存在的虛擬帳號（避免重複開立） */
  initialAtmInfo?: AtmInfo | null;
  onCreated?: (info: AtmInfo) => void;
}

const FIELD_PREFIX = "atm-pay-panel";

export function AtmPaymentPanel({
  orderId, orderNumber, amount, cardholder, initialAtmInfo, onCreated,
}: Props) {
  const { config, loading: configLoading, error: configError } = useTapPayConfig(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [atmInfo, setAtmInfo] = useState<AtmInfo | null>(initialAtmInfo || null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<{ title: string; suggestion: string; canRetrySamePrime: boolean } | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  // 載入 SDK
  useEffect(() => {
    if (!config) return;
    setSdkReady(false);
    const ensure = () => {
      if (TP()) {
        try { TP().setupSDK(config.appId, config.appKey, config.env); } catch {}
        setSdkReady(!!TP()?.virtualAccount?.getPrime);
        return;
      }
      const existing = document.querySelector('script[data-tp-sdk]');
      if (existing) { existing.addEventListener('load', ensure as any); return; }
      const s = document.createElement("script");
      s.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.19.2";
      s.async = true;
      s.dataset.tpSdk = "1";
      s.onload = () => {
        try { TP()?.setupSDK(config.appId, config.appKey, config.env); } catch {}
        setSdkReady(!!TP()?.virtualAccount?.getPrime);
      };
      s.onerror = () => setError("無法載入付款模組");
      document.body.appendChild(s);
    };
    ensure();
  }, [config]);

  // 已有虛擬帳號 → 不需檢查 ATM getPrime
  useEffect(() => {
    if (!sdkReady || atmInfo) return;
    const t = setTimeout(() => {
      if (!TP()?.virtualAccount?.getPrime) {
        setError("此付款方式尚未啟用，請聯繫業者");
        setErrorDetail(classifyAtmError("付款方式未啟用"));
      }
    }, 200);
    return () => clearTimeout(t);
  }, [sdkReady, atmInfo]);

  /** 重置銀行選單：重新 mount TPDirect ATM iframe */
  const resetBankPicker = useCallback(() => {
    setError(null);
    setErrorDetail(null);
    toast.info("已重置付款模組，請重新取得虛擬帳號");
  }, []);

  const handleCreate = async () => {
    if (!TP()?.virtualAccount?.getPrime) return;
    setProcessing(true);
    setError(null);
    setErrorDetail(null);
    try {
      const prime: string = await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("取得 Prime 逾時")), 15000);
        TP().virtualAccount.getPrime((err: any, result?: any) => {
          clearTimeout(to);
          const r = result ?? err;
          if (err && result) return reject(new Error(err?.msg || err?.message || "取得 Prime 失敗"));
          if (!r || r.status !== 0) return reject(new Error(r?.msg || "取得 Prime 失敗"));
          const p = r?.prime;
          if (!p) return reject(new Error("Prime 格式錯誤"));
          resolve(p);
        });
      });

      const { data, error: invErr } = await supabase.functions.invoke("tappay-atm-create", {
        body: { prime, orderId, orderNumber, amount, cardholder, expireInDays: 3 },
      });
      if (invErr) throw invErr;
      if (!data?.success) throw new Error(data?.message || "建立虛擬帳號失敗");
      const info: AtmInfo = {
        vaccNo: data.vaccNo,
        bankCode: data.bankCode,
        expireAt: data.expireAt,
        amount: data.amount ?? amount,
      };
      setAtmInfo(info);
      setAttemptCount(0);
      onCreated?.(info);
      toast.success("已開立虛擬帳號");
    } catch (e: any) {
      console.error(e);
      const msg = e?.message || "建立失敗";
      const detail = classifyAtmError(msg);
      setError(msg);
      setErrorDetail(detail);
      setAttemptCount((c) => c + 1);
      toast.error(detail.title, { description: detail.suggestion });
    } finally {
      setProcessing(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("已複製"));
  };

  if (atmInfo) {
    const exp = new Date(atmInfo.expireAt);
    const expStr = exp.toLocaleString("zh-TW", { dateStyle: "long", timeStyle: "short" });
    return (
      <Card className="border-primary/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-base">虛擬帳號已開立</div>
              <p className="text-sm text-muted-foreground mt-1">請於繳費期限前以 ATM、網路銀行或臨櫃匯款。</p>
            </div>
          </div>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <div className="text-xs text-muted-foreground">銀行代碼</div>
                <div className="font-mono text-base font-semibold">{atmInfo.bankCode || "—"}</div>
              </div>
              {atmInfo.bankCode && (
                <Button size="sm" variant="ghost" onClick={() => copy(atmInfo.bankCode!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <div className="text-xs text-muted-foreground">虛擬帳號</div>
                <div className="font-mono text-base font-semibold tracking-wider">{atmInfo.vaccNo}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copy(atmInfo.vaccNo)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <div>
                <div className="text-xs text-muted-foreground">轉帳金額</div>
                <div className="font-bold text-base text-primary">NT$ {atmInfo.amount.toLocaleString()}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => copy(String(atmInfo.amount))}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="text-xs text-amber-800">繳費期限</div>
              <div className="font-semibold text-amber-900">{expStr}</div>
              <div className="text-xs text-amber-700 mt-1">逾期未繳款訂單將自動取消。</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">系統收到入帳通知後將自動更新訂單狀態，無需另行通知。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Building2 className="h-4 w-4 text-primary" />
          ATM 虛擬帳號轉帳
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          請選擇您要使用的轉帳銀行，系統將為此筆訂單開立專屬虛擬帳號（繳費期限 3 天）。
        </p>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">轉帳銀行</Label>
        <div id={`${FIELD_PREFIX}-form`} className="min-h-[3rem] px-4 py-3 border rounded-lg bg-background" />
      </div>
      {(configLoading || !sdkReady) && !configError && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在載入付款模組...
        </div>
      )}
      {(configError || error) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{errorDetail?.title || error || configError}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="text-sm">{errorDetail?.suggestion || "請稍後再試或聯繫客服。"}</p>
            {attemptCount > 0 && (
              <p className="text-xs opacity-80">已嘗試 {attemptCount} 次{attemptCount >= 2 ? "，建議聯繫客服協助處理" : ""}</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {errorDetail?.canRetrySamePrime && (
                <Button type="button" size="sm" variant="outline" onClick={handleCreate} disabled={processing}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  重試
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={resetBankPicker} disabled={processing}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                重新選銀行
              </Button>
              {attemptCount >= 2 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => window.open("tel:0987654321", "_self")}
                >
                  <LifeBuoy className="h-3.5 w-3.5 mr-1.5" />
                  聯繫客服
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
      <Button
        onClick={handleCreate}
        disabled={!sdkReady || !bankValid || processing}
        className="w-full h-12 text-base"
      >
        {processing ? (<><Loader2 className="h-5 w-5 mr-2 animate-spin" />開立中...</>) :
          error ? (<><RefreshCw className="h-5 w-5 mr-2" />重新取得虛擬帳號 NT$ {amount.toLocaleString()}</>) :
          (<><Building2 className="h-5 w-5 mr-2" />取得虛擬帳號 NT$ {amount.toLocaleString()}</>)}
      </Button>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>使用 TapPay 安全加密傳輸</span>
      </div>
    </div>
  );
}
