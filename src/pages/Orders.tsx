import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { format, addDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useOrderNotifications } from "@/hooks/use-order-notifications";
import { useAuditLog } from "@/hooks/use-audit-log";
import { Order, QuickFilterType, CustomMealPlan } from "@/types/order";
import { QuickFilters } from "@/components/orders/QuickFilters";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { OrderPriceEditDialog } from "@/components/orders/OrderPriceEditDialog";
import { PaymentStatusDialog } from "@/components/orders/PaymentStatusDialog";
import { OrderStatusDialog } from "@/components/orders/OrderStatusDialog";
import { OrderSourceDialog } from "@/components/orders/OrderSourceDialog";
import { CreateOrderDialog } from "@/components/orders/CreateOrderDialog";
import { CreateHoldOrderDialog } from "@/components/orders/CreateHoldOrderDialog";
import { Button } from "@/components/ui/button";
import { Filter, ShoppingCart, CalendarDays, CreditCard, Package, ShoppingBag, Plus, CalendarClock, Download, Upload } from "lucide-react";
import { exportOrdersToExcel } from "@/utils/exportOrders";
import { ImportOrdersDialog } from "@/components/orders/ImportOrdersDialog";
import { OrderMetaDrawer } from "@/components/orders/OrderMetaDrawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { AdminPageHeader } from "@/components/AdminPageHeader";

