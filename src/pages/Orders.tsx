import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { OrderPriceEditDialog } from "@/components/orders/OrderPriceEditDialog";
import { PaymentStatusDialog } from "@/components/orders/PaymentStatusDialog";
import { OrderStatusDialog } from "@/components/orders/OrderStatusDialog";
import { OrderSourceDialog } from "@/components/orders/OrderSourceDialog";
import { CreateOrderDialog } from "@/components/orders/CreateOrderDialog";
import { CreateHoldOrderDialog } from "@/components/orders/CreateHoldOrderDialog";
import { Button } from "@/components/ui/button";
import { Filter, ShoppingCart, CalendarDays, CreditCard, Package, ShoppingBag, Home, Plus, CalendarClock, Download } from "lucide-react";
import { exportOrdersToExcel } from "@/utils/exportOrders";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
import { PageHeader } from "@/components/PageHeader";

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
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [customMealPlans, setCustomMealPlans] = useState<CustomMealPlan[]>([]);
  
  // 編輯對話框狀態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  // 新增對話框狀態
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);

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
  
  // 篩選觸發計數器（點擊查詢按鈕時遞增）
  const [filterTrigger, setFilterTrigger] = useState(0);
  // 如果 URL 中已有篩選參數，初始載入時也要觸發一次篩選
  const hasInitialFilters = !!(searchParams.get("sd") || searchParams.get("ps") || searchParams.get("os") || searchParams.get("src") || searchParams.get("kw"));
  const [initialFilterApplied, setInitialFilterApplied] = useState(false);
  
  // 篩選抽屜狀態
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab === "list") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 檢查是否從預訂管理頁面開啟
  const isFromRoomInventory = searchParams.get("edit") !== null;

  // 處理 URL 中的 edit 參數，自動開啟編輯對話框
  useEffect(() => {
    const editOrderId = searchParams.get("edit");
    if (editOrderId && orders.length > 0 && !loading) {
      const orderToEdit = orders.find(order => order.id === editOrderId);
      if (orderToEdit) {
        setEditingOrder(orderToEdit);
        setEditDialogOpen(true);
      }
    }
  }, [searchParams, orders, loading]);

  // 處理編輯對話框關閉（從預訂管理頁面開啟時）
  const handleEditDialogClose = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open && isFromRoomInventory) {
      // 通知預訂管理頁面重新載入
      localStorage.setItem('room-inventory-refresh', Date.now().toString());
      // 關閉視窗
      window.close();
    }
  };

  // 載入訂單資料
  const fetchOrders = async () => {
    if (!accommodationId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // 同時獲取訂單和自訂餐食方案
      const [ordersResult, templatesResult] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            *,
            room_types (
              id,
              name
            )
          `)
          .eq("accommodation_id", accommodationId)
          .order("order_date", { ascending: false }),
        supabase
          .from("pricing_templates")
          .select("meal_plans")
          .eq("accommodation_id", accommodationId)
          .eq("is_default", true)
          .maybeSingle()
      ]);

      if (ordersResult.error) throw ordersResult.error;
      
      if (ordersResult.data) {
        setOrders(ordersResult.data);
        setFilteredOrders(ordersResult.data);
      }

      if (templatesResult.data?.meal_plans && Array.isArray(templatesResult.data.meal_plans)) {
        setCustomMealPlans(templatesResult.data.meal_plans as unknown as CustomMealPlan[]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setError(error instanceof Error ? error.message : "載入訂單時發生錯誤");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [accommodationId]);

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
          // Refetch orders when any change occurs
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId]);

  // 套用篩選
  const applyFilters = () => {
    let filtered = [...orders];

    // 快速篩選
    const today = format(new Date(), "yyyy-MM-dd");
    const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    if (quickFilter) {
      switch (quickFilter) {
        case "pending":
          filtered = filtered.filter(order => order.order_status === "pending");
          break;
        case "today_checkin":
          filtered = filtered.filter(order => order.check_in_date === today);
          break;
        case "today_checkout":
          filtered = filtered.filter(order => order.check_out_date === today);
          break;
        case "unpaid":
          filtered = filtered.filter(order => order.payment_status === "unpaid");
          break;
        case "upcoming":
          filtered = filtered.filter(order => 
            order.check_in_date >= today && 
            order.check_in_date <= next7Days &&
            order.order_status !== "cancelled"
          );
          break;
      }
    }

    // 日期篩選
    if (startDate && endDate) {
      if (dateType === "check_in") {
        filtered = filtered.filter(
          order => order.check_in_date >= startDate && order.check_in_date <= endDate
        );
      } else if (dateType === "order") {
        filtered = filtered.filter(
          order => format(new Date(order.order_date), "yyyy-MM-dd") >= startDate &&
                   format(new Date(order.order_date), "yyyy-MM-dd") <= endDate
        );
      }
    }

    // 付款狀態篩選
    if (paymentStatus) {
      filtered = filtered.filter(order => order.payment_status === paymentStatus);
    }

    // 訂單狀態篩選
    if (orderStatus) {
      filtered = filtered.filter(order => order.order_status === orderStatus);
    }

    // 訂單來源篩選
    if (orderSource) {
      filtered = filtered.filter(order => order.order_source === orderSource);
    }

    // 關鍵字搜尋
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(order =>
        order.order_number.toLowerCase().includes(keyword) ||
        order.guest_name.toLowerCase().includes(keyword) ||
        order.guest_phone.includes(keyword)
      );
    }

    // 排序
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue = a[sortField];
        let bValue = b[sortField];

        // 處理特殊欄位
        if (sortField === "order_date" || sortField === "check_in_date" || sortField === "check_out_date") {
          aValue = new Date(aValue as string).getTime();
          bValue = new Date(bValue as string).getTime();
        }

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    setFilteredOrders(filtered);
  };

  useEffect(() => {
    applyFilters();
    if (!hasInitialFilters || initialFilterApplied) {
      setCurrentPage(1);
    }
  }, [orders, quickFilter, sortField, sortDirection, filterTrigger]);

  // 初次載入時，如果 URL 有篩選參數，自動觸發一次篩選
  useEffect(() => {
    if (hasInitialFilters && orders.length > 0 && !initialFilterApplied) {
      setInitialFilterApplied(true);
      applyFilters();
    }
  }, [orders, hasInitialFilters, initialFilterApplied]);

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
    setFilterTrigger(prev => prev + 1);
    syncFiltersToUrl();
  };

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
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // 計算快速篩選的數量
  const getQuickFilterCount = (filter: string) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    switch (filter) {
      case "pending":
        return orders.filter(order => order.order_status === "pending").length;
      case "today_checkin":
        return orders.filter(order => order.check_in_date === today).length;
      case "today_checkout":
        return orders.filter(order => order.check_out_date === today).length;
      case "unpaid":
        return orders.filter(order => order.payment_status === "unpaid").length;
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

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setEditDialogOpen(true);
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

  const handleSaveEdit = async (form: { 
    order_status: string; 
    payment_status: string;
    deposit_payment_method: string;
    balance_payment_method: string;
    deposit_amount: number;
    notes: string;
    check_in_date: string;
    check_out_date: string;
    room_type_id: string;
    guest_count: number;
    total_price: number;
    discount_amount: number;
    final_price: number;
    discount_code: string | null;
    meal_plan: string | null;
    meal_plan_details: { addon_id: string; quantity: number }[] | null;
    guest_name: string;
    guest_phone: string;
    guest_email: string;
  }) => {
    if (!editingOrder) return;

    try {
      // 準備更新資料
      const updateData: any = {
        order_status: form.order_status,
        payment_status: form.payment_status,
        deposit_payment_method: form.deposit_payment_method || null,
        balance_payment_method: form.balance_payment_method || null,
        deposit_amount: form.deposit_amount || 0,
        paid_amount: form.payment_status === "deposit_paid" ? form.deposit_amount : (form.payment_status === "paid" ? form.final_price : 0),
        notes: form.notes || null,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        room_type_id: form.room_type_id,
        guest_count: form.guest_count,
        total_price: form.total_price,
        discount_amount: form.discount_amount,
        discount_code: form.discount_code,
        final_price: form.final_price,
        meal_plan: form.meal_plan,
        meal_plan_details: form.meal_plan_details,
        guest_name: form.guest_name.trim(),
        guest_phone: form.guest_phone.trim(),
        guest_email: form.guest_email.trim() || null,
        updated_at: new Date().toISOString(),
      };

      // 如果訂單狀態改變，自動記錄時間戳
      const now = new Date().toISOString();
      const statusChanged = editingOrder.order_status !== form.order_status;
      
      if (statusChanged) {
        switch (form.order_status) {
          case "confirmed":
            updateData.confirmed_at = now;
            break;
          case "checked_in":
            updateData.checked_in_at = now;
            break;
          case "checked_out":
            updateData.checked_out_at = now;
            break;
          case "cancelled":
            updateData.cancelled_at = now;
            break;
        }
      }

      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", editingOrder.id);

      if (error) throw error;

      // Update or create customer record
      const guestName = form.guest_name.trim();
      const guestPhone = form.guest_phone.trim();
      const guestEmail = form.guest_email.trim() || null;

      if (accommodationId && guestPhone) {
        // Check if customer already exists by phone number
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id, visit_count")
          .eq("accommodation_id", accommodationId)
          .eq("phone", guestPhone)
          .maybeSingle();

        if (existingCustomer) {
          // Update existing customer and link to order if not already linked
          if (!editingOrder.customer_id) {
            await supabase
              .from("orders")
              .update({ customer_id: existingCustomer.id })
              .eq("id", editingOrder.id);
          }
          // Update customer info
          await supabase
            .from("customers")
            .update({
              name: guestName,
              email: guestEmail,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingCustomer.id);
        } else if (!editingOrder.customer_id) {
          // Create new customer if order doesn't have one
          const { data: newCustomer } = await supabase
            .from("customers")
            .insert({
              accommodation_id: accommodationId,
              name: guestName,
              phone: guestPhone,
              email: guestEmail,
              visit_count: 1,
              first_order_date: form.check_in_date,
            })
            .select("id")
            .single();

          // Link customer to order
          if (newCustomer?.id) {
            await supabase
              .from("orders")
              .update({ customer_id: newCustomer.id })
              .eq("id", editingOrder.id);
          }
        }
      }

      // 重新載入訂單
      await fetchOrders();

      // 記錄操作日誌
      const isCancelled = form.order_status === "cancelled" && editingOrder.order_status !== "cancelled";
      await logAction({
        actionType: isCancelled ? "delete" : "update",
        actionCategory: "order",
        entityType: "order",
        entityId: editingOrder.id,
        entityName: editingOrder.order_number,
        accommodationId: accommodationId,
        details: isCancelled ? {
          reason: "訂單已取消",
          guest_name: editingOrder.guest_name,
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          final_price: form.final_price,
        } : {
          changes: {
            order_status: statusChanged ? { from: editingOrder.order_status, to: form.order_status } : undefined,
            payment_status: editingOrder.payment_status !== form.payment_status ? { from: editingOrder.payment_status, to: form.payment_status } : undefined,
            check_in_date: editingOrder.check_in_date !== form.check_in_date ? { from: editingOrder.check_in_date, to: form.check_in_date } : undefined,
            check_out_date: editingOrder.check_out_date !== form.check_out_date ? { from: editingOrder.check_out_date, to: form.check_out_date } : undefined,
            final_price: editingOrder.final_price !== form.final_price ? { from: editingOrder.final_price, to: form.final_price } : undefined,
          },
          guest_name: editingOrder.guest_name,
        },
      });

      toast({
        title: isCancelled ? "訂單已取消" : "更新成功",
        description: isCancelled ? "訂單已成功取消" : "訂單資訊已更新",
      });

      // 使用新的關閉處理函數
      handleEditDialogClose(false);
    } catch (error) {
      console.error("Error updating order:", error);
      toast({
        title: "更新失敗",
        description: "無法更新訂單資訊",
        variant: "destructive",
      });
    }
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
    <div className="space-y-6 md:space-y-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/admin" className="flex items-center hover:opacity-70 transition-opacity">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink className="text-muted-foreground">訂單資訊</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>訂單列表</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title="訂單列表"
        icon={ShoppingBag}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (filteredOrders.length === 0) {
                  toast({ title: "無資料可匯出", description: "目前沒有符合條件的訂單", variant: "destructive" });
                  return;
                }
                exportOrdersToExcel(filteredOrders);
                toast({ title: "匯出成功", description: `已匯出 ${filteredOrders.length} 筆訂單` });
              }}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">匯出 Excel</span>
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
                        description: "管理訂金、尾款和付款狀態，掌握現金流。"
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
                    onEditOrder={handleEditOrder}
                    onEditPrice={handleEditPrice}
                    onChangePaymentStatus={handleChangePaymentStatus}
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
                                       Math.abs(page - currentPage) <= 1;
                              })
                              .map((page, index, array) => (
                                <PaginationItem key={page}>
                                  {/* 顯示省略號 */}
                                  {index > 0 && array[index - 1] !== page - 1 && (
                                    <span className="px-2 md:px-2 text-muted-foreground">...</span>
                                  )}
                                  <PaginationLink
                                    onClick={() => setCurrentPage(page)}
                                    isActive={currentPage === page}
                                    className="h-10 touch-manipulation cursor-pointer"
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              ))}
                            
                            <PaginationItem>
                              <PaginationNext 
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                className={`h-10 touch-manipulation ${currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
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

      {/* 編輯訂單對話框 */}
      <EditOrderDialog
        open={editDialogOpen}
        order={editingOrder}
        onOpenChange={handleEditDialogClose}
        onSave={handleSaveEdit}
        onCancel={async (orderId) => {
          const { error } = await supabase
            .from("orders")
            .update({ order_status: "cancelled", cancelled_at: new Date().toISOString() })
            .eq("id", orderId);
          if (error) {
            toast({ title: "取消失敗", description: error.message, variant: "destructive" });
          } else {
            toast({ title: "訂單已取消" });
            fetchOrders();
          }
        }}
        onDelete={async (orderId) => {
          const { error } = await supabase
            .from("orders")
            .delete()
            .eq("id", orderId);
          if (error) {
            toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
          } else {
            toast({ title: "訂單已刪除" });
            fetchOrders();
          }
        }}
      />

      {/* 新增訂單對話框 */}
      <CreateOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchOrders}
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
    </div>
  );
};

export default Orders;
