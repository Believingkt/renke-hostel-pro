import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { Loader2, CreditCard, CheckCircle, AlertTriangle, Building2, Copy } from "lucide-react";

interface InlineChatPaymentProps {
  orderId: string;
  orderNumber: string;
  finalPrice: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  accommodationId: string;
  roomName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  initialMethod?: 'none' | 'card' | 'transfer';
  onPaymentSuccess?: (transactionId: string) => void;
}

export function InlineChatPayment({
  orderId,
  orderNumber,
  finalPrice,
  guestName,
  guestPhone,
  guestEmail,
  accommodationId,
  roomName,
  checkInDate,
  checkOutDate,
  initialMethod = 'none',
  onPaymentSuccess,
}: InlineChatPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<'none' | 'card' | 'transfer'>(initialMethod);
  const [showForm, setShowForm] = useState(initialMethod === 'card');
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [depositPercentage, setDepositPercentage] = useState<number | null>(null);
  const [useDeposit, setUseDeposit] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const formInitRef = useRef(false);

  const { config: tappayConfig, loading: configLoading, error: configError, reload: reloadConfig } = useTapPayConfig(showForm);

  // Fetch booking settings for deposit info
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('booking_settings')
          .select('use_deposit, deposit_percentage')
          .eq('accommodation_id', accommodationId)
          .maybeSingle();
        if (data) {
          setUseDeposit(data.use_deposit ?? false);
          setDepositPercentage(data.deposit_percentage ?? 30);
        }
      } finally {
        setSettingsLoaded(true);
      }
    };
    fetchSettings();
  }, [accommodationId]);

  const depositAmount = useDeposit && depositPercentage
    ? Math.round(finalPrice * depositPercentage / 100)
    : finalPrice;
  
  const paymentAmount = useDeposit ? depositAmount : finalPrice;

  // Load TapPay SDK
  useEffect(() => {
    if (!showForm || !tappayConfig) return;

    const loadSDK = () => {
      if (window.TPDirect) {
        window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
        setIsTapPayReady(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.18.0';
      script.async = true;
      script.onload = () => {
        if (window.TPDirect && tappayConfig) {
          window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
          setIsTapPayReady(true);
        }
      };
      document.body.appendChild(script);
    };

    loadSDK();
  }, [showForm, tappayConfig]);

  // Setup card form when ready
  useEffect(() => {
    if (!isTapPayReady || !showForm || formInitRef.current) return;

    const timer = setTimeout(() => {
      if (!window.TPDirect) return;

      const cardNum = document.getElementById('chat-card-number');
      const cardExp = document.getElementById('chat-card-expiry');
      const cardCcv = document.getElementById('chat-card-ccv');
      if (!cardNum || !cardExp || !cardCcv) return;

      try {
        window.TPDirect.card.setup({
          fields: {
            number: { element: '#chat-card-number', placeholder: '**** **** **** ****' },
            expirationDate: { element: '#chat-card-expiry', placeholder: 'MM / YY' },
            ccv: { element: '#chat-card-ccv', placeholder: 'CVV' },
          },
          styles: {
            input: { 'font-size': '16px', color: 'rgb(0, 0, 0)' },
            ':focus': { color: 'rgb(0, 0, 0)' },
            '.valid': { color: 'rgb(34, 197, 94)' },
            '.invalid': { color: 'rgb(239, 68, 68)' },
          },
        });

        window.TPDirect.card.onUpdate((update: any) => {
          setCardValid(update.canGetPrime);
        });
        
        formInitRef.current = true;
      } catch (e) {
        console.error('TapPay card setup error:', e);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isTapPayReady, showForm]);

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentError(null);

    try {
      const prime = await getTapPayPrime({ timeoutMs: 15000 });

      const baseUrl = window.location.origin;
      const frontendRedirectUrl = `${baseUrl}/payment-result?source=ai-booking`;

      const { data: paymentResult, error } = await supabase.functions.invoke('process-tappay-payment', {
        body: {
          prime,
          amount: paymentAmount,
          orderId: orderNumber,
          cardholder: {
            phoneNumber: guestPhone,
            name: guestName,
            email: guestEmail || '',
          },
          details: roomName
            ? `${roomName} - ${checkInDate} 至 ${checkOutDate}`
            : `訂單 ${orderNumber}`,
          frontendRedirectUrl,
        },
      });

      if (error) throw error;

      if (!paymentResult.success) {
        setPaymentError(paymentResult.message || '付款失敗，請檢查卡片資訊');
        return;
      }

      // Handle 3D Secure
      if (paymentResult.requires3DSecure && paymentResult.paymentUrl) {
        window.location.href = paymentResult.paymentUrl;
        return;
      }

      // Payment success - update order
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          payment_status: 'deposit_paid',
          paid_amount: paymentAmount,
          deposit_amount: paymentAmount,
          deposit_payment_method: '信用卡',
          payment_method: '信用卡',
          order_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('Failed to update order payment status:', updateError);
      }

      setPaymentDone(true);
      onPaymentSuccess?.(paymentResult.transactionId);
    } catch (e: any) {
      setPaymentError(e?.message || '付款處理失敗，請稍後再試');
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentDone) {
    return (
      <div className="bg-success/10 border border-success/30 rounded-lg p-4 mt-3">
        <div className="flex items-center gap-2 text-success font-semibold">
          <CheckCircle className="h-5 w-5" />
          <span>訂金付款成功！</span>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          已成功支付訂金 NT$ {paymentAmount.toLocaleString()}，訂單已確認。
          餘款 NT$ {(finalPrice - paymentAmount).toLocaleString()} 請於入住當天支付。
        </p>
      </div>
    );
  }

  const handleCopyAccount = () => {
    navigator.clipboard.writeText('121450000353');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Wait for settings to load before showing payment selection
  if (!settingsLoaded) {
    return (
      <div className="mt-3 border rounded-lg p-4 bg-card flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">載入付款資訊...</span>
      </div>
    );
  }

  // Step 1: Choose payment method
  if (paymentMethod === 'none') {
    return (
      <div className="mt-3 border rounded-lg p-4 bg-card space-y-4">
        <div className="text-sm font-semibold">請選擇付款方式</div>
        {useDeposit && (
          <p className="text-xs text-muted-foreground">
            應付訂金 NT$ {paymentAmount.toLocaleString()}（總金額 {depositPercentage}%），餘款 NT$ {(finalPrice - paymentAmount).toLocaleString()} 入住時支付
          </p>
        )}
        <RadioGroup
          value=""
          onValueChange={(v) => {
            if (v === 'card') {
              setPaymentMethod('card');
              setShowForm(true);
            } else if (v === 'transfer') {
              setPaymentMethod('transfer');
            }
          }}
          className="gap-3"
        >
          <label className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="card" />
            <CreditCard className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">線上刷卡</div>
              <div className="text-xs text-muted-foreground">使用信用卡即時完成付款</div>
            </div>
          </label>
          <label className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <RadioGroupItem value="transfer" />
            <Building2 className="h-4 w-4 text-primary" />
            <div>
              <div className="text-sm font-medium">銀行轉帳</div>
              <div className="text-xs text-muted-foreground">轉帳至指定帳戶後通知我們</div>
            </div>
          </label>
        </RadioGroup>
      </div>
    );
  }

  // Step 2a: Bank transfer info
  if (paymentMethod === 'transfer') {
    return (
      <div className="mt-3 border rounded-lg p-4 bg-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="h-4 w-4 text-primary" />
          <span>銀行轉帳資訊</span>
          <span className="ml-auto text-primary font-bold">NT$ {paymentAmount.toLocaleString()}</span>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">銀行</span>
            <span className="font-medium">陽信銀行</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">銀行代號</span>
            <span className="font-mono font-medium">108</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">帳號</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-medium">121450000353</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyAccount}>
                {copied ? <CheckCircle className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">戶名</span>
            <span className="font-medium">人客多股份有限公司</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          轉帳完成後請通知我們，確認後將為您更新訂單狀態。
        </p>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setPaymentMethod('none')}
        >
          返回選擇付款方式
        </Button>
      </div>
    );
  }

  // Step 2b: Credit card (existing flow, paymentMethod === 'card')
  if (!showForm) {
    setShowForm(true);
  }

  return (
    <div className="mt-3 border rounded-lg p-4 bg-card space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CreditCard className="h-4 w-4 text-primary" />
        <span>信用卡付款</span>
        <span className="ml-auto text-primary font-bold">NT$ {paymentAmount.toLocaleString()}</span>
      </div>

      {configLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">取得付款設定...</span>
        </div>
      ) : configError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>付款模組載入失敗</AlertTitle>
          <AlertDescription>
            <p className="mb-2">{configError}</p>
            <Button variant="outline" size="sm" onClick={() => reloadConfig()}>重新載入</Button>
          </AlertDescription>
        </Alert>
      ) : !isTapPayReady ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">載入付款表單...</span>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">卡號</Label>
              <div id="chat-card-number" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">有效期限</Label>
                <div id="chat-card-expiry" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">安全碼</Label>
                <div id="chat-card-ccv" className="tpfield h-10 border rounded-md px-3 bg-background"></div>
              </div>
            </div>
          </div>

          {cardValid && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle className="h-4 w-4" />
              <span>卡片資訊已驗證</span>
            </div>
          )}
        </>
      )}

      {paymentError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>付款失敗</AlertTitle>
          <AlertDescription>{paymentError}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => { setShowForm(false); setPaymentMethod('none'); formInitRef.current = false; }}
          disabled={isProcessing}
        >
          返回選擇付款方式
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={handlePayment}
          disabled={!cardValid || isProcessing || !isTapPayReady}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              處理中...
            </>
          ) : (
            `確認付款 NT$ ${paymentAmount.toLocaleString()}`
          )}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        您的卡片資訊由 TapPay 安全加密處理
      </p>
    </div>
  );
}
