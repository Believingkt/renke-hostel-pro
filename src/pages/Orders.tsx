import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useSubdomain } from "@/hooks/use-subdomain";
import { format, addDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Order, QuickFilterType } from "@/types/order";
import { QuickFilters } from "@/components/orders/QuickFilters";
import { OrderFilters } from "@/components/orders/OrderFilters";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { EditOrderDialog } from "@/components/orders/EditOrderDialog";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
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

const Orders = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "list");
  const { accommodationId } = useSubdomain();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  
  // 編輯對話框狀態
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  
  // 快速篩選
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>("");
  
  // 篩選條件
  const [dateType, setDateType] = useState("check_in");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  
  // 排序狀態
  const [sortField, setSortField] = useState<keyof Order | "">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  
  // 分頁狀態
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // 篩選抽屜狀態
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && tab === "list") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // 載入訂單資料
  const fetchOrders = async () => {
    if (!accommodationId) return;
    
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

  useEffect(() => {
    fetchOrders();
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
    setCurrentPage(1); // 重置到第一頁
  }, [orders, startDate, endDate, paymentStatus, orderStatus, searchKeyword, quickFilter, sortField, sortDirection]);

  // 快速篩選處理
  const handleQuickFilter = (filter: QuickFilterType) => {
    setQuickFilter(filter === quickFilter ? "" : filter);
    // 清除其他篩選條件
    if (filter !== quickFilter) {
      setStartDate("");
      setEndDate("");
      setPaymentStatus("");
      setOrderStatus("");
      setSearchKeyword("");
    }
  };

  // 清除所有篩選
  const clearAllFilters = () => {
    setQuickFilter("");
    setStartDate("");
    setEndDate("");
    setPaymentStatus("");
    setOrderStatus("");
    setSearchKeyword("");
    setSortField("");
    setSortDirection("desc");
    setCurrentPage(1);
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

  const handleSaveEdit = async (form: { order_status: string; payment_status: string; notes: string }) => {
    if (!editingOrder) return;

    try {
      // 準備更新資料
      const updateData: any = {
        order_status: form.order_status,
        payment_status: form.payment_status,
        notes: form.notes || null,
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

      // 重新載入訂單
      await fetchOrders();

      toast({
        title: "更新成功",
        description: "訂單資訊已更新",
      });

      setEditDialogOpen(false);
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">訂單資訊</h1>
      </div>
      
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
                  searchKeyword={searchKeyword}
                  onDateTypeChange={setDateType}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  onPaymentStatusChange={setPaymentStatus}
                  onOrderStatusChange={setOrderStatus}
                  onSearchKeywordChange={setSearchKeyword}
                  onClear={clearAllFilters}
                />
              </div>

              {/* 行動版篩選按鈕 */}
              <div className="md:hidden">
                <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Filter className="w-4 h-4 mr-2" />
                      進階篩選
                      {(startDate || endDate || paymentStatus || orderStatus || searchKeyword) && (
                        <span className="ml-2 bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                          已套用
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>進階篩選</SheetTitle>
                      <SheetDescription>
                        設定篩選條件來找到您要的訂單
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6">
                      <OrderFilters
                        dateType={dateType}
                        startDate={startDate}
                        endDate={endDate}
                        paymentStatus={paymentStatus}
                        orderStatus={orderStatus}
                        searchKeyword={searchKeyword}
                        onDateTypeChange={setDateType}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                        onPaymentStatusChange={setPaymentStatus}
                        onOrderStatusChange={setOrderStatus}
                        onSearchKeywordChange={setSearchKeyword}
                        onClear={clearAllFilters}
                      />
                      <Button 
                        className="w-full mt-4" 
                        onClick={() => setFilterDrawerOpen(false)}
                      >
                        套用篩選
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>

              {/* 訂單表格 */}
                <OrdersTable 
                  orders={paginatedOrders} 
                  onEditOrder={handleEditOrder}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                />

                {/* 分頁資訊和控制 */}
                {filteredOrders.length > 0 && (
                  <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-sm text-muted-foreground">
                      顯示 {startIndex + 1}-{Math.min(endIndex, filteredOrders.length)} 筆，
                      共 {filteredOrders.length} 筆訂單
                    </div>
                    
                    {totalPages > 1 && (
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
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
                                  <span className="px-2">...</span>
                                )}
                                <PaginationLink
                                  onClick={() => setCurrentPage(page)}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            ))}
                          
                          <PaginationItem>
                            <PaginationNext 
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </div>
                )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 編輯訂單對話框 */}
      <EditOrderDialog
        open={editDialogOpen}
        order={editingOrder}
        onOpenChange={setEditDialogOpen}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default Orders;
