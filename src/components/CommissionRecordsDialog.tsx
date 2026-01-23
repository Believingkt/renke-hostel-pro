import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MonthPicker } from "@/components/ui/month-picker";

interface CommissionRecord {
  id: string;
  order_id: string;
  order_total: number;
  discount_amount: number;
  commission_rate: number;
  commission_amount: number;
  settlement_status: "pending" | "approved" | "paid" | "cancelled";
  settlement_date: string | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_note: string | null;
  created_at: string;
  orders: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
  } | null;
}

interface CommissionRecordsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discountCodeId: string;
  discountCodeName: string;
  discountCode: string;
}

export const CommissionRecordsDialog = ({
  open,
  onOpenChange,
  discountCodeId,
  discountCodeName,
  discountCode,
}: CommissionRecordsDialogProps) => {
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [isSettling, setIsSettling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && discountCodeId) {
      fetchCommissionRecords();
    }
  }, [open, discountCodeId]);

  const fetchCommissionRecords = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("commission_records")
        .select(`
          *,
          orders (
            order_number,
            guest_name,
            check_in_date,
            check_out_date
          )
        `)
        .eq("discount_code_id", discountCodeId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRecords((data || []) as CommissionRecord[]);
    } catch (error) {
      console.error("Error fetching commission records:", error);
      toast({
        title: "查詢失敗",
        description: "無法取得佣金記錄",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (
    recordId: string,
    newStatus: "pending" | "approved" | "paid" | "cancelled"
  ) => {
    setUpdatingId(recordId);
    try {
      const updates: any = {
        settlement_status: newStatus,
      };

      // Set timestamps based on status
      if (newStatus === "approved") {
        updates.settlement_date = new Date().toISOString();
      } else if (newStatus === "paid") {
        updates.payment_date = new Date().toISOString();
        if (!records.find((r) => r.id === recordId)?.settlement_date) {
          updates.settlement_date = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from("commission_records")
        .update(updates)
        .eq("id", recordId);

      if (error) throw error;

      toast({
        title: "狀態更新成功",
      });
      fetchCommissionRecords();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "更新失敗",
        variant: "destructive",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  // Generate available months from records
  const getAvailableMonths = () => {
    if (records.length === 0) return [];
    
    const months = new Set<string>();
    records.forEach((record) => {
      const month = format(new Date(record.created_at), "yyyy-MM");
      months.add(month);
    });
    
    return Array.from(months).sort().reverse();
  };

  // Filter records by selected month
  const filteredRecords = selectedMonth === "all" 
    ? records 
    : records.filter((record) => {
        const recordMonth = format(new Date(record.created_at), "yyyy-MM");
        return recordMonth === selectedMonth;
      });

  // Batch settlement for selected month
  const handleMonthlySettlement = async (status: "approved" | "paid") => {
    if (selectedMonth === "all") {
      toast({
        title: "請先選擇要結算的月份",
        variant: "destructive",
      });
      return;
    }

    const pendingRecordsInMonth = filteredRecords.filter(
      (r) => r.settlement_status === "pending"
    );

    if (pendingRecordsInMonth.length === 0) {
      toast({
        title: "該月份沒有待結算的佣金記錄",
        variant: "destructive",
      });
      return;
    }

    setIsSettling(true);
    try {
      const updates: any = {
        settlement_status: status,
      };

      if (status === "approved") {
        updates.settlement_date = new Date().toISOString();
      } else if (status === "paid") {
        updates.payment_date = new Date().toISOString();
        updates.settlement_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from("commission_records")
        .update(updates)
        .in(
          "id",
          pendingRecordsInMonth.map((r) => r.id)
        );

      if (error) throw error;

      toast({
        title: "月結算成功",
        description: `已將 ${pendingRecordsInMonth.length} 筆記錄標記為${status === "approved" ? "已核准" : "已付款"}`,
      });
      fetchCommissionRecords();
    } catch (error) {
      console.error("Error during monthly settlement:", error);
      toast({
        title: "月結算失敗",
        variant: "destructive",
      });
    } finally {
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<
      string,
      { label: string; variant: "default" | "secondary" | "destructive" }
    > = {
      pending: { label: "待結算", variant: "secondary" },
      approved: { label: "已核准", variant: "default" },
      paid: { label: "已付款", variant: "default" },
      cancelled: { label: "已取消", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const totalCommission = filteredRecords
    .filter((r) => r.settlement_status !== "cancelled")
    .reduce((sum, r) => sum + r.commission_amount, 0);

  const pendingCommission = filteredRecords
    .filter((r) => r.settlement_status === "pending")
    .reduce((sum, r) => sum + r.commission_amount, 0);

  const paidCommission = filteredRecords
    .filter((r) => r.settlement_status === "paid")
    .reduce((sum, r) => sum + r.commission_amount, 0);

  const availableMonths = getAvailableMonths();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>佣金記錄 - {discountCodeName}</DialogTitle>
          <DialogDescription>
            折扣碼：{discountCode}
          </DialogDescription>
        </DialogHeader>

        {/* Month Filter and Batch Settlement */}
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <Label className="text-sm font-medium mb-2 block">選擇月份</Label>
            <MonthPicker
              value={selectedMonth}
              onChange={setSelectedMonth}
              allowAll
              allLabel="全部月份"
              className="w-full"
            />
          </div>
          
          {selectedMonth !== "all" && pendingCommission > 0 && (
            <div className="flex gap-2 items-end">
              <Button
                onClick={() => handleMonthlySettlement("approved")}
                disabled={isSettling}
                variant="outline"
              >
                批量核准
              </Button>
              <Button
                onClick={() => handleMonthlySettlement("paid")}
                disabled={isSettling}
              >
                批量付款
              </Button>
            </div>
          )}
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {selectedMonth === "all" ? "總佣金" : "本月佣金"}
                </p>
                <p className="text-2xl font-bold">NT$ {totalCommission.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {selectedMonth === "all" ? "待結算佣金" : "本月待結算"}
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  NT$ {pendingCommission.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {selectedMonth === "all" ? "已付款佣金" : "本月已付款"}
                </p>
                <p className="text-2xl font-bold text-primary">
                  NT$ {paidCommission.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : filteredRecords.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {selectedMonth === "all" ? "尚無佣金記錄" : "該月份無佣金記錄"}
          </p>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訂單編號</TableHead>
                    <TableHead>客人姓名</TableHead>
                    <TableHead>入住日期</TableHead>
                    <TableHead>訂單金額</TableHead>
                    <TableHead>折扣金額</TableHead>
                    <TableHead>佣金率</TableHead>
                    <TableHead>佣金金額</TableHead>
                    <TableHead>結算狀態</TableHead>
                    <TableHead className="w-[140px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono">
                        {record.orders?.order_number || "-"}
                      </TableCell>
                      <TableCell>{record.orders?.guest_name || "-"}</TableCell>
                      <TableCell>
                        {record.orders?.check_in_date
                          ? format(new Date(record.orders.check_in_date), "yyyy/MM/dd")
                          : "-"}
                      </TableCell>
                      <TableCell>NT$ {record.order_total.toLocaleString()}</TableCell>
                      <TableCell>NT$ {record.discount_amount.toLocaleString()}</TableCell>
                      <TableCell>{record.commission_rate}%</TableCell>
                      <TableCell className="font-semibold">
                        NT$ {record.commission_amount.toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(record.settlement_status)}</TableCell>
                      <TableCell className="w-[140px]">
                        <Select
                          value={record.settlement_status}
                          onValueChange={(value) =>
                            handleUpdateStatus(
                              record.id,
                              value as "pending" | "approved" | "paid" | "cancelled"
                            )
                          }
                          disabled={updatingId === record.id}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">待結算</SelectItem>
                            <SelectItem value="approved">已核准</SelectItem>
                            <SelectItem value="paid">已付款</SelectItem>
                            <SelectItem value="cancelled">已取消</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {filteredRecords.map((record) => (
                <Card key={record.id}>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">訂單編號</p>
                        <p className="font-mono">{record.orders?.order_number || "-"}</p>
                      </div>
                      {getStatusBadge(record.settlement_status)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">客人姓名</p>
                        <p>{record.orders?.guest_name || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">入住日期</p>
                        <p>
                          {record.orders?.check_in_date
                            ? format(new Date(record.orders.check_in_date), "yyyy/MM/dd")
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">訂單金額</p>
                        <p>NT$ {record.order_total.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">折扣金額</p>
                        <p>NT$ {record.discount_amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">佣金率</p>
                        <p>{record.commission_rate}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">佣金金額</p>
                        <p className="font-semibold">
                          NT$ {record.commission_amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">更新狀態</Label>
                      <Select
                        value={record.settlement_status}
                        onValueChange={(value) =>
                          handleUpdateStatus(
                            record.id,
                            value as "pending" | "approved" | "paid" | "cancelled"
                          )
                        }
                        disabled={updatingId === record.id}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">待結算</SelectItem>
                          <SelectItem value="approved">已核准</SelectItem>
                          <SelectItem value="paid">已付款</SelectItem>
                          <SelectItem value="cancelled">已取消</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
