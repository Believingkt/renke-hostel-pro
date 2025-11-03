import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAccommodation } from "@/contexts/AccommodationContext";

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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

  const loadCustomers = async () => {
    if (!currentAccommodationId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("accommodation_id", currentAccommodationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast.error("載入顧客資料失敗：" + error.message);
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

    if (!formData.name.trim()) {
      toast.error("請填寫姓名");
      return;
    }

    setIsLoading(true);
    try {
      const customerData = {
        accommodation_id: currentAccommodationId,
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        first_order_date: formData.first_order_date || null,
        visit_count: parseInt(formData.visit_count) || 0,
        notes: formData.notes.trim() || null,
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">顧客名單</h1>
          <p className="text-muted-foreground mt-1">管理您的顧客資料</p>
        </div>
        <div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                新增顧客
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">載入中...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">尚無顧客資料</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">編號</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>手機號碼</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>首筆訂單日</TableHead>
                    <TableHead className="text-center">來訪次數</TableHead>
                    <TableHead className="w-24 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer, index) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>{customer.name}</TableCell>
                      <TableCell>{customer.phone || "-"}</TableCell>
                      <TableCell>{customer.email || "-"}</TableCell>
                      <TableCell>{formatDate(customer.first_order_date)}</TableCell>
                      <TableCell className="text-center">{customer.visit_count}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteCustomerId(customer.id)}
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
    </div>
  );
};

export default Customers;