const Orders = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "list");
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const { toast } = useToast();
  const { logAction } = useAuditLog();
  
  // Enable real-time order notifications
  useOrderNotifications(true);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [hasAnyOrder, setHasAnyOrder] = useState(false);
  const [quickCounts, setQuickCounts] = useState<Record<string, number>>({});
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  
  // 新增對話框狀態
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);

  // 行銷資訊補填 Drawer
  const [metaDrawerOrderId, setMetaDrawerOrderId] = useState<string | null>(null);
  const [metaDrawerOpen, setMetaDrawerOpen] = useState(false);

  // 修改金額對話框狀態
  const [priceEditDialogOpen, setPriceEditDialogOpen] = useState(false);
  const [priceEditingOrder, setPriceEditingOrder] = useState<Order | null>(null);

  // 付款狀態對話框
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [paymentStatusOrder, setPaymentStatusOrder] = useState<Order | null>(null);

  // 訂單狀態對話框
  const [orderStatusDialogOpen, setOrderStatusDialogOpen] = useState(false);
  const [orderStatusOrder, setOrderStatusOrder] = useState<Order | null>(null);

  // 訂單來源對話框
  const [orderSourceDialogOpen, setOrderSourceDialogOpen] = useState(false);
  const [orderSourceOrder, setOrderSourceOrder] = useState<Order | null>(null);
  
  // 快速篩選
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>((searchParams.get("qf") || "") as QuickFilterType);
  
  // 篩選條件 - 從 URL 參數初始化
  const [dateType, setDateType] = useState(searchParams.get("dt") || "check_in");
  const [startDate, setStartDate] = useState(searchParams.get("sd") || "");
  const [endDate, setEndDate] = useState(searchParams.get("ed") || "");
  const [paymentStatus, setPaymentStatus] = useState(searchParams.get("ps") || "");
  const [orderStatus, setOrderStatus] = useState(searchParams.get("os") || "");
  const [orderSource, setOrderSource] = useState(searchParams.get("src") || "");
  const [searchKeyword, setSearchKeyword] = useState(searchParams.get("kw") || "");
  
  // 排序狀態
  const [sortField, setSortField] = useState<keyof Order | "">((searchParams.get("sf") || "") as keyof Order | "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">((searchParams.get("sdir") === "asc" ? "asc" : "desc"));
  
  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // 篩選觸發計數器（點擊查詢按鈕時遞增）— 觸發後端重新 query
  const [filterTrigger, setFilterTrigger] = useState(0);
  
  // 篩選抽屜狀態
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab === "list") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 載入訂單資料
  // 將篩選條件套到 Supabase query builder 上（後端 query）
  const applyServerFilters = useCallback((q: any) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    if (quickFilter === "pending") {
      q = q.eq("order_status", "pending");
    } else if (quickFilter === "today_checkin") {
      q = q.eq("check_in_date", today).neq("order_status", "cancelled");
    } else if (quickFilter === "today_checkout") {
      q = q.eq("check_out_date", today).neq("order_status", "cancelled");
    } else if (quickFilter === "unpaid") {
      q = q.eq("payment_status", "unpaid").neq("order_status", "cancelled");
    } else if (quickFilter === "upcoming") {
      q = q.gte("check_in_date", today).lte("check_in_date", next7Days).neq("order_status", "cancelled");
    }

    if (startDate || endDate) {
      if (dateType === "order") {
        if (startDate) q = q.gte("order_date", startDate);
        if (endDate) q = q.lte("order_date", `${endDate}T23:59:59.999Z`);
      } else {
        if (startDate) q = q.gte("check_in_date", startDate);
        if (endDate) q = q.lte("check_in_date", endDate);
      }
    }
    if (paymentStatus) q = q.eq("payment_status", paymentStatus);
    if (orderStatus) q = q.eq("order_status", orderStatus);
    if (orderSource) q = q.eq("order_source", orderSource);
    if (searchKeyword) {
      const kw = searchKeyword.replace(/[%,()]/g, "").trim();
      if (kw) {
        q = q.or(
          `order_number.ilike.%${kw}%,guest_name.ilike.%${kw}%,guest_phone.ilike.%${kw}%`,
        );
      }
    }
    return q;
  }, [quickFilter, dateType, startDate, endDate, paymentStatus, orderStatus, orderSource, searchKeyword]);

  // 後端分頁載入訂單
  const fetchOrders = useCallback(async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
    if (!accommodationId) return;
    try {
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let q: any = supabase
        .from("orders")
        .select(`*, room_types ( id, name )`, { count: "exact" })
        .eq("accommodation_id", accommodationId);
      q = applyServerFilters(q);
      const sf = (sortField || "order_date") as string;
      q = q.order(sf, { ascending: sortDirection === "asc" }).range(from, to);

      const [ordersResult, templatesResult] = await Promise.all([
        q,
        supabase
          .from("pricing_templates")
          .select("meal_plans")
          .eq("accommodation_id", accommodationId)
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      if (ordersResult.error) throw ordersResult.error;
      setOrders((ordersResult.data ?? []) as Order[]);
      setTotal(ordersResult.count ?? 0);

      if (templatesResult.data?.meal_plans && Array.isArray(templatesResult.data.meal_plans)) {
        setCustomMealPlans(templatesResult.data.meal_plans as unknown as CustomMealPlan[]);
      }
      setError(null);
    } catch (e) {
      console.error("Error fetching orders:", e);
      if (showLoading) {
        setError(e instanceof Error ? e.message : "載入訂單時發生錯誤");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accommodationId, currentPage, itemsPerPage, sortField, sortDirection, quickFilter, filterTrigger]);

  useEffect(() => {
    fetchOrders({ showLoading: true });
  }, [fetchOrders]);

  // 載入快速篩選的計數（不受其他篩選影響）
  const fetchQuickCounts = useCallback(async () => {
    if (!accommodationId) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");
    const base = () =>
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("accommodation_id", accommodationId);

    const [pendingR, ciR, coR, unpaidR, upcomingR, anyR] = await Promise.all([
      base().eq("order_status", "pending"),
      base().eq("check_in_date", today).neq("order_status", "cancelled"),
      base().eq("check_out_date", today).neq("order_status", "cancelled"),
      base().eq("payment_status", "unpaid").neq("order_status", "cancelled"),
      base().gte("check_in_date", today).lte("check_in_date", next7Days).neq("order_status", "cancelled"),
      base(),
    ]);
    setQuickCounts({
      pending: pendingR.count ?? 0,
      today_checkin: ciR.count ?? 0,
      today_checkout: coR.count ?? 0,
      unpaid: unpaidR.count ?? 0,
      upcoming: upcomingR.count ?? 0,
    });
    setHasAnyOrder((anyR.count ?? 0) > 0);
  }, [accommodationId]);

  useEffect(() => {
    fetchQuickCounts();
  }, [fetchQuickCounts]);

  // Set up real-time subscription to refetch orders on changes
  useEffect(() => {
    if (!accommodationId) return;

    const channel = supabase
      .channel('orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `accommodation_id=eq.${accommodationId}`
        },
        () => {
          fetchOrders();
          fetchQuickCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId, fetchOrders, fetchQuickCounts]);



  // 將篩選狀態同步到 URL
  const syncFiltersToUrl = () => {
    const params = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, val: string) => {
      if (val) params.set(key, val);
      else params.delete(key);
    };
    setOrDelete("qf", quickFilter);
    setOrDelete("dt", dateType !== "check_in" ? dateType : "");
    setOrDelete("sd", startDate);
    setOrDelete("ed", endDate);
    setOrDelete("ps", paymentStatus);
    setOrDelete("os", orderStatus);
    setOrDelete("src", orderSource);
    setOrDelete("kw", searchKeyword);
    setOrDelete("sf", sortField);
    setOrDelete("sdir", sortDirection !== "desc" ? sortDirection : "");
    setSearchParams(params, { replace: true });
  };

  // 快速篩選處理
  const handleQuickFilter = (filter: QuickFilterType) => {
    const newFilter = filter === quickFilter ? "" : filter;
    setQuickFilter(newFilter);
    setCurrentPage(1);
    // 清除其他篩選條件
    if (filter !== quickFilter) {
      setStartDate("");
      setEndDate("");
      setPaymentStatus("");
      setOrderStatus("");
      setSearchKeyword("");
    }
    // 同步 URL
    const params = new URLSearchParams(searchParams);
    if (newFilter) params.set("qf", newFilter);
    else params.delete("qf");
    // 清除詳細篩選參數
    if (filter !== quickFilter) {
      ["sd", "ed", "ps", "os", "kw"].forEach(k => params.delete(k));
    }
    setSearchParams(params, { replace: true });
  };

  // 清除所有篩選
  const clearAllFilters = () => {
    setQuickFilter("");
    setStartDate("");
    setEndDate("");
    setPaymentStatus("");
    setOrderStatus("");
    setOrderSource("");
    setSearchKeyword("");
    setSortField("");
    setSortDirection("desc");
    setCurrentPage(1);
    setFilterTrigger(prev => prev + 1);
    // 清除 URL 篩選參數
    const params = new URLSearchParams();
    const accId = searchParams.get("accId");
    const tab = searchParams.get("tab");
    if (tab) params.set("tab", tab);
    if (accId) params.set("accId", accId);
    setSearchParams(params, { replace: true });
  };

  // 手動觸發篩選查詢
  const handleFilterSubmit = () => {
    // 提交進階篩選時，清除快速篩選以避免衝突
    if (quickFilter) {
      setQuickFilter("");
      const params = new URLSearchParams(searchParams);
      params.delete("qf");
      setSearchParams(params, { replace: true });
    }
    setCurrentPage(1);
    setFilterTrigger(prev => prev + 1);
    syncFiltersToUrl();
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [accommodationId]);

  // 處理排序
  const handleSort = (field: keyof Order) => {
    if (sortField === field) {
      // 切換排序方向
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // 新欄位，預設降序
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // 計算分頁
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const safeCurrentPage = totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  // 計算快速篩選的數量
  const getQuickFilterCount = (filter: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    switch (filter) {
      case "pending":
        return orders.filter(order => order.order_status === "pending").length;
      case "today_checkin":
        return orders.filter(order => order.check_in_date === today && order.order_status !== "cancelled").length;
      case "today_checkout":
        return orders.filter(order => order.check_out_date === today && order.order_status !== "cancelled").length;
      case "unpaid":
        return orders.filter(order => order.payment_status === "unpaid" && order.order_status !== "cancelled").length;
      case "upcoming":
        return orders.filter(order => 
          order.check_in_date >= today && 
          order.check_in_date <= next7Days &&
          order.order_status !== "cancelled"
        ).length;
      default:
        return 0;
    }
  };

  const handleEditPrice = (order: Order) => {
    setPriceEditingOrder(order);
    setPriceEditDialogOpen(true);
  };

  const handleChangePaymentStatus = (order: Order) => {
    setPaymentStatusOrder(order);
    setPaymentStatusDialogOpen(true);
  };

  const handleChangeOrderStatus = (order: Order) => {
    setOrderStatusOrder(order);
    setOrderStatusDialogOpen(true);
  };

  const handleChangeOrderSource = (order: Order) => {
    setOrderSourceOrder(order);
    setOrderSourceDialogOpen(true);
  };

  if (loading) {
    return <TableSkeleton rows={20} columns={8} showSearch showFilters />;
  }

  if (error) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="目前沒有訂單"
        description="尚未建立任何訂單，點擊下方按鈕新增第一筆訂單"
        action={{
          label: "新增訂單",
          onClick: () => setCreateDialogOpen(true),
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="訂單列表"
        icon={ShoppingBag}
        breadcrumbs={[{ label: "訂單資訊" }]}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
              if (filteredOrders.length === 0) {
                  toast({ title: "無資料可匯出", description: "目前沒有符合條件的訂單", variant: "destructive" });
                  return;
                }
                exportOrdersToExcel(filteredOrders).then(() => {
                  toast({ title: "匯出成功", description: `已匯出 ${filteredOrders.length} 筆訂單` });
                }).catch(() => {
                  toast({ title: "匯出失敗", description: "匯出過程中發生錯誤", variant: "destructive" });
                });
              }}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">匯出 Excel</span>
            </Button>
            <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">匯入訂單</span>
            </Button>
            <Button variant="outline" onClick={() => setHoldDialogOpen(true)} className="gap-2">
              <CalendarClock className="h-4 w-4" />
              <span className="hidden sm:inline">新增保留單</span>
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">新增訂單</span>
            </Button>
          </div>
        }
      />
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="list">
          <Card>
            <CardContent className="pt-6 space-y-6">
              {/* 快速篩選標籤 */}
              <QuickFilters
                quickFilter={quickFilter}
                onFilterChange={handleQuickFilter}
                getFilterCount={getQuickFilterCount}
              />

              {/* 桌面版篩選區域 */}
              <div className="hidden md:block">
                <OrderFilters
                  dateType={dateType}
                  startDate={startDate}
                  endDate={endDate}
                  paymentStatus={paymentStatus}
                  orderStatus={orderStatus}
                  orderSource={orderSource}
                  searchKeyword={searchKeyword}
                  accommodationId={accommodationId}
                  onDateTypeChange={setDateType}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onPaymentStatusChange={setPaymentStatus}
                  onOrderStatusChange={setOrderStatus}
                  onOrderSourceChange={setOrderSource}
                  onSearchKeywordChange={setSearchKeyword}
                  onClear={clearAllFilters}
                  onSubmit={handleFilterSubmit}
                />
              </div>

              {/* 行動版篩選按鈕 */}
              <div className="md:hidden">
                <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="w-full h-12 touch-manipulation">
                      <Filter className="w-5 h-5 mr-2" />
                      <span className="text-base">進階篩選</span>
                      {(startDate || endDate || paymentStatus || orderStatus || orderSource || searchKeyword) && (
                        <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-xs font-medium">
                          已套用
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                    <SheetHeader className="pb-4">
                      <SheetTitle className="text-lg">進階篩選</SheetTitle>
                      <SheetDescription className="text-sm">
                        設定篩選條件來找到您要的訂單
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 pb-6">
                      <OrderFilters
                        dateType={dateType}
                        startDate={startDate}
                        endDate={endDate}
                        paymentStatus={paymentStatus}
                        orderStatus={orderStatus}
                        orderSource={orderSource}
                        searchKeyword={searchKeyword}
                        accommodationId={accommodationId}
                        onDateTypeChange={setDateType}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                        onPaymentStatusChange={setPaymentStatus}
                        onOrderStatusChange={setOrderStatus}
                        onOrderSourceChange={setOrderSource}
                        onSearchKeywordChange={setSearchKeyword}
                        onClear={clearAllFilters}
                        onSubmit={() => {
                          handleFilterSubmit();
                          setFilterDrawerOpen(false);
                        }}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* 訂單表格 */}
              {filteredOrders.length === 0 ? (
                orders.length === 0 ? (
                  // 完全沒有訂單的空狀態
                  <EmptyState
                    icon={ShoppingCart}
                    title="歡迎使用訂單管理"
                    description="目前還沒有任何訂單。開始建立第一筆訂單，追蹤預訂狀態與營運數據。"
                    action={{
                      label: "建立第一筆訂單",
                      onClick: () => setCreateDialogOpen(true)
                    }}
                    suggestions={[
                      {
                        icon: CalendarDays,
                        title: "管理預訂",
                        description: "輕鬆記錄入住和退房日期，追蹤訂單狀況。"
                      },
                      {
                        icon: CreditCard,
                        title: "追蹤付款",
                        description: "管理付款狀態與付款方式，掌握現金流。"
                      },
                      {
                        icon: Package,
                        title: "處理訂單",
                        description: "從待確認到已完成，完整的訂單生命週期管理。"
                      }
                    ]}
                  />
                ) : (
                  // 有訂單但被篩選掉的空狀態
                  <EmptyState
                    icon={ShoppingCart}
                    title="查無符合的訂單"
                    description="目前沒有符合篩選條件的訂單，請調整篩選條件或清除篩選查看所有訂單。"
                  />
                )
              ) : (
                <>
                  <OrdersTable 
                    orders={paginatedOrders} 
                    onEditOrder={() => {}}
                    onEditPrice={handleEditPrice}
                    onChangePaymentStatus={handleChangePaymentStatus}
                    onChangeOrderStatus={handleChangeOrderStatus}
                    onChangeOrderSource={handleChangeOrderSource}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    customMealPlans={customMealPlans}
                  />

                  {/* 分頁資訊和控制 */}
                  {filteredOrders.length > 0 && (
                  <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                        <div className="text-sm text-muted-foreground whitespace-nowrap">
                          顯示 {startIndex + 1} 至 {Math.min(endIndex, filteredOrders.length)} 筆，共 {filteredOrders.length} 筆訂單
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">每頁顯示</span>
                          <Select
                            value={itemsPerPage.toString()}
                            onValueChange={(value) => {
                              setItemsPerPage(Number(value));
                              setCurrentPage(1);
                            }}
                          >
                            <SelectTrigger className="w-24 h-11 sm:h-9 touch-manipulation">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-background border-border z-50">
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                              <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {totalPages > 1 && (
                        <Pagination className="mx-0 w-full lg:w-auto justify-start lg:justify-end">
                          <PaginationContent className="gap-2 md:gap-1.5 flex-wrap">
                            <PaginationItem>
                              <PaginationPrevious 
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                className={`h-10 touch-manipulation ${currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                              >
                                上一頁
                              </PaginationPrevious>
                            </PaginationItem>
                            
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(page => {
                                // 顯示第一頁、最後一頁、當前頁及其前後各一頁
                                 return page === 1 || 
                                        page === totalPages || 
                                        Math.abs(page - safeCurrentPage) <= 1;
                              })
                              .map((page, index, array) => (
                                <PaginationItem key={page}>
                                  {/* 顯示省略號 */}
                                  {index > 0 && array[index - 1] !== page - 1 && (
                                    <span className="px-2 md:px-2 text-muted-foreground">...</span>
                                  )}
                                  <PaginationLink
                                     onClick={() => setCurrentPage(page)}
                                     isActive={safeCurrentPage === page}
                                    className="h-10 touch-manipulation cursor-pointer"
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              ))}
                            
                            <PaginationItem>
                              <PaginationNext 
                                 onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                 className={`h-10 touch-manipulation ${safeCurrentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
                              >
                                下一頁
                              </PaginationNext>
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 新增訂單對話框 */}
      <CreateOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={(orderId) => {
          void fetchOrders();
          setMetaDrawerOrderId(orderId);
          setMetaDrawerOpen(true);
        }}
      />

      {/* 訂單行銷資訊補填 Drawer */}
      <OrderMetaDrawer
        orderId={metaDrawerOrderId}
        open={metaDrawerOpen}
        onClose={() => {
          setMetaDrawerOpen(false);
          setMetaDrawerOrderId(null);
        }}
      />

      {/* 修改金額對話框 */}
      <OrderPriceEditDialog
        order={priceEditingOrder}
        open={priceEditDialogOpen}
        onOpenChange={setPriceEditDialogOpen}
        onSuccess={fetchOrders}
      />

      {/* 新增保留單對話框 */}
      <CreateHoldOrderDialog
        open={holdDialogOpen}
        onOpenChange={setHoldDialogOpen}
        onSuccess={fetchOrders}
      />

      {/* 付款狀態對話框 */}
      <PaymentStatusDialog
        order={paymentStatusOrder}
        open={paymentStatusDialogOpen}
        onOpenChange={setPaymentStatusDialogOpen}
        onSuccess={fetchOrders}
      />

      {/* 訂單狀態對話框 */}
      <OrderStatusDialog
        order={orderStatusOrder}
        open={orderStatusDialogOpen}
        onOpenChange={setOrderStatusDialogOpen}
        onSuccess={fetchOrders}
      />

      {/* 訂單來源對話框 */}
      <OrderSourceDialog
        order={orderSourceOrder}
        open={orderSourceDialogOpen}
        onOpenChange={setOrderSourceDialogOpen}
        onSuccess={fetchOrders}
        accommodationId={accommodationId}
      />

      {/* 匯入訂單對話框 */}
      {accommodationId && (
        <ImportOrdersDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          accommodationId={accommodationId}
          onSuccess={fetchOrders}
        />
      )}
    </div>
  );
};

export default Orders;
