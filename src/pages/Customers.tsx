import { useState, useEffect } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Plus, Pencil, Trash2, Search, FileText, Users, Phone, Mail, Calendar, UserRound, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CustomerQuickPreview } from "@/components/customers/CustomerQuickPreview";
import { AdminPageHeader } from "@/components/AdminPageHeader";

// Validation schema for customer inputs
const customerSchema = z.object({
  name: z.string()
    .trim()
    .min(1, "姓名不能為空")
    .max(100, "姓名長度不能超過 100 字元"),
  phone: z.string()
    .trim()
    .max(20, "手機號碼長度不能超過 20 字元")
    .regex(/^[0-9\-\+\(\)\s]*$/, "手機號碼格式不正確")
    .optional()
    .or(z.literal("")),
  email: z.string()
    .trim()
    .email("Email 格式不正確")
    .max(255, "Email 長度不能超過 255 字元")
    .optional()
    .or(z.literal("")),
  notes: z.string()
    .trim()
    .max(1000, "備註長度不能超過 1000 字元")
    .optional()
    .or(z.literal("")),
  visit_count: z.number()
    .int("來訪次數必須是整數")
    .min(0, "來訪次數不能為負數")
    .max(999999, "來訪次數超出範圍"),
});

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  nationality: string | null;
  first_order_date: string | null;
  visit_count: number;
  notes: string | null;
  created_at: string;
}

