import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function LinePayConfirm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accommodationId, isLoading } = useSubdomain();
  const [isProcessing, setIsProcessing] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorType, setErrorType] = useState<'network' | 'payment' | 'order' | 'system' | 'unknown'>('unknown');
  const [errorSuggestion, setErrorSuggestion] = useState("");

  // 錯誤分類函數
  const classifyError = (error: any): {
    type: 'network' | 'payment' | 'order' | 'system' | 'unknown';
    message: string;
    suggestion: string;
  } => {
    const errorMsg = error?.message || String(error);
    
    if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('連線')) {
      return {
        type: 'network',
        message: '網路連線問題',
        suggestion: '請檢查您的網路連線，然後重新嘗試'
      };
    }
    
    if (errorMsg.includes('payment') || errorMsg.includes('付款') || errorMsg.includes('LINE Pay') || errorMsg.includes('確認失敗')) {
      return {
        type: 'payment',
        message: 'LINE Pay 付款處理失敗',
        suggestion: '付款未完成或被取消，請重新預訂或選擇其他付款方式'
      };
    }
    
    if (errorMsg.includes('order') || errorMsg.includes('訂單') || errorMsg.includes('insert') || errorMsg.includes('database')) {
      return {
        type: 'order',
        message: '訂單建立失敗',
        suggestion: '付款已完成但訂單建立失敗，請立即聯絡客服處理退款'
      };
    }
    
    if (errorMsg.includes('system') || errorMsg.includes('系統') || errorMsg.includes('service')) {
      return {
        type: 'system',
        message: '系統暫時無法處理',
        suggestion: '系統繁忙中，請稍後再試或聯絡客服'
      };
    }
    
    return {
      type: 'unknown',
      message: '處理過程發生錯誤',
      suggestion: '請聯絡客服並提供您的交易時間以便查詢'
    };
  };

  useEffect(() => {
    const confirmPayment = async () => {
      try {
        const transactionId = searchParams.get('transactionId');
        const orderId = searchParams.get('orderId');

        if (!transactionId || !orderId) {
          throw new Error('缺少付款資訊');
        }

        // 從 sessionStorage 取得訂單資料
        const orderDataStr = sessionStorage.getItem('pendingLinePayOrder');
        if (!orderDataStr) {
          throw new Error('找不到訂單資料');
        }

        const orderData = JSON.parse(orderDataStr);

        // 確認 LINE Pay 付款
        const { data: confirmResult, error: confirmError } = await supabase.functions.invoke(
          'process-linepay-payment',
          {
            body: {
              action: 'confirm',
              transactionId: transactionId,
              amount: orderData.finalPrice,
            },
          }
        );

        if (confirmError) {
          throw confirmError;
        }

        if (!confirmResult.success) {
          throw new Error(confirmResult.message || '付款確認失敗');
        }

        console.log('LINE Pay confirmed:', confirmResult);

        // 建立訂單（order_number 會由 trigger 自動生成）
        const orderInsertData = {
          accommodation_id: orderData.accommodationId,
          room_type_id: orderData.selectedRoom.id,
          order_number: '', // trigger 會自動生成
          check_in_date: orderData.checkInDateStr,
          check_out_date: orderData.checkOutDateStr,
          guest_name: orderData.guestInfo.name,
          guest_phone: orderData.guestInfo.phone,
          guest_email: orderData.guestInfo.email || null,
          guest_address: orderData.guestInfo.address || null,
          notes: orderData.guestInfo.notes || null,
          guest_count: orderData.totalGuests,
          total_price: orderData.totalPrice,
          discount_amount: orderData.discountAmount,
          discount_code: orderData.appliedDiscount?.code || null,
          final_price: orderData.finalPrice,
          deposit_amount: 0,
          deposit_payment_method: 'line_pay',
          balance_payment_method: null,
          payment_method: 'LINE Pay',
          payment_status: 'paid',
          paid_amount: orderData.finalPrice,
          order_status: 'confirmed',
          pet_count: orderData.petCount || 0,
          pet_plan_price: orderData.petPlanPrice || 0,
          meal_plan: orderData.selectedMealPlan || null,
          meal_plan_details: orderData.mealPlanDetailsData.length > 0 ? orderData.mealPlanDetailsData : null,
          meal_plan_total: orderData.mealPlanTotalPrice || 0,
          customer_id: orderData.customerId,
        };

        const { data: orderResult, error: orderError } = await supabase
          .from('orders')
          .insert([orderInsertData])
          .select()
          .single();

        if (orderError) {
          throw orderError;
        }

        console.log('Order created:', orderResult);

        // 清除 sessionStorage
        sessionStorage.removeItem('pendingLinePayOrder');

        // 統一寄送訂房通知信
        try {
          await supabase.functions.invoke('notify-booking-confirmation', {
            body: {
              orderId: orderResult.id,
              paymentMethodLabel: 'LINE Pay',
            },
          });
        } catch (emailError) {
          console.error('Email sending failed:', emailError);
        }

        setIsSuccess(true);
        
        toast({
          title: "付款成功",
          description: "訂單已建立完成",
        });

        // 3 秒後導向首頁
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } catch (error) {
        console.error('LINE Pay confirmation error:', error);
        
        const errorInfo = classifyError(error);
        setIsSuccess(false);
        setErrorMessage(errorInfo.message);
        setErrorType(errorInfo.type);
        setErrorSuggestion(errorInfo.suggestion);
        
        toast({
          title: "付款確認失敗",
          description: `${errorInfo.message}。${errorInfo.suggestion}`,
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    };

    if (!isLoading && accommodationId) {
      confirmPayment();
    }
  }, [searchParams, accommodationId, isLoading, navigate, toast]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-12 pb-8 px-6">
          {isProcessing ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold mb-2">處理付款中</h2>
              <p className="text-muted-foreground">請稍候，正在確認您的付款...</p>
            </div>
          ) : isSuccess ? (
            <div className="text-center">
              <div className="rounded-full bg-primary/10 p-6 inline-block mb-6">
                <CheckCircle className="h-16 w-16 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">付款成功！</h2>
              <p className="text-muted-foreground mb-6">您的訂單已成功建立</p>
              <Button onClick={() => navigate('/')} className="w-full">
                返回首頁
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="rounded-full bg-destructive/10 p-6 inline-block">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">付款處理失敗</h2>
                <p className="text-muted-foreground">{errorMessage || "無法完成付款確認"}</p>
              </div>

              {/* 錯誤詳情提示 */}
              <Alert variant={errorType === 'order' ? 'destructive' : 'default'} className="text-left">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-semibold">
                  {errorType === 'network' && '網路連線問題'}
                  {errorType === 'payment' && 'LINE Pay 付款失敗'}
                  {errorType === 'order' && '⚠️ 重要：訂單建立失敗'}
                  {errorType === 'system' && '系統處理問題'}
                  {errorType === 'unknown' && '處理失敗'}
                </AlertTitle>
                <AlertDescription>
                  <p className="mb-2">{errorSuggestion}</p>
                  
                  {errorType === 'network' && (
                    <ul className="text-xs space-y-1 mt-2 list-disc list-inside">
                      <li>檢查您的網路連線是否穩定</li>
                      <li>嘗試重新整理頁面</li>
                      <li>如問題持續，請聯絡客服</li>
                    </ul>
                  )}
                  
                  {errorType === 'payment' && (
                    <ul className="text-xs space-y-1 mt-2 list-disc list-inside">
                      <li>付款可能未完成或被取消</li>
                      <li>請檢查您的 LINE Pay 帳戶交易記錄</li>
                      <li>如有扣款但未收到訂單，請聯絡客服</li>
                    </ul>
                  )}
                  
                  {errorType === 'order' && (
                    <div className="bg-destructive/20 border border-destructive/30 rounded p-3 mt-2">
                      <p className="text-xs font-semibold mb-1">請立即採取以下行動：</p>
                      <ul className="text-xs space-y-1 list-disc list-inside">
                        <li>保存此頁面截圖</li>
                        <li>記錄交易時間：{new Date().toLocaleString('zh-TW')}</li>
                        <li>立即聯絡客服處理退款事宜</li>
                        <li>提供您的聯絡資訊以便我們追蹤</li>
                      </ul>
                    </div>
                  )}
                  
                  {errorType === 'system' && (
                    <ul className="text-xs space-y-1 mt-2 list-disc list-inside">
                      <li>系統目前繁忙中</li>
                      <li>請稍後 5-10 分鐘後再試</li>
                      <li>或選擇其他付款方式</li>
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3 pt-4">
                <Button onClick={() => navigate('/book')} className="w-full">
                  重新訂房
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                  返回首頁
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
