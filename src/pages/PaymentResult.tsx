import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Home, RotateCw, ClipboardList, Calendar, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

type PaymentStatus = 'loading' | 'success' | 'failed' | 'error' | 'creating_order';
type PaymentSource = 'booking' | 'admin' | 'test' | 'unknown';

interface TransactionInfo {
  recTradeId: string;
  bankTransactionId?: string;
  orderNumber?: string;
  amount?: number;
  authCode?: string;
}

interface PendingPayment {
  orderId?: string;
  orderNumber?: string;
  amount?: number;
  source?: string;
}

interface PendingBookingData {
  accommodationId: string;
  selectedRoom: { id: string; name: string };
  checkInDate: string;
  checkOutDate: string;
  guestInfo: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  };
  mealPlan: string;
  mealPlanDetails: Array<{ date: string; count: number; price: number }>;
  mealPlanTotal: number;
  packageId?: string | null;
  petCount: number;
  petPlanPrice: number;
  finalPrice: number;
  nights: number;
  discountCode?: string;
  discountAmount: number;
  totalPrice?: number;
  depositAmount?: number;
  totalGuests?: number;
  customerId?: string;
}

interface BookingOrderResult {
  orderNumber: string;
  roomName: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  finalPrice: number;
  emailSent: boolean;
}

