import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, CheckCircle2, ShieldCheck, AlertTriangle, Phone, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface PaymentError {
  message: string;
  suggestion?: string;
  errorCode?: number;
  technicalMessage?: string;
}

export default function PublicPayment() {
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [paymentError, setPaymentError] = useState<PaymentError | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
  } = useTapPayConfig(true);

  // 測試訂單資料 - orderId 格式: YYYYMMDD + 3位流水號 (共11位數字)
  const generateOrderId = () => {
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0');
    const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return dateStr + seq;
  };

  const orderInfo = {
    orderNumber: generateOrderId(),
    amount: 10,
    description: "測試訂單",
    customerName: "測試顧客",
    customerPhone: "0912345678",
    customerEmail: "test@example.com",
  };

  // 載入 TapPay SDK
  useEffect(() => {
    if (!tappayConfig) return;

    const loadTapPaySDK = () => {
      if (window.TPDirect) {
        console.log(`TapPay SDK already loaded (${tappayConfig.env})`);
        window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
        setIsTapPayReady(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0";
      script.async = true;
      script.onload = () => {
        if (window.TPDirect) {
          console.log(`TapPay SDK loaded (${tappayConfig.env})`);
          window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
          setIsTapPayReady(true);
        }
      };
      script.onerror = () => {
        console.error("Failed to load TapPay SDK");
        setPaymentError({ message: "無法載入付款模組", suggestion: "請重新整理頁面" });
      };
      document.body.appendChild(script);
    };

    setIsTapPayReady(false);
    loadTapPaySDK();
  }, [tappayConfig]);

  useEffect(() => {
    if (!tappayConfigError) return;
    setPaymentError({ message: tappayConfigError, suggestion: '請重新整理頁面或聯繫客服' });
  }, [tappayConfigError]);

  // 設定 TapPay 表單
  useEffect(() => {
    if (!isTapPayReady) return;

    const timer = setTimeout(() => {
      if (!window.TPDirect) return;

      try {
        window.TPDirect.card.setup({
          fields: {
            number: {
              element: "#public-card-number",
              placeholder: "**** **** **** ****",
            },
            expirationDate: {
              element: "#public-card-expiry",
              placeholder: "MM / YY",
            },
            ccv: {
              element: "#public-card-ccv",
              placeholder: "CVV",
            },
          },
          styles: {
            input: {
              "font-size": "16px",
              color: "#1a1a1a",
            },
            ".valid": {
              color: "#16a34a",
            },
            ".invalid": {
              color: "#dc2626",
            },
          },
        });

        window.TPDirect.card.onUpdate((update: any) => {
          setCardValid(update.canGetPrime);
        });
      } catch (error) {
        console.error("TapPay setup error:", error);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isTapPayReady]);

  const handlePayment = async () => {
    if (!window.TPDirect || !cardValid || !tappayConfig) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // 取得 Prime（含逾時與相容性 fallback，避免卡在「處理中」）
      const prime = await getTapPayPrime();
      console.log("[TapPay] Prime obtained, calling backend...");

      // Build redirect URLs for 3D Secure
      const baseUrl = window.location.origin;
      const frontendRedirectUrl = `${baseUrl}/payment-result`;

      // Normalize phone to E.164 format
      const phoneE164 = orderInfo.customerPhone.startsWith('+') 
        ? orderInfo.customerPhone 
        : orderInfo.customerPhone.startsWith('09')
          ? '+886' + orderInfo.customerPhone.substring(1)
          : '+886' + orderInfo.customerPhone;

      // 呼叫後端處理付款
      const { data, error } = await supabase.functions.invoke(
        "process-tappay-payment",
        {
          body: {
            prime,
            amount: orderInfo.amount,
            orderId: orderInfo.orderNumber,
            cardholder: {
              phoneNumber: phoneE164,
              name: orderInfo.customerName,
              email: orderInfo.customerEmail,
            },
            details: orderInfo.description,
            frontendRedirectUrl,
          },
        }
      );

      if (error) throw error;

      if (data.success) {
        // Check if 3D Secure redirect is required
        if (data.requires3DSecure && data.paymentUrl) {
          console.log("[TapPay] Redirecting to 3D Secure...");
          // Redirect to TapPay 3D Secure page
          window.location.href = data.paymentUrl;
          return;
        }

        // Direct success (rare in production with 3D enabled)
        setTransactionId(data.transactionId);
        setPaymentSuccess(true);
        toast.success("付款成功！");
      } else {
        // 顯示詳細錯誤
        setPaymentError({
          message: data.message || "付款失敗",
          suggestion: data.suggestion,
          errorCode: data.errorCode,
          technicalMessage: data.technicalMessage,
        });
        toast.error("付款失敗", { description: data.message });
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      setPaymentError({
        message: error.message || "處理付款時發生錯誤",
        suggestion: "請稍後再試或聯繫客服",
      });
      toast.error("付款失敗", { description: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyErrorInfo = async () => {
    if (!paymentError) return;
    const errorText = [
      `錯誤訊息: ${paymentError.message}`,
      paymentError.errorCode !== undefined ? `錯誤碼: ${paymentError.errorCode}` : null,
      paymentError.technicalMessage ? `技術訊息: ${paymentError.technicalMessage}` : null,
    ].filter(Boolean).join('\n');
    
    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("已複製錯誤資訊");
    } catch {
      // ignore clipboard errors
    }
  };

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-700">付款成功！</h2>
            <p className="text-muted-foreground">
              感謝您的付款，交易已完成。
            </p>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">交易金額</span>
                <span className="font-semibold">NT$ {orderInfo.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">交易編號</span>
                <span className="font-mono text-xs">{transactionId}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">線上付款</CardTitle>
          <CardDescription>請填寫信用卡資訊完成付款</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 訂單資訊 */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-medium font-mono text-xs">
                {orderInfo.orderNumber}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">商品說明</span>
              <span className="font-medium">{orderInfo.description}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>應付金額</span>
              <span className="text-primary">
                NT$ {orderInfo.amount.toLocaleString()}
              </span>
            </div>
          </div>

          {/* 信用卡表單 */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              信用卡資訊
            </Label>

            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  卡號
                </Label>
                <div
                  id="public-card-number"
                  className="h-12 px-4 py-3 border rounded-lg bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    有效期限
                  </Label>
                  <div
                    id="public-card-expiry"
                    className="h-12 px-4 py-3 border rounded-lg bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    安全碼
                  </Label>
                  <div
                    id="public-card-ccv"
                    className="h-12 px-4 py-3 border rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>

            {(tappayConfigLoading || !isTapPayReady) && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在載入付款模組...
              </div>
            )}

            {paymentError && (
              <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="flex items-center justify-between">
                  <span>{paymentError.message}</span>
                  {paymentError.errorCode !== undefined && (
                    <span className="text-xs font-mono bg-destructive/10 px-2 py-0.5 rounded">
                      錯誤碼: {paymentError.errorCode}
                    </span>
                  )}
                </AlertTitle>
                <AlertDescription className="mt-2 space-y-3">
                  {paymentError.technicalMessage && (
                    <p className="text-xs font-mono text-muted-foreground bg-muted/50 p-2 rounded">
                      {paymentError.technicalMessage}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* 付款按鈕 */}
          <Button
            onClick={handlePayment}
            disabled={!tappayConfig || !cardValid || isProcessing || !isTapPayReady}
            className="w-full h-12 text-base"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                處理中...
              </>
            ) : (
              <>
                <CreditCard className="h-5 w-5 mr-2" />
                確認付款 NT$ {orderInfo.amount}
              </>
            )}
          </Button>

          {/* 安全提示 */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>使用 TapPay 安全加密傳輸</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
