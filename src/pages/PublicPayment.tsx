import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function PublicPayment() {
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // 測試訂單資料
  const orderInfo = {
    orderNumber: `TEST${Date.now()}`,
    amount: 10,
    description: "測試訂單",
    customerName: "測試顧客",
    customerPhone: "0912345678",
    customerEmail: "test@example.com",
  };

  // 載入 TapPay SDK
  useEffect(() => {
    const loadTapPaySDK = () => {
      if (window.TPDirect) {
        console.log("TapPay SDK already loaded");
        window.TPDirect.setupSDK(
          "165714",
          "app_zYcYVG6FPf8I3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP",
          "production"
        );
        setIsTapPayReady(true);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.18.0";
      script.async = true;
      script.onload = () => {
        if (window.TPDirect) {
          console.log("TapPay SDK loaded");
          window.TPDirect.setupSDK(
            "165714",
            "app_zYcYVG6FPf8I3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP",
            "production"
          );
          setIsTapPayReady(true);
        }
      };
      script.onerror = () => {
        console.error("Failed to load TapPay SDK");
        setErrorMessage("無法載入付款模組，請重新整理頁面");
      };
      document.body.appendChild(script);
    };

    loadTapPaySDK();
  }, []);

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
    if (!window.TPDirect || !cardValid) return;

    setIsProcessing(true);
    setErrorMessage("");

    try {
      // 取得 Prime
      const prime = await new Promise<string>((resolve, reject) => {
        window.TPDirect.card.getPrime((result: any) => {
          console.log("[TapPay] getPrime result:", result);
          if (result.status !== 0) {
            const hostname = window.location.hostname;
            const origin = window.location.origin;
            reject(
              new Error(
                `TapPay 授權失敗 (${result.status}): ${result.msg || "unknown"} | hostname: ${hostname} | origin: ${origin}`
              )
            );
            return;
          }
          resolve(result.card.prime);
        });
      });

      console.log("[TapPay] Prime obtained, calling backend...");

      // 呼叫後端處理付款
      const { data, error } = await supabase.functions.invoke(
        "process-tappay-payment",
        {
          body: {
            prime,
            amount: orderInfo.amount,
            orderId: orderInfo.orderNumber,
            cardholder: {
              phoneNumber: orderInfo.customerPhone,
              name: orderInfo.customerName,
              email: orderInfo.customerEmail,
            },
            details: orderInfo.description,
          },
        }
      );

      if (error) throw error;

      if (data.success) {
        setTransactionId(data.transactionId);
        setPaymentSuccess(true);
        toast.success("付款成功！");
      } else {
        throw new Error(data.message || "付款失敗");
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      setErrorMessage(error.message || "處理付款時發生錯誤");
      toast.error("付款失敗", { description: error.message });
    } finally {
      setIsProcessing(false);
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

            {!isTapPayReady && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在載入付款模組...
              </div>
            )}

            {errorMessage && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                {errorMessage}
              </div>
            )}
          </div>

          {/* 付款按鈕 */}
          <Button
            onClick={handlePayment}
            disabled={!cardValid || isProcessing || !isTapPayReady}
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
