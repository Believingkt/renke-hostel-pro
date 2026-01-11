import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { HQSplitSkeleton } from "@/components/skeletons/HQSkeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { toast } from "sonner";

interface SplitRule {
  id: string;
  accommodation_id: string;
  hq_percentage: number;
  accommodation_percentage: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  description: string | null;
  created_at: string;
}

interface SplitRecord {
  id: string;
  order_id: string;
  accommodation_id: string;
  order_amount: number;
  hq_amount: number;
  accommodation_amount: number;
  hq_percentage: number;
  accommodation_percentage: number;
  settlement_status: string;
  settlement_date: string | null;
  settlement_note: string | null;
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

// Map URL section to internal tab value
const sectionToTab: Record<string, string> = {
  rules: "rules",
  details: "records",
  reports: "reports",
  pending: "settlement",
};

const tabToSection: Record<string, string> = {
  rules: "rules",
  records: "details",
  reports: "reports",
  settlement: "pending",
};

export function SplitManagement({ accommodations }: SplitManagementProps) {
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
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [settlingRecords, setSettlingRecords] = useState<SplitRecord[]>([]);
  const [settlementNote, setSettlementNote] = useState("");
  
  // Form state
  const [ruleForm, setRuleForm] = useState({
    accommodation_id: "",
    hq_percentage: 10,
    accommodation_percentage: 90,
    effective_from: format(new Date(), "yyyy-MM-dd"),
    effective_to: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);

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
      } else if (activeTab === "records" || activeTab === "reports") {
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

    if (statusFilter !== "all") {
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

    if (ruleForm.hq_percentage + ruleForm.accommodation_percentage !== 100) {
      toast.error("拆帳比例總和必須為 100%");
      return;
    }

    setSaving(true);
    try {
      if (editingRule) {
        // Deactivate old rule
        await supabase
          .from("split_rules")
          .update({ is_active: false, effective_to: format(new Date(), "yyyy-MM-dd") })
          .eq("id", editingRule.id);
      }

      // Create new rule
      const { error } = await supabase.from("split_rules").insert([{
        accommodation_id: ruleForm.accommodation_id,
        hq_percentage: ruleForm.hq_percentage,
        accommodation_percentage: ruleForm.accommodation_percentage,
        effective_from: ruleForm.effective_from,
        effective_to: ruleForm.effective_to || null,
        description: ruleForm.description || null,
      }]);

      if (error) throw error;

      toast.success(editingRule ? "拆帳規則已更新" : "拆帳規則已建立");
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

  const handleSettleRecords = async () => {
    if (settlingRecords.length === 0) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("split_records")
        .update({
          settlement_status: "settled",
          settlement_date: new Date().toISOString(),
          settlement_note: settlementNote || null,
          settled_by: user?.id,
        })
        .in("id", settlingRecords.map(r => r.id));

      if (error) throw error;

      toast.success(`已結算 ${settlingRecords.length} 筆記錄`);
      setShowSettleDialog(false);
      setSettlingRecords([]);
      setSettlementNote("");
      await loadSplitRecords();
    } catch (error) {
      console.error("Error settling records:", error);
      toast.error("結算失敗");
    } finally {
      setSaving(false);
    }
  };

  const resetRuleForm = () => {
    setRuleForm({
      accommodation_id: "",
      hq_percentage: 10,
      accommodation_percentage: 90,
      effective_from: format(new Date(), "yyyy-MM-dd"),
      effective_to: "",
      description: "",
    });
  };

  const openEditRule = (rule: SplitRule) => {
    setEditingRule(rule);
    setRuleForm({
      accommodation_id: rule.accommodation_id,
      hq_percentage: Number(rule.hq_percentage),
      accommodation_percentage: Number(rule.accommodation_percentage),
      effective_from: format(new Date(), "yyyy-MM-dd"),
      effective_to: "",
      description: rule.description || "",
    });
    setShowRuleDialog(true);
  };

  const getAccommodationName = (id: string) => {
    return accommodations.find(a => a.id === id)?.name || "未知";
  };

  // Calculate summary for reports
  const reportSummary = useMemo(() => {
    const byAccommodation: Record<string, {
      total: number;
      hqTotal: number;
      accTotal: number;
      pending: number;
      settled: number;
      count: number;
    }> = {};

    splitRecords.forEach(record => {
      if (!byAccommodation[record.accommodation_id]) {
        byAccommodation[record.accommodation_id] = {
          total: 0,
          hqTotal: 0,
          accTotal: 0,
          pending: 0,
          settled: 0,
          count: 0,
        };
      }

      const acc = byAccommodation[record.accommodation_id];
      acc.total += record.order_amount;
      acc.hqTotal += record.hq_amount;
      acc.accTotal += record.accommodation_amount;
      acc.count += 1;

      if (record.settlement_status === "pending") {
        acc.pending += record.hq_amount;
      } else {
        acc.settled += record.hq_amount;
      }
    });

    return byAccommodation;
  }, [splitRecords]);

  const pendingRecords = splitRecords.filter(r => r.settlement_status === "pending");

  if (loading && splitRules.length === 0 && splitRecords.length === 0) {
    return <HQSplitSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
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

            <Button onClick={() => { resetRuleForm(); setEditingRule(null); setShowRuleDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              新增規則
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                拆帳規則設定
              </CardTitle>
              <CardDescription>設定總部與各民宿的分潤比例</CardDescription>
            </CardHeader>
            <CardContent>
              {splitRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Percent className="h-12 w-12 mb-4 opacity-50" />
                  <p>尚無拆帳規則</p>
                  <p className="text-sm">請點擊「新增規則」建立拆帳設定</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>民宿</TableHead>
                        <TableHead>總部比例</TableHead>
                        <TableHead>民宿比例</TableHead>
                        <TableHead>生效日期</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="text-right">操作</TableHead>
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
                            <Badge variant="outline">{rule.hq_percentage}%</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{rule.accommodation_percentage}%</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(rule.effective_from), "yyyy/MM/dd")}
                            {rule.effective_to && ` ~ ${format(new Date(rule.effective_to), "yyyy/MM/dd")}`}
                          </TableCell>
                          <TableCell>
                            {rule.is_active ? (
                              <Badge className="bg-primary">啟用中</Badge>
                            ) : (
                              <Badge variant="secondary">已停用</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
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

        {/* Records Tab */}
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
                <SelectItem value="pending">待結算</SelectItem>
                <SelectItem value="settled">已結算</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-[180px]"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                拆帳明細記錄
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
                        <TableHead>訂單編號</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead className="text-right">訂單金額</TableHead>
                        <TableHead className="text-right">總部分潤</TableHead>
                        <TableHead className="text-right">民宿分潤</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead>建立時間</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {splitRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.orders?.order_number}
                          </TableCell>
                          <TableCell>{getAccommodationName(record.accommodation_id)}</TableCell>
                          <TableCell className="text-right font-medium">
                            NT$ {record.order_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            NT$ {record.hq_amount.toLocaleString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({record.hq_percentage}%)
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-primary">
                            NT$ {record.accommodation_amount.toLocaleString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              ({record.accommodation_percentage}%)
                            </span>
                          </TableCell>
                          <TableCell>
                            {record.settlement_status === "settled" ? (
                              <Badge className="bg-primary">已結算</Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-500 border-orange-500">待結算</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(record.created_at), "MM/dd HH:mm")}
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

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-[180px]"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {format(new Date(monthFilter + "-01"), "yyyy年M月", { locale: zhTW })} 結算報表
              </CardTitle>
              <CardDescription>各民宿的拆帳統計與結算狀態</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(reportSummary).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
                  <p>本月無拆帳資料</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(reportSummary).map(([accId, summary]) => (
                    <Card key={accId} className="border-dashed">
                      <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <span className="font-semibold">{getAccommodationName(accId)}</span>
                            <Badge variant="outline">{summary.count} 筆</Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">訂單總額</p>
                            <p className="text-xl font-bold">NT$ {summary.total.toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">總部分潤</p>
                            <p className="text-xl font-bold text-blue-600">NT$ {summary.hqTotal.toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">待結算</p>
                            <p className="text-xl font-bold text-orange-500">NT$ {summary.pending.toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">已結算</p>
                            <p className="text-xl font-bold text-primary">NT$ {summary.settled.toLocaleString()}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settlement Tab */}
        <TabsContent value="settlement" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    待結算記錄
                  </CardTitle>
                  <CardDescription>標記訂單拆帳為已結算狀態</CardDescription>
                </div>
                {pendingRecords.length > 0 && (
                  <Button
                    onClick={() => {
                      setSettlingRecords(pendingRecords);
                      setShowSettleDialog(true);
                    }}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    全部結算 ({pendingRecords.length})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {pendingRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mb-4 opacity-50" />
                  <p>目前沒有待結算的記錄</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>訂單編號</TableHead>
                        <TableHead>民宿</TableHead>
                        <TableHead>入住日期</TableHead>
                        <TableHead className="text-right">訂單金額</TableHead>
                        <TableHead className="text-right">總部應收</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRecords.map(record => (
                        <TableRow key={record.id}>
                          <TableCell className="font-mono text-sm">
                            {record.orders?.order_number}
                          </TableCell>
                          <TableCell>{getAccommodationName(record.accommodation_id)}</TableCell>
                          <TableCell className="text-sm">
                            {record.orders?.check_in_date && format(new Date(record.orders.check_in_date), "yyyy/MM/dd")}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            NT$ {record.order_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-blue-600 font-medium">
                            NT$ {record.hq_amount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSettlingRecords([record]);
                                setShowSettleDialog(true);
                              }}
                            >
                              結算
                            </Button>
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
            <DialogTitle>{editingRule ? "編輯拆帳規則" : "新增拆帳規則"}</DialogTitle>
            <DialogDescription>設定民宿的分潤比例</DialogDescription>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>總部比例 (%)</Label>
                <Input
                  type="number"
                  value={ruleForm.hq_percentage}
                  onChange={(e) => {
                    const hq = parseInt(e.target.value) || 0;
                    setRuleForm(prev => ({
                      ...prev,
                      hq_percentage: hq,
                      accommodation_percentage: 100 - hq,
                    }));
                  }}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <Label>民宿比例 (%)</Label>
                <Input
                  type="number"
                  value={ruleForm.accommodation_percentage}
                  onChange={(e) => {
                    const acc = parseInt(e.target.value) || 0;
                    setRuleForm(prev => ({
                      ...prev,
                      accommodation_percentage: acc,
                      hq_percentage: 100 - acc,
                    }));
                  }}
                  min={0}
                  max={100}
                />
              </div>
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

      {/* Settlement Dialog */}
      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認結算</DialogTitle>
            <DialogDescription>
              即將結算 {settlingRecords.length} 筆記錄，總計 NT$ {settlingRecords.reduce((sum, r) => sum + r.hq_amount, 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>結算備註</Label>
              <Textarea
                value={settlementNote}
                onChange={(e) => setSettlementNote(e.target.value)}
                placeholder="選填，例如：轉帳單號、付款方式等"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettleDialog(false)}>取消</Button>
            <Button onClick={handleSettleRecords} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              確認結算
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
