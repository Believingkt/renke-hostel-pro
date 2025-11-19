import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, DollarSign, User, Phone, Mail } from "lucide-react";
import { format } from "date-fns";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { ErrorState } from "@/components/ErrorState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  discount_amount: number;
  final_price: number;
  order_status: string;
  created_at: string;
  room_types: {
    name: string;
  } | null;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  checked_in: "bg-green-500/10 text-green-500 border-green-500/20",
  checked_out: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusLabels: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  checked_in: "已入住",
  checked_out: "已退房",
  cancelled: "已取消",
};

const DiscountCodeOrders = () => {
  const { discountCode } = useParams<{ discountCode: string }>();
  const { accommodationId } = useSubdomain();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!accommodationId || !discountCode) return;

      setIsLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from("orders")
          .select("*, room_types(name)")
          .eq("accommodation_id", accommodationId)
          .eq("discount_code", discountCode)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setOrders(data || []);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [accommodationId, discountCode]);

  const totalRevenue = orders.reduce((sum, order) => sum + order.final_price, 0);
  const totalDiscount = orders.reduce((sum, order) => sum + order.discount_amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold">載入中...</h1>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="無法載入訂單資料"
        message={error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="pt-4 pb-4 border-b border-primary/20 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <span className="w-2 h-9 bg-primary rounded-full"></span>
              折扣代碼訂單
            </h2>
            <p className="text-muted-foreground mt-2 ml-[18px]">代碼：{discountCode}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              使用次數
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{orders.length} 筆</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              總折扣金額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              NT$ {totalDiscount.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              總實收金額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              NT$ {totalRevenue.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">尚無訂單使用此折扣代碼</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 桌面版表格 */}
          <div className="hidden md:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>訂單編號</TableHead>
                  <TableHead>顧客資訊</TableHead>
                  <TableHead>房型</TableHead>
                  <TableHead>入住日期</TableHead>
                  <TableHead>金額</TableHead>
                  <TableHead>折扣</TableHead>
                  <TableHead>實收</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>訂單日期</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow 
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/admin/orders/${order.id}`)}
                  >
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{order.guest_name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{order.guest_phone}</span>
                        </div>
                        {order.guest_email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{order.guest_email}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{order.room_types?.name || "-"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm">
                          {format(new Date(order.check_in_date), "yyyy/MM/dd")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          至 {format(new Date(order.check_out_date), "yyyy/MM/dd")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      NT$ {order.total_price.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-red-500">
                      -NT$ {order.discount_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="font-semibold">
                      NT$ {order.final_price.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[order.order_status]}>
                        {statusLabels[order.order_status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(order.created_at), "yyyy/MM/dd HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 手機版卡片 */}
          <div className="md:hidden space-y-3">
            {orders.map((order) => (
              <Card 
                key={order.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/admin/orders/${order.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {order.guest_name}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusColors[order.order_status]}>
                      {statusLabels[order.order_status]}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">房型</p>
                      <p className="font-medium">{order.room_types?.name || "-"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">入住日期</p>
                      <p className="font-medium">
                        {format(new Date(order.check_in_date), "MM/dd")}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">原價</p>
                      <p className="font-medium">NT$ {order.total_price.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">折扣</p>
                      <p className="font-medium text-red-500">-{order.discount_amount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">實收</p>
                      <p className="font-semibold text-green-600">NT$ {order.final_price.toLocaleString()}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    訂單日期：{format(new Date(order.created_at), "yyyy/MM/dd HH:mm")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default DiscountCodeOrders;
