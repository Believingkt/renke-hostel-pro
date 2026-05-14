import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, ArrowLeft, Calendar, Users, Phone, Mail, CreditCard, BanknoteIcon, CheckCircle2, Clock, Home, LogOut, MessageCircle, Mic, Volume2, User, ClipboardList, Settings, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { DevAccommodationSwitcher } from "@/components/DevAccommodationSwitcher";
import { getThemeClassByAccommodation } from "@/constants/themes";

interface OrderData {
  id: string;
  order_number: string;
  order_date: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_count: number;
  order_status: string;
  payment_status: string;
  total_price: number;
  deposit_amount: number;
  paid_amount: number;
  final_price: number;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancelled_at: string | null;
  room_types: {
    name: string;
  };
}

const OrderSearch = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromAiBooking = searchParams.get('from') === 'ai-booking';
  const { accommodationId, isLoading: subdomainLoading } = useSubdomain();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);

  // 使用共用主題常數
  const themeClass = getThemeClassByAccommodation(accommodationId);

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

  const getOrderStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      confirmed: "default",
      checked_in: "secondary",
      checked_out: "secondary",
      cancelled: "destructive",
    };
    return variantMap[status] || "outline";
  };

  const getPaymentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      unpaid: { label: "未付款", variant: "destructive" },
      deposit_paid: { label: "已付訂金", variant: "outline" },
      paid: { label: "已付款", variant: "default" },
      refunded: { label: "已退款", variant: "secondary" },
      partial_refunded: { label: "部分退款", variant: "outline" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getOrderStatusSteps = (currentStatus: string, orderData: OrderData | null) => {
    const getStepTimestamp = (status: string) => {
      if (!orderData) return null;
      switch (status) {
        case "pending":
          return orderData.order_date;
        case "confirmed":
          return orderData.confirmed_at;
        case "checked_in":
          return orderData.checked_in_at;
        case "checked_out":
          return orderData.checked_out_at;
        default:
          return null;
      }
    };

    const steps = [
      { status: "pending", label: "訂單建立", icon: Clock, description: "等待確認" },
      { status: "confirmed", label: "訂單確認", icon: CheckCircle2, description: "已確認訂單" },
      { status: "checked_in", label: "已入住", icon: Home, description: "已辦理入住" },
      { status: "checked_out", label: "已退房", icon: LogOut, description: "完成住宿" },
    ];

    const statusOrder = ["pending", "confirmed", "checked_in", "checked_out"];
    const currentIndex = statusOrder.indexOf(currentStatus);
    const isCancelled = currentStatus === "cancelled";

    return steps.map((step, index) => ({
      ...step,
      timestamp: getStepTimestamp(step.status),
      isCompleted: !isCancelled && index <= currentIndex,
      isActive: !isCancelled && index === currentIndex,
      isCancelled,
    }));
  };

  const handleSearch = async () => {
    if (!orderNumber.trim() || !phone.trim()) {
      toast.error("請輸入訂單編號和手機號碼");
      return;
    }

    setIsSearching(true);
    setOrderData(null);
    setSearchAttempted(true);

    try {
      let query = supabase
        .from("orders")
        .select(`
          id,
          order_number,
          order_date,
          check_in_date,
          check_out_date,
          guest_name,
          guest_phone,
          guest_email,
          guest_count,
          order_status,
          payment_status,
          total_price,
          deposit_amount,
          paid_amount,
          final_price,
          confirmed_at,
          checked_in_at,
          checked_out_at,
          cancelled_at,
          room_types (
            name
          )
        `)
        .eq("order_number", orderNumber.trim())
        .eq("guest_phone", phone.trim());

      if (accommodationId) {
        query = query.eq("accommodation_id", accommodationId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("查無此訂單，請確認訂單編號和手機號碼是否正確");
        return;
      }

      setOrderData(data as OrderData);
      toast.success("查詢成功");
    } catch (error) {
      console.error("Search error:", error);
      toast.error("查詢失敗，請稍後再試");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (subdomainLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-4 ${themeClass} ${fromAiBooking ? 'pb-28 md:pb-8' : ''}`}>
      <div className="max-w-2xl mx-auto">
        {!fromAiBooking && (
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回首頁
          </Button>
        )}

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Search className="h-6 w-6" />
              訂單查詢
            </CardTitle>
            <CardDescription>
              請輸入您的訂單編號和訂房時使用的手機號碼
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orderNumber">訂單編號</Label>
                <Input
                  id="orderNumber"
                  placeholder="請輸入訂房確認通知信提供的訂單編號"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">手機號碼</Label>
                <Input
                  id="phone"
                  placeholder="請輸入訂房時填寫的手機號碼"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSearch}
                disabled={isSearching}
              >
                {isSearching ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                    查詢中...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    查詢訂單
                  </>
                )}
              </Button>
            </div>

            {searchAttempted && !orderData && !isSearching && (
              <div className="bg-warning-light border border-warning/20 rounded-lg p-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-warning/10 p-3">
                    <Search className="h-8 w-8 text-warning" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-warning mb-2">
                      查無此訂單
                    </h3>
                    <p className="text-sm text-warning/80 mb-3">
                      請確認以下資訊是否正確：
                    </p>
                    <ul className="text-sm text-warning/70 text-left space-y-1 max-w-md mx-auto">
                      <li>• 訂單編號是否輸入正確</li>
                      <li>• 手機號碼是否為訂房時填寫的號碼</li>
                      <li>• 訂單是否屬於此住宿業者</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {orderData && (
              <>
                <Separator />
                <div className="space-y-6 pt-2">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">訂單資訊</h3>
                    <p className="text-sm text-muted-foreground">
                      訂單編號：{orderData.order_number}
                    </p>
                  </div>

                  {/* Order Status Timeline */}
                  <div className="bg-muted/30 rounded-lg p-6">
                    <h4 className="font-semibold mb-4 text-center">訂單狀態追蹤</h4>
                    {orderData.order_status === "cancelled" ? (
                      <div className="text-center py-4">
                        <div className="inline-flex items-center gap-2 text-destructive">
                          <div className="rounded-full bg-destructive/10 p-3">
                            <Search className="h-6 w-6" />
                          </div>
                        </div>
                        <p className="font-medium text-destructive mt-3">訂單已取消</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {orderData.cancelled_at && format(new Date(orderData.cancelled_at), "yyyy年MM月dd日 HH:mm", { locale: zhTW })}
                        </p>
                      </div>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute top-6 left-0 right-0 h-0.5 bg-border hidden md:block" />
                        <div className="absolute top-6 left-0 h-0.5 bg-primary hidden md:block transition-all duration-500" 
                          style={{ 
                            width: `${(getOrderStatusSteps(orderData.order_status, orderData).filter(s => s.isCompleted).length - 1) / 3 * 100}%` 
                          }} 
                        />
                        
                        {/* Steps */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-2 relative">
                          {getOrderStatusSteps(orderData.order_status, orderData).map((step, index) => {
                            const Icon = step.icon;
                            return (
                              <div key={step.status} className="flex flex-col items-center text-center">
                                <div className={`
                                  relative rounded-full p-3 mb-2 transition-all duration-300
                                  ${step.isCompleted 
                                    ? 'bg-primary text-primary-foreground shadow-lg' 
                                    : 'bg-muted text-muted-foreground'
                                  }
                                  ${step.isActive ? 'ring-4 ring-primary/20 scale-110' : ''}
                                `}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <p className={`
                                  text-sm font-medium mb-1
                                  ${step.isCompleted ? 'text-foreground' : 'text-muted-foreground'}
                                `}>
                                  {step.label}
                                </p>
                                <p className="text-xs text-muted-foreground hidden md:block mb-1">
                                  {step.description}
                                </p>
                                {step.timestamp && step.isCompleted && (
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(step.timestamp), "MM/dd HH:mm", { locale: zhTW })}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">入住日期</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(orderData.check_in_date), "yyyy年MM月dd日 (E)", { locale: zhTW })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">退房日期</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(orderData.check_out_date), "yyyy年MM月dd日 (E)", { locale: zhTW })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">入住人數</p>
                          <p className="text-sm text-muted-foreground">{orderData.guest_count} 位</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">聯絡電話</p>
                          <p className="text-sm text-muted-foreground">{orderData.guest_phone}</p>
                        </div>
                      </div>

                      {orderData.guest_email && (
                        <div className="flex items-start gap-3">
                          <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">電子信箱</p>
                            <p className="text-sm text-muted-foreground break-all">
                              {orderData.guest_email}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium">房型</p>
                          <p className="text-sm text-muted-foreground">
                            {orderData.room_types?.name || "未指定"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="font-semibold flex items-center gap-2">
                      <BanknoteIcon className="h-5 w-5" />
                      費用明細
                    </h4>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>訂單總額</span>
                        <span className="font-medium">NT$ {orderData.total_price.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-base font-semibold">
                        <span>最終金額</span>
                        <span className="text-primary">NT$ {orderData.final_price.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span>應付訂金</span>
                        <span className="font-medium">NT$ {orderData.deposit_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>已付金額</span>
                        <span className="font-medium text-success">NT$ {orderData.paid_amount.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-base font-semibold">
                        <span>應付餘額</span>
                        <span className="text-destructive">NT$ {(orderData.final_price - orderData.paid_amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 dark:bg-primary/10 rounded-lg p-4 text-sm">
                    <p className="font-medium mb-1 text-primary">溫馨提醒</p>
                    <p className="text-primary/80">
                      如需取消訂單或修改日期，請點擊下方按鈕與我們聯繫。
                    </p>
                  </div>

                  <div className="text-center pt-2">
                    <Button 
                      className="w-full"
                      onClick={() => window.open("https://line.me/R/ti/p/@042deypa", "_blank")}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      LINE 官方帳號
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* 開發環境住宿切換器 */}
      <DevAccommodationSwitcher />
      {/* 手機版底部 Tab（從 AI 訂房進入時顯示） */}
      {fromAiBooking && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.08)] z-50">
          <div className="flex items-center justify-around px-2 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            {/* 對話 */}
            <button
              onClick={() => navigate('/ai-booking')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <MessageCircle className="h-5 w-5" />
              <span className="text-[10px] font-medium">對話</span>
            </button>

            {/* 訂單（當前頁） */}
            <button
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-primary bg-primary/5 transition-all duration-200"
            >
              <ClipboardList className="h-5 w-5" />
              <span className="text-[10px] font-medium">訂單</span>
            </button>

            {/* 我的 */}
            <button
              onClick={() => navigate('/profile?from=ai-booking')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <UserCircle className="h-5 w-5" />
              <span className="text-[10px] font-medium">我的</span>
            </button>

            {/* 設定 */}
            <button
              onClick={() => navigate('/ai-booking?tab=settings')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all duration-200"
            >
              <Settings className="h-5 w-5" />
              <span className="text-[10px] font-medium">設定</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderSearch;
