import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface MealPlanDetail {
  date: string;
  count: number;
  pricePerUnit: number;
  price: number;
}

interface OrderDetail {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  guest_address: string | null;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  order_status: string;
  payment_status: string;
  total_price: number;
  discount_amount: number;
  discount_code: string | null;
  final_price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_method: string | null;
  meal_plan: string | null;
  notes: string | null;
  order_date: string;
  room_assigned: boolean;
  pet_count: number;
  pet_plan_price: number;
  meal_plan_details: MealPlanDetail[];
  meal_plan_total: number;
  room_types: {
    name: string;
    name_en: string | null;
  } | null;
}

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            room_types (
              name,
              name_en
            )
          `)
          .eq("id", orderId)
          .maybeSingle();

        if (error) throw error;
        
        if (data) {
          const orderData = data as any;
          setOrder({
            ...orderData,
            pet_count: orderData.pet_count || 0,
            pet_plan_price: orderData.pet_plan_price || 0,
            meal_plan_details: orderData.meal_plan_details || [],
            meal_plan_total: orderData.meal_plan_total || 0,
          } as OrderDetail);
        }
      } catch (error) {
        console.error("Error fetching order:", error);
        toast({
          title: "載入失敗",
          description: "無法載入訂單資料",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, toast]);

  const getPaymentStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      unpaid: { label: "未付款", variant: "destructive" },
      deposit_paid: { label: "已付訂金", variant: "outline" },
      paid: { label: "已付清", variant: "default" },
      overdue: { label: "已逾期", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getOrderStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "待確認",
      confirmed: "已確認",
      checked_in: "已入住",
      checked_out: "已退房",
      cancelled: "已取消",
    };
    return statusMap[status] || status;
  };

  const handleResendConfirmation = async () => {
    if (!order || !order.guest_email) {
      toast({
        title: "無法發送郵件",
        description: "此訂單沒有電子郵件地址",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const mealPlanDetailsForEmail = (order.meal_plan_details || []).map(detail => ({
        date: format(new Date(detail.date), "MM/dd"),
        count: detail.count,
        price: detail.price
      }));

      const { error: emailError } = await supabase.functions.invoke(
        "send-booking-confirmation",
        {
          body: {
            guestName: order.guest_name,
            guestEmail: order.guest_email,
            orderNumber: order.order_number,
            roomName: order.room_types?.name || "房型資訊不完整",
            checkInDate: order.check_in_date,
            checkOutDate: order.check_out_date,
            guestCount: order.guest_count,
            mealPlan: order.meal_plan || "2_meals",
            finalPrice: order.final_price,
            depositAmount: order.deposit_amount,
            paymentMethod: order.payment_method || "未指定",
            petCount: order.pet_count > 0 ? order.pet_count : undefined,
            petPlanPrice: order.pet_plan_price > 0 ? order.pet_plan_price : undefined,
            mealPlanDetails: mealPlanDetailsForEmail.length > 0 ? mealPlanDetailsForEmail : undefined,
            mealPlanTotal: order.meal_plan_total > 0 ? order.meal_plan_total : undefined,
          },
        }
      );

      if (emailError) {
        throw emailError;
      }

      toast({
        title: "郵件發送成功",
        description: `確認信已重新發送至 ${order.guest_email}`,
      });
    } catch (error) {
      console.error("重發確認郵件失敗:", error);
      toast({
        title: "郵件發送失敗",
        description: "無法發送確認郵件，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">找不到訂單資料</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nights = Math.ceil(
    (new Date(order.check_out_date).getTime() - new Date(order.check_in_date).getTime()) / 
    (1000 * 60 * 60 * 24)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單詳情</h1>
        </div>
        {order.guest_email && (
          <Button 
            variant="outline" 
            onClick={handleResendConfirmation}
            disabled={isSendingEmail}
          >
            <Mail className="h-4 w-4 mr-2" />
            {isSendingEmail ? "發送中..." : "重發確認信"}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 訂單基本資訊 */}
        <Card>
          <CardHeader>
            <CardTitle>訂單資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">訂單編號</span>
              <span className="font-medium">{order.order_number}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">訂購日期</span>
              <span className="font-medium">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">訂單狀態</span>
              <Badge variant="outline">{getOrderStatusLabel(order.order_status)}</Badge>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">付款狀態</span>
              {getPaymentStatusBadge(order.payment_status)}
            </div>
            {order.payment_method && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">付款方式</span>
                  <span className="font-medium">{order.payment_method}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 訂購人資訊 */}
        <Card>
          <CardHeader>
            <CardTitle>訂購人資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">姓名</span>
              <span className="font-medium">{order.guest_name}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">電話</span>
              <span className="font-medium">{order.guest_phone}</span>
            </div>
            {order.guest_email && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="font-medium text-sm">{order.guest_email}</span>
                </div>
              </>
            )}
            {order.guest_address && (
              <>
                <Separator />
                <div className="flex justify-between items-start">
                  <span className="text-sm text-muted-foreground">地址</span>
                  <span className="font-medium text-sm text-right max-w-[60%]">{order.guest_address}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* 住宿資訊 */}
        <Card>
          <CardHeader>
            <CardTitle>住宿資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">房型</span>
              <span className="font-medium">{order.room_types?.name || "-"}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">入住日期</span>
              <span className="font-medium">{order.check_in_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">退房日期</span>
              <span className="font-medium">{order.check_out_date}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">住宿天數</span>
              <span className="font-medium">{nights} 晚</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">入住人數</span>
              <span className="font-medium">{order.guest_count} 人</span>
            </div>
            {order.meal_plan && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">餐食方案</span>
                  <span className="font-medium">{order.meal_plan}</span>
                </div>
              </>
            )}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">房間分配</span>
              <Badge variant={order.room_assigned ? "default" : "secondary"}>
                {order.room_assigned ? "已分配" : "未分配"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* 價格資訊 */}
        <Card>
          <CardHeader>
            <CardTitle>價格明細</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">原始金額</span>
              <span className="font-medium">NT$ {order.total_price.toLocaleString()}</span>
            </div>
            {order.discount_amount > 0 && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">折扣金額</span>
                  <span className="font-medium text-destructive">- NT$ {order.discount_amount.toLocaleString()}</span>
                </div>
                {order.discount_code && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">折扣碼</span>
                    <Badge variant="outline">{order.discount_code}</Badge>
                  </div>
                )}
              </>
            )}
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">最終金額</span>
              <span className="font-bold text-lg">NT$ {order.final_price.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">訂金金額</span>
              <span className="font-medium">NT$ {order.deposit_amount.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">已付金額</span>
              <span className="font-medium text-primary">NT$ {order.paid_amount.toLocaleString()}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">待付金額</span>
              <span className="font-medium text-destructive">
                NT$ {(order.final_price - order.paid_amount).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 加購方案 */}
      <Card>
        <CardHeader>
          <CardTitle>加購方案</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(order.pet_count > 0 || order.meal_plan_total > 0) ? (
            <>
              {order.pet_count > 0 && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">🐾 寵物方案</span>
                      <Badge variant="outline">{order.pet_count} 隻 × {nights} 晚</Badge>
                    </div>
                    <div className="flex justify-between items-center pl-4">
                      <span className="text-sm text-muted-foreground">小計</span>
                      <span className="font-medium">NT$ {order.pet_plan_price.toLocaleString()}</span>
                    </div>
                  </div>
                  {order.meal_plan_total > 0 && <Separator />}
                </>
              )}
              
              {order.meal_plan_total > 0 && order.meal_plan_details && order.meal_plan_details.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">🍖 烤肉餐食方案</span>
                  </div>
                  <div className="pl-4 space-y-2">
                    {order.meal_plan_details.map((detail, index) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                          {format(new Date(detail.date), "yyyy/MM/dd")} - {detail.count} 份
                        </span>
                        <span className="font-medium">NT$ {detail.price.toLocaleString()}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">小計</span>
                      <span className="font-medium">NT$ {order.meal_plan_total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
              
              <Separator />
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm font-semibold">加購總計</span>
                <span className="font-bold text-lg text-primary">
                  NT$ {(order.pet_plan_price + order.meal_plan_total).toLocaleString()}
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">此訂單無加購方案</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 備註 */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>訂單備註</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OrderDetail;