const Customers = () => {
  const isMobile = useIsMobile();
  const { currentAccommodationId } = useAccommodation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortField, setSortField] = useState<'name' | 'visit_count' | 'first_order_date' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    gender: "",
    nationality: "",
    first_order_date: "",
    visit_count: "0",
    notes: "",
  });

  useEffect(() => {
    if (currentAccommodationId) {
      loadCustomers();
    }
  }, [currentAccommodationId]);

  useEffect(() => {
    // 當搜尋條件改變時過濾顧客列表並重置到第一頁
    if (searchQuery.trim() === "") {
      setFilteredCustomers(customers);
    } else {
      const query = searchQuery.toLowerCase().trim();
      const filtered = customers.filter(customer => 
        customer.name.toLowerCase().includes(query) ||
        (customer.phone && customer.phone.toLowerCase().includes(query))
      );
      setFilteredCustomers(filtered);
    }
    setCurrentPage(1);
  }, [searchQuery, customers]);

  // 排序處理函數
  const handleSort = (field: 'name' | 'visit_count' | 'first_order_date') => {
    if (sortField === field) {
      // 如果點擊相同欄位，切換排序方向
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 如果點擊不同欄位，設定新欄位並預設為升序
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // 獲取排序圖標
  const getSortIcon = (field: 'name' | 'visit_count' | 'first_order_date') => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-primary" />
      : <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
  };

  // 應用排序
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (!sortField) return 0;

    let comparison = 0;
    
    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name, 'zh-TW');
        break;
      case 'visit_count':
        comparison = a.visit_count - b.visit_count;
        break;
      case 'first_order_date':
        const dateA = a.first_order_date ? new Date(a.first_order_date).getTime() : 0;
        const dateB = b.first_order_date ? new Date(b.first_order_date).getTime() : 0;
        comparison = dateA - dateB;
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // 計算分頁資料
  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCustomers = sortedCustomers.slice(startIndex, endIndex);

  const loadCustomers = async () => {
    if (!currentAccommodationId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("customers")
        .select("*")
        .eq("accommodation_id", currentAccommodationId)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setCustomers(data || []);
      setFilteredCustomers(data || []);
    } catch (err) {
      console.error("載入顧客資料時發生錯誤:", err);
      setError("載入顧客資料時發生錯誤，請稍後再試");
      toast.error("載入失敗", {
        description: "無法載入顧客資料",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      setFormData({
        name: customer.name,
        phone: customer.phone || "",
        email: customer.email || "",
        gender: customer.gender || "",
        nationality: customer.nationality || "",
        first_order_date: customer.first_order_date || "",
        visit_count: customer.visit_count.toString(),
        notes: customer.notes || "",
      });
    } else {
      setEditingCustomer(null);
      setFormData({
        name: "",
        phone: "",
        email: "",
        gender: "",
        nationality: "",
        first_order_date: "",
        visit_count: "0",
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccommodationId) {
      toast.error("錯誤", { description: "無法取得住宿 ID" });
      return;
    }

    // Validate form data
    try {
      customerSchema.parse({
        name: formData.name,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        notes: formData.notes || undefined,
        visit_count: parseInt(formData.visit_count) || 0,
      });
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const firstError = validationError.errors[0];
        toast.error("驗證失敗", { description: firstError.message });
      }
      return;
    }

    setIsLoading(true);

    try {
      const customerData = {
        accommodation_id: currentAccommodationId,
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        gender: formData.gender || null,
        nationality: formData.nationality || null,
        first_order_date: formData.first_order_date || null,
        visit_count: parseInt(formData.visit_count) || 0,
        notes: formData.notes || null,
      };

      if (editingCustomer) {
        // Update existing customer
        const { error: updateError } = await supabase
          .from("customers")
          .update(customerData)
          .eq("id", editingCustomer.id);

        if (updateError) throw updateError;

        toast.success("更新成功", {
          description: "顧客資料已更新",
        });
      } else {
        // Create new customer
        const { error: insertError } = await supabase
          .from("customers")
          .insert([customerData]);

        if (insertError) throw insertError;

        toast.success("新增成功", {
          description: "已新增顧客資料",
        });
      }

      setIsDialogOpen(false);
      loadCustomers();
    } catch (err) {
      console.error("儲存顧客資料時發生錯誤:", err);
      toast.error("儲存失敗", {
        description: "無法儲存顧客資料，請稍後再試",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomerId) return;

    try {
      const { error: deleteError } = await supabase
        .from("customers")
        .delete()
        .eq("id", deleteCustomerId);

      if (deleteError) throw deleteError;

      toast.success("刪除成功", {
        description: "已刪除顧客資料",
      });

      loadCustomers();
    } catch (err) {
      console.error("刪除顧客時發生錯誤:", err);
      toast.error("刪除失敗", {
        description: "無法刪除顧客資料，請稍後再試",
      });
    } finally {
      setDeleteCustomerId(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("zh-TW");
  };

  // Form content for both Dialog and Drawer
  const formContent = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">姓名 *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="請輸入姓名"
          className="h-12 text-base sm:h-10 sm:text-sm"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">手機號碼</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="0912-345-678"
            className="h-12 text-base sm:h-10 sm:text-sm"
            inputMode="tel"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="example@email.com"
            className="h-12 text-base sm:h-10 sm:text-sm"
            inputMode="email"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="gender">性別</Label>
          <Select
            value={formData.gender}
            onValueChange={(value) => setFormData({ ...formData, gender: value })}
          >
            <SelectTrigger className="h-12 sm:h-10">
              <SelectValue placeholder="請選擇" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">男</SelectItem>
              <SelectItem value="female">女</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="nationality">國籍</Label>
          <Input
            id="nationality"
            value={formData.nationality}
            onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
            placeholder="例如：台灣、日本"
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_order_date">首筆訂單日</Label>
          <Input
            id="first_order_date"
            type="date"
            value={formData.first_order_date}
            onChange={(e) => setFormData({ ...formData, first_order_date: e.target.value })}
            className="h-12 text-base sm:h-10 sm:text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="visit_count">來訪次數</Label>
          <Input
            id="visit_count"
            type="number"
            min="0"
            value={formData.visit_count}
            onChange={(e) => setFormData({ ...formData, visit_count: e.target.value })}
            className="h-12 text-base sm:h-10 sm:text-sm"
            inputMode="numeric"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">備註</Label>
        <Input
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="其他備註資訊"
          className="h-12 text-base sm:h-10 sm:text-sm"
        />
      </div>
    </div>
  );

  const footerButtons = (
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      <Button 
        variant="outline" 
        onClick={() => setIsDialogOpen(false)}
        className="h-12 sm:h-10 w-full sm:w-auto touch-manipulation"
      >
        取消
      </Button>
      <Button 
        onClick={handleSave} 
        disabled={isLoading}
        className="h-12 sm:h-10 w-full sm:w-auto touch-manipulation"
      >
        {isLoading ? "儲存中..." : "儲存變更"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-8">
      {isLoading ? (
        <TableSkeleton rows={10} columns={7} showSearch showFilters={false} />
      ) : error ? (
        <ErrorState
          title="無法載入顧客資料"
          message={error}
          onRetry={loadCustomers}
        />
      ) : (
        <>
          <AdminPageHeader
            title="顧客資料"
            icon={Users}
            action={
              <Button onClick={() => handleOpenDialog()} className="gap-2 h-11 sm:h-10 touch-manipulation">
                <Plus className="h-4 w-4" />
                <span>新增顧客</span>
              </Button>
            }
          />

          {/* Customer Dialog/Drawer */}
          {isMobile ? (
            <Drawer open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DrawerContent className="max-h-[95vh]">
                <DrawerHeader>
                  <DrawerTitle>{editingCustomer ? "編輯顧客" : "新增顧客"}</DrawerTitle>
                  <DrawerDescription>填寫顧客的基本資料</DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4">
                  {formContent}
                </div>
                <DrawerFooter className="pt-4">
                  {footerButtons}
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          ) : (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingCustomer ? "編輯顧客" : "新增顧客"}</DialogTitle>
                  <DialogDescription>填寫顧客的基本資料</DialogDescription>
                </DialogHeader>
                {formContent}
                <SaveButtonContainer 
                  onSave={handleSave} 
                  isSaving={isLoading}
                  saveText="儲存變更"
                  className="border-t-0"
                >
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    取消
                  </Button>
                </SaveButtonContainer>
              </DialogContent>
            </Dialog>
          )}

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Input
                type="text"
                placeholder="搜尋顧客姓名或手機號碼..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 md:h-10 pr-10 text-base md:text-sm touch-manipulation"
              />
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 md:h-4 md:w-4 text-muted-foreground pointer-events-none" />
            </div>
            
            {/* Mobile Sort Options */}
            <div className="md:hidden">
              <Select
                value={sortField || 'none'}
                onValueChange={(value) => {
                  if (value === 'none') {
                    setSortField(null);
                  } else {
                    handleSort(value as 'name' | 'visit_count' | 'first_order_date');
                  }
                }}
              >
                <SelectTrigger className="w-full h-12 text-base touch-manipulation">
                  <SelectValue placeholder="排序方式" />
                </SelectTrigger>
                <SelectContent className="bg-background border-border z-50">
                  <SelectItem value="none">預設排序</SelectItem>
                  <SelectItem value="name">按姓名 {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}</SelectItem>
                  <SelectItem value="visit_count">按來訪次數 {sortField === 'visit_count' && (sortDirection === 'asc' ? '↑' : '↓')}</SelectItem>
                  <SelectItem value="first_order_date">按訂房日期 {sortField === 'first_order_date' && (sortDirection === 'asc' ? '↑' : '↓')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Results Container */}
          {filteredCustomers.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                {searchQuery ? (
                  <EmptyState
                    icon={Search}
                    title="查無符合的顧客"
                    description={`找不到符合「${searchQuery}」的顧客資料，請嘗試其他關鍵字`}
                  />
                ) : (
                  <EmptyState
                    icon={Users}
                    title="歡迎使用顧客管理"
                    description="建立您的第一位顧客資料，開始追蹤客戶來訪記錄和偏好，提供更優質的服務體驗。"
                    action={{
                      label: "新增第一位顧客",
                      onClick: () => handleOpenDialog()
                    }}
                    suggestions={[
                      {
                        icon: Phone,
                        title: "記錄聯絡資訊",
                        description: "儲存顧客的電話和 Email，方便日後聯繫與行銷推廣。"
                      },
                      {
                        icon: Calendar,
                        title: "追蹤來訪記錄",
                        description: "自動記錄顧客的入住次數和首次訂房日期。"
                      },
                      {
                        icon: FileText,
                        title: "備註重要資訊",
                        description: "記錄顧客偏好、特殊需求等客製化服務資訊。"
                      }
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop: Table View */}
              <div className="hidden md:block table-scroll-container overflow-x-auto rounded-md border touch-pan-x">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-foreground pl-8 text-sm">
                        <button 
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                        >
                          姓名
                          {getSortIcon('name')}
                        </button>
                      </TableHead>
                      <TableHead className="text-foreground text-sm">
                        手機
                      </TableHead>
                      <TableHead className="text-foreground text-sm">
                        Email
                      </TableHead>
                      <TableHead className="text-foreground text-sm">
                        <button 
                          onClick={() => handleSort('first_order_date')}
                          className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                        >
                          首次訂房日期
                          {getSortIcon('first_order_date')}
                        </button>
                      </TableHead>
                      <TableHead className="text-foreground text-sm">
                        <button 
                          onClick={() => handleSort('visit_count')}
                          className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                        >
                          來訪次數
                          {getSortIcon('visit_count')}
                        </button>
                      </TableHead>
                      <TableHead className="text-foreground text-sm">
                        備註
                      </TableHead>
                      <TableHead className="text-foreground text-center text-sm w-[140px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((customer) => (
                      <TableRow key={customer.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium pl-8 text-sm">
                          <CustomerQuickPreview customer={customer}>
                            <span className="cursor-help hover:text-primary transition-colors">{customer.name}</span>
                          </CustomerQuickPreview>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{customer.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{customer.email || "-"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(customer.first_order_date)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-md bg-primary/10 text-primary font-medium text-sm">
                            {customer.visit_count}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm">
                          <div className="truncate text-muted-foreground" title={customer.notes || ""}>
                            {customer.notes || "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm w-[140px]">
                          <div className="flex justify-center gap-1 pr-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/customers/${customer.id}/orders`)}
                              className="h-9 w-9 touch-manipulation"
                              title="查看訂單詳情"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(customer)}
                              className="h-9 w-9 touch-manipulation"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteCustomerId(customer.id)}
                              className="h-9 w-9 text-destructive hover:text-destructive touch-manipulation"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: Card View */}
              <div className="md:hidden space-y-4">
                {paginatedCustomers.map((customer) => (
                  <Card key={customer.id}>
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                                <UserRound className="h-4 w-4 text-primary" />
                              </div>
                              <h3 className="font-semibold text-base truncate">{customer.name}</h3>
                            </div>
                            {customer.phone && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-10">
                                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="truncate">{customer.phone}</span>
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground pl-10">
                                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="truncate">{customer.email}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/customers/${customer.id}/orders`)}
                              className="h-10 w-10 touch-manipulation"
                              title="查看訂單詳情"
                            >
                              <FileText className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(customer)}
                              className="h-10 w-10 touch-manipulation"
                            >
                              <Pencil className="h-5 w-5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteCustomerId(customer.id)}
                              className="h-10 w-10 text-destructive hover:text-destructive touch-manipulation"
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs flex items-center gap-1.5 font-medium">
                              <Calendar className="h-3.5 w-3.5" />
                              首次訂房
                            </p>
                            <p className="font-medium text-sm">
                              {formatDate(customer.first_order_date)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs flex items-center gap-1.5 font-medium">
                              <Users className="h-3.5 w-3.5" />
                              來訪次數
                            </p>
                            <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 rounded-md bg-primary/10 text-primary font-medium text-sm">
                              {customer.visit_count}
                            </span>
                          </div>
                        </div>
                        
                        {customer.notes && (
                          <div className="pt-3 border-t border-border/50 space-y-1.5">
                            <p className="text-muted-foreground text-xs flex items-center gap-1.5 font-medium">
                              <FileText className="h-3.5 w-3.5" />
                              備註
                            </p>
                            <p className="text-sm text-foreground/80 leading-relaxed">{customer.notes}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {sortedCustomers.length > 0 && (
            <div className="mt-6 p-4 bg-muted/30 rounded-lg">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    顯示 {startIndex + 1} 至 {Math.min(endIndex, sortedCustomers.length)} 筆，共 {sortedCustomers.length} 筆資料
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteCustomerId} onOpenChange={() => setDeleteCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              確定要刪除此顧客資料嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-10 touch-manipulation">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 h-11 sm:h-10 touch-manipulation">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Customers;
