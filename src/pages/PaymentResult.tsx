import { useEffect, useMemo, useState } from "react";
import { hapticSuccess, hapticError } from "@/lib/native/haptics";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddToCalendarButton from "@/components/booking/AddToCalendarButton";
import BookingLanguageSwitch from "@/components/booking/BookingLanguageSwitch";
import { BookingLocaleProvider, useBookingLocale } from "@/contexts/BookingLocaleContext";
import { useTranslatedFields } from "@/hooks/use-translated-fields";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Home, RotateCw, ClipboardList, Calendar, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearNativePaymentDraft,
  handoffPaymentResultToApp,
  isNativeApp,
  loadNativePaymentDraft,
} from "@/lib/nativePayment";
import { format } from "date-fns";

type PaymentStatus = 'loading' | 'success' | 'failed' | 'error' | 'creating_order';
type PaymentSource = 'booking' | 'admin' | 'test' | 'unknown';

/** 錯誤訊息一律以字典 key 保存，語言切換時才能整頁跟著換；raw 為後端原始訊息（僅中文模式顯示） */
interface ErrorInfo {
  key: string;
  raw?: string;
}

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
  accommodationId?: string;
  roomName: string;
  roomId?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  finalPrice: number;
  emailSent: boolean;
}

function PaymentResultInner() {
  const { t, lang, dateLocale } = useBookingLocale();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PaymentStatus>('loading');

  // 原生 App：付款成功／失敗給予震動回饋
  useEffect(() => {
    if (status === 'success') void hapticSuccess();
    else if (status === 'failed' || status === 'error') void hapticError();
  }, [status]);
  const [transaction, setTransaction] = useState<TransactionInfo | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [paymentSource, setPaymentSource] = useState<PaymentSource>('unknown');
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingOrderResult | null>(null);

  // Get rec_trade_id from TapPay redirect URL params
  const recTradeId = searchParams.get('rec_trade_id');
  const orderNumber = searchParams.get('order_number');
  const source = searchParams.get('source');

  // 動態內容（後台維護的房型名稱）：英文模式才送翻譯，中文模式完全不呼叫
  const dynamicFields = useMemo(
    () =>
      bookingResult?.roomName
        ? [
            {
              table: "room_types",
              column: "name",
              id: bookingResult.roomId || bookingResult.roomName,
              text: bookingResult.roomName,
            },
          ]
        : [],
    [bookingResult?.roomName, bookingResult?.roomId],
  );
  const { tf } = useTranslatedFields(dynamicFields);

  /** 顯示錯誤訊息：英文模式一律用字典（避免殘留中文），中文模式優先顯示後端原文 */
  const showError = (info: ErrorInfo | null, fallbackKey: string) => {
    if (!info) return t(fallbackKey);
    if (lang === "en") return t(info.key);
    return info.raw || t(info.key);
  };

  useEffect(() => {
    // App 3DS 回程：本頁只負責把結果以深層連結交回 App（不建立訂單）
    if (searchParams.get('native') === '1') {
      handoffPaymentResultToApp({
        rec_trade_id: recTradeId || undefined,
        order_number: orderNumber || undefined,
        status: searchParams.get('status') || (recTradeId ? 'success' : 'failed'),
        error: recTradeId ? undefined : 'missing_rec_trade_id',
      });
      return;
    }

    // 團購信用卡 3DS 回程：付款成功後才建立正式訂單，
    // 完成邏輯全在後端（group-buy-complete-paid-order），本頁只轉導結果。
    if (source === 'group_buy') {
      const draftId = searchParams.get('draft');
      setPaymentSource('unknown');
      setStatus('creating_order');
      void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('group-buy-complete-paid-order', {
            body: { draftId, recTradeId },
          });
          const payload: any = data;
          if (error && !payload) throw error;
          if (payload?.success && payload.orderNumber) {
            navigate(`/g/order/${payload.orderNumber}/confirmed`, {
              state: { fromCreditCard: true, result: payload },
              replace: true,
            });
            return;
          }
          setStatus('failed');
          setErrorInfo({
            key: 'booking.payment.msg.groupBuyConfirmFailed',
            raw: payload?.error || undefined,
          });
        } catch (e) {
          console.error('[group-buy] complete paid order failed', e);
          setStatus('failed');
          setErrorInfo({ key: 'booking.payment.msg.groupBuyNetworkFailed' });
        }
      })();
      return;
    }


    // Determine payment source and load pending data
    let detectedSource: PaymentSource = 'unknown';
    let pending: PendingPayment | null = null;
    let pendingBooking: PendingBookingData | null = null;
    let pendingPaidOrder: any = null;

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
      const paidOrderData = isNativeApp()
        ? loadNativePaymentDraft<PendingBookingData & Record<string, unknown>>()
        : sessionStorage.getItem('pending_paid_order_3ds');
      const bookingData = sessionStorage.getItem('pending_booking_3ds');
      if (paidOrderData) {
        detectedSource = 'booking';
        if (typeof paidOrderData === 'string') {
          try {
            pendingPaidOrder = JSON.parse(paidOrderData);
          } catch (e) {
            console.error('Failed to parse pending_paid_order_3ds:', e);
          }
        } else pendingPaidOrder = paidOrderData;
      } else if (bookingData) {
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
        setErrorInfo({ key: 'booking.payment.msg.missingRecTradeId' });
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
          if (detectedSource === 'booking' && pendingPaidOrder) {
            // 立即請款 3DS 回程：以 post-charge 模式建立訂單
            setStatus('creating_order');
            try {
              const { data: orderResult, error: orderError } = await supabase.functions.invoke(
                'create-paid-order',
                {
                  body: {
                    ...pendingPaidOrder,
                    alreadyChargedRecTradeId: data.recTradeId,
                  },
                }
              );

              if (orderError) throw orderError;
              if (!orderResult?.success) throw new Error(orderResult?.message || '訂單建立失敗');

              setBookingResult({
                orderNumber: orderResult.order.order_number,
                accommodationId: pendingPaidOrder.accommodationId,
                roomName: pendingPaidOrder.selectedRoom?.name || '',
                roomId: pendingPaidOrder.selectedRoom?.id,
                checkInDate: orderResult.order.check_in_date || pendingPaidOrder.checkInDate,
                checkOutDate: orderResult.order.check_out_date || pendingPaidOrder.checkOutDate,
                nights: pendingPaidOrder.nights,
                finalPrice: orderResult.order.final_price || pendingPaidOrder.finalPrice,
                emailSent: orderResult.emailSent ?? true,
              });
              setStatus('success');
              sessionStorage.removeItem('pending_paid_order_3ds');
              clearNativePaymentDraft();
            } catch (orderErr: any) {
              console.error('Paid order creation failed:', orderErr);
              setStatus('error');
              setErrorInfo({
                key: 'booking.payment.msg.paidButOrderFailed',
                raw: orderErr?.message || undefined,
              });
            }
          } else if (detectedSource === 'booking' && pendingBooking) {

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
                  accommodationId: pendingBooking.accommodationId,
                  roomName: orderResult.order.room_name || pendingBooking.selectedRoom.name,
                  roomId: pendingBooking.selectedRoom?.id,
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
              setErrorInfo({
                key: 'booking.payment.msg.paidButOrderFailed',
                raw: orderErr?.message || undefined,
              });
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
                                         newPaidAmount > 0 ? 'deposit_paid' : 'unpaid';

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
          setErrorInfo({ key: 'booking.payment.msg.verifyFailed', raw: data.message || undefined });
        }
      } catch (err: any) {
        console.error('Query transaction error:', err);
        setStatus('error');
        setErrorInfo({ key: 'booking.payment.msg.queryError', raw: err?.message || undefined });
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
      return format(
        new Date(dateStr),
        lang === 'en' ? 'EEEE, d MMMM yyyy' : 'yyyy年M月d日 (EEEE)',
        { locale: dateLocale },
      );
    } catch {
      return dateStr;
    }
  };

  const LangBar = () => (
    <div className="absolute top-4 right-4">
      <BookingLanguageSwitch compact />
    </div>
  );

  // Loading state
  if (status === 'loading') {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
        <LangBar />
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h2 className="text-xl font-semibold">{t('booking.payment.loading.title')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('booking.payment.loading.desc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Creating order state
  if (status === 'creating_order') {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <LangBar />
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="relative">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <Loader2 className="h-6 w-6 animate-spin text-primary absolute -right-2 -bottom-1" />
            </div>
            <h2 className="text-xl font-semibold text-green-700">
              {t('booking.payment.creating.title')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('booking.payment.creating.desc')}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state for booking
  if (status === 'success' && paymentSource === 'booking' && bookingResult) {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <LangBar />
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">
              {t('booking.payment.booking.title')}
            </CardTitle>
            <CardDescription>
              {t('booking.payment.booking.desc')}
              {bookingResult.emailSent && (
                <span className="block mt-1 text-green-600">
                  {t('booking.payment.booking.emailSent')}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3 pb-2 border-b">
                <span className="text-lg font-semibold">
                  {t('booking.payment.field.orderNumber')}
                </span>
                <span className="font-mono text-lg text-primary">{bookingResult.orderNumber}</span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <span className="text-muted-foreground">
                      {t('booking.payment.field.roomType')}
                    </span>
                    <span className="font-medium">
                      {dynamicFields.length > 0 ? tf(dynamicFields[0]) : bookingResult.roomName}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div>
                      <span className="text-muted-foreground">
                        {t('booking.payment.field.checkIn')}
                      </span>
                      <span className="font-medium">{formatDisplayDate(bookingResult.checkInDate)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t('booking.payment.field.checkOut')}
                      </span>
                      <span className="font-medium">{formatDisplayDate(bookingResult.checkOutDate)}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {t('booking.payment.field.nights', { nights: bookingResult.nights })}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">
                    {t('booking.payment.field.paidAmount')}
                  </span>
                  <span className="font-semibold text-lg">NT$ {bookingResult.finalPrice.toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            {transaction && (
              <div className="bg-muted/30 rounded-lg p-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t('booking.payment.field.transactionId')}</span>
                  <span className="font-mono">{transaction.recTradeId}</span>
                </div>
                {transaction.authCode && (
                  <div className="flex justify-between">
                    <span>{t('booking.payment.field.authCode')}</span>
                    <span className="font-mono">{transaction.authCode}</span>
                  </div>
                )}
              </div>
            )}
            
            <AddToCalendarButton
              className="w-full"
              size="lg"
              orderNumber={bookingResult.orderNumber}
              accommodationId={bookingResult.accommodationId}
              checkInDate={bookingResult.checkInDate}
              checkOutDate={bookingResult.checkOutDate}
            />

            <Button onClick={handleHome} className="w-full" size="lg">
              <Home className="h-4 w-4 mr-2" />
              {t('booking.payment.action.home')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Generic success state (admin or test)
  if (status === 'success') {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <LangBar />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-700">
              {t('booking.payment.success.title')}
            </CardTitle>
            <CardDescription>
              {paymentSource === 'admin'
                ? t('booking.payment.success.desc.admin')
                : t('booking.payment.success.desc.general')
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              {transaction?.amount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('booking.payment.field.amount')}
                  </span>
                  <span className="font-semibold">NT$ {transaction.amount.toLocaleString()}</span>
                </div>
              )}
              {transaction?.orderNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('booking.payment.field.orderNumber')}
                  </span>
                  <span className="font-mono text-xs">{transaction.orderNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('booking.payment.field.transactionId')}
                </span>
                <span className="font-mono text-xs">{transaction?.recTradeId}</span>
              </div>
              {transaction?.authCode && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('booking.payment.field.authCode')}
                  </span>
                  <span className="font-mono">{transaction.authCode}</span>
                </div>
              )}
            </div>
            
            {paymentSource === 'admin' ? (
              <Button onClick={handleViewOrders} className="w-full">
                <ClipboardList className="h-4 w-4 mr-2" />
                {t('booking.payment.action.orders')}
              </Button>
            ) : (
              <Button onClick={handleHome} className="w-full">
                <Home className="h-4 w-4 mr-2" />
                {t('booking.payment.action.home')}
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
      <div className="relative min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <LangBar />
        <Card className="w-full max-w-md">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <XCircle className="h-10 w-10 text-orange-600" />
            </div>
            <CardTitle className="text-2xl text-orange-700">
              {t('booking.payment.failed.title')}
            </CardTitle>
            <CardDescription>
              {showError(errorInfo, 'booking.payment.failed.desc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {transaction && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                {transaction.amount && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('booking.payment.field.amount')}
                    </span>
                    <span className="font-semibold">NT$ {transaction.amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('booking.payment.field.transactionId')}
                  </span>
                  <span className="font-mono text-xs">{transaction.recTradeId}</span>
                </div>
                {transaction.orderNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t('booking.payment.field.orderNumber')}
                    </span>
                    <span className="font-mono text-xs">{transaction.orderNumber}</span>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleHome} className="flex-1">
                <Home className="h-4 w-4 mr-2" />
                {t('booking.payment.action.home')}
              </Button>
              <Button onClick={handleRetry} className="flex-1">
                <RotateCw className="h-4 w-4 mr-2" />
                {t('booking.payment.action.retryPayment')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
      <LangBar />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl text-red-700">
            {t('booking.payment.error.title')}
          </CardTitle>
          <CardDescription>
            {showError(errorInfo, 'booking.payment.error.desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t('booking.payment.error.contact')}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleHome} className="flex-1">
              <Home className="h-4 w-4 mr-2" />
              {t('booking.payment.action.home')}
            </Button>
            <Button onClick={handleRetry} className="flex-1">
              <RotateCw className="h-4 w-4 mr-2" />
              {t('booking.payment.action.retry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentResult() {
  return (
    <BookingLocaleProvider>
      <PaymentResultInner />
    </BookingLocaleProvider>
  );
}
