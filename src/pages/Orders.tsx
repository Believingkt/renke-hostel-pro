import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  order_status: string;
  payment_status: string;
  final_price: number;
  paid_amount: number;
  notes: string | null;
  order_date: string;
  room_types: {
    name: string;
  } | null;
}


const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "list");
  const { accommodationId } = useSubdomain();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  
  // 編輯對話框狀態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editForm, setEditForm] = useState({
    order_status: "",
    payment_status: "",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  
  // 篩選條件
  const [dateType, setDateType] = useState("check_in");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab === "list") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 載入訂單資料
  useEffect(() => {
    if (!accommodationId) return;
    
    const fetchOrders = async () => {
      try {
        setLoading(true);
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
          setFilteredOrders(data);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [accommodationId]);

  // 套用篩選
  const applyFilters = () => {
    let filtered = [...orders];

    // 日期篩選
    if (startDate && endDate) {
      filtered = filtered.filter(order => {
        const compareDate = dateType === "check_in" 
          ? order.check_in_date 
          : format(new Date(order.order_date), "yyyy-MM-dd");
        return compareDate >= startDate && compareDate <= endDate;
      });
    }

    // 付款狀態篩選
    if (paymentStatus) {
      filtered = filtered.filter(order => order.payment_status === paymentStatus);
    }

    // 訂單狀態篩選
    if (orderStatus) {
      filtered = filtered.filter(order => order.order_status === orderStatus);
    }

    // 關鍵字搜尋
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(order => 
        order.order_number.toLowerCase().includes(keyword) ||
        order.guest_name.toLowerCase().includes(keyword)
      );
    }

    setFilteredOrders(filtered);
  };

  // 清除所有篩選條件
  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setPaymentStatus("");
    setOrderStatus("");
    setSearchKeyword("");
    setFilteredOrders(orders);
  };

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

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditForm({
      order_status: order.order_status,
      payment_status: order.payment_status,
      notes: order.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingOrder) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          order_status: editForm.order_status,
          payment_status: editForm.payment_status,
          notes: editForm.notes || null,
        })
        .eq("id", editingOrder.id);

      if (error) throw error;

      // 更新本地狀態
      const updatedOrders = orders.map(order =>
        order.id === editingOrder.id
          ? { ...order, ...editForm }
          : order
      );
      setOrders(updatedOrders);
      setFilteredOrders(updatedOrders.filter(order => 
        filteredOrders.find(fo => fo.id === order.id)
      ));

      toast({
        title: "更新成功",
        description: "訂單資訊已更新",
      });

      setEditDialogOpen(false);
      setEditingOrder(null);
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "更新失敗",
        description: "無法更新訂單，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單查詢</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* 篩選區域 */}
              <div className="grid grid-cols-12 gap-4">
                {/* 日期區間 */}
                <div className="col-span-6">
                  <Label className="text-sm mb-2 block">日期區間</Label>
                  <div className="flex items-center gap-2">
                    <select 
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={dateType}
                      onChange={(e) => setDateType(e.target.value)}
                    >
                      <option value="check_in">入住日期</option>
                      <option value="order">訂購日期</option>
                    </select>
                    <Button variant="ghost" size="icon" className="h-10 w-10">
                      <Calendar className="h-4 w-4" />
                    </Button>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-10"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* 付款狀態 */}
                <div className="col-span-2">
                  <Label className="text-sm mb-2 block">付款狀態</Label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                  >
                    <option value="">(全部)</option>
                    <option value="unpaid">未付款</option>
                    <option value="deposit_paid">已付訂金</option>
                    <option value="paid">已付清</option>
                    <option value="overdue">已逾期</option>
                  </select>
                </div>

                {/* 訂單狀態 */}
                <div className="col-span-2">
                  <Label className="text-sm mb-2 block">訂單狀態</Label>
                  <select 
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value)}
                  >
                    <option value="">(全部)</option>
                    <option value="pending">待確認</option>
                    <option value="confirmed">已確認</option>
                    <option value="checked_in">已入住</option>
                    <option value="checked_out">已退房</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </div>

                {/* 搜尋按鈕 */}
                <div className="col-span-2 flex items-end">
                  <Button 
                    className="w-full h-10 bg-orange-600 hover:bg-orange-700"
                    onClick={applyFilters}
                  >
                    搜尋
                  </Button>
                </div>
              </div>

              {/* 搜尋欄 */}
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8">
                  <Label className="text-sm mb-2 block">關鍵字</Label>
                  <div className="relative">
                    <Input
                      className="h-10 pr-20"
                      placeholder="請輸入訂單編號或訂購人名稱"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          applyFilters();
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="col-span-2 flex items-end">
                  <Button 
                    variant="outline"
                    className="w-full h-10"
                    onClick={clearFilters}
                  >
                    清除
                  </Button>
                </div>
                <div className="col-span-2 flex items-end">
                  <Button 
                    className="w-full h-10 bg-orange-600 hover:bg-orange-700"
                    onClick={applyFilters}
                  >
                    搜尋
                  </Button>
                </div>
              </div>

              {/* 訂單表格 */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂單編號
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購時間
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        訂購人
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        入住日期
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        退房日期
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        付款狀態
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground">
                          暫無資料
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr key={order.id} className="border-b hover:bg-muted/50">
                          <td className="px-4 py-3 text-sm">
                            <Link 
                              to={`/admin/orders/${order.id}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {order.order_number}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</td>
                          <td className="px-4 py-3 text-sm">{order.guest_name}</td>
                          <td className="px-4 py-3 text-sm">{order.check_in_date}</td>
                          <td className="px-4 py-3 text-sm">{order.check_out_date}</td>
                          <td className="px-4 py-3 text-sm">{getPaymentStatusBadge(order.payment_status)}</td>
                          <td className="px-4 py-3 text-sm">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditOrder(order)}
                            >
                              編輯
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 編輯訂單對話框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>編輯訂單</DialogTitle>
          </DialogHeader>
          {editingOrder && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>訂單編號</Label>
                <Input value={editingOrder.order_number} disabled />
              </div>
              <div className="space-y-2">
                <Label>訂購人</Label>
                <Input value={editingOrder.guest_name} disabled />
              </div>
              <div className="space-y-2">
                <Label>訂單狀態</Label>
                <Select
                  value={editForm.order_status}
                  onValueChange={(value) => setEditForm({ ...editForm, order_status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">待確認</SelectItem>
                    <SelectItem value="confirmed">已確認</SelectItem>
                    <SelectItem value="checked_in">已入住</SelectItem>
                    <SelectItem value="checked_out">已退房</SelectItem>
                    <SelectItem value="cancelled">已取消</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>付款狀態</Label>
                <Select
                  value={editForm.payment_status}
                  onValueChange={(value) => setEditForm({ ...editForm, payment_status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">未付款</SelectItem>
                    <SelectItem value="deposit_paid">已付訂金</SelectItem>
                    <SelectItem value="paid">已付清</SelectItem>
                    <SelectItem value="overdue">已逾期</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>訂單備註</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="輸入訂單備註..."
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={isSaving}
            >
              取消
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSaving}
            >
              {isSaving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      
    </div>
  );
};

export default Orders;
