import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LinePayConfirm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accommodationId, isLoading } = useSubdomain();
  const [isProcessing, setIsProcessing] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
          deposit_amount: orderData.depositAmount,
          payment_method: 'Line Pay',
          payment_status: 'paid',
          paid_amount: orderData.finalPrice,
          order_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
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

        // 發送確認信
        try {
          await supabase.functions.invoke('send-booking-confirmation', {
            body: {
              orderId: orderResult.id,
              orderNumber: orderResult.order_number,
              guestEmail: orderData.guestInfo.email,
              guestName: orderData.guestInfo.name,
              roomTypeName: orderData.selectedRoom.name,
              checkInDate: orderData.checkInDateStr,
              checkOutDate: orderData.checkOutDateStr,
              totalPrice: orderData.finalPrice,
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
        setIsSuccess(false);
        setErrorMessage(error instanceof Error ? error.message : '付款確認過程發生錯誤');
        
        toast({
          title: "付款確認失敗",
          description: error instanceof Error ? error.message : '付款確認過程發生錯誤',
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
            <div className="text-center">
              <div className="rounded-full bg-destructive/10 p-6 inline-block mb-6">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold mb-2">付款失敗</h2>
              <p className="text-muted-foreground mb-6">{errorMessage}</p>
              <div className="space-y-3">
                <Button onClick={() => navigate('/booking')} className="w-full">
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
