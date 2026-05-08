import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Building2, Copy, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTapPayConfig } from "@/hooks/use-tappay-config";

const TP = (): any => (typeof window !== "undefined" ? (window as any).TPDirect : undefined);

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
  const [bankValid, setBankValid] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [atmInfo, setAtmInfo] = useState<AtmInfo | null>(initialAtmInfo || null);
  const [error, setError] = useState<string | null>(null);
  const setupDone = useRef(false);

  // 載入 SDK
  useEffect(() => {
    if (!config) return;
    setSdkReady(false);
    setupDone.current = false;
    const ensure = () => {
      if (TP()) {
        try { TP().setupSDK(config.appId, config.appKey, config.env); } catch {}
        setSdkReady(true);
        return;
      }
      const existing = document.querySelector('script[data-tp-sdk]');
      if (existing) { existing.addEventListener('load', ensure as any); return; }
      const s = document.createElement("script");
      s.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0";
      s.async = true;
      s.dataset.tpSdk = "1";
      s.onload = () => {
        try { TP()?.setupSDK(config.appId, config.appKey, config.env); } catch {}
        setSdkReady(true);
      };
      s.onerror = () => setError("無法載入付款模組");
      document.body.appendChild(s);
    };
    ensure();
  }, [config]);

  // 已有虛擬帳號 → 不需設定欄位
  useEffect(() => {
    if (!sdkReady || atmInfo) return;
    if (setupDone.current) return;
    const t = setTimeout(() => {
      if (!TP()?.atm?.setup) {
        setError("此付款方式尚未啟用，請聯繫業者");
        return;
      }
      try {
        TP().atm.setup({ el: `#${FIELD_PREFIX}-form` });
        TP().atm.onUpdate((u: any) => setBankValid(!!u?.canGetPrime));
        setupDone.current = true;
      } catch (e) {
        console.error("[AtmPaymentPanel] setup error", e);
        setError("付款模組初始化失敗");
      }
    }, 200);
    return () => clearTimeout(t);
  }, [sdkReady, atmInfo]);

  const handleCreate = async () => {
    if (!TP()?.atm?.getPrime) return;
    setProcessing(true);
    setError(null);
    try {
      const prime: string = await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("取得 Prime 逾時")), 15000);
        TP().atm.getPrime((r: any) => {
          clearTimeout(to);
          if (!r || r.status !== 0) return reject(new Error(r?.msg || "取得 Prime 失敗"));
          const p = r?.bank?.prime || r?.prime;
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
      onCreated?.(info);
      toast.success("已開立虛擬帳號");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "建立失敗");
      toast.error("建立虛擬帳號失敗", { description: e?.message });
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
          <AlertTitle>{error || configError}</AlertTitle>
          <AlertDescription>請稍後再試或聯繫客服。</AlertDescription>
        </Alert>
      )}
      <Button
        onClick={handleCreate}
        disabled={!sdkReady || !bankValid || processing}
        className="w-full h-12 text-base"
      >
        {processing ? (<><Loader2 className="h-5 w-5 mr-2 animate-spin" />開立中...</>) :
          (<><Building2 className="h-5 w-5 mr-2" />取得虛擬帳號 NT$ {amount.toLocaleString()}</>)}
      </Button>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        <span>使用 TapPay 安全加密傳輸</span>
      </div>
    </div>
  );
}
