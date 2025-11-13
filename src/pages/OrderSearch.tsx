import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, ArrowLeft, Calendar, Users, Phone, Mail, CreditCard, BanknoteIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

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
  room_types: {
    name: string;
  };
}

const OrderSearch = () => {
  const navigate = useNavigate();
  const { accommodationId, isLoading: subdomainLoading } = useSubdomain();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);

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
    };
    const config = statusConfig[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const handleSearch = async () => {
    if (!orderNumber.trim() || !phone.trim()) {
      toast.error("請輸入訂單編號和電話號碼");
      return;
    }

    if (!accommodationId) {
      toast.error("無法取得住宿資訊");
      return;
    }

    setIsSearching(true);
    setOrderData(null);
    setSearchAttempted(true);

    try {
      const { data, error } = await supabase
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
          room_types (
            name
          )
        `)
        .eq("accommodation_id", accommodationId)
        .eq("order_number", orderNumber.trim())
        .eq("guest_phone", phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error("查無此訂單，請確認訂單編號和電話號碼是否正確");
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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回首頁
        </Button>

        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Search className="h-6 w-6" />
              訂單查詢
            </CardTitle>
            <CardDescription>
              請輸入您的訂單編號和訂房時使用的電話號碼
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
                <Label htmlFor="phone">電話號碼</Label>
                <Input
                  id="phone"
                  placeholder="請輸入訂房時填寫的電話號碼"
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
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-yellow-100 dark:bg-yellow-900/30 p-3">
                    <Search className="h-8 w-8 text-yellow-600 dark:text-yellow-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
                      查無此訂單
                    </h3>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                      請確認以下資訊是否正確：
                    </p>
                    <ul className="text-sm text-yellow-700 dark:text-yellow-300 text-left space-y-1 max-w-md mx-auto">
                      <li>• 訂單編號是否輸入正確</li>
                      <li>• 電話號碼是否為訂房時填寫的號碼</li>
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
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold mb-1">訂單資訊</h3>
                      <p className="text-sm text-muted-foreground">
                        訂單編號：{orderData.order_number}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Badge variant={getOrderStatusVariant(orderData.order_status)}>
                        {getOrderStatusLabel(orderData.order_status)}
                      </Badge>
                      {getPaymentStatusBadge(orderData.payment_status)}
                    </div>
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
                      <div className="flex justify-between text-sm">
                        <span>應付訂金</span>
                        <span className="font-medium">NT$ {orderData.deposit_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>已付金額</span>
                        <span className="font-medium text-primary">NT$ {orderData.paid_amount.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-base font-semibold">
                        <span>最終金額</span>
                        <span className="text-primary">NT$ {orderData.final_price.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4 text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium mb-1">溫馨提醒</p>
                    <p className="text-blue-800 dark:text-blue-200">
                      如有任何問題，請直接聯繫住宿業者，或撥打訂房確認信中的聯絡電話。
                    </p>
                  </div>

                  <div className="text-center space-y-3 pt-2">
                    <p className="text-sm text-muted-foreground">
                      若您想取消或修改日期，請聯絡我們。
                    </p>
                    <Button 
                      variant="outline"
                      onClick={() => window.open("https://line.me/R/ti/p/@042deypa", "_blank")}
                      className="w-full sm:w-auto"
                    >
                      聯絡我們
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OrderSearch;
