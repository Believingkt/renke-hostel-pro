import { useState, useEffect } from "react";
import { Bell, CreditCard, DollarSign, Search, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  room_assigned: boolean;
  final_price: number;
  order_date: string;
  room_types: {
    name: string;
  } | null;
}


const Reception = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const { accommodationId } = useSubdomain();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 統計數據
  const [todayCheckin, setTodayCheckin] = useState(0);
  const [todayCheckout, setTodayCheckout] = useState(0);
  const [todayNewOrders, setTodayNewOrders] = useState(0);
  const [todayAssignedOrders, setTodayAssignedOrders] = useState(0);
  const [unpaidOrders, setUnpaidOrders] = useState(0);
  const [overdueOrders, setOverdueOrders] = useState(0);

  useEffect(() => {
    if (!accommodationId) return;
    
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const today = format(new Date(), "yyyy-MM-dd");
        
        // 查詢所有訂單
        const { data, error } = await supabase
          .from("orders")
          .select(`
            *,
            room_types (
              name
            )
          `)
          .eq("accommodation_id", accommodationId)
          .order("order_date", { ascending: false });

        if (error) throw error;
        
        if (data) {
          setOrders(data);
          
          // 計算統計數據
          const todayCheckins = data.filter(o => o.check_in_date === today).length;
          const todayCheckouts = data.filter(o => o.check_out_date === today).length;
          const todayNew = data.filter(o => format(new Date(o.order_date), "yyyy-MM-dd") === today);
          const todayNewUnassigned = todayNew.filter(o => !o.room_assigned).length;
          const todayNewAssigned = todayNew.filter(o => o.room_assigned).length;
          const unpaid = data.filter(o => o.payment_status === 'unpaid' || o.payment_status === 'deposit_paid').length;
          const overdue = data.filter(o => o.payment_status === 'overdue').length;
          
          setTodayCheckin(todayCheckins);
          setTodayCheckout(todayCheckouts);
          setTodayNewOrders(todayNewUnassigned);
          setTodayAssignedOrders(todayNewAssigned);
          setUnpaidOrders(unpaid);
          setOverdueOrders(overdue);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [accommodationId]);

  // 篩選訂單
  const getTodayCheckinOrders = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return orders.filter(o => o.check_in_date === today && searchQuery ? 
      o.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );
  };

  const getTodayCheckoutOrders = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    return orders.filter(o => o.check_out_date === today && searchQuery ?
      o.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) : true
    );
  };

  const getTomorrowCheckinOrders = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = format(tomorrow, "yyyy-MM-dd");
    return orders.filter(o => o.check_in_date === tomorrowStr);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "待確認", variant: "outline" },
      confirmed: { label: "已確認", variant: "default" },
      checked_in: { label: "已入住", variant: "secondary" },
      checked_out: { label: "已退房", variant: "outline" },
      cancelled: { label: "已取消", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
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

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">今日櫃檯</h1>
      
      <div className="space-y-4 md:space-y-6">
          {/* 統計卡片區 */}
          <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* 今日櫃檯 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">今日櫃檯</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                    <Bell className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">住房/退房為今日</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">今日住房</span>
                    <span className="text-2xl font-bold">{todayCheckin}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">今日退房</span>
                    <span className="text-2xl font-bold">{todayCheckout}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 最新訂單 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">最新訂單</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <CreditCard className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">訂購日為今日</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">未排房</span>
                    <span className="text-2xl font-bold">{todayNewOrders}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">已排房</span>
                    <span className="text-2xl font-bold">{todayAssignedOrders}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 訂單待付 */}
            <Card className="shadow-card hover:shadow-card-hover transition-base">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold">訂單待付</CardTitle>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
                    <DollarSign className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">所有未付訂與逾期的訂單</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">未付訂/待付款</span>
                    <span className="text-2xl font-bold">{unpaidOrders}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">訂金逾期</span>
                    <span className="text-2xl font-bold">{overdueOrders}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 今日櫃檯詳細資料 */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">今日櫃檯</CardTitle>
            </CardHeader>
            <CardContent>
              {/* 入住/退房標籤 */}
              <Tabs defaultValue="checkin" className="w-full">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                  <TabsList>
                    <TabsTrigger value="checkin">
                      入住 <span className="ml-1">🏠</span>
                    </TabsTrigger>
                    <TabsTrigger value="checkout">
                      退房 <span className="ml-1">🚪</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* 搜尋欄 */}
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <TabsContent value="checkin" className="space-y-4">
                  {/* 入住統計 */}
                  <div className="flex gap-4 mb-4">
                    <Badge variant="outline" className="text-base px-4 py-2">
                      今日入住 ({getTodayCheckinOrders().filter(o => o.order_status === 'checked_in').length} / {getTodayCheckinOrders().length})
                    </Badge>
                    <Badge variant="outline" className="text-base px-4 py-2">
                      明日入住 ({getTomorrowCheckinOrders().length})
                    </Badge>
                  </div>

                  {/* 表格 */}
                  <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂單編號 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            顧客 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            聯絡電話 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            房型
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            狀態 <span className="ml-1">▼</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {getTodayCheckinOrders().length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-muted-foreground">
                              暫無資料
                            </td>
                          </tr>
                        ) : (
                          getTodayCheckinOrders().map((order) => (
                            <tr key={order.id} className="border-b hover:bg-muted/50">
                              <td className="px-4 py-3 text-sm">{order.order_number}</td>
                              <td className="px-4 py-3 text-sm">{order.guest_name}</td>
                              <td className="px-4 py-3 text-sm">{order.guest_phone}</td>
                              <td className="px-4 py-3 text-sm">{order.room_types?.name || '-'}</td>
                              <td className="px-4 py-3 text-sm">{getStatusBadge(order.order_status)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                <TabsContent value="checkout" className="space-y-4">
                  {/* 退房統計 */}
                  <div className="flex gap-4 mb-4">
                    <Badge variant="outline" className="text-base px-4 py-2">
                      今日退房 ({getTodayCheckoutOrders().filter(o => o.order_status === 'checked_out').length} / {getTodayCheckoutOrders().length})
                    </Badge>
                  </div>

                  {/* 表格 */}
                  <div className="overflow-x-auto scrollbar-thin -mx-2 md:mx-0">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            訂單編號 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            顧客 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            聯絡電話 <span className="ml-1">↕</span>
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            房型
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                            狀態 <span className="ml-1">▼</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {getTodayCheckoutOrders().length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-muted-foreground">
                              暫無資料
                            </td>
                          </tr>
                        ) : (
                          getTodayCheckoutOrders().map((order) => (
                            <tr key={order.id} className="border-b hover:bg-muted/50">
                              <td className="px-4 py-3 text-sm">{order.order_number}</td>
                              <td className="px-4 py-3 text-sm">{order.guest_name}</td>
                              <td className="px-4 py-3 text-sm">{order.guest_phone}</td>
                              <td className="px-4 py-3 text-sm">{order.room_types?.name || '-'}</td>
                              <td className="px-4 py-3 text-sm">{getStatusBadge(order.order_status)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
      </div>
    </div>
  );
};

export default Reception;
