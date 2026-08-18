import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ConciergeBell, LogIn, LogOut, RefreshCw, Search, X, ArrowUpDown, FileSpreadsheet } from "lucide-react";
import { ReceptionExportDialog } from "@/components/reception/ReceptionExportDialog";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DepositQuickEdit } from "@/components/orders/DepositQuickEdit";

const PAYMENT_STATUS_OPTIONS: { value: string; label: string; cls: string }[] = [
  { value: "unpaid", label: "未付款", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  { value: "deposit_paid", label: "已付訂金", cls: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400" },
  { value: "paid", label: "已付清", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400" },
  { value: "overdue", label: "已逾期", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  { value: "refunded", label: "已退款", cls: "bg-muted text-muted-foreground border-border" },
  { value: "partial_refunded", label: "部分退款", cls: "bg-muted text-muted-foreground border-border" },
];

function paymentLabel(s: string) {
  return PAYMENT_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}
function paymentCls(s: string) {
  return PAYMENT_STATUS_OPTIONS.find((o) => o.value === s)?.cls ?? "bg-muted text-muted-foreground border-border";
}

type ReceptionMode = "checkin" | "checkout";
type CheckinDay = "yesterday" | "today" | "tomorrow";

interface ReceptionOrder {
  id: string;
  order_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  check_in_date: string;
  check_out_date: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  order_source: string | null;
  order_status: string;
  payment_status: string;
  final_price: number | null;
  paid_amount: number | null;
  deposit_required_amount: number | null;
  deposit_status: string | null;
  deposit_charged_amount: number | null;
  deposit_refunded_amount: number | null;
  room_type?: { name: string | null } | null;
  rooms?: Array<{
    room_type_id: string;
    quantity: number;
    room_type?: { name: string | null } | null;
    room_unit?: { unit_number: string | null; display_order: number | null } | null;
  }>;
}

type SortKey = "order_number" | "guest_name" | "status" | "room_type" | "room_unit";

const SORT_LABELS: Record<SortKey, string> = {
  order_number: "訂單編號",
  guest_name: "顧客",
  status: "狀態",
  room_type: "房型",
  room_unit: "房號",
};

const todayStr = () => format(new Date(), "yyyy-MM-dd");
const offsetDateStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
};

function getCheckinStatus(o: ReceptionOrder): { label: string; tone: "pending" | "in" | "out" } {
  if (o.checked_out_at) return { label: "已退房", tone: "out" };
  if (o.checked_in_at) return { label: "已入住", tone: "in" };
  return { label: "尚未入住", tone: "pending" };
}

function getCheckoutStatus(o: ReceptionOrder): { label: string; tone: "pending" | "in" | "out" } {
  if (o.checked_out_at) return { label: "已退房", tone: "out" };
  if (o.checked_in_at) return { label: "入住中", tone: "in" };
  return { label: "尚未入住", tone: "pending" };
}

function StatusBadge({ tone, children }: { tone: "pending" | "in" | "out"; children: React.ReactNode }) {
  const cls =
    tone === "out"
      ? "text-muted-foreground"
      : tone === "in"
        ? "text-success"
        : "text-primary";
  return <span className={`text-sm font-medium ${cls}`}>{children}</span>;
}

function roomLabel(o: ReceptionOrder): string {
  if (o.rooms && o.rooms.length > 0) {
    return o.rooms
      .map((r) => `${r.room_type?.name ?? "房型"}${r.quantity > 1 ? ` x${r.quantity}` : ""}`)
      .join("、");
  }
  return o.room_type?.name ?? "—";
}

export default function Reception() {
  const { currentAccommodationId } = useAccommodation();
  const { canEdit } = useStaffPermissions();
  const editable = canEdit("reception");
  const { toast } = useToast();

  const [mode, setMode] = useState<ReceptionMode>("checkin");
  const [day, setDay] = useState<CheckinDay>("today");
  const [orders, setOrders] = useState<ReceptionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("room_type");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [exportOpen, setExportOpen] = useState(false);

  // Re-render every 30s so relative timestamp stays fresh
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const formatRelative = (d: Date) => {
    void nowTick;
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 10) return "剛剛";
    if (diff < 60) return `${diff} 秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
    return format(d, "yyyy-MM-dd HH:mm");
  };

  const today = todayStr();

  const handleRefresh = async () => {
    if (!currentAccommodationId || refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadOrders(), loadCounts()]);
    } finally {
      setRefreshing(false);
    }
  };

  const targetDate = useMemo(() => {
    if (mode === "checkout") return today;
    if (day === "yesterday") return offsetDateStr(-1);
    if (day === "tomorrow") return offsetDateStr(1);
    return today;
  }, [mode, day, today]);

  // Counts for tabs
  const [counts, setCounts] = useState({
    yesterday: { total: 0, in: 0 },
    today: { total: 0, in: 0 },
    tomorrow: { total: 0, in: 0 },
    checkout: { total: 0, out: 0 },
  });

  useEffect(() => {
    if (!currentAccommodationId) return;
    loadCounts();
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId, mode, day]);

  // Realtime: refresh list & counts when any order in this accommodation changes
  useEffect(() => {
    if (!currentAccommodationId) return;
    const channel = supabase
      .channel(`reception-orders-${currentAccommodationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `accommodation_id=eq.${currentAccommodationId}`,
        },
        () => {
          loadOrders();
          loadCounts();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId, mode, day]);

  const loadCounts = async () => {
    if (!currentAccommodationId) return;
    const dates = {
      yesterday: offsetDateStr(-1),
      today: today,
      tomorrow: offsetDateStr(1),
    };
    const fetchOne = async (date: string, kind: "checkin" | "checkout") => {
      let q = supabase
        .from("orders")
        .select("id, checked_in_at, checked_out_at")
        .eq("accommodation_id", currentAccommodationId)
        .neq("order_status", "cancelled");
      // 入住頁：住宿期間內（含當日入住與續住）都要顯示，直到退房日才移出
      q = kind === "checkin"
        ? q.lte("check_in_date", date).gt("check_out_date", date)
        : q.eq("check_out_date", date);
      const { data, error } = await q;
      if (error) return { total: 0, done: 0 };

      const total = data?.length ?? 0;
      const done =
        kind === "checkin"
          ? data?.filter((o) => o.checked_in_at).length ?? 0
          : data?.filter((o) => o.checked_out_at).length ?? 0;
      return { total, done };
    };
    const [y, t, tm, co] = await Promise.all([
      fetchOne(dates.yesterday, "checkin"),
      fetchOne(dates.today, "checkin"),
      fetchOne(dates.tomorrow, "checkin"),
      fetchOne(dates.today, "checkout"),
    ]);
    setCounts({
      yesterday: { total: y.total, in: y.done },
      today: { total: t.total, in: t.done },
      tomorrow: { total: tm.total, in: tm.done },
      checkout: { total: co.total, out: co.done },
    });
  };

  const loadOrders = async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select(
          `id, order_number, guest_name, guest_phone,
           check_in_date, check_out_date, checked_in_at, checked_out_at,
           order_source, order_status, payment_status, final_price, paid_amount,
           deposit_required_amount, deposit_status, deposit_charged_amount, deposit_refunded_amount,
           room_type:room_types ( name ),
           rooms:order_rooms ( room_type_id, quantity, room_type:room_types ( name ), room_unit:room_units ( unit_number, display_order ) )`
        )
        .eq("accommodation_id", currentAccommodationId)
        .neq("order_status", "cancelled");
      // 入住頁：住宿期間內（含續住）都顯示；退房頁：退房日當天
      query = mode === "checkin"
        ? query.lte("check_in_date", targetDate).gt("check_out_date", targetDate)
        : query.eq("check_out_date", targetDate);
      const { data, error } = await query.order("order_number", { ascending: true });

      if (error) throw error;
      setOrders((data ?? []) as unknown as ReceptionOrder[]);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      toast({ title: "載入失敗", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (o: ReceptionOrder, action: "checkin" | "checkout" | "undo_checkin" | "undo_checkout") => {
    if (!editable) {
      toast({ title: "權限不足", description: "您沒有櫃檯接待的編輯權限", variant: "destructive" });
      return;
    }
    if (action === "checkin" && o.payment_status !== "paid") {
      toast({ title: "無法辦理入住", description: "請先結清才能辦理入住", variant: "destructive" });
      return;
    }
    setActingId(o.id);
    try {
      const patch: Record<string, string | null> = {};
      if (action === "checkin") patch.checked_in_at = new Date().toISOString();
      if (action === "undo_checkin") patch.checked_in_at = null;
      if (action === "checkout") {
        patch.checked_out_at = new Date().toISOString();
        if (!o.checked_in_at) patch.checked_in_at = new Date().toISOString();
      }
      if (action === "undo_checkout") patch.checked_out_at = null;

      const { error } = await supabase.from("orders").update(patch as any).eq("id", o.id);
      if (error) throw error;

      toast({
        title:
          action === "checkin"
            ? "已辦理入住"
            : action === "checkout"
              ? "已辦理退房"
              : action === "undo_checkin"
                ? "已取消入住記錄"
                : "已取消退房記錄",
      });
      await Promise.all([loadOrders(), loadCounts()]);
    } catch (err: any) {
      toast({ title: "操作失敗", description: err.message, variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const handlePaymentChange = async (o: ReceptionOrder, newStatus: string) => {
    if (!editable) {
      toast({ title: "權限不足", description: "您沒有櫃檯接待的編輯權限", variant: "destructive" });
      return;
    }
    if (newStatus === o.payment_status) return;
    setActingId(o.id);
    try {
      const patch: Record<string, unknown> = { payment_status: newStatus };
      if (newStatus === "paid" && o.final_price != null) {
        patch.paid_amount = o.final_price;
      }
      const { error } = await supabase.from("orders").update(patch as any).eq("id", o.id);
      if (error) throw error;
      // Optimistic local update
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, payment_status: newStatus } : x)));
      toast({ title: "付款狀態已更新", description: paymentLabel(newStatus) });
    } catch (err: any) {
      toast({ title: "更新失敗", description: err.message, variant: "destructive" });
    } finally {
      setActingId(null);
    }
  };

  const applyDepositPatch = (orderId: string, patch: Record<string, unknown>) => {
    setOrders((prev) =>
      prev.map((x) =>
        x.id === orderId
          ? {
              ...x,
              deposit_required_amount: Number(patch.deposit_required_amount ?? x.deposit_required_amount),
              deposit_status: String(patch.deposit_status ?? x.deposit_status),
              deposit_charged_amount: Number(patch.deposit_charged_amount ?? 0),
              deposit_refunded_amount: Number(patch.deposit_refunded_amount ?? 0),
            }
          : x,
      ),
    );
  };

  const sortedFiltered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    let list = orders;
    if (kw) {
      list = list.filter((o) => {
        return (
          o.order_number.toLowerCase().includes(kw) ||
          (o.guest_name ?? "").toLowerCase().includes(kw) ||
          (o.guest_phone ?? "").toLowerCase().includes(kw) ||
          roomLabel(o).toLowerCase().includes(kw)
        );
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (o: ReceptionOrder): string => {
      if (sortKey === "order_number") return o.order_number;
      if (sortKey === "guest_name") return o.guest_name ?? "";
      if (sortKey === "room_type") {
        const names = (o.rooms ?? [])
          .map((r) => r.room_type?.name ?? "")
          .filter(Boolean)
          .sort();
        return names[0] ?? o.room_type?.name ?? "";
      }
      if (sortKey === "room_unit") {
        const units = (o.rooms ?? [])
          .map((r) => r.room_unit?.unit_number ?? "")
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
        // Unassigned units sort last
        return units[0] ?? "\uFFFF";
      }
      return mode === "checkin" ? getCheckinStatus(o).label : getCheckoutStatus(o).label;
    };
    return [...list].sort((a, b) => get(a).localeCompare(get(b), "zh-Hant", { numeric: true }) * dir);
  }, [orders, keyword, sortKey, sortDir, mode]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  if (!currentAccommodationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">請先選擇住宿</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="櫃檯接待" icon={ConciergeBell} />

      <Card>
        <CardHeader className="pb-4 px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-lg">今日櫃檯</CardTitle>
            <div className="text-sm text-muted-foreground">今日：{today}</div>
          </div>

          {/* Mode switch */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant={mode === "checkin" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("checkin")}
              className="gap-2"
            >
              <LogIn className="h-4 w-4" /> 入住
            </Button>
            <Button
              variant={mode === "checkout" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("checkout")}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" /> 退房
            </Button>
            <div className="ml-auto flex items-center gap-2 min-w-0">
              {lastRefreshedAt && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline" title={format(lastRefreshedAt, "yyyy-MM-dd HH:mm:ss")}>
                  最後更新：{formatRelative(lastRefreshedAt)}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
                className="gap-2 shrink-0"
                aria-label="預覽 / 下載"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">預覽 / 下載</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2 shrink-0"
                aria-label="重新整理"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">重新整理</span>
              </Button>
            </div>

          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-4 sm:px-6">
          {/* Day tabs (only for checkin) + search */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {mode === "checkin" ? (
              <Tabs value={day} onValueChange={(v) => setDay(v as CheckinDay)} className="w-full lg:w-auto min-w-0">
                <TabsList className="w-full lg:w-auto grid grid-cols-3 lg:inline-flex h-auto">
                  <TabsTrigger value="yesterday" className="flex-col sm:flex-row gap-0.5 sm:gap-2 py-1.5 text-xs sm:text-sm">
                    <span>昨日入住</span>
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5">
                      {counts.yesterday.in}/{counts.yesterday.total}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="today" className="flex-col sm:flex-row gap-0.5 sm:gap-2 py-1.5 text-xs sm:text-sm">
                    <span>今日入住</span>
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5">
                      {counts.today.in}/{counts.today.total}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="tomorrow" className="flex-col sm:flex-row gap-0.5 sm:gap-2 py-1.5 text-xs sm:text-sm">
                    <span>明日入住</span>
                    <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5">
                      {counts.tomorrow.total}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value={day} />
              </Tabs>

            ) : (
              <div className="text-sm font-medium">
                今日退房{" "}
                <Badge variant="outline" className="ml-2">
                  {counts.checkout.out}/{counts.checkout.total}
                </Badge>
              </div>
            )}

            <div className="relative w-full lg:w-80">
              <div className="absolute left-0 top-0 h-full w-10 flex items-center justify-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜尋名稱 / 訂單編號 / 房型"
                className="!pl-10 !pr-10 h-10"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  className="absolute right-0 top-0 h-full w-10 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="清除"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sort controls (primary for mobile, also usable on desktop) */}
          <div className="flex items-center gap-2 md:justify-end">
            <span className="text-xs text-muted-foreground shrink-0">排序</span>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[9rem] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1"
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              aria-label="切換排序方向"
            >
              <ArrowUpDown className="h-4 w-4" />
              <span className="text-xs">{sortDir === "asc" ? "升冪" : "降冪"}</span>
            </Button>
          </div>


          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <Th onClick={() => toggleSort("order_number")} active={sortKey === "order_number"}>
                    訂單編號
                  </Th>
                  <Th onClick={() => toggleSort("guest_name")} active={sortKey === "guest_name"}>
                    顧客
                  </Th>
                  <Th onClick={() => toggleSort("room_type")} active={sortKey === "room_type"}>
                    房型
                  </Th>
                  <Th onClick={() => toggleSort("room_unit")} active={sortKey === "room_unit"}>
                    房號
                  </Th>
                  <Th>付款狀態</Th>
                  <Th>押金</Th>
                  <Th onClick={() => toggleSort("status")} active={sortKey === "status"}>
                    狀態
                  </Th>
                  <th className="px-4 py-3 text-right font-medium">
                    {mode === "checkin" ? "辦理入住" : "辦理退房"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      載入中…
                    </td>
                  </tr>
                ) : sortedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {keyword ? "找不到符合條件的訂單" : "目前沒有需要處理的訂單"}
                    </td>
                  </tr>
                ) : (
                  sortedFiltered.map((o) => {
                    const status =
                      mode === "checkin" ? getCheckinStatus(o) : getCheckoutStatus(o);
                    const acting = actingId === o.id;
                    const units = (o.rooms ?? [])
                      .map((r) => r.room_unit?.unit_number)
                      .filter((u): u is string => Boolean(u));
                    return (
                      <tr key={o.id} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 align-top">
                          <Link
                            to={`/admin/orders/${o.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {o.order_number}
                          </Link>
                          {o.order_source && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {sourceLabel(o.order_source)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <span>{o.guest_name ?? "—"}</span>
                            {mode === "checkin" && o.check_in_date < targetDate && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">續住</span>
                            )}
                          </div>

                          {o.guest_phone && (
                            <div className="text-xs text-muted-foreground mt-0.5">{o.guest_phone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">{roomLabel(o)}</td>
                        <td className="px-4 py-3 align-top tabular-nums">
                          {units.length > 0 ? units.join("、") : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Select
                            value={o.payment_status}
                            onValueChange={(v) => handlePaymentChange(o, v)}
                            disabled={!editable || acting}
                          >
                            <SelectTrigger
                              className={`h-8 w-[140px] text-xs font-medium [&>span]:truncate-0 ${paymentCls(o.payment_status)}`}
                            >
                              <SelectValue>{paymentLabel(o.payment_status)}</SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {o.final_price != null && (
                            <div className="text-xs text-muted-foreground mt-1">
                              ${(o.paid_amount ?? 0).toLocaleString()} / ${o.final_price.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <DepositQuickEdit
                            orderId={o.id}
                            requiredAmount={o.deposit_required_amount ?? 0}
                            status={o.deposit_status}
                            chargedAmount={o.deposit_charged_amount ?? 0}
                            refundedAmount={o.deposit_refunded_amount ?? 0}
                            disabled={!editable || acting}
                            onSaved={(patch) => applyDepositPatch(o.id, patch)}
                          />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          {mode === "checkin" && o.checked_in_at && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(o.checked_in_at), "MM-dd HH:mm")}
                            </div>
                          )}
                          {mode === "checkout" && o.checked_out_at && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {format(new Date(o.checked_out_at), "MM-dd HH:mm")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          {mode === "checkin" ? (
                            o.checked_in_at ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!editable || acting}
                                onClick={() => handleAction(o, "undo_checkin")}
                              >
                                取消入住
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                disabled={!editable || acting}
                                onClick={() => handleAction(o, "checkin")}
                                className="gap-1"
                              >
                                <LogIn className="h-4 w-4" /> 辦理入住
                              </Button>
                            )
                          ) : o.checked_out_at ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!editable || acting}
                              onClick={() => handleAction(o, "undo_checkout")}
                            >
                              取消退房
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={!editable || acting}
                              onClick={() => handleAction(o, "checkout")}
                              className="gap-1"
                            >
                              <LogOut className="h-4 w-4" /> 辦理退房
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="px-4 py-10 text-center text-muted-foreground text-sm">載入中…</div>
            ) : sortedFiltered.length === 0 ? (
              <div className="px-4 py-10 text-center text-muted-foreground text-sm">
                {keyword ? "找不到符合條件的訂單" : "目前沒有需要處理的訂單"}
              </div>
            ) : (
              sortedFiltered.map((o) => {
                const status = mode === "checkin" ? getCheckinStatus(o) : getCheckoutStatus(o);
                const acting = actingId === o.id;
                const units = (o.rooms ?? [])
                  .map((r) => r.room_unit?.unit_number)
                  .filter((u): u is string => Boolean(u));
                return (
                  <div key={o.id} className="rounded-lg border p-3 space-y-2.5 bg-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/admin/orders/${o.id}`}
                          className="text-primary font-semibold hover:underline text-sm"
                        >
                          {o.order_number}
                        </Link>
                        {o.order_source && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {sourceLabel(o.order_source)}
                          </div>
                        )}
                      </div>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </div>

                    <div className="text-sm">
                      <div className="font-medium flex items-center gap-1.5">
                        <span>{o.guest_name ?? "—"}</span>
                        {mode === "checkin" && o.check_in_date < targetDate && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground whitespace-nowrap">續住</span>
                        )}
                      </div>

                      {o.guest_phone && (
                        <div className="text-xs text-muted-foreground">{o.guest_phone}</div>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground">房型：</span>{roomLabel(o)}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground">房號：</span>
                      {units.length > 0 ? <span className="tabular-nums">{units.join("、")}</span> : "—"}
                    </div>


                    <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 min-h-[2.75rem]">
                      <Select
                        value={o.payment_status}
                        onValueChange={(v) => handlePaymentChange(o, v)}
                        disabled={!editable || acting}
                      >
                        <SelectTrigger
                          className={`h-11 w-full xs:flex-1 text-xs font-medium ${paymentCls(o.payment_status)}`}
                        >
                          <SelectValue>{paymentLabel(o.payment_status)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {o.final_price != null && (
                        <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap self-end xs:self-auto">
                          ${(o.paid_amount ?? 0).toLocaleString()} / ${o.final_price.toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div>
                      <DepositQuickEdit
                        orderId={o.id}
                        requiredAmount={o.deposit_required_amount ?? 0}
                        status={o.deposit_status}
                        chargedAmount={o.deposit_charged_amount ?? 0}
                        refundedAmount={o.deposit_refunded_amount ?? 0}
                        disabled={!editable || acting}
                        onSaved={(patch) => applyDepositPatch(o.id, patch)}
                        triggerClassName="h-11 w-full justify-start"
                      />
                    </div>




                    {(o.checked_in_at || o.checked_out_at) && (
                      <div className="text-[11px] text-muted-foreground">
                        {mode === "checkin" && o.checked_in_at && `入住：${format(new Date(o.checked_in_at), "MM-dd HH:mm")}`}
                        {mode === "checkout" && o.checked_out_at && `退房：${format(new Date(o.checked_out_at), "MM-dd HH:mm")}`}
                      </div>
                    )}

                    <div className="pt-1 min-h-[3rem]">
                      {mode === "checkin" ? (
                        o.checked_in_at ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!editable || acting}
                            onClick={() => handleAction(o, "undo_checkin")}
                            className="w-full h-11"
                          >
                            取消入住
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={!editable || acting}
                            onClick={() => handleAction(o, "checkin")}
                            className="w-full h-11 gap-1"
                          >
                            <LogIn className="h-4 w-4" /> 辦理入住
                          </Button>
                        )
                      ) : o.checked_out_at ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!editable || acting}
                          onClick={() => handleAction(o, "undo_checkout")}
                          className="w-full h-11"
                        >
                          取消退房
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={!editable || acting}
                          onClick={() => handleAction(o, "checkout")}
                          className="w-full h-11 gap-1"
                        >
                          <LogOut className="h-4 w-4" /> 辦理退房
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <ReceptionExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        accommodationId={currentAccommodationId}
        mode={mode}
        targetDate={targetDate}
      />
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
            active ? "text-foreground" : ""
          }`}
        >
          {children} <ArrowUpDown className="h-3 w-3 opacity-60" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    manual: "手動訂單",
    manual_line: "手動訂單(Line)",
    website: "官網",
    line: "Line",
    owlting: "OwlTing",
    booking: "Booking.com",
    airbnb: "Airbnb",
    agoda: "Agoda",
    official_use: "官方使用",
  };
  return map[src] ?? src;
}
