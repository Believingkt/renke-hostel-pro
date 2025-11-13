import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Order } from "@/types/order";
import { getPaymentStatusConfig, getOrderStatusConfig } from "@/utils/orderHelpers";

interface OrdersTableProps {
  orders: Order[];
  onEditOrder: (order: Order) => void;
}

export function OrdersTable({ orders, onEditOrder }: OrdersTableProps) {
  return (
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
              訂單狀態
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
          {orders.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-muted-foreground">
                暫無資料
              </td>
            </tr>
          ) : (
            orders.map((order) => {
              const orderStatusConfig = getOrderStatusConfig(order.order_status);
              const paymentStatusConfig = getPaymentStatusConfig(order.payment_status);
              
              return (
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
                  <td className="px-4 py-3 text-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEditOrder(order)}
                    >
                      編輯
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
