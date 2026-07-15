import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Order, CustomMealPlan } from "@/types/order";
import { getPaymentStatusConfig, getOrderStatusConfig, getOrderSourceConfig, getHotelnabeOtaCode, getOrderOtaCode, getOrderSourceDisplayName, getHotelnabeOtaDisplayName, getEffectivePaymentStatus, getPaymentMethodLabel, getOrderPaymentMethod, cleanGuestNameDisplay } from "@/utils/orderHelpers";
import { ArrowUpDown, ArrowUp, ArrowDown, Calendar, User, DollarSign, ShoppingCart, Edit, Eye, Utensils, Globe, UserPlus, CreditCard } from "lucide-react";
import { OrderQuickPreview } from "./OrderQuickPreview";
import { EmptyState } from "@/components/EmptyState";
import { useSecondaryCurrency } from "@/hooks/use-secondary-currency";
import { formatSecondary } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

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
  /** 啟用副幣別顯示（旅行日 JPY 等），需配合 accommodationId 才會生效 */
  accommodationId?: string | null;
}

export function OrdersTable({ orders, onEditOrder, onEditPrice, onChangePaymentStatus, onChangeOrderStatus, onChangeOrderSource, sortField, sortDirection, onSort, customMealPlans = [], accommodationId }: OrdersTableProps) {
  const { config: secondaryConfig } = useSecondaryCurrency(accommodationId);
  // 逐筆訂單顯示幣別：order_id → 'TWD' | 'JPY' | ...
  const [displayCurrencyMap, setDisplayCurrencyMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!secondaryConfig) { setDisplayCurrencyMap(new Map()); return; }
    const ids = orders.map(o => o.id).filter(Boolean);
    if (ids.length === 0) { setDisplayCurrencyMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("order_meta")
        .select("order_id, display_currency")
        .in("order_id", ids);
      if (cancelled) return;
      const m = new Map<string, string>();
      (data ?? []).forEach((r: any) => { if (r.display_currency) m.set(r.order_id, r.display_currency); });
      setDisplayCurrencyMap(m);
    })();
    return () => { cancelled = true; };
  }, [orders, secondaryConfig]);

  const currencyPrefix = (order: Order) => {
    if (!secondaryConfig) return "NT$";
    const orderCur = (displayCurrencyMap.get(order.id) || "TWD").toUpperCase();
    return orderCur === secondaryConfig.code.toUpperCase() ? secondaryConfig.symbol : "NT$";
  };
  const renderAmount = (order: Order, amount: number) => {
    return <>{currencyPrefix(order)} {amount.toLocaleString()}</>;
  };
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
              <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">
                付款方式
              </th>
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
                <td colSpan={12} className="p-0">
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
                const orderSourceConfig = getOrderSourceConfig(order.order_source, getOrderOtaCode(order as any));

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
                    <td className="px-4 py-3 text-sm">{cleanGuestNameDisplay(order.guest_name)}</td>
                    <td className="px-4 py-3 text-sm">{order.check_in_date}</td>
                    <td className="px-4 py-3 text-sm">{order.check_out_date}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <div>{renderAmount(order, order.final_price)}</div>
                      {(() => {
                        const method = getOrderPaymentMethod(order);
                        const dep = (order as any).deposit_amount ?? 0;
                        if (method === 'bank_transfer' && dep > 0 && dep < order.final_price) {
                          const depositPaid = order.payment_status === 'deposit_paid' || order.payment_status === 'paid' || order.paid_amount >= dep;
                          const balancePaid = order.payment_status === 'paid';
                          return (
                            <div className="text-xs text-muted-foreground font-normal leading-tight mt-0.5">
                              <div>訂金 {currencyPrefix(order)} {dep.toLocaleString()} <span className={depositPaid ? 'text-primary' : 'text-destructive'}>{depositPaid ? '已付' : '未付'}</span></div>
                              <div>尾款 {currencyPrefix(order)} {(order.final_price - dep).toLocaleString()} <span className={balancePaid ? 'text-primary' : 'text-destructive'}>{balancePaid ? '已付' : '未付'}</span></div>
                            </div>
                          );
                        }
                        if (order.paid_amount > 0 && order.paid_amount < order.final_price) {
                          return (
                            <div className="text-xs text-muted-foreground font-normal">
                              已付 {currencyPrefix(order)} {order.paid_amount.toLocaleString()}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {(() => {
                        const m = getOrderPaymentMethod(order);
                        if (!m) return <span className="text-muted-foreground">—</span>;
                        return (
                          <span className="inline-flex items-center gap-1">
                            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                            {getPaymentMethodLabel(m)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <TooltipProvider delayDuration={200}><Tooltip>
                        <TooltipTrigger asChild>
                          {onChangeOrderSource ? (
                            <button
                              onClick={() => onChangeOrderSource(order)}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${orderSourceConfig.className}`}
                            >
                              {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                              {orderSourceConfig.label}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border cursor-help ${orderSourceConfig.className}`}>
                              {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                              {orderSourceConfig.label}
                            </span>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1 text-xs">
                            <div className="flex gap-2"><span className="text-muted-foreground">來源 code：</span><span className="font-mono">{order.order_source || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground">顯示名稱：</span><span>{getOrderSourceDisplayName(order.order_source || "")}</span></div>
                            {getOrderOtaCode(order as any) && (
                              <>
                                <div className="border-t border-border/50 my-1" />
                                <div className="flex gap-2"><span className="text-muted-foreground">OTA code：</span><span className="font-mono">{getOrderOtaCode(order as any)}</span></div>
                                <div className="flex gap-2"><span className="text-muted-foreground">OTA 通路：</span><span>{getHotelnabeOtaDisplayName(getOrderOtaCode(order as any) || "")}</span></div>
                                {onChangeOrderSource && <div className="pt-1 text-muted-foreground">點擊可變更訂單來源</div>}
                              </>
                            )}
                            {!getOrderOtaCode(order as any) && onChangeOrderSource && <div className="pt-1 text-muted-foreground">點擊可變更訂單來源</div>}
                          </div>
                        </TooltipContent>
                      </Tooltip></TooltipProvider>
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
            const orderSourceConfig = getOrderSourceConfig(order.order_source, getOrderOtaCode(order as any));

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
                      <TooltipProvider delayDuration={200}><Tooltip>
                        <TooltipTrigger asChild>
                          {onChangeOrderSource ? (
                            <button
                              onClick={() => onChangeOrderSource(order)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit cursor-pointer hover:opacity-80 transition-opacity ${orderSourceConfig.className}`}
                            >
                              {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                              {orderSourceConfig.label}
                            </button>
                          ) : (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border w-fit cursor-help ${orderSourceConfig.className}`}>
                              {order.order_source === 'website' ? <Globe className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                              {orderSourceConfig.label}
                            </span>
                          )}
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1 text-xs">
                            <div className="flex gap-2"><span className="text-muted-foreground">來源 code：</span><span className="font-mono">{order.order_source || "—"}</span></div>
                            <div className="flex gap-2"><span className="text-muted-foreground">顯示名稱：</span><span>{getOrderSourceDisplayName(order.order_source || "")}</span></div>
                            {getOrderOtaCode(order as any) && (
                              <>
                                <div className="border-t border-border/50 my-1" />
                                <div className="flex gap-2"><span className="text-muted-foreground">OTA code：</span><span className="font-mono">{getOrderOtaCode(order as any)}</span></div>
                                <div className="flex gap-2"><span className="text-muted-foreground">OTA 通路：</span><span>{getHotelnabeOtaDisplayName(getOrderOtaCode(order as any) || "")}</span></div>
                              </>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip></TooltipProvider>
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
                      <span className="font-medium">{cleanGuestNameDisplay(order.guest_name)}</span>
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
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="flex items-center">
                      <DollarSign className="w-4 h-4 mr-1 text-muted-foreground" />
                      <span className="text-muted-foreground">實收金額:</span>
                    </div>
                    <span className="font-semibold text-base">{renderAmount(order, order.final_price)}</span>
                  </div>

                  {/* 已付金額 / 訂金尾款拆分（匯款） */}
                  {(() => {
                    const method = getOrderPaymentMethod(order);
                    const dep = (order as any).deposit_amount ?? 0;
                    if (method === 'bank_transfer' && dep > 0 && dep < order.final_price) {
                      const depositPaid = order.payment_status === 'deposit_paid' || order.payment_status === 'paid' || order.paid_amount >= dep;
                      const balancePaid = order.payment_status === 'paid';
                      return (
                        <div className="space-y-1 mb-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground pl-5">訂金:</span>
                            <span className="font-medium">
                              {currencyPrefix(order)} {dep.toLocaleString()}
                              <span className={`ml-2 text-xs ${depositPaid ? 'text-primary' : 'text-destructive'}`}>{depositPaid ? '已付' : '未付'}</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground pl-5">尾款:</span>
                            <span className="font-medium">
                              {currencyPrefix(order)} {(order.final_price - dep).toLocaleString()}
                              <span className={`ml-2 text-xs ${balancePaid ? 'text-primary' : 'text-destructive'}`}>{balancePaid ? '已付' : '未付'}</span>
                            </span>
                          </div>
                        </div>
                      );
                    }
                    if (order.paid_amount > 0 && order.paid_amount < order.final_price) {
                      return (
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span className="text-muted-foreground pl-5">已付:</span>
                          <span className="font-medium">{currencyPrefix(order)} {order.paid_amount.toLocaleString()}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* 付款方式與付款狀態 */}
                  <div className="flex items-center justify-between text-sm mb-3">
                    <div className="flex items-center">
                      <CreditCard className="w-4 h-4 mr-1 text-muted-foreground" />
                      <span className="text-muted-foreground mr-2">付款方式:</span>
                      <span className="font-medium">
                        {getPaymentMethodLabel(getOrderPaymentMethod(order)) || "—"}
                      </span>
                    </div>
                    {onChangePaymentStatus && order.order_status !== 'cancelled' ? (
                      <button
                        onClick={() => onChangePaymentStatus(order)}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${paymentStatusConfig.className}`}
                      >
                        {paymentStatusConfig.label}
                      </button>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${paymentStatusConfig.className}`}>
                        {paymentStatusConfig.label}
                      </span>
                    )}
                  </div>

                  {/* 操作按鈕 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="default"
                      className="flex-1 h-11 touch-manipulation gap-1.5 px-2 text-sm"
                      asChild
                    >
                      <Link to={`/admin/orders/${order.id}`} state={{ from: backTo }}>
                        <Eye className="h-4 w-4" />
                        <span>詳情</span>
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="default"
                      className="flex-1 h-11 touch-manipulation gap-1.5 px-2 text-sm"
                      asChild
                    >
                      <Link to={`/admin/orders/${order.id}?editing=true`} state={{ from: backTo }}>
                        <Edit className="h-4 w-4" />
                        <span>編輯</span>
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
