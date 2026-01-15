import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTapPayConfig } from "@/hooks/use-tappay-config";
import { supabase } from "@/integrations/supabase/client";
import { getTapPayPrime } from "@/utils/tappayPrime";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, CheckCircle2, AlertTriangle, Phone, Copy, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ToastAction } from "@/components/ui/toast";

interface PaymentError {
  message: string;
  suggestion?: string;
  errorCode?: number;
  technicalMessage?: string;
}


interface OnlinePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    order_number: string;
    guest_name: string;
    guest_phone: string;
    guest_email: string | null;
    final_price: number;
    payment_status: string;
    deposit_amount: number;
    paid_amount: number;
  } | null;
  onPaymentSuccess: () => void;
}

export function OnlinePaymentDialog({ 
  open, 
  onOpenChange, 
  order,
  onPaymentSuccess 
}: OnlinePaymentDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const {
    config: tappayConfig,
    loading: tappayConfigLoading,
    error: tappayConfigError,
  } = useTapPayConfig(open);
  
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentType, setPaymentType] = useState<'full' | 'deposit' | 'balance' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [paymentError, setPaymentError] = useState<PaymentError | null>(null);
  const [copied, setCopied] = useState(false);

  // 計算待付金額
  const unpaidAmount = order ? order.final_price - (order.paid_amount || 0) : 0;
  const depositAmount = order?.deposit_amount || 0;
  const balanceAmount = order ? order.final_price - depositAmount : 0;

  // 初始化 TapPay SDK
  useEffect(() => {
    if (!open || !tappayConfig) return;

    const loadTapPaySDK = () => {
      if (window.TPDirect) {
        console.log(`TapPay SDK already loaded (${tappayConfig.env})`);
        window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
        setIsTapPayReady(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.18.0';
      script.async = true;
      script.onload = () => {
        if (window.TPDirect) {
          console.log(`TapPay SDK loaded (${tappayConfig.env})`);
          window.TPDirect.setupSDK(tappayConfig.appId, tappayConfig.appKey, tappayConfig.env);
          setIsTapPayReady(true);
        }
      };
      document.body.appendChild(script);
    };

    setIsTapPayReady(false);
    loadTapPaySDK();
  }, [open, tappayConfig]);

  // 設定 TapPay 表單
  useEffect(() => {
    if (!isTapPayReady || !open) return;

    const timer = setTimeout(() => {
      if (!window.TPDirect) return;

      const cardNumberElement = document.getElementById('admin-card-number');
      const cardExpiryElement = document.getElementById('admin-card-expiry');
      const cardCcvElement = document.getElementById('admin-card-ccv');

      if (!cardNumberElement || !cardExpiryElement || !cardCcvElement) {
        console.error('Card form elements not found');
        return;
      }

      try {
        window.TPDirect.card.setup({
          fields: {
            number: {
              element: '#admin-card-number',
              placeholder: '**** **** **** ****'
            },
            expirationDate: {
              element: '#admin-card-expiry',
              placeholder: 'MM / YY'
            },
            ccv: {
              element: '#admin-card-ccv',
              placeholder: 'CVV'
            }
          },
          styles: {
            'input': {
              'color': 'hsl(var(--foreground))',
              'font-size': '16px',
              'line-height': '24px'
            },
            '.valid': {
              'color': 'hsl(142, 76%, 36%)'
            },
            '.invalid': {
              'color': 'hsl(0, 84%, 60%)'
            }
          }
        });

        window.TPDirect.card.onUpdate((update: any) => {
          setCardValid(update.canGetPrime);
        });
      } catch (error) {
        console.error('TapPay setup error:', error);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [isTapPayReady, open]);

  // 設定付款金額
  useEffect(() => {
    if (!order) return;
    
    switch (paymentType) {
      case 'full':
        setPaymentAmount(unpaidAmount);
        break;
      case 'deposit':
        setPaymentAmount(depositAmount);
        break;
      case 'balance':
        setPaymentAmount(balanceAmount);
        break;
      case 'custom':
        setPaymentAmount(parseInt(customAmount) || 0);
        break;
    }
  }, [paymentType, customAmount, order, unpaidAmount, depositAmount, balanceAmount]);

  // 重置狀態
  useEffect(() => {
    if (!open) {
      setPaymentSuccess(false);
      setTransactionId('');
      setPaymentType('full');
      setCustomAmount('');
      setCardValid(false);
      setPaymentError(null);
      setCopied(false);
    }
  }, [open]);

  const handlePayment = async () => {
    if (!order || !window.TPDirect || paymentAmount <= 0 || !tappayConfig) return;

    setIsProcessing(true);
    setPaymentError(null);

    try {
      // 獲取 Prime（含逾時與相容性 fallback，避免卡在「處理中」）
      const prime = await getTapPayPrime(tappayConfig.appId, tappayConfig.appKey);

      console.log('[TapPay][Admin] invoking process-tappay-payment', {
        orderNumber: order.order_number,
        amount: paymentAmount,
      });

      // 呼叫後端處理付款
      const { data, error } = await supabase.functions.invoke('process-tappay-payment', {
        body: {
          prime,
          amount: paymentAmount,
          orderId: order.order_number,
          cardholder: {
            phoneNumber: order.guest_phone,
            name: order.guest_name,
            email: order.guest_email || 'no-email@example.com',
          },
          details: `訂單 ${order.order_number} 付款`,
        },
      });

      console.log('[TapPay][Admin] process-tappay-payment response:', data);

      if (error) throw error;

      if (data.success) {
        // 更新訂單付款狀態
        const newPaidAmount = (order.paid_amount || 0) + paymentAmount;
        const newPaymentStatus = newPaidAmount >= order.final_price ? 'paid' : 
                                 newPaidAmount > 0 ? 'partial' : 'unpaid';

        await supabase
          .from('orders')
          .update({
            paid_amount: newPaidAmount,
            payment_status: newPaymentStatus,
            balance_payment_method: '信用卡',
          })
          .eq('id', order.id);

        setTransactionId(data.transactionId);
        setPaymentSuccess(true);
        
        toast({
          title: "付款成功",
          description: `已收取 NT$ ${paymentAmount.toLocaleString()}`,
        });

        onPaymentSuccess();
      } else {
        // 顯示詳細錯誤
        setPaymentError({
          message: data.message || '付款失敗',
          suggestion: data.suggestion,
          errorCode: data.errorCode,
          technicalMessage: data.technicalMessage,
        });
        
        toast({
          title: "付款失敗",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      const message = error?.message || "處理付款時發生錯誤";

      setPaymentError({
        message,
        suggestion: '請稍後再試或聯繫技術支援',
      });

      toast({
        title: "付款失敗",
        description: message,
        variant: "destructive",
        action: (
          <ToastAction
            altText="複製錯誤"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
              } catch {
                // ignore (clipboard may be blocked)
              }
            }}
          >
            複製
          </ToastAction>
        ),
      });
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
      toast({ title: "已複製錯誤資訊" });
    } catch {
      // ignore clipboard errors
    }
  };

  const content = (
    <div className="space-y-6 py-4">
      {paymentSuccess ? (
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-primary">付款成功！</h3>
            <p className="text-sm text-muted-foreground mt-1">
              已收取 NT$ {paymentAmount.toLocaleString()}
            </p>
            {transactionId && (
              <p className="text-xs text-muted-foreground mt-2">
                交易編號: {transactionId}
              </p>
            )}
          </div>
          <Button onClick={() => onOpenChange(false)} className="w-full">
            關閉
          </Button>
        </div>
      ) : (
        <>
          {/* 訂單資訊 */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂單編號</span>
              <span className="font-medium">{order?.order_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂購人</span>
              <span className="font-medium">{order?.guest_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">訂單金額</span>
              <span className="font-medium">NT$ {order?.final_price.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已付金額</span>
              <span className="font-medium">NT$ {(order?.paid_amount || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>待付金額</span>
              <span className="text-primary">NT$ {unpaidAmount.toLocaleString()}</span>
            </div>
          </div>

          {unpaidAmount <= 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>此訂單已全額付款完成</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* 付款金額選擇 */}
              <div className="space-y-3">
                <Label>付款金額</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={paymentType === 'full' ? 'default' : 'outline'}
                    onClick={() => setPaymentType('full')}
                    className="h-auto py-2"
                  >
                    <div className="text-left">
                      <div className="text-sm">全額付款</div>
                      <div className="text-xs opacity-80">NT$ {unpaidAmount.toLocaleString()}</div>
                    </div>
                  </Button>
                  {depositAmount > 0 && order?.paid_amount === 0 && (
                    <Button
                      type="button"
                      variant={paymentType === 'deposit' ? 'default' : 'outline'}
                      onClick={() => setPaymentType('deposit')}
                      className="h-auto py-2"
                    >
                      <div className="text-left">
                        <div className="text-sm">訂金</div>
                        <div className="text-xs opacity-80">NT$ {depositAmount.toLocaleString()}</div>
                      </div>
                    </Button>
                  )}
                  {depositAmount > 0 && order?.paid_amount === depositAmount && (
                    <Button
                      type="button"
                      variant={paymentType === 'balance' ? 'default' : 'outline'}
                      onClick={() => setPaymentType('balance')}
                      className="h-auto py-2"
                    >
                      <div className="text-left">
                        <div className="text-sm">尾款</div>
                        <div className="text-xs opacity-80">NT$ {balanceAmount.toLocaleString()}</div>
                      </div>
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={paymentType === 'custom' ? 'default' : 'outline'}
                    onClick={() => setPaymentType('custom')}
                    className="h-auto py-2"
                  >
                    <div className="text-left">
                      <div className="text-sm">自訂金額</div>
                      <div className="text-xs opacity-80">輸入金額</div>
                    </div>
                  </Button>
                </div>

                {paymentType === 'custom' && (
                  <Input
                    type="number"
                    placeholder="輸入付款金額"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    min={1}
                    max={unpaidAmount}
                  />
                )}

                {paymentAmount > 0 && (
                  <div className="text-center py-2 bg-primary/10 rounded-lg">
                    <span className="text-sm text-muted-foreground">本次收款金額：</span>
                    <span className="text-lg font-bold text-primary ml-2">
                      NT$ {paymentAmount.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* 信用卡表單 */}
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  信用卡資訊
                </Label>
                
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">卡號</Label>
                    <div 
                      id="admin-card-number" 
                      className="h-10 px-3 py-2 border rounded-md bg-background"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">有效期限</Label>
                      <div 
                        id="admin-card-expiry" 
                        className="h-10 px-3 py-2 border rounded-md bg-background"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">安全碼</Label>
                      <div 
                        id="admin-card-ccv" 
                        className="h-10 px-3 py-2 border rounded-md bg-background"
                      />
                    </div>
                  </div>
                </div>

                {((tappayConfigLoading || !isTapPayReady) && !tappayConfigError) && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>正在載入付款模組...</AlertDescription>
                  </Alert>
                )}

                {/* 錯誤顯示 */}
                {paymentError && (
                  <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="flex items-center justify-between flex-wrap gap-2">
                      <span>{paymentError.message}</span>
                      {paymentError.errorCode !== undefined && (
                        <span className="text-xs font-mono bg-destructive/10 px-2 py-0.5 rounded">
                          錯誤碼: {paymentError.errorCode}
                        </span>
                      )}
                    </AlertTitle>
                    <AlertDescription className="mt-2 space-y-3">
                      {paymentError.suggestion && (
                        <p className="text-sm">{paymentError.suggestion}</p>
                      )}
                      {paymentError.technicalMessage && (
                        <p className="text-xs font-mono text-muted-foreground bg-muted/50 p-2 rounded">
                          {paymentError.technicalMessage}
                        </p>
                      )}
                      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-destructive/20">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyErrorInfo}
                          className="text-xs h-8"
                        >
                          {copied ? (
                            <><Check className="h-3 w-3 mr-1" /> 已複製</>
                          ) : (
                            <><Copy className="h-3 w-3 mr-1" /> 複製錯誤資訊</>
                          )}
                        </Button>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span>如需協助，請聯繫技術支援</span>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* 付款按鈕 */}
              <Button
                onClick={handlePayment}
                disabled={!tappayConfig || !cardValid || isProcessing || paymentAmount <= 0 || !isTapPayReady}
                className="w-full"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    處理中...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    確認付款 NT$ {paymentAmount.toLocaleString()}
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                付款由 TapPay 安全處理，我們不會儲存您的卡片資訊
              </p>
            </>
          )}
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>線上收款</DrawerTitle>
            <DrawerDescription>使用信用卡收取訂單款項</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>線上收款</DialogTitle>
          <DialogDescription>使用信用卡收取訂單款項</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
