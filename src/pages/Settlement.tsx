import { useState, useEffect, useMemo } from "react";
import { getPaymentStatusConfig } from "@/utils/orderHelpers";
import { Link } from "react-router-dom";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  DollarSign,
  FileText,
  Send,
  Clock,
  CheckCircle,
  Loader2,
  ArrowUpRight,
  Building2,
  Calendar,
  Banknote,
  ClipboardList,
  Download,
  CreditCard,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { MonthPicker } from "@/components/ui/month-picker";

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
  approved_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    payment_status: string;
    payment_method: string | null;
    deposit_payment_method: string | null;
  };
}

interface SplitRule {
  id: string;
  is_active: boolean;
  transaction_fee_percentage: number;
}

export default function Settlement() {
  const { currentAccommodationId } = useAccommodation();
  const [loading, setLoading] = useState(true);
  const [splitRecords, setSplitRecords] = useState<SplitRecord[]>([]);
  const [splitRule, setSplitRule] = useState<SplitRule | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pending");
  const [monthFilter, setMonthFilter] = useState<string>(format(new Date(), "yyyy-MM"));
  
  // Dialog states
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<string[]>([]);
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (currentAccommodationId) {
      loadData();
    }
  }, [currentAccommodationId, activeTab, monthFilter]);

  const loadData = async () => {
    if (!currentAccommodationId) return;
    
    setLoading(true);
    try {
      // Load split rule
      const { data: ruleData } = await supabase
        .from("split_rules")
        .select("id, is_active, transaction_fee_percentage")
        .eq("accommodation_id", currentAccommodationId)
        .eq("is_active", true)
        .single();
      
      setSplitRule(ruleData);

      // Load split records
      const monthStart = startOfMonth(new Date(monthFilter + "-01"));
      const monthEnd = endOfMonth(monthStart);

      let query = supabase
        .from("split_records")
        .select(`
          *,
          orders!inner(order_number, guest_name, check_in_date, check_out_date, payment_status, payment_method, deposit_payment_method)
        `)
        .eq("accommodation_id", currentAccommodationId)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString())
        .order("created_at", { ascending: false });

      if (activeTab === "pending") {
        query = query.eq("settlement_status", "pending");
      } else if (activeTab === "requested") {
        query = query.eq("settlement_status", "requested");
      } else if (activeTab === "history") {
        query = query.in("settlement_status", ["approved", "paid"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSplitRecords(data || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("載入資料失敗");
    } finally {
      setLoading(false);
    }
  };

  const pendingRecords = useMemo(() => 
    splitRecords.filter(r => r.settlement_status === "pending"),
    [splitRecords]
  );

  const selectedAmount = useMemo(() => 
    pendingRecords
      .filter(r => selectedRecords.includes(r.id))
      .reduce((sum, r) => sum + r.accommodation_amount, 0),
    [pendingRecords, selectedRecords]
  );

  const handleSelectAll = () => {
    if (selectedRecords.length === pendingRecords.length) {
      setSelectedRecords([]);
    } else {
      setSelectedRecords(pendingRecords.map(r => r.id));
    }
  };

  const handleSelectRecord = (id: string) => {
    setSelectedRecords(prev => 
      prev.includes(id) 
        ? prev.filter(r => r !== id)
        : [...prev, id]
    );
  };

  const handleSubmitRequest = async () => {
    if (selectedRecords.length === 0) {
      toast.error("請選擇要請款的記錄");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("split_records")
        .update({
          settlement_status: "requested",
          requested_at: new Date().toISOString(),
          requested_by: user?.id,
          settlement_note: requestNote || null,
        })
        .in("id", selectedRecords);

      if (error) throw error;

      toast.success(`已提交 ${selectedRecords.length} 筆請款申請`);
      setShowRequestDialog(false);
      setSelectedRecords([]);
      setRequestNote("");
      await loadData();
    } catch (error) {
      console.error("Error submitting request:", error);
      toast.error("提交失敗");
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate summary with transaction fee
  const summary = useMemo(() => {
    const feeRate = splitRule?.transaction_fee_percentage ?? 0;
    
    const calculateNetAmount = (amount: number) => {
      const fee = Math.round(amount * feeRate / 100);
      return amount - fee;
    };
    
    const total = splitRecords.reduce((sum, r) => sum + r.accommodation_amount, 0);
    const totalNet = splitRecords.reduce((sum, r) => sum + calculateNetAmount(r.accommodation_amount), 0);
    const pending = splitRecords
      .filter(r => r.settlement_status === "pending")
      .reduce((sum, r) => sum + r.accommodation_amount, 0);
    const pendingNet = splitRecords
      .filter(r => r.settlement_status === "pending")
      .reduce((sum, r) => sum + calculateNetAmount(r.accommodation_amount), 0);
    const requested = splitRecords
      .filter(r => r.settlement_status === "requested")
      .reduce((sum, r) => sum + r.accommodation_amount, 0);
    const requestedNet = splitRecords
      .filter(r => r.settlement_status === "requested")
      .reduce((sum, r) => sum + calculateNetAmount(r.accommodation_amount), 0);
    const paid = splitRecords
      .filter(r => r.settlement_status === "paid")
      .reduce((sum, r) => sum + r.accommodation_amount, 0);
    const paidNet = splitRecords
      .filter(r => r.settlement_status === "paid")
      .reduce((sum, r) => sum + calculateNetAmount(r.accommodation_amount), 0);
    
    const totalFee = total - totalNet;
    
    return { total, totalNet, pending, pendingNet, requested, requestedNet, paid, paidNet, totalFee, feeRate };
  }, [splitRecords, splitRule]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-orange-500 border-orange-500">待請款</Badge>;
      case "requested":
        return <Badge variant="outline" className="text-blue-500 border-blue-500">已請款</Badge>;
      case "approved":
        return <Badge variant="outline" className="text-purple-500 border-purple-500">已審核</Badge>;
      case "paid":
        return <Badge className="bg-primary">已撥款</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleExportCSV = () => {
    if (splitRecords.length === 0) {
      toast.error("沒有資料可匯出");
      return;
    }

    const headers = ["訂單編號", "入住日期", "退房日期", "訂單金額", "手續費", "撥款金額", "狀態", "請款日期", "撥款日期"];
    const rows = splitRecords.map(r => [
      r.orders?.order_number || "",
      r.orders?.check_in_date || "",
      r.orders?.check_out_date || "",
      r.order_amount,
      r.hq_amount,
      r.accommodation_amount,
      r.settlement_status === "pending" ? "待請款" :
      r.settlement_status === "requested" ? "已請款" :
      r.settlement_status === "approved" ? "已審核" : "已撥款",
      r.requested_at ? format(new Date(r.requested_at), "yyyy/MM/dd") : "",
      r.paid_at ? format(new Date(r.paid_at), "yyyy/MM/dd") : "",
    ]);

    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `請款報表_${monthFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("報表已匯出");
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="請款管理"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">本月總撥款</p>
                <p className="text-xl font-bold">NT$ {summary.total.toLocaleString()}</p>
                {summary.feeRate > 0 && (
                  <p className="text-xs text-muted-foreground">
                    扣除手續費後實際撥款：<span className="font-medium text-primary">NT$ {summary.totalNet.toLocaleString()}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {summary.feeRate > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100 text-red-600">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">手續費 ({summary.feeRate}%)</p>
                  <p className="text-xl font-bold text-red-600">-NT$ {summary.totalFee.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-orange-100 text-orange-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">待請款</p>
                <p className="text-xl font-bold text-orange-600">NT$ {summary.pendingNet.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-100 text-purple-600">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">審核中</p>
                <p className="text-xl font-bold text-purple-600">NT$ {summary.requestedNet.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10 text-primary">
                <CheckCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">已撥款</p>
                <p className="text-xl font-bold text-primary">NT$ {summary.paidNet.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Split Rule Info */}
      {splitRule && splitRule.transaction_fee_percentage > 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm">請款手續費：</span>
              <Badge variant="destructive">
                {splitRule.transaction_fee_percentage}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              待請款
            </TabsTrigger>
            <TabsTrigger value="requested" className="gap-2">
              <Send className="h-4 w-4" />
              已請款
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              撥款紀錄
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker
              value={monthFilter}
              onChange={setMonthFilter}
              className="w-[160px]"
            />
            <Button variant="outline" size="icon" onClick={handleExportCSV} title="匯出 CSV">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Pending Tab */}
        <TabsContent value="pending" className="space-y-4">
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : pendingRecords.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">目前沒有待請款的記錄</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="py-3 px-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">已選擇</span>
                      <span className="font-semibold text-foreground">{selectedRecords.length} 筆</span>
                      <span className="text-muted-foreground">，金額</span>
                      <span className="font-semibold text-primary">NT$ {selectedAmount.toLocaleString()}</span>
                    </div>
                    <Button 
                      onClick={() => setShowRequestDialog(true)}
                      disabled={selectedRecords.length === 0}
                      className="shrink-0"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      提交請款申請
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedRecords.length === pendingRecords.length && pendingRecords.length > 0}
                              onCheckedChange={handleSelectAll}
                            />
                          </TableHead>
                          <TableHead>訂單編號</TableHead>
                          <TableHead>入住日期</TableHead>
                          <TableHead className="text-right">訂單金額</TableHead>
                          <TableHead className="text-right">手續費</TableHead>
                          <TableHead className="text-right">撥款金額</TableHead>
                          <TableHead>付款狀態</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRecords.map(record => (
                          <TableRow key={record.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedRecords.includes(record.id)}
                                onCheckedChange={() => handleSelectRecord(record.id)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              <Link to={`/admin/orders/${record.order_id}`} className="text-primary hover:underline">
                                {record.orders?.order_number}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.orders?.check_in_date && format(new Date(record.orders.check_in_date), "yyyy/MM/dd")}
                            </TableCell>
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
                              {(() => {
                                const config = getPaymentStatusConfig(record.orders?.payment_status || "unpaid");
                                return (
                                  <Badge className={`${config.className} border`}>
                                    {config.label}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Requested Tab */}
        <TabsContent value="requested" className="space-y-4">
          {loading ? (
            <TableSkeleton rows={5} columns={6} />
          ) : splitRecords.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">目前沒有審核中的請款</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="py-3 px-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Send className="h-4 w-4 text-blue-500" />
                      <span className="text-muted-foreground">審核中</span>
                      <span className="font-semibold text-foreground">{splitRecords.length} 筆</span>
                      <span className="text-muted-foreground">，總金額</span>
                      <span className="font-semibold text-primary">
                        NT$ {splitRecords.reduce((sum, r) => sum + r.accommodation_amount, 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      請款申請已送出，請等待總部審核
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>訂單編號</TableHead>
                          <TableHead>入住日期</TableHead>
                          <TableHead className="text-right">撥款金額</TableHead>
                          <TableHead>請款日期</TableHead>
                          <TableHead>狀態</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {splitRecords.map(record => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">
                              <Link to={`/admin/orders/${record.order_id}`} className="text-primary hover:underline">
                                {record.orders?.order_number}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.orders?.check_in_date && format(new Date(record.orders.check_in_date), "yyyy/MM/dd")}
                            </TableCell>
                            <TableCell className="text-right text-primary font-medium">
                              NT$ {record.accommodation_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.requested_at && format(new Date(record.requested_at), "yyyy/MM/dd HH:mm")}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(record.settlement_status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : splitRecords.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Banknote className="h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <p className="text-muted-foreground">目前沒有撥款紀錄</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-muted/30 border-dashed">
                <CardContent className="py-3 px-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">已撥款</span>
                      <span className="font-semibold text-foreground">{splitRecords.length} 筆</span>
                      <span className="text-muted-foreground">，總金額</span>
                      <span className="font-semibold text-primary">
                        NT$ {splitRecords.reduce((sum, r) => sum + r.accommodation_amount, 0).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {monthFilter ? format(new Date(monthFilter + "-01"), "yyyy年M月", { locale: zhTW }) : ""}撥款紀錄
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>訂單編號</TableHead>
                          <TableHead>入住日期</TableHead>
                          <TableHead className="text-right">撥款金額</TableHead>
                          <TableHead>請款日期</TableHead>
                          <TableHead>撥款日期</TableHead>
                          <TableHead>付款方式</TableHead>
                          <TableHead>狀態</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {splitRecords.map(record => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">
                              <Link to={`/admin/orders/${record.order_id}`} className="text-primary hover:underline">
                                {record.orders?.order_number}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.orders?.check_in_date && format(new Date(record.orders.check_in_date), "yyyy/MM/dd")}
                            </TableCell>
                            <TableCell className="text-right text-primary font-medium">
                              NT$ {record.accommodation_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.requested_at && format(new Date(record.requested_at), "yyyy/MM/dd")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.paid_at && format(new Date(record.paid_at), "yyyy/MM/dd")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {record.payment_method || "-"}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(record.settlement_status)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Request Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交請款申請</DialogTitle>
            <DialogDescription>
              即將提交 {selectedRecords.length} 筆請款申請，總計 NT$ {selectedAmount.toLocaleString()}
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
                <span className="text-xl font-bold text-primary">NT$ {selectedAmount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>備註（選填）</Label>
              <Textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder="如有特殊說明，請在此填寫"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>取消</Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              確認提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
