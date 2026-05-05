import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface BindError {
  message: string;
  suggestion?: string;
}

export default function DepositCardBind() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order_number") || "";
  const accommodationId = searchParams.get("acc") || "";

  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bindSuccess, setBindSuccess] = useState(false);
  const [cardLastFour, setCardLastFour] = useState<string | null>(null);
  const [bindError, setBindError] = useState<BindError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [cardFormKey, setCardFormKey] = useState(0);
  const [orderInfo, setOrderInfo] = useState<{
    orderId: string;
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    depositAmount: number;
  } | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [accName, setAccName] = useState("");

  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
  } = useTapPayConfig(!loadingOrder && !orderError);

  // Fetch order info
  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber || !accommodationId) {
        setOrderError("綁卡連結無效，缺少必要參數");
        setLoadingOrder(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, guest_name, guest_phone, guest_email, order_status, deposit_required_amount, deposit_status, deposit_method")
          .eq("order_number", orderNumber)
          .eq("accommodation_id", accommodationId)
          .maybeSingle();

        if (error) throw error;
        if (!data) { setOrderError("找不到此訂單"); setLoadingOrder(false); return; }
        if (data.order_status === "cancelled") { setOrderError("此訂單已取消"); setLoadingOrder(false); return; }
        if (data.deposit_status === "card_bound" || data.deposit_status === "charged") {
          setOrderError("此訂單已完成綁卡");
          setLoadingOrder(false);
          return;
        }

        setOrderInfo({
          orderId: data.id,
          guestName: data.guest_name,
          guestPhone: data.guest_phone,
          guestEmail: data.guest_email || "",
          depositAmount: data.deposit_required_amount || 0,
        });

        const { data: accData } = await supabase
          .from("accommodation_info").select("name").eq("id", accommodationId).maybeSingle();
        if (accData) setAccName(accData.name);
      } catch (err) {
        console.error("Fetch order error:", err);
        setOrderError("載入訂單資料失敗");
      } finally {
        setLoadingOrder(false);
      }
    };
    fetchOrder();
  }, [orderNumber, accommodationId]);

  // Load TapPay SDK
  useEffect(() => {
    if (!tappayConfig) return;
    const load = () => {
      if (window.TPDirect) {
        window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
        setIsTapPayReady(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0";
      script.async = true;
      script.onload = () => {
        if (window.TPDirect) {
          window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
          setIsTapPayReady(true);
        }
      };
      script.onerror = () => setBindError({ message: "無法載入綁卡模組", suggestion: "請重新整理頁面" });
      document.body.appendChild(script);
    };
    setIsTapPayReady(false);
    load();
  }, [tappayConfig]);

  useEffect(() => {
    if (tappayConfigError) setBindError({ message: tappayConfigError, suggestion: "請重新整理頁面或聯繫客服" });
  }, [tappayConfigError]);

  // Setup card form
  useEffect(() => {
    if (!isTapPayReady) return;
    const timer = setTimeout(() => {
      if (!window.TPDirect) return;
      try {
        window.TPDirect.card.setup({
          fields: {
            number: { element: "#bind-card-number", placeholder: "**** **** **** ****" },
            expirationDate: { element: "#bind-card-expiry", placeholder: "MM / YY" },
            ccv: { element: "#bind-card-ccv", placeholder: "CVV" },
          },
          styles: {
            input: { "font-size": "16px", color: "#1a1a1a" },
            ".valid": { color: "#16a34a" },
            ".invalid": { color: "#dc2626" },
          },
        });
        window.TPDirect.card.onUpdate((u: any) => setCardValid(u.canGetPrime));
        setCardValid(false);
      } catch (e) {
        console.error("TapPay setup error:", e);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isTapPayReady, cardFormKey]);

  const handleRetry = () => {
    setBindError(null);
    setCardValid(false);
    setRetryCount((c) => c + 1);
    // Re-mount the card fields to clear them and allow a fresh prime
    setCardFormKey((k) => k + 1);
    try {
      (window.TPDirect as any)?.card?.reset?.();
    } catch (e) {
      console.warn("TapPay reset failed:", e);
    }
    toast.info("已重置卡片資料，請重新輸入後再次綁卡");
  };

  const handleBind = async () => {
    if (!window.TPDirect || !cardValid || !tappayConfig || !orderInfo) return;
    setIsProcessing(true);
    setBindError(null);
    try {
      const prime = await getTapPayPrime();
      const phoneE164 = orderInfo.guestPhone.startsWith("+")
        ? orderInfo.guestPhone
        : orderInfo.guestPhone.startsWith("09")
          ? "+886" + orderInfo.guestPhone.substring(1)
          : "+886" + orderInfo.guestPhone;

      const { data, error } = await supabase.functions.invoke("bind-deposit-card", {
        body: {
          prime,
          orderId: orderInfo.orderId,
          cardholder: {
            name: orderInfo.guestName,
            email: orderInfo.guestEmail || "no-email@example.com",
            phoneNumber: phoneE164,
          },
        },
      });
      if (error) throw error;
      if (!data?.success) {
        setBindError({ message: data?.message || "綁卡失敗", suggestion: data?.suggestion });
        toast.error("綁卡失敗", { description: data?.message });
      } else {
        setCardLastFour(data?.cardLastFour ?? null);
        setBindSuccess(true);
        toast.success("綁卡成功");
      }
    } catch (e: any) {
      console.error("Bind error:", e);
      setBindError({ message: e?.message || "綁卡處理失敗", suggestion: "請稍後再試或聯繫客服" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">載入訂單資料...</p>
        </div>
      </div>
    );
  }

  if (orderError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">{orderError}</h2>
            <p className="text-sm text-muted-foreground">如有疑問，請聯繫住宿業者。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (bindSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-700">綁卡成功！</h2>
            <p className="text-muted-foreground">押金將於入住前一天自動扣款。</p>
            {cardLastFour && (
              <div className="bg-muted/50 rounded-lg p-4 text-sm">
                已綁定卡片 •••• {cardLastFour}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {accName && <p className="text-sm text-muted-foreground mb-1">{accName}</p>}
          <CardTitle className="text-xl">押金綁卡</CardTitle>
          <CardDescription>綁定信用卡作為押金預授權，入住前一天自動扣款</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-medium">{orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂購人</span>
              <span className="font-medium">{orderInfo?.guestName}</span>
            </div>
            {orderInfo && orderInfo.depositAmount > 0 && (
              <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                <span>押金金額</span>
                <span className="text-primary">NT$ {orderInfo.depositAmount.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Label className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              信用卡資訊
            </Label>
            <div className="space-y-3" key={cardFormKey}>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">卡號</Label>
                <div id="bind-card-number" className="h-12 px-4 py-3 border rounded-lg bg-white" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">有效期限</Label>
                  <div id="bind-card-expiry" className="h-12 px-4 py-3 border rounded-lg bg-white" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">安全碼</Label>
                  <div id="bind-card-ccv" className="h-12 px-4 py-3 border rounded-lg bg-white" />
                </div>
              </div>
            </div>

            {(tappayConfigLoading || !isTapPayReady) && !tappayConfigError && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在載入綁卡模組...
              </div>
            )}

            {bindError && (
              <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{bindError.message}</AlertTitle>
                {bindError.suggestion && (
                  <AlertDescription className="mb-2">{bindError.suggestion}</AlertDescription>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={isProcessing}
                  className="mt-2"
                >
                  重新綁卡{retryCount > 0 ? `（第 ${retryCount + 1} 次）` : ""}
                </Button>
              </Alert>
            )}
          </div>

          <Button
            onClick={handleBind}
            disabled={!tappayConfig || !cardValid || isProcessing || !isTapPayReady}
            className="w-full h-12 text-base"
            size="lg"
          >
            {isProcessing ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" />處理中...</>
            ) : (
              <><CreditCard className="h-5 w-5 mr-2" />確認綁卡</>
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>本次僅綁定卡片，不會立即扣款</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
