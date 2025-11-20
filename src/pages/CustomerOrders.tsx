import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Eye, Calendar, DollarSign, Users, Phone, Mail, FileText, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  first_order_date: string | null;
  visit_count: number;
  notes: string | null;
}

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  check_in_date: string;
  check_out_date: string;
  guest_count: number;
  total_price: number;
  final_price: number;
  order_status: string;
  payment_status: string;
  room_type_id: string | null;
  room_types?: {
    name: string;
  };
}

const CustomerOrders = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { currentAccommodationId } = useAccommodation();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentAccommodationId && customerId) {
      loadCustomerAndOrders();
    }
  }, [currentAccommodationId, customerId]);

  const loadCustomerAndOrders = async () => {
    if (!currentAccommodationId || !customerId) return;

    setIsLoading(true);
    setError(null);
    try {
      // 載入顧客資料
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .eq("accommodation_id", currentAccommodationId)
        .single();

      if (customerError) throw customerError;
      setCustomer(customerData);

      // 載入訂單資料
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(`
          *,
          room_types (
            name
          )
        `)
        .eq("customer_id", customerId)
        .eq("accommodation_id", currentAccommodationId)
        .order("order_date", { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (error) {
      console.error("Error loading customer orders:", error);
      setError("無法載入顧客訂單資料");
      toast.error("載入失敗");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "待確認", variant: "secondary" },
      confirmed: { label: "已確認", variant: "default" },
      checked_in: { label: "已入住", variant: "default" },
      checked_out: { label: "已退房", variant: "outline" },
      cancelled: { label: "已取消", variant: "destructive" },
    };
    const config = statusConfig[status] || { label: status, variant: "default" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPaymentStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      unpaid: { label: "未付款", variant: "secondary" },
      partial: { label: "部分付款", variant: "outline" },
      paid: { label: "已付款", variant: "default" },
    };
    const config = statusConfig[status] || { label: status, variant: "default" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "yyyy/MM/dd", { locale: zhTW });
    } catch {
      return "-";
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "yyyy/MM/dd HH:mm", { locale: zhTW });
    } catch {
      return "-";
    }
  };

  const calculateTotalRevenue = () => {
    return orders
      .filter(order => order.order_status !== "cancelled")
      .reduce((sum, order) => sum + order.final_price, 0);
  };

  const handleViewOrderDetail = (orderId: string) => {
    navigate(`/admin/orders/${orderId}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <TableSkeleton rows={10} columns={6} showSearch={false} />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <ErrorState
        title="無法載入顧客資料"
        message={error || "找不到該顧客"}
        onRetry={loadCustomerAndOrders}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${customer.name} 的訂單記錄`}
        icon={UserRound}
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/customers")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        }
      />

      {/* Customer Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">聯絡電話</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{customer.phone || "未提供"}</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">電子信箱</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold truncate">{customer.email || "未提供"}</div>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">來訪次數</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              {customer.visit_count}
            </div>
            <p className="text-xs text-muted-foreground">次</p>
          </CardContent>
        </Card>
        <Card className="animate-fade-in hover-scale cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary/50" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總消費金額</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              ${calculateTotalRevenue().toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">{orders.filter(o => o.order_status !== "cancelled").length} 筆訂單</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer Notes */}
      {customer.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5" />
              備註
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardDescription>共 {orders.length} 筆訂單</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="尚無訂單記錄"
              description="此顧客目前沒有任何訂單記錄"
            />
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead>訂單日期</TableHead>
                      <TableHead>入住/退房日期</TableHead>
                      <TableHead>房型</TableHead>
                      <TableHead className="text-center">人數</TableHead>
                      <TableHead className="text-right">金額</TableHead>
                      <TableHead>訂單狀態</TableHead>
                      <TableHead>付款狀態</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{formatDateTime(order.order_date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{formatDate(order.check_in_date)}</span>
                            <span className="text-muted-foreground">~</span>
                            <span className="text-sm">{formatDate(order.check_out_date)}</span>
                          </div>
                        </TableCell>
                        <TableCell>{order.room_types?.name || "-"}</TableCell>
                        <TableCell className="text-center">{order.guest_count}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${order.final_price.toLocaleString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(order.order_status)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(order.payment_status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewOrderDetail(order.id)}
                            title="查看訂單詳情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-3 p-4">
                {orders.map((order) => (
                  <Card key={order.id} className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm mb-1">{order.order_number}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(order.order_date)}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          {getStatusBadge(order.order_status)}
                          {getPaymentStatusBadge(order.payment_status)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">入住：</span>
                          <span>{formatDate(order.check_in_date)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">退房：</span>
                          <span>{formatDate(order.check_out_date)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">房型：</span>
                          <span>{order.room_types?.name || "-"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">人數：</span>
                          <span>{order.guest_count} 人</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="font-bold text-lg">
                          ${order.final_price.toLocaleString()}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOrderDetail(order.id)}
                          className="gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          查看詳情
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerOrders;
