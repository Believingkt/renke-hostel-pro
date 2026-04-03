import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Order, CustomMealPlan } from "@/types/order";
import { getPaymentStatusConfig, getOrderStatusConfig, getOrderSourceConfig, getEffectivePaymentStatus } from "@/utils/orderHelpers";
import { ArrowUpDown, ArrowUp, ArrowDown, Calendar, User, DollarSign, ShoppingCart, Edit, Eye, Utensils, Globe, UserPlus } from "lucide-react";
import { OrderQuickPreview } from "./OrderQuickPreview";
import { EmptyState } from "@/components/EmptyState";

interface OrdersTableProps {
  orders: Order[];
  onEditOrder: (order: Order) => void;
  onEditPrice?: (order: Order) => void;
  onChangePaymentStatus?: (order: Order) => void;
  onChangeOrderStatus?: (order: Order) => void;
  onChangeOrderSource?: (order: Order) => void;
  sortField: keyof Order | "";
  sortDirection: "asc" | "desc";
  onSort: (field: keyof Order) => void;
  customMealPlans?: CustomMealPlan[];
}

export function OrdersTable({ orders, onEditOrder, onEditPrice, onChangePaymentStatus, onChangeOrderStatus, onChangeOrderSource, sortField, sortDirection, onSort, customMealPlans = [] }: OrdersTableProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = `${location.pathname}${location.search}`;

  const getSortIcon = (field: keyof Order) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc"
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  // 獲取餐食方案顯示名稱
  const getMealPlanDisplayName = (planId: string | null) => {
    if (!planId) return "-";
    const customPlan = customMealPlans.find(p => p.id === planId);
    if (customPlan) {
      return customPlan.name;
    }
    // 預設名稱
    return planId === "2_meals" ? "一泊二食" : planId === "3_meals" ? "一泊三食" : planId;
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
              <SortableHeader field="final_price">實收金額</SortableHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                來源
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                訂單狀態
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                付款狀態
              </th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-[160px]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-0">
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
                const effectivePaymentStatus = getEffectivePaymentStatus(order.payment_status, order.payment_link_created_at);
                const paymentStatusConfig = getPaymentStatusConfig(effectivePaymentStatus);
                const orderSourceConfig = getOrderSourceConfig(order.order_source);

                return (
                  <tr key={order.id} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-3 text-sm">
                        <Link
                          to={`/admin/orders/${order.id}`}
                          state={{ from: backTo }}
                          className="text-primary hover:underline font-medium"
                        >
                          {order.order_number}
                        </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{format(new Date(order.order_date), "yyyy-MM-dd HH:mm")}</td>
                    <td className="px-4 py-3 text-sm">{order.guest_name}</td>
                    <td className="px-4 py-3 text-sm">{order.check_in_date}</td>
                    <td className="px-4 py-3 text-sm">{order.check_out_date}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {onEditPrice && order.order_status !== 'cancelled' ? (
                        <button
                          onClick={() => onEditPrice(order)}
                          className="text-primary hover:underline cursor-pointer transition-opacity hover:opacity-80"
                          title="點擊修改金額"
                        >
                          NT$ {order.final_price.toLocaleString()}
                        </button>
                      ) : (
                        <>NT$ {order.final_price.toLocaleString()}</>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {onChangeOrderSource ? (
                        <button
                          onClick={() => onChangeOrderSource(order)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${orderSourceConfig.className}`}
                          title="點擊變更訂單來源"
                        >
                          {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                          {orderSourceConfig.label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${orderSourceConfig.className}`}>
                          {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                          {orderSourceConfig.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {onChangeOrderStatus ? (
                        <button
                          onClick={() => onChangeOrderStatus(order)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${orderStatusConfig.className}`}
                          title="點擊變更訂單狀態"
                        >
                          {orderStatusConfig.label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${orderStatusConfig.className}`}>
                          {orderStatusConfig.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {onChangePaymentStatus && order.order_status !== 'cancelled' ? (
                        <button
                          onClick={() => onChangePaymentStatus(order)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${paymentStatusConfig.className}`}
                          title="點擊變更付款狀態"
                        >
                          {paymentStatusConfig.label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${paymentStatusConfig.className}`}>
                          {paymentStatusConfig.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm w-[160px]">
                      <div className="flex justify-start gap-1 -ml-5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-9 p-0 touch-manipulation"
                                asChild
                              >
                                <Link to={`/admin/orders/${order.id}`} state={{ from: backTo }}>
                                  <Eye className="h-4 w-4" />
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
                                className="h-9 w-9 p-0 touch-manipulation"
                                asChild
                              >
                                <Link to={`/admin/orders/${order.id}?editing=true`} state={{ from: backTo }}>
                                  <Edit className="h-4 w-4" />
                                </Link>
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
            const effectiveMobilePaymentStatus = getEffectivePaymentStatus(order.payment_status, order.payment_link_created_at);
            const paymentStatusConfig = getPaymentStatusConfig(effectiveMobilePaymentStatus);
            const orderSourceConfig = getOrderSourceConfig(order.order_source);

            return (
              <Card key={order.id} className="overflow-hidden">
                <CardContent className="p-4">
                  {/* 訂單編號和狀態 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        to={`/admin/orders/${order.id}`}
                        state={{ from: backTo }}
                        className="text-primary hover:underline font-semibold text-base"
                      >
                        {order.order_number}
                      </Link>
                      {onChangeOrderSource ? (
                        <button
                          onClick={() => onChangeOrderSource(order)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit cursor-pointer hover:opacity-80 transition-opacity ${orderSourceConfig.className}`}
                        >
                          {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                          {orderSourceConfig.label}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${orderSourceConfig.className}`}>
                          {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                          {orderSourceConfig.label}
                        </span>
                      )}
                    </div>
                    {onChangeOrderStatus ? (
                      <button
                        onClick={() => onChangeOrderStatus(order)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${orderStatusConfig.className}`}
                      >
                        {orderStatusConfig.label}
                      </button>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${orderStatusConfig.className}`}>
                        {orderStatusConfig.label}
                      </span>
                    )}
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
                    {order.meal_plan && (
                      <div className="flex items-center text-sm">
                        <Utensils className="w-4 h-4 mr-2 text-muted-foreground" />
                        <span className="text-muted-foreground mr-2">專案:</span>
                        <span className="font-medium">{getMealPlanDisplayName(order.meal_plan)}</span>
                      </div>
                    )}
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
                      <span className="text-muted-foreground">實收金額:</span>
                    </div>
                    {onEditPrice && order.order_status !== 'cancelled' ? (
                      <button
                        onClick={() => onEditPrice(order)}
                        className="font-semibold text-base text-primary hover:underline cursor-pointer"
                        title="點擊修改金額"
                      >
                        NT$ {order.final_price.toLocaleString()}
                      </button>
                    ) : (
                      <span className="font-semibold text-base">NT$ {order.final_price.toLocaleString()}</span>
                    )}
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="default"
                      className="flex-1 h-12 touch-manipulation gap-2"
                      asChild
                    >
                      <Link to={`/admin/orders/${order.id}`} state={{ from: backTo }}>
                        <Eye className="h-5 w-5" />
                        <span>查看詳情</span>
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="default"
                      className="flex-1 h-12 touch-manipulation gap-2"
                      asChild
                    >
                      <Link to={`/admin/orders/${order.id}?editing=true`} state={{ from: backTo }}>
                        <Edit className="h-5 w-5" />
                        <span>編輯訂單</span>
                      </Link>
                    </Button>
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
