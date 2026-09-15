import { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HQSplitSkeleton } from "@/components/skeletons/HQSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Percent,
  FileText,
  BarChart3,
  CheckCircle,
  Clock,
  Building2,
  Loader2,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Calendar,
  AlertCircle,
  Send,
  Banknote,
  Download,
  CreditCard,
  MoreHorizontal,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { MonthPicker } from "@/components/ui/month-picker";

interface SplitRule {
  id: string;
  accommodation_id: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  description: string | null;
  created_at: string;
  transaction_fee_percentage: number;
}

interface SplitRecord {
  id: string;
  order_id: string;
  accommodation_id: string;
  order_amount: number;
  hq_amount: number;
  accommodation_amount: number;
  settlement_status: string;
  settlement_date: string | null;
  settlement_note: string | null;
  requested_at: string | null;
  requested_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
  };
}

interface SplitManagementProps {
  accommodations: { id: string; name: string }[];
}

export interface SplitManagementRef {
  openAddRuleDialog: () => void;
}

// Map URL section to internal tab value
const sectionToTab: Record<string, string> = {
  rules: "rules",
  details: "records",
  reports: "records",
  requested: "requested",
  approved: "approved",
};

const tabToSection: Record<string, string> = {
  rules: "rules",
  records: "details",
  requested: "requested",
  approved: "approved",
};

