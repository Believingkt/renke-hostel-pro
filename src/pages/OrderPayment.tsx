import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, CheckCircle2, ShieldCheck, AlertTriangle, Building2, RefreshCw, Clock, Info, ListOrdered } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AtmPaymentPanel } from "@/components/payment/AtmPaymentPanel";

interface PaymentError {
  message: string;
  suggestion?: string;
  errorCode?: number;
  technicalMessage?: string;
}

export default function OrderPayment() {
  const [searchParams] = useSearchParams();
  const orderNumber = searchParams.get("order_number") || "";
  const amount = parseInt(searchParams.get("amount") || "0", 10);
  const accommodationId = searchParams.get("acc") || "";

  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [paymentError, setPaymentError] = useState<PaymentError | null>(null);
  const [orderInfo, setOrderInfo] = useState<{
    guestName: string;
    guestPhone: string;
    guestEmail: string;
    orderId: string;
    needsCardBinding: boolean;
    atmInfo: { vaccNo: string; bankCode?: string | null; expireAt: string; amount: number } | null;
    atmExpiredInfo: { vaccNo: string; expireAt: string } | null;
  } | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [accName, setAccName] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [orderStatus, setOrderStatus] = useState<string>("pending");
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
  } = useTapPayConfig(!loadingOrder && !orderError);

  // Fetch order info
  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber || !amount || !accommodationId) {
        setOrderError("付款連結無效，缺少必要參數");
        setLoadingOrder(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, guest_name, guest_phone, guest_email, final_price, paid_amount, payment_status, order_status, payment_link_created_at, deposit_method, deposit_status, atm_vacc_no, atm_vacc_bank_code, atm_expire_at")
          .eq("order_number", orderNumber)
          .eq("accommodation_id", accommodationId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setOrderError("找不到此訂單");
          setLoadingOrder(false);
          return;
        }

        if (data.order_status === "cancelled") {
          setOrderError("此訂單已取消");
          setLoadingOrder(false);
          return;
        }

        if (data.payment_status === "paid") {
          setOrderError("此訂單已全額付款完成");
          setLoadingOrder(false);
          return;
        }

        // Check if payment link has expired (3 days)
        if (data.payment_link_created_at) {
          const created = new Date(data.payment_link_created_at);
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
          if (Date.now() > created.getTime() + threeDaysMs) {
            setOrderError("此付款連結已逾期（超過 3 天），請聯繫業者取得新的付款連結");
            setLoadingOrder(false);
            return;
          }
        }

        const unpaid = data.final_price - (data.paid_amount || 0);
        if (amount > unpaid) {
          setOrderError(`付款金額超過待付金額 (NT$ ${unpaid.toLocaleString()})`);
          setLoadingOrder(false);
          return;
        }

        const needsCardBinding =
          data.deposit_method === "card" &&
          data.deposit_status !== "card_bound" &&
          data.deposit_status !== "charged" &&
          data.deposit_status !== "partially_refunded" &&
          data.deposit_status !== "refunded";

        const atmActive = data.atm_vacc_no && data.atm_expire_at && new Date(data.atm_expire_at) > new Date();
        const atmExpired = data.atm_vacc_no && data.atm_expire_at && new Date(data.atm_expire_at) <= new Date();
        setOrderInfo({
          guestName: data.guest_name,
          guestPhone: data.guest_phone,
          guestEmail: data.guest_email || "",
          orderId: data.id,
          needsCardBinding,
          atmInfo: atmActive
            ? { vaccNo: data.atm_vacc_no, bankCode: data.atm_vacc_bank_code, expireAt: data.atm_expire_at, amount }
            : null,
          atmExpiredInfo: atmExpired
            ? { vaccNo: data.atm_vacc_no, expireAt: data.atm_expire_at }
            : null,
        });
        setPaymentStatus(data.payment_status || "unpaid");

        // Fetch accommodation name
        const { data: accData } = await supabase
          .from("accommodation_info")
          .select("name")
          .eq("id", accommodationId)
          .maybeSingle();
        if (accData) setAccName(accData.name);
      } catch (err) {
        console.error("Fetch order error:", err);
        setOrderError("載入訂單資料失敗");
      } finally {
        setLoadingOrder(false);
      }
    };

    fetchOrder();
  }, [orderNumber, amount, accommodationId]);

  // Refresh order payment status (manual + realtime)
  const refreshStatus = async (silent = false) => {
    if (!orderInfo?.orderId) return;
    if (!silent) setRefreshingStatus(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("payment_status, paid_amount, final_price")
        .eq("id", orderInfo.orderId)
        .maybeSingle();
      if (data) {
        setPaymentStatus(data.payment_status || "unpaid");
        if (data.payment_status === "paid" && !silent) {
          toast.success("已收到入帳通知，訂單已完成付款");
        }
      }
    } finally {
      if (!silent) setRefreshingStatus(false);
    }
  };

  useEffect(() => {
    if (!orderInfo?.orderId) return;
    const channel = supabase
      .channel(`order-pay-${orderInfo.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderInfo.orderId}` },
        (payload: any) => {
          const newStatus = payload.new?.payment_status;
          if (newStatus) setPaymentStatus(newStatus);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderInfo?.orderId]);

  // Load TapPay SDK
  useEffect(() => {
    if (!tappayConfig) return;

    const loadTapPaySDK = () => {
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
      script.onerror = () => {
        setPaymentError({ message: "無法載入付款模組", suggestion: "請重新整理頁面" });
      };
      document.body.appendChild(script);
    };

    setIsTapPayReady(false);
    loadTapPaySDK();
  }, [tappayConfig]);

  useEffect(() => {
    if (tappayConfigError) {
      setPaymentError({ message: tappayConfigError, suggestion: "請重新整理頁面或聯繫客服" });
    }
  }, [tappayConfigError]);

  // Setup TapPay card form
  useEffect(() => {
    if (!isTapPayReady) return;

    const timer = setTimeout(() => {
      if (!window.TPDirect) return;
      try {
        window.TPDirect.card.setup({
          fields: {
            number: { element: "#order-card-number", placeholder: "**** **** **** ****" },
            expirationDate: { element: "#order-card-expiry", placeholder: "MM / YY" },
            ccv: { element: "#order-card-ccv", placeholder: "CVV" },
          },
          styles: {
            input: { "font-size": "16px", color: "#1a1a1a" },
            ".valid": { color: "#16a34a" },
            ".invalid": { color: "#dc2626" },
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
    if (!window.TPDirect || !cardValid || !tappayConfig || !orderInfo) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      const prime = await getTapPayPrime();

      const phoneE164 = orderInfo.guestPhone.startsWith("+")
        ? orderInfo.guestPhone
        : orderInfo.guestPhone.startsWith("09")
          ? "+886" + orderInfo.guestPhone.substring(1)
          : "+886" + orderInfo.guestPhone;

      const { data, error } = await supabase.functions.invoke("process-tappay-payment", {
        body: {
          prime,
          amount,
          orderId: orderNumber,
          cardholder: {
            phoneNumber: phoneE164,
            name: orderInfo.guestName,
            email: orderInfo.guestEmail || "no-email@example.com",
          },
          details: `訂單 ${orderNumber} 付款`,
          frontendRedirectUrl: `${window.location.origin}/payment-result?order_number=${orderNumber}&amount=${amount}&source=link`,
          bindCard: orderInfo.needsCardBinding,
        },
      });

      if (error) throw error;

      if (data.success) {
        if (data.requires3DSecure && data.paymentUrl) {
          sessionStorage.setItem("pending_payment", JSON.stringify({
            orderId: orderInfo.orderId,
            orderNumber,
            amount,
            source: "link",
          }));
          window.location.href = data.paymentUrl;
          return;
        }

        // Direct success - update order
        const { data: currentOrder } = await supabase
          .from("orders")
          .select("paid_amount, final_price")
          .eq("id", orderInfo.orderId)
          .maybeSingle();

        if (currentOrder) {
          const newPaid = (currentOrder.paid_amount || 0) + amount;
          const newStatus = newPaid >= currentOrder.final_price ? "paid" : newPaid > 0 ? "partial" : "unpaid";
          await supabase
            .from("orders")
            .update({
              paid_amount: newPaid,
              payment_status: newStatus,
              balance_payment_method: "信用卡",
            })
            .eq("id", orderInfo.orderId);
        }

        setTransactionId(data.transactionId);
        setPaymentSuccess(true);
        toast.success("付款成功！");
      } else {
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
            <p className="text-sm text-muted-foreground">
              如有疑問，請聯繫住宿業者。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-green-700">付款成功！</h2>
            <p className="text-muted-foreground">感謝您的付款，交易已完成。</p>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">訂單編號</span>
                <span className="font-medium">{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">交易金額</span>
                <span className="font-semibold">NT$ {amount.toLocaleString()}</span>
              </div>
              {transactionId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">交易編號</span>
                  <span className="font-mono text-xs">{transactionId}</span>
                </div>
              )}
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
          {accName && <p className="text-sm text-muted-foreground mb-1">{accName}</p>}
          <CardTitle className="text-xl">線上付款</CardTitle>
          <CardDescription>選擇付款方式以完成本筆款項</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 訂單資訊 */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-medium">{orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂購人</span>
              <span className="font-medium">{orderInfo?.guestName}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>應付金額</span>
              <span className="text-primary">NT$ {amount.toLocaleString()}</span>
            </div>
          </div>

          {orderInfo?.needsCardBinding && (
            <Alert className="border-primary/30 bg-primary/5">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>本次付款將同步完成押金綁卡</AlertTitle>
              <AlertDescription>
                此訂單押金為線上綁卡，將使用本次刷卡的同一張卡片進行押金預授權，並於入住前一天自動扣款。
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue={(searchParams.get("tab") === "atm" || orderInfo?.atmInfo) ? "atm" : "card"} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="card"><CreditCard className="h-4 w-4 mr-1.5" />信用卡</TabsTrigger>
              <TabsTrigger value="atm"><Building2 className="h-4 w-4 mr-1.5" />ATM 轉帳</TabsTrigger>
            </TabsList>

            <TabsContent value="card" className="space-y-4 pt-4">
              <Label className="flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5" />
                信用卡資訊
              </Label>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">卡號</Label>
                  <div id="order-card-number" className="h-12 px-4 py-3 border rounded-lg bg-white" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">有效期限</Label>
                    <div id="order-card-expiry" className="h-12 px-4 py-3 border rounded-lg bg-white" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">安全碼</Label>
                    <div id="order-card-ccv" className="h-12 px-4 py-3 border rounded-lg bg-white" />
                  </div>
                </div>
              </div>

              {(tappayConfigLoading || !isTapPayReady) && !tappayConfigError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在載入付款模組...
                </div>
              )}

              {paymentError && (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{paymentError.message}</AlertTitle>
                  {paymentError.suggestion && (
                    <AlertDescription>{paymentError.suggestion}</AlertDescription>
                  )}
                </Alert>
              )}

              <Button
                onClick={handlePayment}
                disabled={!tappayConfig || !cardValid || isProcessing || !isTapPayReady}
                className="w-full h-12 text-base"
                size="lg"
              >
                {isProcessing ? (
                  <><Loader2 className="h-5 w-5 mr-2 animate-spin" />處理中...</>
                ) : (
                  <><CreditCard className="h-5 w-5 mr-2" />確認付款 NT$ {amount.toLocaleString()}</>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="atm" className="pt-4 space-y-4">
              {orderInfo && (
                <>
                  {orderInfo.atmExpiredInfo && (
                    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>原虛擬帳號已逾期</AlertTitle>
                      <AlertDescription className="space-y-2">
                        <div className="text-xs">
                          原帳號 <span className="font-mono">{orderInfo.atmExpiredInfo.vaccNo}</span> 已於{" "}
                          {new Date(orderInfo.atmExpiredInfo.expireAt).toLocaleString("zh-TW", {
                            dateStyle: "long",
                            timeStyle: "short",
                          })}{" "}
                          失效，請重新申請新的虛擬帳號完成付款。
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={reapplying}
                          onClick={async () => {
                            setReapplying(true);
                            try {
                              const { error } = await supabase
                                .from("orders")
                                .update({
                                  atm_vacc_no: null,
                                  atm_vacc_bank_code: null,
                                  atm_expire_at: null,
                                  atm_rec_trade_id: null,
                                })
                                .eq("id", orderInfo.orderId);
                              if (error) throw error;
                              setOrderInfo((prev) =>
                                prev ? { ...prev, atmInfo: null, atmExpiredInfo: null } : prev,
                              );
                              toast.success("已清除舊帳號，請重新選擇銀行申請");
                            } catch (e: any) {
                              toast.error("清除舊帳號失敗", { description: e?.message });
                            } finally {
                              setReapplying(false);
                            }
                          }}
                        >
                          {reapplying ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />處理中...</>
                          ) : (
                            <><RefreshCw className="h-4 w-4 mr-2" />重新申請新的虛擬帳號</>
                          )}
                        </Button>
                      </AlertDescription>
                    </Alert>
                  )}

                  <AtmPaymentPanel
                    orderId={orderInfo.orderId}
                    orderNumber={orderNumber}
                    amount={amount}
                    cardholder={{
                      name: orderInfo.guestName,
                      email: orderInfo.guestEmail || "no-email@example.com",
                      phoneNumber: orderInfo.guestPhone,
                    }}
                    initialAtmInfo={orderInfo.atmInfo}
                    onCreated={(info) => {
                      setOrderInfo((prev) => prev ? { ...prev, atmInfo: info, atmExpiredInfo: null } : prev);
                    }}
                  />

                  {orderInfo.atmInfo && (
                    <>
                      {/* 匯款步驟指引 */}
                      <div className="rounded-lg border bg-primary/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <ListOrdered className="h-4 w-4" />
                          匯款步驟指引
                        </div>
                        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                          <li>請使用網路銀行、ATM 或臨櫃匯款至上方虛擬帳號。</li>
                          <li>確認轉帳金額與訂單金額完全一致（NT$ {amount.toLocaleString()}）。</li>
                          <li>轉帳完成後，系統約 1–3 個工作日自動確認入帳。</li>
                        </ol>
                      </div>

                      {/* 轉帳備註 */}
                      <Alert className="border-amber-200 bg-amber-50">
                        <Info className="h-4 w-4 text-amber-600" />
                        <AlertTitle className="text-amber-800">轉帳備註</AlertTitle>
                        <AlertDescription className="text-amber-700 text-xs space-y-1">
                          <p>• 請務必輸入正確的「轉帳金額」，多付或少付可能導致入帳失敗。</p>
                          <p>• 虛擬帳號為一次性專屬帳號，請勿與他人共用或重複轉帳。</p>
                          <p>• 若逾期未繳款，訂單將自動取消，虛擬帳號隨之失效。</p>
                        </AlertDescription>
                      </Alert>

                      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            訂單付款狀態
                          </div>
                          {paymentStatus === "paid" ? (
                            <Badge className="bg-green-600 hover:bg-green-600">已付款</Badge>
                          ) : paymentStatus === "partial" ? (
                            <Badge variant="secondary">部分付款</Badge>
                          ) : (
                            <Badge variant="outline">等待入帳</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          系統收到銀行入帳通知後將自動更新；您也可以手動重新整理。
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => refreshStatus(false)}
                          disabled={refreshingStatus}
                        >
                          {refreshingStatus ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />查詢中...</>
                          ) : (
                            <><RefreshCw className="h-4 w-4 mr-2" />查看訂單狀態</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>使用 TapPay 安全加密傳輸</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
