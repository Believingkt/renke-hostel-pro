import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveButtonContainer } from "@/components/ui/save-button-container";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, FileText, Users, Phone, Mail, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CustomerQuickPreview } from "@/components/customers/CustomerQuickPreview";

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
  first_order_date: string | null;
  visit_count: number;
  notes: string | null;
  created_at: string;
}

const Customers = () => {
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
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
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
    // 當搜尋條件改變時過濾顧客列表
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
  }, [searchQuery, customers]);

  const loadCustomers = async () => {
    if (!currentAccommodationId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("accommodation_id", currentAccommodationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
      setFilteredCustomers(data || []);
    } catch (error: any) {
      console.error("Error loading customers:", error);
      setError(error.message || "載入顧客資料失敗");
      toast.error("載入顧客資料失敗");
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
        first_order_date: "",
        visit_count: "0",
        notes: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccommodationId) {
      toast.error("請先選擇物件");
      return;
    }

    // Validate input with Zod schema
    const validationData = {
      name: formData.name,
      phone: formData.phone,
      email: formData.email,
      notes: formData.notes,
      visit_count: parseInt(formData.visit_count) || 0,
    };

    const validation = customerSchema.safeParse(validationData);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    setIsLoading(true);
    try {
      const customerData = {
        accommodation_id: currentAccommodationId,
        name: validation.data.name,
        phone: validation.data.phone || null,
        email: validation.data.email || null,
        first_order_date: formData.first_order_date || null,
        visit_count: validation.data.visit_count,
        notes: validation.data.notes || null,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from("customers")
          .update(customerData)
          .eq("id", editingCustomer.id);

        if (error) throw error;
        toast.success("顧客資料已更新");
      } else {
        const { error } = await supabase
          .from("customers")
          .insert(customerData);

        if (error) throw error;
        toast.success("顧客已新增");
      }

      setIsDialogOpen(false);
      loadCustomers();
    } catch (error: any) {
      toast.error("儲存失敗：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomerId) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("customers")
        .delete()
        .eq("id", deleteCustomerId);

      if (error) throw error;
      toast.success("顧客已刪除");
      setDeleteCustomerId(null);
      loadCustomers();
    } catch (error: any) {
      toast.error("刪除失敗：" + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("zh-TW");
  };

  return (
    <div className="space-y-4 md:space-y-6">
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
          <div className="pb-4 border-b border-primary/20 mb-6">
            <h2 className="text-3xl font-bold flex items-center gap-2.5">
              <span className="w-2 h-9 bg-primary rounded-full"></span>
              顧客資料
            </h2>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="hidden">
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋姓名或手機號碼..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                新增顧客
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCustomer ? "編輯顧客" : "新增顧客"}</DialogTitle>
                <DialogDescription>填寫顧客的基本資料</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">姓名 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="請輸入姓名"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">手機號碼</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="0912-345-678"
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
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_order_date">首筆訂單日</Label>
                    <Input
                      id="first_order_date"
                      type="date"
                      value={formData.first_order_date}
                      onChange={(e) => setFormData({ ...formData, first_order_date: e.target.value })}
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
                  />
                </div>
              </div>
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
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && filteredCustomers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">載入中...</div>
          ) : filteredCustomers.length === 0 ? (
            searchQuery ? (
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
            )
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">編號</TableHead>
                      <TableHead>姓名</TableHead>
                      <TableHead>手機號碼</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>首筆訂單日</TableHead>
                      <TableHead className="text-center">來訪次數</TableHead>
                      <TableHead className="w-32 text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer, index) => (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <CustomerQuickPreview customer={customer}>
                            <span className="cursor-help hover:text-primary transition-colors">{customer.name}</span>
                          </CustomerQuickPreview>
                        </TableCell>
                        <TableCell>{customer.phone || "-"}</TableCell>
                        <TableCell>{customer.email || "-"}</TableCell>
                        <TableCell>{formatDate(customer.first_order_date)}</TableCell>
                        <TableCell className="text-center">{customer.visit_count}</TableCell>
                          <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => navigate(`/admin/customers/${customer.id}/orders`)}
                              title="查看訂單詳情"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(customer)}
                              title="編輯顧客"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteCustomerId(customer.id)}
                              title="刪除顧客"
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

              {/* Mobile card view */}
              <div className="md:hidden space-y-3 p-4">
                {filteredCustomers.map((customer, index) => (
                  <Card key={customer.id} className="shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            <h3 className="font-semibold text-base truncate">{customer.name}</h3>
                          </div>
                          <div className="space-y-1 text-sm">
                            {customer.phone && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span className="text-xs">手機</span>
                                <span>{customer.phone}</span>
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-2 text-muted-foreground truncate">
                                <span className="text-xs">Email</span>
                                <span className="truncate">{customer.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground text-xs">首筆訂單</span>
                            <p className="font-medium">{formatDate(customer.first_order_date)}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">來訪次數</span>
                            <p className="font-medium">{customer.visit_count}</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => navigate(`/admin/customers/${customer.id}/orders`)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleOpenDialog(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setDeleteCustomerId(customer.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteCustomerId} onOpenChange={() => setDeleteCustomerId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>
              您確定要刪除這位顧客嗎？此操作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  );
};

export default Customers;