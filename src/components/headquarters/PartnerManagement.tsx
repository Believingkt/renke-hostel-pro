import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { Plus, Copy, Eye, EyeOff, Loader2, Trash2, ExternalLink, Handshake, FileText, ArrowDownUp, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import * as XLSX from "xlsx";

interface PointTransaction {
  id: string;
  order_id: string | null;
  external_user_id: string;
  external_transaction_id: string | null;
  points_amount: number;
  currency_amount: number;
  transaction_type: string;
  status: string;
  created_at: string;
  metadata: any;
  orders: {
    order_number: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    final_price: number;
    order_status: string;
    room_types: { name: string } | null;
    accommodation_id: string;
  } | null;
}

interface Partner {
  id: string;
  platform_name: string;
  platform_code: string;
  api_key: string;
  is_active: boolean;
  point_to_currency_rate: number;
  webhook_url: string | null;
  webhook_secret: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

export interface PartnerManagementRef {
  openCreateDialog: () => void;
}

export const PartnerManagement = forwardRef<PartnerManagementRef>((_, ref) => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [showTransactions, setShowTransactions] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [accommodationNames, setAccommodationNames] = useState<Record<string, string>>({});
  const [settlementMonth, setSettlementMonth] = useState(new Date());
  const [settlementData, setSettlementData] = useState<PointTransaction[]>([]);
  const [loadingSettlement, setLoadingSettlement] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formRate, setFormRate] = useState("1");
  const [formEmail, setFormEmail] = useState("");
  const [formWebhook, setFormWebhook] = useState("");
  const [formNotes, setFormNotes] = useState("");

  useImperativeHandle(ref, () => ({
    openCreateDialog: () => setShowCreateDialog(true),
  }));

  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("points_platform_partners")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("載入合作夥伴失敗");
      console.error(error);
    } else {
      setPartners((data as any) || []);
    }
    setLoading(false);
  };

  const loadTransactions = async (partner: Partner) => {
    setSelectedPartner(partner);
    setShowTransactions(true);
    setLoadingTransactions(true);

    const { data, error } = await supabase
      .from("point_transactions")
      .select("*, orders(order_number, guest_name, check_in_date, check_out_date, final_price, order_status, room_types(name), accommodation_id)")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast.error("載入交易記錄失敗");
      console.error(error);
    } else {
      const txns = (data as any) || [];
      setTransactions(txns);
      
      // Load accommodation names
      const accIds = [...new Set(txns.map((t: any) => t.orders?.accommodation_id).filter(Boolean))] as string[];
      if (accIds.length > 0) {
        const { data: accData } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", accIds);
        if (accData) {
          const map: Record<string, string> = {};
          accData.forEach((a: any) => { map[a.id] = a.name; });
          setAccommodationNames(map);
        }
      }
    }
    setLoadingTransactions(false);
  };

  const loadSettlement = async (partner: Partner, month: Date) => {
    setSelectedPartner(partner);
    setShowSettlement(true);
    setSettlementMonth(month);
    setLoadingSettlement(true);

    const from = format(startOfMonth(month), "yyyy-MM-dd'T'00:00:00");
    const to = format(endOfMonth(month), "yyyy-MM-dd'T'23:59:59");

    const { data, error } = await supabase
      .from("point_transactions")
      .select("*, orders(order_number, guest_name, check_in_date, check_out_date, final_price, order_status, room_types(name), accommodation_id)")
      .eq("partner_id", partner.id)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("載入結算資料失敗");
      console.error(error);
    } else {
      const txns = (data as any) || [];
      setSettlementData(txns);

      const accIds = [...new Set(txns.map((t: any) => t.orders?.accommodation_id).filter(Boolean))] as string[];
      if (accIds.length > 0) {
        const { data: accData } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", accIds);
        if (accData) {
          const map: Record<string, string> = {};
          accData.forEach((a: any) => { map[a.id] = a.name; });
          setAccommodationNames(prev => ({ ...prev, ...map }));
        }
      }
    }
    setLoadingSettlement(false);
  };

  const changeSettlementMonth = (delta: number) => {
    if (!selectedPartner) return;
    const newMonth = delta > 0 ? addMonths(settlementMonth, 1) : subMonths(settlementMonth, 1);
    loadSettlement(selectedPartner, newMonth);
  };

  const getSettlementSummary = () => {
    const deductions = settlementData.filter(t => t.transaction_type === "deduction" && t.status === "completed");
    const refunds = settlementData.filter(t => t.transaction_type === "refund" && t.status === "completed");

    const totalPoints = deductions.reduce((s, t) => s + t.points_amount, 0);
    const totalCurrency = deductions.reduce((s, t) => s + t.currency_amount, 0);
    const refundPoints = refunds.reduce((s, t) => s + t.points_amount, 0);
    const refundCurrency = refunds.reduce((s, t) => s + t.currency_amount, 0);

    // Group by accommodation
    const byAccommodation: Record<string, { deductionPoints: number; deductionCurrency: number; refundPoints: number; refundCurrency: number; count: number }> = {};
    settlementData.forEach(t => {
      const accId = t.orders?.accommodation_id || "unknown";
      if (!byAccommodation[accId]) {
        byAccommodation[accId] = { deductionPoints: 0, deductionCurrency: 0, refundPoints: 0, refundCurrency: 0, count: 0 };
      }
      if (t.transaction_type === "deduction" && t.status === "completed") {
        byAccommodation[accId].deductionPoints += t.points_amount;
        byAccommodation[accId].deductionCurrency += t.currency_amount;
        byAccommodation[accId].count++;
      } else if (t.transaction_type === "refund" && t.status === "completed") {
        byAccommodation[accId].refundPoints += t.points_amount;
        byAccommodation[accId].refundCurrency += t.currency_amount;
      }
    });

    return { totalPoints, totalCurrency, refundPoints, refundCurrency, netPoints: totalPoints - refundPoints, netCurrency: totalCurrency - refundCurrency, byAccommodation, orderCount: deductions.length };
  };

  const exportSettlement = () => {
    if (!selectedPartner) return;
    const summary = getSettlementSummary();
    const monthStr = format(settlementMonth, "yyyy-MM");

    const rows = Object.entries(summary.byAccommodation).map(([accId, data]) => ({
      "民宿": accommodationNames[accId] || accId,
      "訂單數": data.count,
      "扣點數": data.deductionPoints,
      "扣點金額": data.deductionCurrency,
      "退點數": data.refundPoints,
      "退點金額": data.refundCurrency,
      "淨點數": data.deductionPoints - data.refundPoints,
      "淨金額": data.deductionCurrency - data.refundCurrency,
    }));

    rows.push({
      "民宿": "合計",
      "訂單數": summary.orderCount,
      "扣點數": summary.totalPoints,
      "扣點金額": summary.totalCurrency,
      "退點數": summary.refundPoints,
      "退點金額": summary.refundCurrency,
      "淨點數": summary.netPoints,
      "淨金額": summary.netCurrency,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const colWidths = Object.keys(rows[0]).map(key => {
      const maxLen = Math.max(key.length, ...rows.map(r => String((r as any)[key] ?? "").length));
      return { wch: Math.min(Math.max(maxLen + 2, 8), 20) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "月結報表");
    XLSX.writeFile(wb, `${selectedPartner.platform_name}_點數結算_${monthStr}.xlsx`);
    toast.success("報表已匯出");
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formCode.trim()) {
      toast.error("請填寫平台名稱和代碼");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.from("points_platform_partners").insert({
      platform_name: formName.trim(),
      platform_code: formCode.trim().toLowerCase(),
      point_to_currency_rate: parseFloat(formRate) || 1,
      contact_email: formEmail.trim() || null,
      webhook_url: formWebhook.trim() || null,
      notes: formNotes.trim() || null,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("平台代碼已存在");
      } else {
        toast.error("建立失敗：" + error.message);
      }
    } else {
      toast.success("合作夥伴已建立");
      setShowCreateDialog(false);
      resetForm();
      loadPartners();
    }
    setIsSubmitting(false);
  };

  const toggleActive = async (partner: Partner) => {
    const { error } = await supabase
      .from("points_platform_partners")
      .update({ is_active: !partner.is_active })
      .eq("id", partner.id);

    if (error) {
      toast.error("更新失敗");
    } else {
      toast.success(partner.is_active ? "已停用" : "已啟用");
      loadPartners();
    }
  };

  const deletePartner = async (partner: Partner) => {
    if (!confirm(`確定要刪除「${partner.platform_name}」？此操作無法復原。`)) return;

    const { error } = await supabase
      .from("points_platform_partners")
      .delete()
      .eq("id", partner.id);

    if (error) {
      toast.error("刪除失敗：" + error.message);
    } else {
      toast.success("已刪除");
      loadPartners();
    }
  };

  const copyApiKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API Key 已複製");
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setFormName("");
    setFormCode("");
    setFormRate("1");
    setFormEmail("");
    setFormWebhook("");
    setFormNotes("");
  };

  const maskKey = (key: string) => key.slice(0, 8) + "••••••••" + key.slice(-8);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If viewing settlement report
  if (showSettlement && selectedPartner) {
    const summary = getSettlementSummary();
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setShowSettlement(false)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                {selectedPartner.platform_name} — 每月點數結算報表
              </h2>
              <p className="text-sm text-muted-foreground">按月份查看點數扣款與退款結算明細</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={exportSettlement} disabled={settlementData.length === 0}>
            <Download className="h-4 w-4 mr-1" /> 匯出 Excel
          </Button>
        </div>

        {/* Month Picker */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => changeSettlementMonth(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="text-xl font-bold min-w-[140px] text-center">
            {format(settlementMonth, "yyyy 年 M 月", { locale: zhTW })}
          </h3>
          <Button variant="ghost" size="icon" onClick={() => changeSettlementMonth(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {loadingSettlement ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : settlementData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>本月無交易記錄</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">訂單數</p>
                  <p className="text-2xl font-bold">{summary.orderCount}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">扣點金額</p>
                  <p className="text-2xl font-bold">${summary.totalCurrency.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">退點金額</p>
                  <p className="text-2xl font-bold text-orange-600">${summary.refundCurrency.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">淨結算金額</p>
                  <p className="text-2xl font-bold text-primary">${summary.netCurrency.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Per-Accommodation Breakdown */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">各民宿結算明細</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>民宿</TableHead>
                        <TableHead className="text-right">訂單數</TableHead>
                        <TableHead className="text-right">扣點數</TableHead>
                        <TableHead className="text-right">扣點金額</TableHead>
                        <TableHead className="text-right">退點數</TableHead>
                        <TableHead className="text-right">退點金額</TableHead>
                        <TableHead className="text-right">淨點數</TableHead>
                        <TableHead className="text-right">淨金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(summary.byAccommodation).map(([accId, data]) => (
                        <TableRow key={accId}>
                          <TableCell className="font-medium">{accommodationNames[accId] || accId}</TableCell>
                          <TableCell className="text-right">{data.count}</TableCell>
                          <TableCell className="text-right">{data.deductionPoints.toLocaleString()}</TableCell>
                          <TableCell className="text-right">${data.deductionCurrency.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-orange-600">{data.refundPoints.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-orange-600">${data.refundCurrency.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{(data.deductionPoints - data.refundPoints).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">${(data.deductionCurrency - data.refundCurrency).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell>合計</TableCell>
                        <TableCell className="text-right">{summary.orderCount}</TableCell>
                        <TableCell className="text-right">{summary.totalPoints.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${summary.totalCurrency.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-orange-600">{summary.refundPoints.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-orange-600">${summary.refundCurrency.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{summary.netPoints.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${summary.netCurrency.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Transaction Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">交易明細</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>時間</TableHead>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>房型</TableHead>
                        <TableHead>旅客</TableHead>
                        <TableHead>入住日期</TableHead>
                        <TableHead>類型</TableHead>
                        <TableHead className="text-right">點數</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlementData.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(t.created_at), "MM/dd HH:mm")}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {t.orders?.order_number || "-"}
                            </code>
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.orders?.accommodation_id ? accommodationNames[t.orders.accommodation_id] || "-" : "-"}
                          </TableCell>
                          <TableCell className="text-sm">{t.orders?.room_types?.name || "-"}</TableCell>
                          <TableCell className="text-sm">{t.orders?.guest_name || t.external_user_id}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {t.orders ? `${t.orders.check_in_date} ~ ${t.orders.check_out_date}` : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={t.transaction_type === "deduction" ? "default" : "secondary"}>
                              {t.transaction_type === "deduction" ? "扣點" : "退點"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {t.transaction_type === "deduction" ? "-" : "+"}{t.points_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${t.currency_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={t.status === "completed" ? "default" : t.status === "refunded" ? "secondary" : "outline"}>
                              {t.status === "completed" ? "完成" : t.status === "refunded" ? "已退款" : t.status}
                            </Badge>
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
      </div>
    );
  }

  // If viewing transactions, show full-page view
  if (showTransactions && selectedPartner) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowTransactions(false)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ArrowDownUp className="h-5 w-5" />
              {selectedPartner.platform_name} — 點數交易記錄
            </h2>
            <p className="text-sm text-muted-foreground">透過此平台進行的所有點數訂房交易明細</p>
          </div>
        </div>

        {loadingTransactions ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>尚無交易記錄</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">總交易筆數</p>
                  <p className="text-2xl font-bold">{transactions.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">總點數使用</p>
                  <p className="text-2xl font-bold">
                    {transactions
                      .filter(t => t.transaction_type === "deduction" && t.status === "completed")
                      .reduce((sum, t) => sum + t.points_amount, 0)
                      .toLocaleString()}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs text-muted-foreground">總折抵金額</p>
                  <p className="text-2xl font-bold">
                    ${transactions
                      .filter(t => t.transaction_type === "deduction" && t.status === "completed")
                      .reduce((sum, t) => sum + t.currency_amount, 0)
                      .toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>時間</TableHead>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>房型</TableHead>
                        <TableHead>旅客</TableHead>
                        <TableHead>入住日期</TableHead>
                        <TableHead>類型</TableHead>
                        <TableHead className="text-right">點數</TableHead>
                        <TableHead className="text-right">折抵金額</TableHead>
                        <TableHead>狀態</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(t.created_at), "yyyy-MM-dd HH:mm")}
                          </TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                              {t.orders?.order_number || "-"}
                            </code>
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.orders?.accommodation_id ? accommodationNames[t.orders.accommodation_id] || "-" : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {t.orders?.room_types?.name || "-"}
                          </TableCell>
                          <TableCell className="text-sm">{t.orders?.guest_name || t.external_user_id}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {t.orders ? `${t.orders.check_in_date} ~ ${t.orders.check_out_date}` : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={t.transaction_type === "deduction" ? "default" : "secondary"}>
                              {t.transaction_type === "deduction" ? "扣點" : "退點"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {t.transaction_type === "deduction" ? "-" : "+"}{t.points_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${t.currency_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={t.status === "completed" ? "default" : t.status === "refunded" ? "secondary" : "outline"}>
                              {t.status === "completed" ? "完成" : t.status === "refunded" ? "已退款" : t.status}
                            </Badge>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {partners.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="尚未建立合作夥伴"
          description="新增點數平台合作夥伴，讓會員可透過點數訂房"
          action={{ label: "新增合作夥伴", onClick: () => setShowCreateDialog(true) }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">合作夥伴列表</CardTitle>
            <CardDescription>管理點數平台串接的合作夥伴及 API 金鑰</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>平台名稱</TableHead>
                    <TableHead>代碼</TableHead>
                    <TableHead>兌換比率</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        <div>
                          {p.platform_name}
                          {p.contact_email && (
                            <p className="text-xs text-muted-foreground">{p.contact_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.platform_code}</code>
                      </TableCell>
                      <TableCell>1 點 = {p.point_to_currency_rate} 元</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded max-w-[200px] truncate">
                            {visibleKeys.has(p.id) ? p.api_key : maskKey(p.api_key)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleKeyVisibility(p.id)}
                          >
                            {visibleKeys.has(p.id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyApiKey(p.api_key)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={() => toggleActive(p)}
                          />
                          <Badge variant={p.is_active ? "default" : "secondary"}>
                            {p.is_active ? "啟用" : "停用"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="查看交易記錄"
                            onClick={() => loadTransactions(p)}
                          >
                            <ArrowDownUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="每月結算報表"
                            onClick={() => loadSettlement(p, new Date())}
                          >
                            <CalendarDays className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => window.open("/points-api-docs", "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deletePartner(p)}
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
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增合作夥伴</DialogTitle>
            <DialogDescription>建立新的點數平台合作夥伴，系統將自動產生 API Key</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>平台名稱 *</Label>
              <Input placeholder="例如：StarChain 星鏈" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>平台代碼 *</Label>
              <Input placeholder="例如：starchain（英文小寫）" value={formCode} onChange={(e) => setFormCode(e.target.value)} />
              <p className="text-xs text-muted-foreground">用於訂單來源識別，建立後不可修改</p>
            </div>
            <div className="space-y-2">
              <Label>兌換比率（1 點 = ? 元）</Label>
              <Input type="number" min="0.01" step="0.01" value={formRate} onChange={(e) => setFormRate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>聯絡 Email</Label>
              <Input type="email" placeholder="partner@example.com" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input placeholder="https://..." value={formWebhook} onChange={(e) => setFormWebhook(e.target.value)} />
              <p className="text-xs text-muted-foreground">訂單建立/取消時會發送通知至此 URL</p>
            </div>
            <div className="space-y-2">
              <Label>備註</Label>
              <Input placeholder="備註說明" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

PartnerManagement.displayName = "PartnerManagement";
