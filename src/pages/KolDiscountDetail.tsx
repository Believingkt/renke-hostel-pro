import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Calendar,
  ShoppingCart,
  DollarSign,
  Ticket,
  Key,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccommodation } from "@/contexts/AccommodationContext";

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

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  discount_amount: number;
  final_price: number;
  order_status: string;
  created_at: string;
  room_types: {
    name: string;
  } | null;
}

interface DiscountCodeInfo {
  id: string;
  name: string;
  code: string;
  accommodation_id: string;
}

const KolDiscountDetail = () => {
  const { discountCodeId } = useParams<{ discountCodeId: string }>();
  const navigate = useNavigate();
  const { currentAccommodationId: accommodationId } = useAccommodation();
  const [commissionRecords, setCommissionRecords] = useState<CommissionRecord[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingCommission, setIsLoadingCommission] = useState(true);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [isSettling, setIsSettling] = useState(false);
  const [activeTab, setActiveTab] = useState("orders");
  const [copiedApiKey, setCopiedApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [codeInfo, setCodeInfo] = useState<DiscountCodeInfo | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (discountCodeId) {
      fetchCodeInfo();
      fetchCommissionRecords();
      fetchApiKey();
    }
  }, [discountCodeId]);

  useEffect(() => {
    if (codeInfo) {
      fetchOrders();
    }
  }, [codeInfo]);

  const fetchCodeInfo = async () => {
    setIsLoadingInfo(true);
    try {
      const { data, error } = await supabase
        .from("discount_codes")
        .select("id, name, code, accommodation_id")
        .eq("id", discountCodeId!)
        .single();

      if (error) throw error;
      setCodeInfo(data);
    } catch (error) {
      console.error("Error fetching code info:", error);
      toast({ title: "查詢折扣碼資料失敗", variant: "destructive" });
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const generateApiKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let newApiKey = "kol_";
    for (let i = 0; i < 32; i++) {
      newApiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return newApiKey;
  };

  const handleCopyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      setCopiedApiKey(true);
      setTimeout(() => setCopiedApiKey(false), 2000);
      toast({ title: "已複製 API 金鑰" });
    }
  };

  const handleRegenerateApiKey = async () => {
    setIsRegenerating(true);
    try {
      const newApiKey = generateApiKey();
      const { error } = await supabase
        .from("discount_code_secrets")
        .update({ api_key: newApiKey, updated_at: new Date().toISOString() })
        .eq("discount_code_id", discountCodeId!);

      if (error) throw error;

      setApiKey(newApiKey);
      toast({
        title: "API 金鑰已重新產生",
        description: "請複製新的 API 金鑰並更新您的應用程式",
      });
    } catch (error) {
      console.error("Error regenerating API key:", error);
      toast({ title: "重新產生失敗", variant: "destructive" });
    } finally {
      setIsRegenerating(false);
      setRegenerateDialogOpen(false);
    }
  };

  const fetchApiKey = async () => {
    setIsLoadingApiKey(true);
    try {
      const { data, error } = await supabase
        .from("discount_code_secrets")
        .select("api_key")
        .eq("discount_code_id", discountCodeId!)
        .single();

      if (!error && data) {
        setApiKey(data.api_key);
      }
    } catch (error) {
      console.error("Error fetching API key:", error);
    } finally {
      setIsLoadingApiKey(false);
    }
  };

  const fetchCommissionRecords = async () => {
    setIsLoadingCommission(true);
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
        .eq("discount_code_id", discountCodeId!)
        .neq("settlement_status", "cancelled")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCommissionRecords((data || []) as CommissionRecord[]);
    } catch (error) {
      console.error("Error fetching commission records:", error);
      toast({ title: "查詢失敗", description: "無法取得佣金記錄", variant: "destructive" });
    } finally {
      setIsLoadingCommission(false);
    }
  };

  const fetchOrders = async () => {
    if (!codeInfo) return;

    setIsLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, room_types(name)")
        .eq("accommodation_id", codeInfo.accommodation_id)
        .eq("discount_code", codeInfo.code)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast({ title: "查詢失敗", description: "無法取得訂單資料", variant: "destructive" });
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const handleUpdateStatus = async (
    recordId: string,
    newStatus: "pending" | "approved" | "paid" | "cancelled"
  ) => {
    setUpdatingId(recordId);
    try {
      const updates: any = { settlement_status: newStatus };

      if (newStatus === "approved") {
        updates.settlement_date = new Date().toISOString();
      } else if (newStatus === "paid") {
        updates.payment_date = new Date().toISOString();
        if (!commissionRecords.find((r) => r.id === recordId)?.settlement_date) {
          updates.settlement_date = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from("commission_records")
        .update(updates)
        .eq("id", recordId);

      if (error) throw error;

      toast({ title: "狀態更新成功" });
      fetchCommissionRecords();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({ title: "更新失敗", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const getAvailableMonths = () => {
    if (commissionRecords.length === 0) return [];
    const months = new Set<string>();
    commissionRecords.forEach((record) => {
      const month = format(new Date(record.created_at), "yyyy-MM");
      months.add(month);
    });
    return Array.from(months).sort().reverse();
  };

  const filteredRecords =
    selectedMonth === "all"
      ? commissionRecords
      : commissionRecords.filter((record) => {
          const recordMonth = format(new Date(record.created_at), "yyyy-MM");
          return recordMonth === selectedMonth;
        });

  const handleMonthlySettlement = async (status: "approved" | "paid") => {
    if (selectedMonth === "all") {
      toast({ title: "請先選擇要結算的月份", variant: "destructive" });
      return;
    }

    const pendingRecordsInMonth = filteredRecords.filter(
      (r) => r.settlement_status === "pending"
    );

    if (pendingRecordsInMonth.length === 0) {
      toast({ title: "該月份沒有待結算的佣金記錄", variant: "destructive" });
      return;
    }

    setIsSettling(true);
    try {
      const updates: any = { settlement_status: status };

      if (status === "approved") {
        updates.settlement_date = new Date().toISOString();
      } else if (status === "paid") {
        updates.payment_date = new Date().toISOString();
        updates.settlement_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from("commission_records")
        .update(updates)
        .in("id", pendingRecordsInMonth.map((r) => r.id));

      if (error) throw error;

      toast({
        title: "月結算成功",
        description: `已將 ${pendingRecordsInMonth.length} 筆記錄標記為${status === "approved" ? "已核准" : "已付款"}`,
      });
      fetchCommissionRecords();
    } catch (error) {
      console.error("Error during monthly settlement:", error);
      toast({ title: "月結算失敗", variant: "destructive" });
    } finally {
      setIsSettling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      pending: { label: "待結算", variant: "secondary" },
      approved: { label: "已核准", variant: "default" },
      paid: { label: "已付款", variant: "default" },
      cancelled: { label: "已取消", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getOrderStatusBadge = (status: string) => {
    const statusLabels: Record<string, string> = {
      pending: "待確認",
      confirmed: "已確認",
      checked_in: "已入住",
      checked_out: "已退房",
      cancelled: "已取消",
    };
    return <Badge variant="outline">{statusLabels[status] || status}</Badge>;
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

  const totalOrderRevenue = orders.reduce((sum, order) => sum + order.final_price, 0);
  const totalOrderDiscount = orders.reduce((sum, order) => sum + order.discount_amount, 0);

  if (isLoadingInfo) {
    return (
      <div className="space-y-6">
        <TableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  if (!codeInfo) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/discount-codes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回折扣碼列表
        </Button>
        <p className="text-center text-muted-foreground py-8">找不到此折扣碼資料</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/discount-codes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6" />
            {codeInfo.name} - 詳細資料
          </h1>
          <p className="text-muted-foreground">折扣碼：{codeInfo.code}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders" className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">訂單列表</span>
            <span className="sm:hidden">訂單</span>
          </TabsTrigger>
          <TabsTrigger value="commission" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">佣金記錄</span>
            <span className="sm:hidden">佣金</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API 金鑰</span>
            <span className="sm:hidden">API</span>
          </TabsTrigger>
        </TabsList>

        {/* API Tab */}
        <TabsContent value="api" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">API 金鑰管理</h3>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    <strong>重要：</strong>API 金鑰用於驗證 API 請求。請妥善保管，切勿公開分享。
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>您的 API 金鑰</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={apiKey || "尚未產生 API 金鑰"}
                        readOnly
                        className="font-mono pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyApiKey}
                      disabled={!apiKey}
                      className={cn("transition-all", copiedApiKey && "bg-primary/10 border-primary")}
                    >
                      {copiedApiKey ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setRegenerateDialogOpen(true)}
                      disabled={isRegenerating}
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", isRegenerating && "animate-spin")} />
                      重新產生
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">使用方式</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>在 API 請求中加入您的 API 金鑰：</p>
                    <div className="p-2 bg-muted rounded font-mono text-xs overflow-x-auto">
                      <p className="mb-1">方式一：HTTP Header</p>
                      <code>x-api-key: {apiKey ? apiKey.substring(0, 15) + "..." : "YOUR_API_KEY"}</code>
                    </div>
                    <div className="p-2 bg-muted rounded font-mono text-xs overflow-x-auto">
                      <p className="mb-1">方式二：URL 參數</p>
                      <code>?api_key={apiKey ? apiKey.substring(0, 15) + "..." : "YOUR_API_KEY"}</code>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">訂單總數</p>
                  <p className="text-2xl font-bold">{orders.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">總折扣金額</p>
                  <p className="text-2xl font-bold text-orange-600">
                    NT$ {totalOrderDiscount.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">折後總金額</p>
                  <p className="text-2xl font-bold text-primary">
                    NT$ {totalOrderRevenue.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoadingOrders ? (
            <TableSkeleton />
          ) : orders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              尚無使用此折扣碼的訂單
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead>客人姓名</TableHead>
                      <TableHead>房型</TableHead>
                      <TableHead>入住日期</TableHead>
                      <TableHead>退房日期</TableHead>
                      <TableHead className="text-right">原價</TableHead>
                      <TableHead className="text-right">折扣</TableHead>
                      <TableHead className="text-right">實付</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">{order.order_number}</TableCell>
                        <TableCell>{order.guest_name}</TableCell>
                        <TableCell>{order.room_types?.name || "-"}</TableCell>
                        <TableCell>{format(new Date(order.check_in_date), "yyyy/MM/dd")}</TableCell>
                        <TableCell>{format(new Date(order.check_out_date), "yyyy/MM/dd")}</TableCell>
                        <TableCell>NT$ {order.total_price.toLocaleString()}</TableCell>
                        <TableCell className="text-orange-600">
                          -NT$ {order.discount_amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-semibold">
                          NT$ {order.final_price.toLocaleString()}
                        </TableCell>
                        <TableCell>{getOrderStatusBadge(order.order_status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="md:hidden space-y-3">
                {orders.map((order) => (
                  <Card key={order.id}>
                    <CardContent className="pt-6 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">訂單編號</p>
                          <p className="font-mono">{order.order_number}</p>
                        </div>
                        {getOrderStatusBadge(order.order_status)}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">客人姓名</p>
                          <p>{order.guest_name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">房型</p>
                          <p>{order.room_types?.name || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">入住日期</p>
                          <p>{format(new Date(order.check_in_date), "yyyy/MM/dd")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">退房日期</p>
                          <p>{format(new Date(order.check_out_date), "yyyy/MM/dd")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">原價</p>
                          <p>NT$ {order.total_price.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">折扣</p>
                          <p className="text-orange-600">
                            -NT$ {order.discount_amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">實付金額</p>
                          <p className="font-semibold text-lg">
                            NT$ {order.final_price.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* Commission Tab */}
        <TabsContent value="commission" className="space-y-4 mt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                選擇月份
              </Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇月份" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部月份</SelectItem>
                  {availableMonths.map((month) => (
                    <SelectItem key={month} value={month}>
                      {format(new Date(month + "-01"), "yyyy 年 MM 月")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {isLoadingCommission ? (
            <TableSkeleton />
          ) : filteredRecords.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {selectedMonth === "all" ? "尚無佣金記錄" : "該月份無佣金記錄"}
            </p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead>客人姓名</TableHead>
                      <TableHead>入住日期</TableHead>
                      <TableHead className="text-right">訂單金額</TableHead>
                      <TableHead className="text-right">折扣金額</TableHead>
                      <TableHead className="text-right">佣金率</TableHead>
                      <TableHead className="text-right">佣金金額</TableHead>
                      <TableHead>結算狀態</TableHead>
                      <TableHead className="text-center">操作</TableHead>
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
                        <TableCell>
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
        </TabsContent>
      </Tabs>

      {/* Regenerate API Key Confirmation Dialog */}
      <AlertDialog open={regenerateDialogOpen} onOpenChange={setRegenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要重新產生 API 金鑰？</AlertDialogTitle>
            <AlertDialogDescription>
              重新產生後，舊的 API 金鑰將立即失效。所有使用舊金鑰的應用程式都需要更新為新的金鑰才能繼續存取 API。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateApiKey}
              disabled={isRegenerating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRegenerating ? "產生中..." : "確定重新產生"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default KolDiscountDetail;
