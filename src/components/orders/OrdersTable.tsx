import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Order } from "@/types/order";
import { getPaymentStatusConfig, getOrderStatusConfig } from "@/utils/orderHelpers";
import { ArrowUpDown, ArrowUp, ArrowDown, Calendar, User, DollarSign, ShoppingCart, Edit, Eye } from "lucide-react";
import { OrderQuickPreview } from "./OrderQuickPreview";
import { EmptyState } from "@/components/EmptyState";

interface OrdersTableProps {
  orders: Order[];
  onEditOrder: (order: Order) => void;
  sortField: keyof Order | "";
  sortDirection: "asc" | "desc";
  onSort: (field: keyof Order) => void;
}

export function OrdersTable({ orders, onEditOrder, sortField, sortDirection, onSort }: OrdersTableProps) {
  const getSortIcon = (field: keyof Order) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const SortableHeader = ({ field, children }: { field: keyof Order; children: React.ReactNode }) => (
    <th 
      className="px-4 py-3 text-left text-sm font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center">
        {children}
        {getSortIcon(field)}
      </div>
    </th>
  );

  return (
    <>
      {/* 桌面版表格 */}
      <div className="hidden md:block table-scroll-container overflow-x-auto rounded-md border touch-pan-x">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <SortableHeader field="order_number">訂單編號</SortableHeader>
              <SortableHeader field="order_date">訂購時間</SortableHeader>
              <SortableHeader field="guest_name">訂購人</SortableHeader>
              <SortableHeader field="check_in_date">入住日期</SortableHeader>
              <SortableHeader field="check_out_date">退房日期</SortableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                訂單狀態
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                付款狀態
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-[120px]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <div className="py-8">
                    <EmptyState
                      icon={ShoppingCart}
                      title="暫無訂單"
                      description="目前還沒有任何訂單記錄，當有新訂單時會顯示在這裡"
                      className="border-0 shadow-none"
                    />
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const orderStatusConfig = getOrderStatusConfig(order.order_status);
                const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);
                
                return (
                  <tr key={order.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm">
                      <OrderQuickPreview order={order}>
                        <Link 
                          to={`/admin/orders/${order.id}`}
                          className="text-primary hover:underline font-medium"
                        >
                          {order.order_number}
                        </Link>
                      </OrderQuickPreview>
                    </td>
                    <td className="px-4 py-3 text-sm">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</td>
                    <td className="px-4 py-3 text-sm">{order.guest_name}</td>
                    <td className="px-4 py-3 text-sm">{order.check_in_date}</td>
                    <td className="px-4 py-3 text-sm">{order.check_out_date}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${orderStatusConfig.className}`}>
                        {orderStatusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${paymentStatusConfig.className}`}>
                        {paymentStatusConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm w-[120px]">
                      <div className="flex justify-start gap-1 -ml-5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 group touch-manipulation"
                                asChild
                              >
                                <Link to={`/admin/orders/${order.id}`}>
                                  <Eye className="h-4 w-4 text-black group-hover:text-white transition-colors" />
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>查看詳情</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 group touch-manipulation"
                                onClick={() => onEditOrder(order)}
                              >
                                <Edit className="h-4 w-4 text-black group-hover:text-white transition-colors" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>編輯訂單</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 行動版卡片 */}
      <div className="md:hidden space-y-4">
        {orders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="暫無訂單"
            description="目前還沒有任何訂單記錄，當有新訂單時會顯示在這裡"
            className="border-0 shadow-none"
          />
        ) : (
          orders.map((order) => {
            const orderStatusConfig = getOrderStatusConfig(order.order_status);
            const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);
            
            return (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* 訂單編號和狀態 */}
                  <div className="flex items-start justify-between mb-3">
                    <Link 
                      to={`/admin/orders/${order.id}`}
                      className="text-primary hover:underline font-semibold text-base"
                    >
                      {order.order_number}
                    </Link>
                    <div className="flex flex-col gap-1.5 items-end">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${orderStatusConfig.className}`}>
                        {orderStatusConfig.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${paymentStatusConfig.className}`}>
                        {paymentStatusConfig.label}
                      </span>
                    </div>
                  </div>

                  {/* 訂購人和訂購時間 */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center text-sm">
                      <User className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="text-muted-foreground mr-2">訂購人:</span>
                      <span className="font-medium">{order.guest_name}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span className="text-muted-foreground mr-2">訂購時間:</span>
                      <span>{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</span>
                    </div>
                  </div>

                  {/* 入住和退房日期 */}
                  <div className="bg-muted/50 rounded-lg p-3 mb-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">入住日期</div>
                        <div className="font-medium">{order.check_in_date}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">退房日期</div>
                        <div className="font-medium">{order.check_out_date}</div>
                      </div>
                    </div>
                  </div>

                  {/* 金額 */}
                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center">
                      <DollarSign className="w-4 h-4 mr-1 text-muted-foreground" />
                      <span className="text-muted-foreground">訂單金額:</span>
                    </div>
                    <span className="font-semibold text-base">NT$ {order.final_price.toLocaleString()}</span>
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="default"
                            className="flex-1 h-11 touch-manipulation gap-2"
                            asChild
                          >
                            <Link to={`/admin/orders/${order.id}`}>
                              <Eye className="h-4 w-4" />
                              查看詳情
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>查看詳情</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="default"
                            className="flex-1 h-11 touch-manipulation gap-2"
                            onClick={() => onEditOrder(order)}
                          >
                            <Edit className="h-4 w-4" />
                            編輯訂單
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>編輯訂單</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