export const SplitManagement = forwardRef<SplitManagementRef, SplitManagementProps>(({ accommodations }, ref) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section") || "rules";
  const activeTab = sectionToTab[section] || "rules";
  
  const [loading, setLoading] = useState(true);
  const [splitRules, setSplitRules] = useState<SplitRule[]>([]);
  const [splitRecords, setSplitRecords] = useState<SplitRecord[]>([]);
  
  // Filters
  const [accommodationFilter, setAccommodationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>(format(new Date(), "yyyy-MM"));
  
  // Dialog states
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<SplitRule | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  
  // Form state
  const [ruleForm, setRuleForm] = useState({
    accommodation_id: "",
    transaction_fee_percentage: 2.5,
    effective_from: format(new Date(), "yyyy-MM-dd"),
    effective_to: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    openAddRuleDialog: () => {
      resetRuleForm();
      setEditingRule(null);
      setShowRuleDialog(true);
    },
  }));

  const handleTabChange = (value: string) => {
    const newSection = tabToSection[value] || "rules";
    setSearchParams({ tab: "split", section: newSection });
  };

  useEffect(() => {
    loadData();
  }, [activeTab, accommodationFilter, statusFilter, monthFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "rules") {
        await loadSplitRules();
      } else {
        await loadSplitRecords();
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSplitRules = async () => {
    let query = supabase
      .from("split_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (accommodationFilter !== "all") {
      query = query.eq("accommodation_id", accommodationFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error loading split rules:", error);
      return;
    }
    setSplitRules(data || []);
  };

  const loadSplitRecords = async () => {
    const monthStart = startOfMonth(new Date(monthFilter + "-01"));
    const monthEnd = endOfMonth(monthStart);

    let query = supabase
      .from("split_records")
      .select(`
        *,
        orders!inner(order_number, guest_name, check_in_date, check_out_date)
      `)
      .gte("created_at", monthStart.toISOString())
      .lte("created_at", monthEnd.toISOString())
      .order("created_at", { ascending: false });

    if (accommodationFilter !== "all") {
      query = query.eq("accommodation_id", accommodationFilter);
    }

    // Filter by status based on active tab
    if (activeTab === "pending") {
      query = query.eq("settlement_status", "pending");
    } else if (activeTab === "requested") {
      query = query.eq("settlement_status", "requested");
    } else if (activeTab === "approved") {
      query = query.in("settlement_status", ["approved", "paid"]);
    } else if (statusFilter !== "all") {
      query = query.eq("settlement_status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error loading split records:", error);
      return;
    }
    setSplitRecords(data || []);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.accommodation_id) {
      toast.error("請選擇民宿");
      return;
    }

    if (ruleForm.transaction_fee_percentage < 0 || ruleForm.transaction_fee_percentage > 100) {
      toast.error("手續費比例必須在 0% 到 100% 之間");
      return;
    }

    setSaving(true);
    try {
      if (editingRule) {
        await supabase
          .from("split_rules")
          .update({ is_active: false, effective_to: format(new Date(), "yyyy-MM-dd") })
          .eq("id", editingRule.id);
      }

      const { error } = await supabase.from("split_rules").insert([{
        accommodation_id: ruleForm.accommodation_id,
        transaction_fee_percentage: ruleForm.transaction_fee_percentage,
        effective_from: ruleForm.effective_from,
        effective_to: ruleForm.effective_to || null,
        description: ruleForm.description || null,
      }]);

      if (error) throw error;

      toast.success(editingRule ? "手續費規則已更新" : "手續費規則已建立");
      setShowRuleDialog(false);
      setEditingRule(null);
      resetRuleForm();
      await loadSplitRules();
    } catch (error) {
      console.error("Error saving rule:", error);
      toast.error("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (rule: SplitRule) => {
    if (!confirm("確定要刪除此拆帳規則？")) return;

    try {
      const { error } = await supabase
        .from("split_rules")
        .delete()
        .eq("id", rule.id);

      if (error) throw error;

      toast.success("拆帳規則已刪除");
      await loadSplitRules();
    } catch (error) {
      console.error("Error deleting rule:", error);
      toast.error("刪除失敗");
    }
  };

  // Approve requested records
  const handleApproveRecords = async () => {
    if (selectedRecords.length === 0) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("split_records")
        .update({
          settlement_status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          settlement_note: settlementNote || null,
        })
        .in("id", selectedRecords);

      if (error) throw error;

      toast.success(`已審核通過 ${selectedRecords.length} 筆請款`);
      setShowApproveDialog(false);
      setSelectedRecords([]);
      setSettlementNote("");
      await loadSplitRecords();
    } catch (error) {
      console.error("Error approving records:", error);
      toast.error("審核失敗");
    } finally {
      setSaving(false);
    }
  };

  // Mark records as paid
  const handlePayRecords = async () => {
    if (selectedRecords.length === 0) return;

    if (!paymentMethod) {
      toast.error("請選擇付款方式");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("split_records")
        .update({
          settlement_status: "paid",
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          settlement_note: settlementNote || null,
        })
        .in("id", selectedRecords);

      if (error) throw error;

      toast.success(`已完成 ${selectedRecords.length} 筆撥款`);
      setShowPayDialog(false);
      setSelectedRecords([]);
      setPaymentMethod("");
      setPaymentReference("");
      setSettlementNote("");
      await loadSplitRecords();
    } catch (error) {
      console.error("Error paying records:", error);
      toast.error("撥款失敗");
    } finally {
      setSaving(false);
    }
  };

  // Change status of one or multiple records
  const handleChangeStatus = async (recordIds: string[], newStatus: string) => {
    if (recordIds.length === 0) return;

    try {
      const updateData: Record<string, unknown> = { settlement_status: newStatus };
      
      if (newStatus === 'requested') {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.requested_at = new Date().toISOString();
        updateData.requested_by = user?.id;
      } else if (newStatus === 'approved') {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.approved_at = new Date().toISOString();
        updateData.approved_by = user?.id;
      } else if (newStatus === 'paid') {
        updateData.paid_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("split_records")
        .update(updateData as any)
        .in("id", recordIds);

      if (error) throw error;

      const statusLabel = newStatus === 'pending' ? '待請款' : newStatus === 'requested' ? '已請款' : newStatus === 'approved' ? '審核中' : '已撥款';
      toast.success(`已將 ${recordIds.length} 筆記錄更新為「${statusLabel}」`);
      setSelectedRecords([]);
      await loadSplitRecords();
    } catch (error) {
      console.error("Error changing status:", error);
      toast.error("狀態更新失敗");
    }
  };

  const resetRuleForm = () => {
    setRuleForm({
      accommodation_id: "",
      transaction_fee_percentage: 2.5,
      effective_from: format(new Date(), "yyyy-MM-dd"),
      effective_to: "",
      description: "",
    });
  };

  const openEditRule = (rule: SplitRule) => {
    setEditingRule(rule);
    setRuleForm({
      accommodation_id: rule.accommodation_id,
      transaction_fee_percentage: Number(rule.transaction_fee_percentage),
      effective_from: format(new Date(), "yyyy-MM-dd"),
      effective_to: "",
      description: rule.description || "",
    });
    setShowRuleDialog(true);
  };

  const getAccommodationName = (id: string) => {
    return accommodations.find(a => a.id === id)?.name || "未知";
  };

  const handleSelectAll = (records: SplitRecord[]) => {
    if (selectedRecords.length === records.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(records.map(r => r.id));
    }
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecords(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-orange-500 border-orange-500">待請款</Badge>;
      case "requested":
        return <Badge variant="outline" className="text-blue-500 border-blue-500">已請款</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-purple-500 border-purple-500">審核中</Badge>;
      case "paid":
        return <Badge className="bg-primary">已撥款</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Get transaction fee for an accommodation
  const getTransactionFeePercentage = (accommodationId: string): number => {
    const rule = splitRules.find(r => r.accommodation_id === accommodationId && r.is_active);
    return rule?.transaction_fee_percentage ?? 0;
  };

  // Calculate net amount after transaction fee
  const calculateNetAmount = (amount: number, accommodationId: string): number => {
    const feeRate = getTransactionFeePercentage(accommodationId);
    const fee = Math.round(amount * feeRate / 100);
    return amount - fee;
  };

  // Calculate summary for reports
  const reportSummary = useMemo(() => {
    const byAccommodation: Record<string, {
      total: number;
      hqTotal: number;
      accTotal: number;
      accNetTotal: number;
      feeTotal: number;
      feePercentage: number;
      pending: number;
      pendingNet: number;
      requested: number;
      requestedNet: number;
      approved: number;
      approvedNet: number;
      paid: number;
      paidNet: number;
      count: number;
    }> = {};

    splitRecords.forEach(record => {
      if (!byAccommodation[record.accommodation_id]) {
        const feeRate = getTransactionFeePercentage(record.accommodation_id);
        byAccommodation[record.accommodation_id] = {
          total: 0,
          hqTotal: 0,
          accTotal: 0,
          accNetTotal: 0,
          feeTotal: 0,
          feePercentage: feeRate,
          pending: 0,
          pendingNet: 0,
          requested: 0,
          requestedNet: 0,
          approved: 0,
          approvedNet: 0,
          paid: 0,
          paidNet: 0,
          count: 0,
        };
      }

      const acc = byAccommodation[record.accommodation_id];
      const netAmount = calculateNetAmount(record.accommodation_amount, record.accommodation_id);
      const fee = record.accommodation_amount - netAmount;
      
      acc.total += record.order_amount;
      acc.hqTotal += record.hq_amount;
      acc.accTotal += record.accommodation_amount;
      acc.accNetTotal += netAmount;
      acc.feeTotal += fee;
      acc.count += 1;

      switch (record.settlement_status) {
        case "pending":
          acc.pending += record.accommodation_amount;
          acc.pendingNet += netAmount;
          break;
        case "requested":
          acc.requested += record.accommodation_amount;
          acc.requestedNet += netAmount;
          break;
        case "approved":
          acc.approved += record.accommodation_amount;
          acc.approvedNet += netAmount;
          break;
        case "paid":
          acc.paid += record.accommodation_amount;
          acc.paidNet += netAmount;
          break;
      }
    });

    return byAccommodation;
  }, [splitRecords, splitRules]);

  const requestedRecords = splitRecords.filter(r => r.settlement_status === "requested");
  const approvedRecords = splitRecords.filter(r => r.settlement_status === "approved");

  const selectedAmount = useMemo(() => {
    const records = splitRecords.filter(r => selectedRecords.includes(r.id));
    const gross = records.reduce((sum, r) => sum + r.accommodation_amount, 0);
    const net = records.reduce((sum, r) => sum + calculateNetAmount(r.accommodation_amount, r.accommodation_id), 0);
    return { gross, net, fee: gross - net };
  }, [splitRecords, selectedRecords, splitRules]);

  const handleExportCSV = () => {
    if (splitRecords.length === 0) {
      toast.error("沒有資料可匯出");
      return;
    }

    const headers = ["民宿", "訂單編號", "入住日期", "訂單金額", "手續費", "撥款金額", "狀態", "請款日期", "審核日期", "撥款日期", "付款方式"];
    const rows = splitRecords.map(r => [
      getAccommodationName(r.accommodation_id),
      r.orders?.order_number || "",
      r.orders?.check_in_date || "",
      r.order_amount,
      r.hq_amount,
      r.accommodation_amount,
      r.settlement_status === "pending" ? "待請款" :
      r.settlement_status === "requested" ? "已請款" :
      r.settlement_status === "approved" ? "審核中" : "已撥款",
      r.requested_at ? format(new Date(r.requested_at), "yyyy/MM/dd") : "",
      r.approved_at ? format(new Date(r.approved_at), "yyyy/MM/dd") : "",
      r.paid_at ? format(new Date(r.paid_at), "yyyy/MM/dd") : "",
      r.payment_method || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `分帳報表_${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("報表已匯出");
  };

  if (loading && splitRules.length === 0 && splitRecords.length === 0) {
    return <HQSplitSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center">
            <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="全部民宿" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部民宿</SelectItem>
                {accommodations.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-6">
              {splitRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mb-4 opacity-50" />
                  <p>尚無手續費規則</p>
                  <p className="text-sm">請點擊「新增規則」建立手續費設定</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>民宿</TableHead>
                        <TableHead>手續費比例</TableHead>
                        <TableHead>生效日期</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {splitRules.map(rule => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {getAccommodationName(rule.accommodation_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">{rule.transaction_fee_percentage}%</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(rule.effective_from), "yyyy/MM/dd")}
                            {rule.effective_to && ` ~ ${format(new Date(rule.effective_to), "yyyy/MM/dd")}`}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
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
        </TabsContent>

        {/* Records + Reports Combined Tab */}
        <TabsContent value="records" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="全部民宿" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部民宿</SelectItem>
                {accommodations.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="全部狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="pending">待請款</SelectItem>
                <SelectItem value="requested">已請款</SelectItem>
                <SelectItem value="approved">審核中</SelectItem>
                <SelectItem value="paid">已撥款</SelectItem>
              </SelectContent>
            </Select>

            <MonthPicker
              value={monthFilter}
              onChange={setMonthFilter}
              className="w-[180px]"
            />

            <Button variant="outline" size="icon" onClick={handleExportCSV}>
              <Download className="h-4 w-4" />
            </Button>
          </div>

          {/* Report Summary Cards */}
          {Object.keys(reportSummary).length > 0 && (
            <div className="space-y-3">
              {Object.entries(reportSummary).map(([accId, summary]) => (
                <Card key={accId} className="border-dashed">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <span className="font-semibold">{getAccommodationName(accId)}</span>
                        <Badge variant="outline">{summary.count} 筆</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">訂單總額</p>
                        <p className="text-xl font-bold">NT$ {summary.total.toLocaleString()}</p>
                      </div>
                      {summary.feePercentage > 0 && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            手續費 ({summary.feePercentage}%)
                          </p>
                          <p className="text-xl font-bold text-red-500">-NT$ {summary.feeTotal.toLocaleString()}</p>
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">待請款</p>
                        <p className="text-xl font-bold text-orange-500">NT$ {summary.pendingNet.toLocaleString()}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">已請款</p>
                        <p className="text-xl font-bold text-blue-500">NT$ {summary.requestedNet.toLocaleString()}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">審核中</p>
                        <p className="text-xl font-bold text-purple-500">NT$ {summary.approvedNet.toLocaleString()}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">已撥款</p>
                        <p className="text-xl font-bold text-primary">NT$ {summary.paidNet.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Bulk Action Bar */}
          {selectedRecords.length > 0 && (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span className="text-muted-foreground">已選擇</span>
                    <span className="font-semibold text-foreground">{selectedRecords.length} 筆</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus(selectedRecords, 'pending')}>
                      <Clock className="h-3.5 w-3.5 mr-1.5" />待請款
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus(selectedRecords, 'requested')}>
                      <Send className="h-3.5 w-3.5 mr-1.5" />已請款
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus(selectedRecords, 'approved')}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />審核中
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleChangeStatus(selectedRecords, 'paid')}>
                      <Banknote className="h-3.5 w-3.5 mr-1.5" />已撥款
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Records Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                訂單請款紀錄
              </CardTitle>
              <CardDescription>
                {format(new Date(monthFilter + "-01"), "yyyy年M月", { locale: zhTW })} 共 {splitRecords.length} 筆
              </CardDescription>
            </CardHeader>
            <CardContent>
              {splitRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-4 opacity-50" />
                  <p>本月無拆帳記錄</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedRecords.length === splitRecords.length && splitRecords.length > 0}
                            onCheckedChange={() => handleSelectAll(splitRecords)}
                          />
                        </TableHead>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead className="text-right">訂單金額</TableHead>
                        <TableHead className="text-right">手續費</TableHead>
                        <TableHead className="text-right">撥款金額</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead>建立時間</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {splitRecords.map(record => (
                        <TableRow key={record.id} data-state={selectedRecords.includes(record.id) ? "selected" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={() => handleSelectRecord(record.id)}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {record.orders?.order_number}
                          </TableCell>
                          <TableCell>{getAccommodationName(record.accommodation_id)}</TableCell>
                          <TableCell className="text-right font-medium">
                            NT$ {record.order_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            -NT$ {record.hq_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-primary font-medium">
                            NT$ {record.accommodation_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(record.settlement_status)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(record.created_at), "MM/dd HH:mm")}
                          </TableCell>
                          <TableCell className="text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {record.settlement_status !== 'pending' && (
                                  <DropdownMenuItem onClick={() => handleChangeStatus([record.id], 'pending')}>
                                    <Clock className="h-4 w-4 mr-2" />待請款
                                  </DropdownMenuItem>
                                )}
                                {record.settlement_status !== 'requested' && (
                                  <DropdownMenuItem onClick={() => handleChangeStatus([record.id], 'requested')}>
                                    <Send className="h-4 w-4 mr-2" />已請款
                                  </DropdownMenuItem>
                                )}
                                {record.settlement_status !== 'approved' && (
                                  <DropdownMenuItem onClick={() => handleChangeStatus([record.id], 'approved')}>
                                    <CheckCircle className="h-4 w-4 mr-2" />審核中
                                  </DropdownMenuItem>
                                )}
                                {record.settlement_status !== 'paid' && (
                                  <DropdownMenuItem onClick={() => handleChangeStatus([record.id], 'paid')}>
                                    <Banknote className="h-4 w-4 mr-2" />已撥款
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requested (Pending Approval) Tab */}
        <TabsContent value="requested" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="全部民宿" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部民宿</SelectItem>
                {accommodations.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <MonthPicker
              value={monthFilter}
              onChange={setMonthFilter}
              className="w-[160px]"
            />
          </div>

          {requestedRecords.length > 0 && (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Send className="h-4 w-4 text-blue-500" />
                    <span className="text-muted-foreground">待審核</span>
                    <span className="font-semibold text-foreground">{requestedRecords.length} 筆</span>
                    <span className="text-muted-foreground">｜已選擇</span>
                    <span className="font-semibold text-foreground">{selectedRecords.length} 筆</span>
                    <span className="font-semibold text-primary">
                      NT$ {selectedAmount.gross.toLocaleString()}
                    </span>
                    {selectedAmount.fee > 0 && (
                      <span className="text-xs text-red-500">
                        (手續費 -NT$ {selectedAmount.fee.toLocaleString()})
                      </span>
                    )}
                  </div>
                  <Button 
                    onClick={() => setShowApproveDialog(true)}
                    disabled={selectedRecords.length === 0}
                    className="shrink-0"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    審核通過
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-5 w-5" />
                待審核請款
              </CardTitle>
              <CardDescription>民宿提交的請款申請</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {requestedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-4 opacity-50" />
                  <p>目前沒有待審核的請款</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedRecords.length === requestedRecords.length && requestedRecords.length > 0}
                            onCheckedChange={() => handleSelectAll(requestedRecords)}
                          />
                        </TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>入住日期</TableHead>
                        <TableHead className="text-right">撥款金額</TableHead>
                        <TableHead>請款日期</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requestedRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRecords.includes(record.id)}
                              onCheckedChange={() => handleSelectRecord(record.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {getAccommodationName(record.accommodation_id)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {record.orders?.order_number}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.orders?.check_in_date && format(new Date(record.orders.check_in_date), "yyyy/MM/dd")}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-primary font-medium">
                              NT$ {record.accommodation_amount.toLocaleString()}
                            </div>
                            {getTransactionFeePercentage(record.accommodation_id) > 0 && (
                              <div className="text-xs text-muted-foreground">
                                撥款 <span className="text-primary">NT$ {calculateNetAmount(record.accommodation_amount, record.accommodation_id).toLocaleString()}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.requested_at && format(new Date(record.requested_at), "MM/dd HH:mm")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approved (Pending Payment) Tab */}
        <TabsContent value="approved" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Select value={accommodationFilter} onValueChange={setAccommodationFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="全部民宿" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部民宿</SelectItem>
                {accommodations.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <MonthPicker
              value={monthFilter}
              onChange={setMonthFilter}
              className="w-[160px]"
            />
          </div>

          {approvedRecords.length > 0 && (
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Banknote className="h-4 w-4 text-purple-500" />
                    <span className="text-muted-foreground">待撥款</span>
                    <span className="font-semibold text-foreground">{approvedRecords.length} 筆</span>
                    <span className="text-muted-foreground">｜已選擇</span>
                    <span className="font-semibold text-foreground">{selectedRecords.length} 筆</span>
                    <span className="font-semibold text-primary">
                      NT$ {selectedAmount.gross.toLocaleString()}
                    </span>
                    {selectedAmount.fee > 0 && (
                      <span className="text-xs text-red-500">
                        (手續費 -NT$ {selectedAmount.fee.toLocaleString()})
                      </span>
                    )}
                  </div>
                  <Button 
                    onClick={() => setShowPayDialog(true)}
                    disabled={selectedRecords.length === 0}
                    className="shrink-0"
                  >
                    <Banknote className="h-4 w-4 mr-2" />
                    確認撥款
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="h-5 w-5" />
                待撥款記錄
              </CardTitle>
              <CardDescription>已審核通過，待撥款給民宿</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {approvedRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Banknote className="h-12 w-12 mb-4 opacity-50" />
                  <p>目前沒有待撥款的記錄</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedRecords.length === approvedRecords.length && approvedRecords.length > 0}
                            onCheckedChange={() => handleSelectAll(approvedRecords)}
                          />
                        </TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>訂單編號</TableHead>
                        <TableHead className="text-right">撥款金額</TableHead>
                        <TableHead>審核日期</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvedRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell>
                            {record.settlement_status === "approved" && (
                              <Checkbox
                                checked={selectedRecords.includes(record.id)}
                                onCheckedChange={() => handleSelectRecord(record.id)}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              {getAccommodationName(record.accommodation_id)}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {record.orders?.order_number}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="text-primary font-medium">
                              NT$ {record.accommodation_amount.toLocaleString()}
                            </div>
                            {getTransactionFeePercentage(record.accommodation_id) > 0 && (
                              <div className="text-xs text-muted-foreground">
                                撥款 <span className="text-primary">NT$ {calculateNetAmount(record.accommodation_amount, record.accommodation_id).toLocaleString()}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.approved_at && format(new Date(record.approved_at), "MM/dd HH:mm")}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(record.settlement_status)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>



      </Tabs>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "編輯手續費規則" : "新增手續費規則"}</DialogTitle>
            <DialogDescription>設定民宿的請款手續費比例</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>民宿</Label>
              <Select
                value={ruleForm.accommodation_id}
                onValueChange={(v) => setRuleForm(prev => ({ ...prev, accommodation_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇民宿" />
                </SelectTrigger>
                <SelectContent>
                  {accommodations.map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>手續費比例 (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={ruleForm.transaction_fee_percentage}
                onChange={(e) => {
                  const fee = parseFloat(e.target.value) || 0;
                  setRuleForm(prev => ({
                    ...prev,
                    transaction_fee_percentage: fee,
                  }));
                }}
                min={0}
                max={100}
              />
              <p className="text-xs text-muted-foreground">民宿請款時將扣除此比例作為手續費</p>
            </div>

            <div className="space-y-2">
              <Label>生效日期</Label>
              <Input
                type="date"
                value={ruleForm.effective_from}
                onChange={(e) => setRuleForm(prev => ({ ...prev, effective_from: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>備註</Label>
              <Textarea
                value={ruleForm.description}
                onChange={(e) => setRuleForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="選填"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>取消</Button>
            <Button onClick={handleSaveRule} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>審核請款申請</DialogTitle>
            <DialogDescription>
              即將審核通過 {selectedRecords.length} 筆請款，總計 NT$ {selectedAmount.gross.toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">請款筆數</span>
                <span className="font-medium">{selectedRecords.length} 筆</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">請款金額</span>
                <span className="text-xl font-bold text-primary">NT$ {selectedAmount.gross.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>審核備註（選填）</Label>
              <Textarea
                value={settlementNote}
                onChange={(e) => setSettlementNote(e.target.value)}
                placeholder="如有特殊說明，請在此填寫"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>取消</Button>
            <Button onClick={handleApproveRecords} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              確認審核通過
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認撥款</DialogTitle>
            <DialogDescription>
              即將撥款 {selectedRecords.length} 筆，總計 NT$ {selectedAmount.gross.toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">撥款筆數</span>
                <span className="font-medium">{selectedRecords.length} 筆</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">撥款金額</span>
                <span className="text-xl font-bold text-primary">NT$ {selectedAmount.gross.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>付款方式 *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇付款方式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">銀行轉帳</SelectItem>
                  <SelectItem value="cash">現金</SelectItem>
                  <SelectItem value="check">支票</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>付款參考編號（選填）</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="例如：轉帳帳號後五碼"
              />
            </div>

            <div className="space-y-2">
              <Label>備註（選填）</Label>
              <Textarea
                value={settlementNote}
                onChange={(e) => setSettlementNote(e.target.value)}
                placeholder="如有特殊說明，請在此填寫"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>取消</Button>
            <Button onClick={handlePayRecords} disabled={saving || !paymentMethod}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              確認撥款完成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

SplitManagement.displayName = "SplitManagement";