export default function PaymentResult() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PaymentStatus>('loading');
  const [transaction, setTransaction] = useState<TransactionInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('unknown');
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingOrderResult | null>(null);

  // Get rec_trade_id from TapPay redirect URL params
  const recTradeId = searchParams.get('rec_trade_id');
  const orderNumber = searchParams.get('order_number');
  const source = searchParams.get('source');

  useEffect(() => {
    // Determine payment source and load pending data
    let detectedSource: PaymentSource = 'unknown';
    let pending: PendingPayment | null = null;
    let pendingBooking: PendingBookingData | null = null;

    if (source === 'admin') {
      detectedSource = 'admin';
      const storedData = sessionStorage.getItem('pending_payment');
      if (storedData) {
        try {
          pending = JSON.parse(storedData);
        } catch (e) {
          console.error('Failed to parse pending_payment:', e);
        }
      }
    } else {
      const bookingData = sessionStorage.getItem('pending_booking_3ds');
      if (bookingData) {
        detectedSource = 'booking';
        try {
          pendingBooking = JSON.parse(bookingData);
        } catch (e) {
          console.error('Failed to parse pending_booking_3ds:', e);
        }
      } else {
        detectedSource = 'test';
      }
    }

    setPaymentSource(detectedSource);
    setPendingPayment(pending);

    const processPaymentResult = async () => {
      if (!recTradeId) {
        setStatus('error');
        setErrorMessage('缺少交易編號，無法查詢付款結果');
        return;
      }

      try {
        // Query TapPay for transaction status
        const { data, error } = await supabase.functions.invoke('tappay-query', {
          body: { recTradeId },
        });

        if (error) throw error;

        if (data.success && data.paymentSuccess) {
          const txInfo: TransactionInfo = {
            recTradeId: data.recTradeId,
            bankTransactionId: data.bankTransactionId,
            orderNumber: data.orderNumber || orderNumber || pending?.orderNumber,
            amount: data.amount || pending?.amount,
            authCode: data.authCode,
          };
          setTransaction(txInfo);

          // Handle based on source
          if (detectedSource === 'booking' && pendingBooking) {
            // Create order via edge function
            setStatus('creating_order');
            
            try {
              const { data: orderResult, error: orderError } = await supabase.functions.invoke(
                'complete-3ds-booking',
                {
                  body: {
                    ...pendingBooking,
                    recTradeId: data.recTradeId,
                    authCode: data.authCode,
                  },
                }
              );

              if (orderError) throw orderError;

              if (orderResult.success) {
                setBookingResult({
                  orderNumber: orderResult.order.order_number,
                  roomName: orderResult.order.room_name || pendingBooking.selectedRoom.name,
                  checkInDate: orderResult.order.check_in_date || pendingBooking.checkInDate,
                  checkOutDate: orderResult.order.check_out_date || pendingBooking.checkOutDate,
                  nights: orderResult.order.nights || pendingBooking.nights,
                  finalPrice: orderResult.order.final_price || pendingBooking.finalPrice,
                  emailSent: orderResult.emailSent,
                });
                setStatus('success');
                
                // Clear pending booking data
                sessionStorage.removeItem('pending_booking_3ds');
              } else {
                throw new Error(orderResult.message || '訂單建立失敗');
              }
            } catch (orderErr: any) {
              console.error('Order creation failed:', orderErr);
              setStatus('error');
              setErrorMessage(orderErr.message || '付款成功但訂單建立失敗，請聯繫客服');
            }
          } else if (detectedSource === 'admin' && pending?.orderId && pending?.amount) {
            // Update order payment status for admin payments
            try {
              const { data: orderData } = await supabase
                .from('orders')
                .select('final_price, paid_amount')
                .eq('id', pending.orderId)
                .single();

              if (orderData) {
                const newPaidAmount = (orderData.paid_amount || 0) + pending.amount;
                const newPaymentStatus = newPaidAmount >= orderData.final_price ? 'paid' :
                                         newPaidAmount > 0 ? 'partial' : 'unpaid';

                await supabase
                  .from('orders')
                  .update({
                    paid_amount: newPaidAmount,
                    payment_status: newPaymentStatus,
                    balance_payment_method: '信用卡(3D驗證)',
                  })
                  .eq('id', pending.orderId);
              }
              setStatus('success');
            } catch (updateErr) {
              console.error('Failed to update order after 3DS:', updateErr);
              setStatus('success'); // Still show success since payment went through
            }

            // Clear stored pending data
            sessionStorage.removeItem('pending_payment');
          } else {
            // Test payment or unknown source
            setStatus('success');
          }
        } else {
          setStatus('failed');
          setTransaction({ 
            recTradeId, 
            orderNumber: data.orderNumber || orderNumber || pending?.orderNumber,
            amount: pending?.amount || pendingBooking?.finalPrice,
          });
          setErrorMessage(data.message || '付款驗證失敗');
        }
      } catch (err: any) {
        console.error('Query transaction error:', err);
        setStatus('error');
        setErrorMessage(err.message || '查詢交易狀態時發生錯誤');
      }
    };

    processPaymentResult();
  }, [recTradeId, orderNumber, source]);

  const handleRetry = () => {
    if (paymentSource === 'admin') {
      navigate('/orders');
    } else if (paymentSource === 'booking') {
      navigate('/book?step=payment');
    } else {
      navigate(-1);
    }
  };

  const handleHome = () => {
    navigate('/');
  };

  const handleViewOrders = () => {
    navigate('/orders');
  };

  const formatDisplayDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy年M月d日 (EEEE)', { locale: zhTW });
    } catch {
      return dateStr;
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">正在確認付款結果...</h2>
            <p className="text-muted-foreground text-sm">
              請稍候，我們正在向銀行確認您的交易狀態
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Creating order state
  if (status === 'creating_order') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="relative">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <Loader2 className="h-6 w-6 animate-spin text-primary absolute -right-2 -bottom-1" />
            </div>
            <h2 className="text-xl font-semibold text-green-700">付款成功！</h2>
            <p className="text-muted-foreground text-sm">
              正在為您建立訂單，請稍候...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state for booking
  if (status === 'success' && paymentSource === 'booking' && bookingResult) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">訂房成功！</CardTitle>
            <CardDescription>
              感謝您的預訂，期待您的到來
              {bookingResult.emailSent && (
                <span className="block mt-1 text-green-600">
                  確認郵件已發送至您的信箱
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 pb-2 border-b">
                <span className="text-lg font-semibold">訂單編號</span>
                <span className="font-mono text-lg text-primary">{bookingResult.orderNumber}</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">房型：</span>
                    <span className="font-medium">{bookingResult.roomName}</span>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div>
                      <span className="text-muted-foreground">入住：</span>
                      <span className="font-medium">{formatDisplayDate(bookingResult.checkInDate)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">退房：</span>
                      <span className="font-medium">{formatDisplayDate(bookingResult.checkOutDate)}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">共 {bookingResult.nights} 晚</span>
                  </div>
                </div>
                
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">已付金額</span>
                  <span className="font-semibold text-lg">NT$ {bookingResult.finalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {transaction && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>交易編號</span>
                  <span className="font-mono">{transaction.recTradeId}</span>
                </div>
                {transaction.authCode && (
                  <div className="flex justify-between">
                    <span>授權碼</span>
                    <span className="font-mono">{transaction.authCode}</span>
                  </div>
                )}
              </div>
            )}
            
            <Button onClick={handleHome} className="w-full" size="lg">
              <Home className="h-4 w-4 mr-2" />
              返回首頁
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Generic success state (admin or test)
  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">付款成功！</CardTitle>
            <CardDescription>
              {paymentSource === 'admin' 
                ? '訂單付款已完成，付款狀態已自動更新'
                : '您的付款已完成，感謝您的訂購'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              {transaction?.amount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">付款金額</span>
                  <span className="font-semibold">NT$ {transaction.amount.toLocaleString()}</span>
                </div>
              )}
              {transaction?.orderNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">訂單編號</span>
                  <span className="font-mono text-xs">{transaction.orderNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">交易編號</span>
                <span className="font-mono text-xs">{transaction?.recTradeId}</span>
              </div>
              {transaction?.authCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">授權碼</span>
                  <span className="font-mono">{transaction.authCode}</span>
                </div>
              )}
            </div>
            
            {paymentSource === 'admin' ? (
              <Button onClick={handleViewOrders} className="w-full">
                <ClipboardList className="h-4 w-4 mr-2" />
                返回訂單管理
              </Button>
            ) : (
              <Button onClick={handleHome} className="w-full">
                <Home className="h-4 w-4 mr-2" />
                返回首頁
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Failed state
  if (status === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-orange-600" />
            </div>
            <CardTitle className="text-2xl text-orange-700">付款未完成</CardTitle>
            <CardDescription>
              {errorMessage || '您的付款未能成功完成'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transaction && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                {transaction.amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">付款金額</span>
                    <span className="font-semibold">NT$ {transaction.amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">交易編號</span>
                  <span className="font-mono text-xs">{transaction.recTradeId}</span>
                </div>
                {transaction.orderNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">訂單編號</span>
                    <span className="font-mono text-xs">{transaction.orderNumber}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleHome} className="flex-1">
                <Home className="h-4 w-4 mr-2" />
                返回首頁
              </Button>
              <Button onClick={handleRetry} className="flex-1">
                <RotateCw className="h-4 w-4 mr-2" />
                重新付款
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-700">處理失敗</CardTitle>
          <CardDescription>
            {errorMessage || '無法確認付款狀態'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            如果您已完成付款，請聯繫客服確認訂單狀態。
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleHome} className="flex-1">
              <Home className="h-4 w-4 mr-2" />
              返回首頁
            </Button>
            <Button onClick={handleRetry} className="flex-1">
              <RotateCw className="h-4 w-4 mr-2" />
              重試
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
