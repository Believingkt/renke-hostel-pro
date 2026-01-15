import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Loader2, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
  
  const [isTapPayReady, setIsTapPayReady] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentType, setPaymentType] = useState<'full' | 'deposit' | 'balance' | 'custom'>('full');
  const [customAmount, setCustomAmount] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');

  // 計算待付金額
  const unpaidAmount = order ? order.final_price - (order.paid_amount || 0) : 0;
  const depositAmount = order?.deposit_amount || 0;
  const balanceAmount = order ? order.final_price - depositAmount : 0;

  // 初始化 TapPay SDK
  useEffect(() => {
    if (!open) return;

      const loadTapPaySDK = () => {
        if (window.TPDirect) {
          console.log('TapPay SDK already loaded (production)');
          window.TPDirect.setupSDK('165714', 'app_zYcYVG6FPf8I3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP', 'production');
          setIsTapPayReady(true);
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://js.tappaysdk.com/sdk/tpdirect/v5.18.0';
        script.async = true;
        script.onload = () => {
          if (window.TPDirect) {
            console.log('TapPay SDK loaded (production)');
            window.TPDirect.setupSDK('165714', 'app_zYcYVG6FPf8I3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP', 'production');
            setIsTapPayReady(true);
          }
        };
        document.body.appendChild(script);
      };

    loadTapPaySDK();
  }, [open]);

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
    }
  }, [open]);

  const handlePayment = async () => {
    if (!order || !window.TPDirect || paymentAmount <= 0) return;

    setIsProcessing(true);

    try {
      // 獲取 Prime
      const prime = await new Promise<string>((resolve, reject) => {
        window.TPDirect.card.getPrime((result: any) => {
          console.log('[TapPay][Admin] getPrime result:', result);
          if (result.status !== 0) {
            const host = typeof window !== 'undefined' ? window.location.hostname : '';
            const appId = '165714';
            const appKey = 'app_zYcYVG6FPf8I3WOti1Xgda3ycBBnz43ovMBehd7XzxkuwB2wzV857jdGWKWP';
            const appKeyPrefix = appKey.substring(0, 6);
            const sdkVersion = 'v5.18.0';
            const tpDirectLoaded = typeof window.TPDirect !== 'undefined' ? 'Yes' : 'No';
            const env = 'production';
            reject(
              new Error(
                `TapPay 授權失敗 (${result.status}): ${result.msg || 'unknown'} | domain: ${host} | appId: ${appId} | appKey: ${appKeyPrefix}... | SDK: ${sdkVersion} | TPDirect: ${tpDirectLoaded} | env: ${env}`
              )
            );
            return;
          }
          resolve(result.card.prime);
        });
      });

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
        throw new Error(data.message || '付款失敗');
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast({
        title: "付款失敗",
        description: error.message || "處理付款時發生錯誤",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
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

                {!isTapPayReady && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertDescription>正在載入付款模組...</AlertDescription>
                  </Alert>
                )}
              </div>

              {/* 付款按鈕 */}
              <Button
                onClick={handlePayment}
                disabled={!cardValid || isProcessing || paymentAmount <= 0 || !isTapPayReady}
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
