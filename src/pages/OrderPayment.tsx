import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CreditCard, Loader2, CheckCircle2, ShieldCheck, AlertTriangle, Building2, RefreshCw, Clock, Info, ListOrdered, Mail, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AtmPaymentPanel } from "@/components/payment/AtmPaymentPanel";
import { getPaymentOriginForAccommodation, isSameOriginIgnoringWww } from "@/utils/paymentDomain";
import { buildRedirectWithSessionHandoff } from "@/utils/oauthCallbackHandler";
import { LINE_CHANNEL_ID, FACEBOOK_APP_ID } from "@/config/oauth";

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
  const requestedMethod = searchParams.get("method") || "";

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
    isAtm: boolean;
  } | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [accName, setAccName] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [orderStatus, setOrderStatus] = useState<string>("pending");
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [reapplying, setReapplying] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  // Auth gate state
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [atmStep, setAtmStep] = useState<1 | 2>(1);

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const emailError =
    emailTouched && !isValidEmail(emailInput) ? "請輸入有效的 Email" : null;

  useEffect(() => {
    let mounted = true;

    // Cross-origin OAuth handoff: callback on booking.lakeze.com appends
    // access/refresh tokens via URL fragment when redirecting back to a
    // different origin (e.g. sensaninn.lakeze.com). Consume them here so
    // the local Supabase client establishes a session in this origin's
    // localStorage. Fragment is stripped immediately afterward.
    const consumeFragmentSession = async (): Promise<boolean> => {
      const hash = window.location.hash || "";
      if (!hash.includes("access_token=")) return false;
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessValues = params.getAll("access_token");
      const refreshValues = params.getAll("refresh_token");
      const access_token = accessValues[accessValues.length - 1];
      const refresh_token = refreshValues[refreshValues.length - 1];
      if (!access_token || !refresh_token) return false;
      try {
        console.log("[OrderPayment] consuming OAuth handoff fragment");
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error("[OrderPayment] setSession from fragment failed", error);
        }
      } catch (e) {
        console.error("[OrderPayment] setSession threw", e);
      }
      // Strip the fragment so tokens don't linger in URL / history.
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState({}, "", cleanUrl);
      return true;
    };

    (async () => {
      await consumeFragmentSession();
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setIsAuthed(!!data.user);
      setAuthChecked(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAuthed(!!session?.user);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const startSocialLogin = (provider: "facebook" | "line") => {
    try {
      // Encode the current payment URL into OAuth state so the callback
      // (which lives on booking.lakeze.com — possibly a different origin from
      // the accommodation's custom domain) can recover it without
      // sessionStorage (sessionStorage is per-origin).
      const returnUrl = window.location.href;
      const returnB64 = btoa(unescape(encodeURIComponent(returnUrl)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const random = crypto.randomUUID().replace(/-/g, "");
      const state = `${random}.${returnB64}`;

      // Best-effort same-origin storage (used when callback happens to share origin)
      sessionStorage.setItem("post_login_redirect", returnUrl);

      if (provider === "facebook") {
        const redirectUri = "https://booking.lakeze.com/member/auth/facebook-callback";
        sessionStorage.setItem("fb_oauth_state", state);
        sessionStorage.setItem("fb_oauth_redirect_uri", redirectUri);
        const u = new URL("https://www.facebook.com/v18.0/dialog/oauth");
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", FACEBOOK_APP_ID);
        u.searchParams.set("redirect_uri", redirectUri);
        u.searchParams.set("state", state);
        u.searchParams.set("scope", "public_profile,email");
        window.location.href = u.toString();
      } else {
        const nonce = crypto.randomUUID().replace(/-/g, "");
        const redirectUri = "https://booking.lakeze.com/member/auth/line-callback";
        // LINE state encodes nonce as third part: <random>.<returnB64>.<nonce>
        const lineState = `${state}.${nonce}`;
        sessionStorage.setItem("line_oauth_state", lineState);
        sessionStorage.setItem("line_oauth_nonce", nonce);
        sessionStorage.setItem("line_oauth_redirect_uri", redirectUri);
        const u = new URL("https://access.line.me/oauth2/v2.1/authorize");
        u.searchParams.set("response_type", "code");
        u.searchParams.set("client_id", LINE_CHANNEL_ID);
        u.searchParams.set("redirect_uri", redirectUri);
        u.searchParams.set("state", lineState);
        u.searchParams.set("scope", "openid profile email");
        u.searchParams.set("nonce", nonce);
        window.location.href = u.toString();
      }
    } catch (e: any) {
      toast.error(e?.message || "登入啟動失敗");
    }
  };



  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
  } = useTapPayConfig(!loadingOrder && !orderError);

  useEffect(() => {
    let cancelled = false;
    if (!accommodationId) return;

    getPaymentOriginForAccommodation(accommodationId).then(async (origin) => {
      if (cancelled || !origin || isSameOriginIgnoringWww(window.location.origin, origin)) return;
      const target = await buildRedirectWithSessionHandoff(
        "OrderPayment",
        `${origin}${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      if (!cancelled) window.location.replace(target);
    });

    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  // Fetch order info
  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber || !amount || !accommodationId) {
        setOrderError("付款連結無效，缺少必要參數");
        setLoadingOrder(false);
        return;
      }

      try {
        const { data: resp, error } = await supabase.functions.invoke("get-public-order", {
          body: { order_number: orderNumber, accommodation_id: accommodationId },
        });

        if (error) throw error;
        const data = resp?.order;
        if (!data) {
          setOrderError("找不到此訂單");
          setLoadingOrder(false);
          return;
        }

        if (data.order_status === "cancelled" && !data.atm_vacc_no) {
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
        const pmText = `${data.payment_method || ""} ${data.deposit_payment_method || ""} ${data.balance_payment_method || ""} ${requestedMethod}`;
        const isAtm = !!(atmActive || atmExpired || /ATM|虛擬帳號|bank_transfer/i.test(pmText));
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
          isAtm,
        });
        if (data.guest_email) setEmailInput((prev) => prev || data.guest_email);
        if (atmActive) setAtmStep(2);
        setPaymentStatus(data.payment_status || "unpaid");
        setOrderStatus(data.order_status || "pending");

        if (resp?.accommodation_name) setAccName(resp.accommodation_name);
      } catch (err) {
        console.error("Fetch order error:", err);
        setOrderError("載入訂單資料失敗");
      } finally {
        setLoadingOrder(false);
      }
    };

    fetchOrder();
  }, [orderNumber, amount, accommodationId, requestedMethod]);

  // Refresh order payment status (manual + realtime)
  const refreshStatus = async (silent = false) => {
    if (!orderInfo?.orderId) return;
    if (!silent) setRefreshingStatus(true);
    try {
      const { data: resp } = await supabase.functions.invoke("get-public-order", {
        body: { order_number: orderNumber, accommodation_id: accommodationId },
      });
      const data = resp?.order;
      if (data) {
        setPaymentStatus(data.payment_status || "unpaid");
        setOrderStatus(data.order_status || "pending");
        if (data.payment_status === "paid" && !silent) {
          toast.success("已收到入帳通知，訂單已完成付款");
        }
      }
    } finally {
      if (!silent) setRefreshingStatus(false);
    }
  };

  // Tick every 30s so timeline reflects expiry without manual refresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!orderInfo?.orderId) return;
    const channel = supabase
      .channel(`order-pay-${orderInfo.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderInfo.orderId}` },
        (payload: any) => {
          const newPayment = payload.new?.payment_status;
          const newOrder = payload.new?.order_status;
          if (newPayment) setPaymentStatus(newPayment);
          if (newOrder) setOrderStatus(newOrder);
          // Silent refresh to grab latest fields
          refreshStatus(true);
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
      script.src = "https://js.tappaysdk.com/sdk/tpdirect/v5.19.2";
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
    if (!isAuthed) {
      toast.error("請先以 Facebook 或 LINE 登入再進行付款");
      return;
    }
    if (!isValidEmail(emailInput)) {
      setEmailTouched(true);
      toast.error("請輸入有效的 Email 以接收付款通知");
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      const prime = await getTapPayPrime();

      const phoneE164 = orderInfo.guestPhone.startsWith("+")
        ? orderInfo.guestPhone
        : orderInfo.guestPhone.startsWith("09")
          ? "+886" + orderInfo.guestPhone.substring(1)
          : "+886" + orderInfo.guestPhone;

      const baseUrl = await getPaymentOriginForAccommodation(accommodationId);
      const { data, error } = await supabase.functions.invoke("process-tappay-payment", {
        body: {
          prime,
          amount,
          orderId: orderNumber,
          cardholder: {
            phoneNumber: phoneE164,
            name: orderInfo.guestName,
            email: emailInput.trim(),
          },
          details: `訂單 ${orderNumber} 付款`,
          frontendRedirectUrl: `${baseUrl}/payment-result?order_number=${orderNumber}&amount=${amount}&source=link`,
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

  // Auth gate: require FB/LINE login before showing the payment form
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {accName && <p className="text-sm text-muted-foreground mb-1">{accName}</p>}
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <LogIn className="h-5 w-5" />
              請先登入會員
            </CardTitle>
            <CardDescription>為確保訂單安全，付款前請以 Facebook 或 LINE 登入</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">訂單編號</span>
                <span className="font-medium">{orderNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">訂購人</span>
                <span className="font-medium">{orderInfo?.guestName}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                <span>應付金額</span>
                <span className="text-primary">NT$ {amount.toLocaleString()}</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full border-[hsl(24,100%,50%)]/40 hover:bg-[hsl(24,100%,50%)]/10"
              onClick={() => startSocialLogin("facebook")}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              使用 Facebook 登入
            </Button>
            <Button
              variant="outline"
              className="w-full border-[hsl(24,100%,50%)]/40 hover:bg-[hsl(24,100%,50%)]/10"
              onClick={() => startSocialLogin("line")}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#06C755">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              使用 LINE 登入
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              登入後將自動返回此付款頁
            </p>
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
          <CardDescription>
            {orderInfo?.isAtm ? "以 ATM 虛擬帳號完成本筆款項" : "以線上刷卡完成本筆款項"}
          </CardDescription>
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

          {/* Email 收據通知欄位（必填） */}
          <div className="space-y-2">
            <Label htmlFor="payment-email" className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4" />
              Email <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground font-normal">（用於寄送訂房資訊）</span>
            </Label>
            <Input
              id="payment-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-invalid={!!emailError}
              className={emailError ? "border-destructive" : ""}
            />
            {emailError && (
              <p className="text-xs text-destructive">{emailError}</p>
            )}
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

          <Tabs value={orderInfo?.isAtm ? "atm" : "card"} className="w-full">

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
                disabled={!tappayConfig || !cardValid || isProcessing || !isTapPayReady || !isValidEmail(emailInput)}
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
                              toast.success("已清除舊帳號，請重新取得虛擬帳號");
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

                  {!isValidEmail(emailInput) && !orderInfo.atmInfo ? (
                    <Alert className="border-amber-200 bg-amber-50">
                      <Info className="h-4 w-4 text-amber-600" />
                      <AlertTitle className="text-amber-800">請先填寫 Email</AlertTitle>
                      <AlertDescription className="text-amber-700 text-xs">
                        虛擬帳號將以此 Email 寄送匯款通知，請於上方填入有效的 Email 後再申請。
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <AtmPaymentPanel
                      orderId={orderInfo.orderId}
                      orderNumber={orderNumber}
                      amount={amount}
                      cardholder={{
                        name: orderInfo.guestName,
                        email: emailInput.trim() || orderInfo.guestEmail || "no-email@example.com",
                        phoneNumber: orderInfo.guestPhone,
                      }}
                      initialAtmInfo={orderInfo.atmInfo}
                      onCreated={(info) => {
                        setOrderInfo((prev) => prev ? { ...prev, atmInfo: info, atmExpiredInfo: null } : prev);
                      }}
                    />
                  )}

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

                      {(() => {
                        const expAt = orderInfo.atmInfo?.expireAt
                          ? new Date(orderInfo.atmInfo.expireAt).getTime()
                          : orderInfo.atmExpiredInfo?.expireAt
                            ? new Date(orderInfo.atmExpiredInfo.expireAt).getTime()
                            : null;
                        const isPaid = paymentStatus === "paid" || paymentStatus === "partial";
                        const isCancelled = orderStatus === "cancelled";
                        const isExpired = !isPaid && !isCancelled && expAt !== null && now >= expAt;
                        const isWaiting = !isPaid && !isCancelled && !isExpired;

                        type Step = { key: string; label: string; sub?: string; state: "done" | "current" | "future" | "error" };
                        const steps: Step[] = [
                          { key: "created", label: "虛擬帳號已建立", state: "done" },
                          {
                            key: "waiting",
                            label: isPaid ? "已收到入帳" : "等待銀行入帳",
                            sub: !isPaid && expAt ? `期限 ${new Date(expAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" })}` : undefined,
                            state: isPaid ? "done" : isWaiting ? "current" : "future",
                          },
                        ];
                        if (isPaid) {
                          steps.push({ key: "paid", label: paymentStatus === "paid" ? "付款完成" : "部分付款", state: "done" });
                        } else if (isCancelled) {
                          steps.push({ key: "cancelled", label: "訂單已取消", state: "error" });
                        } else if (isExpired) {
                          steps.push({ key: "expired", label: "虛擬帳號已到期", sub: "請重新申請", state: "error" });
                        } else {
                          steps.push({ key: "done", label: "付款完成", state: "future" });
                        }

                        return (
                          <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-sm font-medium">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                訂單付款狀態
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => refreshStatus(false)}
                                disabled={refreshingStatus}
                              >
                                {refreshingStatus ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                            <ol className="relative space-y-4">
                              {steps.map((s, i) => {
                                const isLast = i === steps.length - 1;
                                const dotCls =
                                  s.state === "done"
                                    ? "bg-green-600 border-green-600 text-white"
                                    : s.state === "current"
                                      ? "bg-primary border-primary text-primary-foreground animate-pulse"
                                      : s.state === "error"
                                        ? "bg-destructive border-destructive text-destructive-foreground"
                                        : "bg-muted border-muted-foreground/30 text-muted-foreground";
                                const lineCls =
                                  s.state === "done"
                                    ? "bg-green-600"
                                    : s.state === "error"
                                      ? "bg-destructive"
                                      : "bg-border";
                                const labelCls =
                                  s.state === "future"
                                    ? "text-muted-foreground"
                                    : s.state === "error"
                                      ? "text-destructive font-medium"
                                      : "text-foreground font-medium";
                                return (
                                  <li key={s.key} className="flex gap-3 relative">
                                    <div className="flex flex-col items-center">
                                      <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] ${dotCls}`}>
                                        {s.state === "done" ? <CheckCircle2 className="h-3 w-3" /> : s.state === "error" ? <AlertTriangle className="h-3 w-3" /> : i + 1}
                                      </div>
                                      {!isLast && <div className={`w-0.5 flex-1 mt-1 min-h-[14px] ${lineCls}`} />}
                                    </div>
                                    <div className="pb-1 -mt-0.5">
                                      <div className={`text-sm ${labelCls}`}>{s.label}</div>
                                      {s.sub && <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>}
                                    </div>
                                  </li>
                                );
                              })}
                            </ol>
                            <p className="text-xs text-muted-foreground">
                              系統收到銀行入帳通知後將自動更新狀態。
                            </p>
                          </div>
                        );
                      })()}
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
