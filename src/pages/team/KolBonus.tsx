import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Eye, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTeam } from "@/components/team/TeamContext";

interface KolRow {
  // 以「cid_code(大寫) + accommodation_id」為列的唯一鍵
  rowKey: string;
  // 對應 kol_profiles.id；若無 match 也無 fallback 則為 null
  id: string | null;
  name: string | null;
  cid_code: string | null;
  // 來自 orders 的 accommodation_id（該列的館別）
  accommodation_id: string | null;
  // 由 accommodation_info 查得的館別名稱，fallback 用 kol_profiles.venue_name
  accommodation_name: string | null;
  public_token: string | null;
  token_expires_at: string | null;
  scout_id: string | null;
  scout_name: string | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  discount_code: string | null;
  check_in_date: string;
  check_out_date: string | null;
  order_date: string | null;
  total_price: number | null;
  final_price: number | null;
  order_status: string;
  accommodation_id: string | null;
}

interface CommissionSetting {
  accommodation_id: string;
  effective_from: string;
  rate: number | null;
}

type RateResolver = (accommodationId: string | null, refDate?: string | null) => number;


const TOKEN_VALID_DAYS = 90;

const fmtMoney = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;

const isTokenValid = (row: KolRow) =>
  !!row.public_token &&
  !!row.token_expires_at &&
  new Date(row.token_expires_at).getTime() > Date.now();

export default function KolBonus() {
  const { roles } = useTeam();
  const roleSet = roles as string[];
  const allowed =
    roleSet.includes("super_admin") ||
    roleSet.includes("hotel_admin") ||
    roleSet.includes("scout_manager") ||
    roleSet.includes("scout");

  const twNow = (() => {
    const now = new Date();
    const twOffset = 8 * 60;
    return new Date(now.getTime() + (twOffset + now.getTimezoneOffset()) * 60000);
  })();
  const currentYear = twNow.getUTCFullYear();
  const currentMonthNum = twNow.getUTCMonth() + 1;
  const currentDay = twNow.getUTCDate();

  // 發放期別預設：今天 ≤ 10 → 當月10日；> 10 → 下個月10日（跨年則年份+1）
  const defaultPayoutMonth =
    currentDay <= 10 ? currentMonthNum : currentMonthNum === 12 ? 1 : currentMonthNum + 1;
  const defaultPayoutYear =
    currentDay > 10 && currentMonthNum === 12 ? currentYear + 1 : currentYear;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionSetting[]>([]);
  const [saving, setSaving] = useState(false);
  const [drawerKol, setDrawerKol] = useState<KolRow | null>(null);
  const [drawerSettlement, setDrawerSettlement] = useState(false);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonthNum)); // "all" | "1".."12"
  const [tab1Search, setTab1Search] = useState<string>("");
  // 發放期別：以月份為單位（顯示為「M月10日」），代表完成業績/分潤所抓的退房月份
  const [payoutYear, setPayoutYear] = useState<number>(defaultPayoutYear);
  const [payoutPeriod, setPayoutPeriod] = useState<string>(String(defaultPayoutMonth));
  const [scoutFilter, setScoutFilter] = useState<string>("all");

  const fetchAll = async () => {
    setLoading(true);
    const [kolRes, orderRes, commRes, accRes, scoutRes, scoutCodeRes] = await Promise.all([
      supabase
        .from("kol_profiles")
        .select(
          "id, name, cid_code, venue_name, accommodation_id, public_token, token_expires_at, scout_id, scout_name",
        )
        .not("cid_code", "is", null)
        .neq("cid_code", ""),
      supabase
        .from("orders")
        .select(
          "id, order_number, discount_code, check_in_date, check_out_date, order_date, total_price, final_price, order_status, accommodation_id",
        )
        .not("discount_code", "is", null)
        .neq("discount_code", "")
        .neq("order_status", "cancelled"),
      supabase
        .from("kol_commission_settings")
        .select("accommodation_id, effective_from, rate, kol_id, created_at")
        .is("kol_id", null)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("accommodation_info").select("id, name"),
      supabase.from("team_member_profiles").select("id, user_id, display_name"),
      supabase
        .from("scout_discount_codes")
        .select("discount_code, scout_id")
        .eq("is_active", true),
    ]);
    if (kolRes.error) toast.error("載入 KOL 失敗：" + kolRes.error.message);
    if (orderRes.error) toast.error("載入訂單失敗：" + orderRes.error.message);
    if (commRes.error) toast.error("載入分潤設定失敗：" + commRes.error.message);
    if (accRes.error) toast.error("載入館別失敗：" + accRes.error.message);

    const allOrders = (orderRes.data ?? []) as OrderRow[];
    const allKols = (kolRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      cid_code: string | null;
      venue_name: string | null;
      accommodation_id: string | null;
      public_token: string | null;
      token_expires_at: string | null;
      scout_id: string | null;
      scout_name: string | null;
    }>;
    const accMap = new Map<string, string>(
      ((accRes.data ?? []) as Array<{ id: string; name: string }>).map((a) => [
        a.id,
        a.name,
      ]),
    );
    const teamMemberProfiles = (scoutRes.data ?? []) as Array<{
      id: string | null;
      user_id: string | null;
      display_name: string | null;
    }>;
    const scoutNameMap = new Map<string, string>(
      teamMemberProfiles
        .filter((s) => !!s.user_id)
        .map((s) => [s.user_id as string, s.display_name ?? ""]),
    );
    // key = team_member_profiles.id → display_name
    const memberNameById = new Map<string, string>();
    for (const m of teamMemberProfiles) {
      if (m.id) memberNameById.set(m.id, m.display_name ?? "");
    }
    // key = discount_code 大寫 → 星探 display_name
    const scoutNameByCode = new Map<string, string>();
    const scoutDiscountCodes = (scoutCodeRes.data ?? []) as Array<{
      discount_code: string | null;
      scout_id: string | null;
    }>;
    for (const s of scoutDiscountCodes) {
      const code = s.discount_code?.trim().toUpperCase();
      if (!code || !s.scout_id) continue;
      const name = memberNameById.get(s.scout_id);
      if (name) scoutNameByCode.set(code, name);
    }


    // kol_profiles 索引：依 cid_code(大寫) 分組，再依 accommodation_id 對應
    const profileByCodeAcc = new Map<string, typeof allKols[number]>(); // key: `${codeUpper}|${accId}`
    const profileFallbackByCode = new Map<string, typeof allKols[number]>(); // key: codeUpper，僅收 accommodation_id 為 null 的那筆
    for (const p of allKols) {
      const code = (p.cid_code ?? "").trim().toUpperCase();
      if (!code) continue;
      if (p.accommodation_id) {
        profileByCodeAcc.set(`${code}|${p.accommodation_id}`, p);
      } else if (!profileFallbackByCode.has(code)) {
        profileFallbackByCode.set(code, p);
      }
    }

    // 以「有實際訂單的 cid_code + accommodation_id 組合」為單位建立列
    const seen = new Set<string>();
    const built: KolRow[] = [];
    for (const o of allOrders) {
      const code = (o.discount_code ?? "").trim().toUpperCase();
      if (!code) continue;
      const accId = o.accommodation_id ?? null;
      const rowKey = `${code}|${accId ?? "null"}`;
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      const matched =
        (accId && profileByCodeAcc.get(`${code}|${accId}`)) ||
        profileFallbackByCode.get(code) ||
        null;
      built.push({
        rowKey,
        id: matched?.id ?? null,
        name: matched?.name ?? scoutNameByCode.get(code) ?? null,
        cid_code: matched?.cid_code ?? code,
        accommodation_id: accId,
        accommodation_name:
          (accId && accMap.get(accId)) || matched?.venue_name || null,
        public_token: matched?.public_token ?? null,
        token_expires_at: matched?.token_expires_at ?? null,
        scout_id: matched?.scout_id ?? null,
        scout_name:
          (matched?.scout_id && scoutNameMap.get(matched.scout_id)) ||
          matched?.scout_name ||
          null,
      });
    }
    // 排序：館別名稱 → cid_code
    built.sort((a, b) => {
      const an = a.accommodation_name ?? "";
      const bn = b.accommodation_name ?? "";
      if (an !== bn) return an.localeCompare(bn);
      return (a.cid_code ?? "").localeCompare(b.cid_code ?? "");
    });

    setRows(built);
    setOrders(allOrders);
    setCommissions(((commRes.data ?? []) as any[]).map((c) => ({
      accommodation_id: c.accommodation_id,
      effective_from: c.effective_from,
      rate: c.rate,
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed]);

  // 依館別分組（已按 effective_from DESC 排序）
  const settingsByAcc = useMemo(() => {
    const map = new Map<string, CommissionSetting[]>();
    for (const c of commissions) {
      const arr = map.get(c.accommodation_id) ?? [];
      arr.push(c);
      map.set(c.accommodation_id, arr);
    }
    return map;
  }, [commissions]);

  // 依退房日期取最新生效的 rate（effective_from <= refDate）
  const getRate = useCallback<RateResolver>(
    (accommodationId, refDate) => {
      if (!accommodationId) return 0;
      const list = settingsByAcc.get(accommodationId);
      if (!list || list.length === 0) return 0;
      if (!refDate) return Number(list[0]?.rate ?? 0);
      const ref = refDate.slice(0, 10);
      const hit = list.find((s) => s.effective_from <= ref);
      return Number(hit?.rate ?? 0);
    },
    [settingsByAcc],
  );


  // 訂單依「cid_code(大寫) + accommodation_id」分組，作為列的明細來源
  const ordersByKey = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of orders) {
      const code = (o.discount_code ?? "").trim().toUpperCase();
      if (!code) continue;
      const key = `${code}|${o.accommodation_id ?? "null"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [orders]);

  // 年份選項：所有訂單 order_date 出現過的年份 + 當年
  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const o of orders) {
      if (o.order_date) set.add(Number(o.order_date.slice(0, 4)));
    }
    set.add(currentYear);
    set.add(defaultPayoutYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [orders, currentYear, defaultPayoutYear]);

  // 星探選項：只列出有實際邀約 KOL（即有出現在 rows 裡）的星探
  const scoutOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.scout_id) {
        if (!map.has(r.scout_id)) map.set(r.scout_id, r.scout_name || "—");
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Tab1 進單管理：依年/月過濾（order_date 或 check_out_date 落在當月）
  const tab1FilteredRows = useMemo(() => {
    const prefix =
      filterMonth === "all"
        ? null
        : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
    const q = tab1Search.trim().toLowerCase();
    return rows.filter((k) => {
      const list = ordersByKey.get(k.rowKey) ?? [];
      const periodMatch = !prefix
        ? list.length > 0
        : list.some(
            (o) =>
              o.order_date?.startsWith(prefix) ||
              (o.order_status !== "cancelled" && o.check_out_date?.startsWith(prefix)),
          );
      if (!periodMatch) return false;
      if (!q) return true;
      const name = (k.name ?? "").toLowerCase();
      const code = (k.cid_code ?? "").toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [rows, ordersByKey, filterYear, filterMonth, tab1Search]);

  // Tab1 度量：進單與完成同時由 filterYear+filterMonth 控制
  const tab1Metrics = useMemo(() => {
    const prefix =
      filterMonth === "all"
        ? null
        : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
    const map = new Map<
      string,
      {
        orderCount: number;
        orderRevenue: number;
        completedCount: number;
        completedRevenue: number;
        commission: number;
      }
    >();
    for (const k of rows) {
      const list = ordersByKey.get(k.rowKey) ?? [];
      let orderCount = 0;
      let orderRevenue = 0;
      let completedCount = 0;
      let completedRevenue = 0;
      let commission = 0;
      for (const o of list) {
        const r = Number(o.final_price ?? o.total_price ?? 0);
        const rate = getRate(o.accommodation_id, o.check_out_date);
        const orderMatch = prefix ? o.order_date?.startsWith(prefix) : true;
        const completedMatch = prefix ? o.check_out_date?.startsWith(prefix) : true;
        if (orderMatch) {
          orderCount += 1;
          orderRevenue += r;
        }
        if (completedMatch) {
          completedCount += 1;
          completedRevenue += r;
          commission += r * (rate / 100);
        }
      }
      map.set(k.rowKey, {
        orderCount,
        orderRevenue,
        completedCount,
        completedRevenue,
        commission: Math.round(commission),
      });
    }
    return map;
  }, [rows, ordersByKey, getRate, filterYear, filterMonth]);

  // Tab2 退房月份 prefix：發放期別 P 對應退房月 = P-1（P=1 → 上一年12月）
  const tab2TargetPrefix = useMemo(() => {
    if (payoutPeriod === "all") return `${payoutYear}-`;
    const p = Number(payoutPeriod);
    if (p === 1) return `${payoutYear - 1}-12`;
    return `${payoutYear}-${String(p - 1).padStart(2, "0")}`;
  }, [payoutYear, payoutPeriod]);

  // Tab2 分潤結算：依 年 + 發放期別 + 星探，且 KOL 須在對應退房月份有退房
  const tab2FilteredRows = useMemo(() => {
    return rows.filter((k) => {
      if (scoutFilter !== "all" && k.scout_id !== scoutFilter) return false;
      const list = ordersByKey.get(k.rowKey) ?? [];
      return list.some(
        (o) =>
          o.order_status !== "cancelled" && o.check_out_date?.startsWith(tab2TargetPrefix),
      );
    });
  }, [rows, ordersByKey, tab2TargetPrefix, scoutFilter]);

  // Tab2 度量：completedCount / completedRevenue / commission 依對應退房月
  const tab2Metrics = useMemo(() => {
    const prefix = tab2TargetPrefix;
    const map = new Map<
      string,
      { completedCount: number; completedRevenue: number; commission: number }
    >();
    for (const k of rows) {
      const list = ordersByKey.get(k.rowKey) ?? [];
      let completedCount = 0;
      let completedRevenue = 0;
      let commission = 0;
      for (const o of list) {
        if (o.order_status === "cancelled") continue;
        if (!o.check_out_date?.startsWith(prefix)) continue;
        const r = Number(o.final_price ?? o.total_price ?? 0);
        const rate = getRate(o.accommodation_id, o.check_out_date);
        completedCount += 1;
        completedRevenue += r;
        commission += r * (rate / 100);
      }
      map.set(k.rowKey, {
        completedCount,
        completedRevenue,
        commission: Math.round(commission),
      });
    }
    return map;
  }, [rows, ordersByKey, getRate, tab2TargetPrefix]);

  const tab1DrawerInitialMonth =
    filterMonth === "all"
      ? `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`
      : `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;
  const tab2DrawerInitialMonth =
    payoutPeriod === "all"
      ? `${payoutYear}-${String(currentMonthNum).padStart(2, "0")}`
      : `${payoutYear}-${String(Number(payoutPeriod)).padStart(2, "0")}`;

  const metricsLabel = filterMonth === "all" ? "全期" : "當月";


  if (!allowed) return <Navigate to="/team" replace />;

  const handleGenerate = async (target: KolRow) => {
    if (!target?.id) return;
    setSaving(true);
    const newToken = crypto.randomUUID();
    const newExpires = new Date(
      Date.now() + TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error } = await supabase
      .from("kol_profiles")
      .update({ public_token: newToken, token_expires_at: newExpires })
      .eq("id", target.id);
    setSaving(false);
    if (error) {
      toast.error("產生失敗：" + error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id && r.id === target.id
          ? { ...r, public_token: newToken, token_expires_at: newExpires }
          : r,
      ),
    );
    setDrawerKol((prev) =>
      prev && prev.id && prev.id === target.id
        ? { ...prev, public_token: newToken, token_expires_at: newExpires }
        : prev,
    );
    toast.success("已產生新連結");
  };


  const copyLink = async (row: KolRow) => {
    if (!row.public_token) return;
    const url = `${window.location.origin}/team/kol/bonus/${row.public_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("已複製連結");
    } catch {
      toast.error("複製失敗，請手動複製");
    }
  };

  const renderStatusBadge = (row: KolRow) => {
    if (!row.public_token) return <Badge variant="secondary">未產生</Badge>;
    if (isTokenValid(row)) {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          連結有效
        </Badge>
      );
    }
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-200">
        已過期
      </Badge>
    );
  };




  const openBonusDrawer = (r: KolRow) => {
    setDrawerSettlement(false);
    setDrawerKol(r);
  };
  const openSettlementDrawer = (r: KolRow) => {
    setDrawerSettlement(true);
    setDrawerKol(r);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="bonus" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bonus">進單管理</TabsTrigger>
          <TabsTrigger value="settlement">分潤結算</TabsTrigger>
          <TabsTrigger value="rates">分潤設定</TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>KOL 進單管理</CardTitle>
              <p className="text-sm text-muted-foreground">查看 KOL 訂單分潤資料並透過明細中的按鈕「產生專屬查詢連結」</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  載入中...
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <Input
                      value={tab1Search}
                      onChange={(e) => setTab1Search(e.target.value)}
                      placeholder="搜尋 KOL 名稱 或 折扣碼 / CID"
                      className="w-[260px]"
                    />
                    <span className="text-sm text-muted-foreground">期間</span>
                    <Select
                      value={String(filterYear)}
                      onValueChange={(v) => setFilterYear(Number(v))}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y} 年
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterMonth} onValueChange={setFilterMonth}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部月份</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} 月
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const empty = {
                        orderCount: 0,
                        orderRevenue: 0,
                        completedCount: 0,
                        completedRevenue: 0,
                        commission: 0,
                      };
                      const totals = tab1FilteredRows.reduce(
                        (acc, r) => {
                          const m = tab1Metrics.get(r.rowKey) ?? empty;
                          acc.orderRevenue += m.orderRevenue;
                          acc.completedRevenue += m.completedRevenue;
                          acc.commission += m.commission;
                          return acc;
                        },
                        { orderRevenue: 0, completedRevenue: 0, commission: 0 },
                      );
                      return (
                        <div className="ml-auto text-sm text-muted-foreground">
                          共 {tab1FilteredRows.length} 位 KOL｜總進單業績 {fmtMoney(totals.orderRevenue)}｜總完成業績 {fmtMoney(totals.completedRevenue)}｜總分潤 {fmtMoney(totals.commission)}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">KOL 名稱</TableHead>
                          <TableHead className="whitespace-nowrap">折扣碼 / CID</TableHead>
                          <TableHead className="whitespace-nowrap">館別</TableHead>
                          <TableHead className="text-right whitespace-nowrap">
                            {metricsLabel}進單筆數
                            <div className="text-xs font-normal text-muted-foreground">依訂單日期</div>
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap border-r">{metricsLabel}進單業績</TableHead>
                          <TableHead className="text-right whitespace-nowrap">
                            {metricsLabel}完成筆數
                            <div className="text-xs font-normal text-muted-foreground">依退房日期</div>
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap">{metricsLabel}完成業績</TableHead>
                          <TableHead className="text-right whitespace-nowrap">{metricsLabel}分潤</TableHead>
                          <TableHead className="text-right whitespace-nowrap">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tab1FilteredRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                              此期間無資料
                            </TableCell>
                          </TableRow>
                        ) : (
                          tab1FilteredRows.map((r) => {
                            const m = tab1Metrics.get(r.rowKey) ?? {
                              orderCount: 0,
                              orderRevenue: 0,
                              completedCount: 0,
                              completedRevenue: 0,
                              commission: 0,
                            };
                            return (
                              <TableRow
                                key={r.rowKey}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => openBonusDrawer(r)}
                              >
                                <TableCell className="whitespace-nowrap" title={r.name || ""}>
                                  {r.name || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap font-mono">
                                  {r.cid_code}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {r.accommodation_name || "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{m.orderCount}</TableCell>
                                <TableCell className="text-right tabular-nums border-r">{fmtMoney(m.orderRevenue)}</TableCell>
                                <TableCell className="text-right tabular-nums">{m.completedCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(m.completedRevenue)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(m.commission)}</TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => openBonusDrawer(r)}
                                    title="查看明細"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <div className="mt-3 px-1 text-xs text-muted-foreground space-y-1">
            <div>「當月進單」的定義 = 訂單產生的日期，目的用於確認該月份廣告跟訂單的成效分析</div>
            <div>「當月完成」的定義 = 目的用於結算該月份 KOL 的分潤獎金，詳細可查詢「分潤結算」的 Tab 分頁</div>
          </div>
        </TabsContent>

        <TabsContent value="settlement" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>分潤結算</CardTitle>
              <p className="text-sm text-muted-foreground">依「發放期別」查看當月成功入住的客人訂單，KOL 實際完成的「業績」與「分潤金額」</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  載入中...
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-sm text-muted-foreground">期間</span>
                    <Select
                      value={String(payoutYear)}
                      onValueChange={(v) => setPayoutYear(Number(v))}
                    >
                      <SelectTrigger className="w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y} 年
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground ml-2">發放期別</span>
                    <Select value={payoutPeriod} onValueChange={setPayoutPeriod}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全年</SelectItem>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {m} 月 10 日
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground ml-2">星探</span>
                    <Select value={scoutFilter} onValueChange={setScoutFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部星探</SelectItem>
                        {scoutOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const empty = { completedCount: 0, completedRevenue: 0, commission: 0 };
                      const totals = tab2FilteredRows.reduce(
                        (acc, r) => {
                          const m = tab2Metrics.get(r.rowKey) ?? empty;
                          acc.completedRevenue += m.completedRevenue;
                          acc.commission += m.commission;
                          return acc;
                        },
                        { completedRevenue: 0, commission: 0 },
                      );
                      return (
                        <div className="ml-auto text-sm text-muted-foreground">
                          共 {tab2FilteredRows.length} 位 KOL｜總完成業績 {fmtMoney(totals.completedRevenue)}｜總分潤 {fmtMoney(totals.commission)}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">KOL 名稱</TableHead>
                          <TableHead className="whitespace-nowrap">折扣碼 / CID</TableHead>
                          <TableHead className="whitespace-nowrap">館別</TableHead>
                          <TableHead className="text-right whitespace-nowrap">完成筆數</TableHead>
                          <TableHead className="text-right whitespace-nowrap">完成業績</TableHead>
                          <TableHead className="text-right whitespace-nowrap">分潤金額</TableHead>
                          <TableHead className="text-right whitespace-nowrap">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tab2FilteredRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                              此期間無資料
                            </TableCell>
                          </TableRow>
                        ) : (
                          tab2FilteredRows.map((r) => {
                            const m = tab2Metrics.get(r.rowKey) ?? {
                              completedCount: 0,
                              completedRevenue: 0,
                              commission: 0,
                            };
                            return (
                              <TableRow
                                key={r.rowKey}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => openSettlementDrawer(r)}
                              >
                                <TableCell className="whitespace-nowrap" title={r.name || ""}>
                                  {r.name || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap font-mono">
                                  {r.cid_code}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {r.accommodation_name || "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{m.completedCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(m.completedRevenue)}</TableCell>
                                <TableCell className="text-right tabular-nums">{fmtMoney(m.commission)}</TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => openSettlementDrawer(r)}
                                    title="查看明細"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <div className="mt-3 px-1 text-xs text-muted-foreground space-y-1">
            <div>同一個「折扣碼 / CID」，若產生兩筆以上訂單，可點開明細查看「訂單編號」</div>
          </div>
        </TabsContent>

        <TabsContent value="rates" className="mt-0">
          <KolRateSettingsTab />
        </TabsContent>
      </Tabs>

      <KolDetailDrawer
        kol={drawerKol}
        onClose={() => setDrawerKol(null)}
        ordersByKey={ordersByKey}
        getRate={getRate}
        initialMonth={drawerSettlement ? tab2DrawerInitialMonth : tab1DrawerInitialMonth}
        onCopy={copyLink}
        onGenerate={handleGenerate}
        saving={saving}
        settlementMode={drawerSettlement}
        filterPrefix={tab2TargetPrefix}
        payoutYear={payoutYear}
        payoutPeriod={payoutPeriod}
        filterYear={filterYear}
        filterMonthAll={filterMonth === "all"}
      />

    </div>
  );
}


interface DetailProps {
  kol: KolRow | null;
  onClose: () => void;
  ordersByKey: Map<string, OrderRow[]>;
  getRate: RateResolver;
  initialMonth: string;
  onCopy: (row: KolRow) => void;
  onGenerate: (row: KolRow) => Promise<void> | void;
  saving: boolean;
  settlementMode?: boolean;
  filterPrefix?: string;
  payoutYear?: number;
  payoutPeriod?: string;
  filterYear?: number;
  filterMonthAll?: boolean;
}

function KolDetailDrawer({
  kol,
  onClose,
  ordersByKey,
  getRate,
  initialMonth,
  onCopy,
  onGenerate,
  saving,
  settlementMode = false,
  filterPrefix = "",
  payoutYear,
  payoutPeriod,
  filterYear,
  filterMonthAll = false,
}: DetailProps) {

  const [month, setMonth] = useState<string>(initialMonth);

  useEffect(() => {
    if (kol) setMonth(initialMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kol?.rowKey, initialMonth]);

  const matched = useMemo(() => {
    if (!kol) return [];
    return ordersByKey.get(kol.rowKey) ?? [];
  }, [kol, ordersByKey]);
  

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    matched.forEach((o) => {
      if (o.order_date) set.add(o.order_date.slice(0, 7));
      if (o.check_out_date) set.add(o.check_out_date.slice(0, 7));
    });
    set.add(initialMonth);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [matched, initialMonth]);

  // 預計發放日：退房月份 +1 月的 10 號
  const payoutDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return "—";
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return `${ny}-${String(nm).padStart(2, "0")}-10`;
  }, [month]);

  // 訂單明細：依 order_date 在當月；非結算模式且選「全年」時改為整年度
  const orderList = useMemo(() => {
    if (!settlementMode && filterMonthAll && filterYear) {
      const yPrefix = `${filterYear}-`;
      return matched.filter((o) => o.order_date?.startsWith(yPrefix));
    }
    return matched.filter((o) => o.order_date?.slice(0, 7) === month);
  }, [matched, month, settlementMode, filterMonthAll, filterYear]);
  // 完成業績明細：分潤結算模式依 filterPrefix 過濾並排除取消單；非結算+全年依年度；否則依 month
  const completedList = useMemo(
    () => {
      if (settlementMode) {
        return matched.filter(
          (o) =>
            o.order_status !== "cancelled" &&
            o.check_out_date?.startsWith(filterPrefix),
        );
      }
      if (filterMonthAll && filterYear) {
        const yPrefix = `${filterYear}-`;
        return matched.filter(
          (o) =>
            o.check_out_date?.startsWith(yPrefix) &&
            o.order_status !== "cancelled",
        );
      }
      return matched.filter((o) => o.check_out_date?.slice(0, 7) === month);
    },
    [matched, month, settlementMode, filterPrefix, filterMonthAll, filterYear],
  );

  const orderTotals = useMemo(() => {
    let count = 0;
    let revenue = 0;
    for (const o of orderList) {
      count += 1;
      revenue += Number(o.final_price ?? o.total_price ?? 0);
    }
    return { count, revenue };
  }, [orderList]);

  const completedTotals = useMemo(() => {
    let count = 0;
    let revenue = 0;
    let commission = 0;
    for (const o of completedList) {
      const r = Number(o.final_price ?? o.total_price ?? 0);
      const rate = getRate(o.accommodation_id, o.check_out_date);
      count += 1;
      revenue += r;
      commission += r * (rate / 100);
    }
    return { count, revenue, commission: Math.round(commission) };
  }, [completedList, getRate]);

  return (
    <Sheet open={!!kol} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{kol?.name ?? "KOL 分潤明細"}</SheetTitle>
          <SheetDescription>
            折扣碼：
            <span className="font-mono">{kol?.cid_code}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {kol && !settlementMode && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <div className="text-sm font-medium">KOL 專屬查詢連結</div>
              <p className="text-xs text-muted-foreground">
                此連結可讓 KOL 本人查看自己的訂單業績，有效期 90 天
              </p>
              {isTokenValid(kol) ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    到期日：{kol.token_expires_at?.slice(0, 10)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => onCopy(kol)}>
                      <Copy className="h-3 w-3 mr-1" />
                      複製連結
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" disabled={saving}>
                          <LinkIcon className="h-3 w-3 mr-1" />
                          重新產生
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>重新產生連結</AlertDialogTitle>
                          <AlertDialogDescription>
                            重新產生後舊連結將立即失效，確定繼續？
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onGenerate(kol)}>
                            確認重新產生
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    尚未產生連結
                  </span>
                  <Button size="sm" onClick={() => onGenerate(kol)} disabled={saving}>
                    <LinkIcon className="h-3 w-3 mr-1" />
                    產生連結
                  </Button>
                </div>
              )}

            </div>
          )}

          {!settlementMode && !filterMonthAll && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">月份</span>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                訂單筆數依訂單日期統計，完成業績依退房日期統計
              </p>
            </div>
          )}

          {!settlementMode && (
            <>
              <div className="space-y-2">
                <div className="text-sm font-semibold">訂單明細（依訂單日期統計）</div>
                <div className="overflow-x-auto">
                  <Table className="fixed-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>館別</TableHead>
                        <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                        <TableHead>折扣碼</TableHead>
                        <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                        <TableHead className="whitespace-nowrap">退房日期</TableHead>
                        <TableHead className="text-right">訂單金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                            此月份無資料
                          </TableCell>
                        </TableRow>
                      ) : (
                        orderList.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>{kol?.accommodation_name || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                            <TableCell className="font-mono">{o.discount_code}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtMoney(Number(o.final_price ?? o.total_price ?? 0))}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                </div>
                <div className="text-xs text-muted-foreground text-right">
                  小計：{orderTotals.count} 筆｜總金額 {fmtMoney(orderTotals.revenue)}
                </div>
              </div>

              <Separator />
            </>
          )}



          <div className="space-y-2">
            <div className="text-sm font-semibold">
              {settlementMode
                ? payoutPeriod === "all"
                  ? `完成業績明細（${payoutYear} 全年度）`
                  : (() => {
                      const p = Number(payoutPeriod);
                      const coYear = p === 1 ? (payoutYear as number) - 1 : payoutYear;
                      const coMonth = p === 1 ? 12 : p - 1;
                      return `完成業績明細（${coYear}年${coMonth}月退房，${payoutYear}年${p}月10日發放）`;
                    })()
                : "完成業績明細（依退房日期統計）"}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">館別</TableHead>
                    <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                    <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                    <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                    <TableHead className="whitespace-nowrap">退房日期</TableHead>
                    <TableHead className="whitespace-nowrap text-right">金額</TableHead>
                    <TableHead className="whitespace-nowrap text-right">分潤%</TableHead>
                    <TableHead className="whitespace-nowrap text-right">分潤金額</TableHead>
                    <TableHead className="whitespace-nowrap">預計發放日</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                        此月份無資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedList.map((o) => {
                      const rate = getRate(o.accommodation_id, o.check_out_date);
                      const revenue = Number(o.final_price ?? o.total_price ?? 0);
                      const amount = Math.round(revenue * (rate / 100));
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="whitespace-nowrap">{kol?.accommodation_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{o.discount_code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(revenue)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{rate}%</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(amount)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{(() => {
                            const co = o.check_out_date?.slice(0, 10);
                            if (!co) return "—";
                            const [y, m] = co.split("-").map(Number);
                            if (!y || !m) return "—";
                            const ny = m === 12 ? y + 1 : y;
                            const nm = m === 12 ? 1 : m + 1;
                            return `${ny}-${String(nm).padStart(2, "0")}-10`;
                          })()}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="text-xs text-muted-foreground text-right">
              小計：{completedTotals.count} 筆｜總完成業績 {fmtMoney(completedTotals.revenue)}｜總分潤 {fmtMoney(completedTotals.commission)}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ 分潤設定 Tab ============

interface RateRow {
  id: string;
  accommodation_id: string;
  rate: number;
  effective_from: string;
  created_at: string | null;
}

interface AccGroup {
  id: string;
  name: string;
  rows: RateRow[];
}

function KolRateSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<AccGroup[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formAccId, setFormAccId] = useState<string>("");
  const [formRate, setFormRate] = useState("");
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [accRes, rateRes] = await Promise.all([
      supabase.from("accommodation_info").select("id, name").order("name"),
      supabase
        .from("kol_commission_settings")
        .select("id, accommodation_id, rate, effective_from, created_at")
        .is("kol_id", null)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (accRes.error) toast.error("載入館別失敗：" + accRes.error.message);
    if (rateRes.error) toast.error("載入分潤設定失敗：" + rateRes.error.message);
    const accs = (accRes.data ?? []) as { id: string; name: string }[];
    const rates = ((rateRes.data ?? []) as any[]).map((r) => ({
      id: r.id,
      accommodation_id: r.accommodation_id,
      rate: Number(r.rate ?? 0),
      effective_from: r.effective_from,
      created_at: r.created_at,
    })) as RateRow[];
    const byAcc = new Map<string, RateRow[]>();
    for (const r of rates) {
      const arr = byAcc.get(r.accommodation_id) ?? [];
      arr.push(r);
      byAcc.set(r.accommodation_id, arr);
    }
    setGroups(
      accs.map((a) => ({ id: a.id, name: a.name, rows: byAcc.get(a.id) ?? [] })),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setFormAccId(groups[0]?.id ?? "");
    setFormRate("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formAccId) {
      toast.error("請選擇館別");
      return;
    }
    const rate = Number(formRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("分潤% 必須在 0-100");
      return;
    }
    if (!formDate || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      toast.error("請輸入有效的生效日期");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("kol_commission_settings").insert({
      accommodation_id: formAccId,
      kol_id: null,
      rate,
      effective_from: formDate,
    });
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success("已新增費率");
    setDialogOpen(false);
    await load();
  };

  const handleDelete = async (row: RateRow) => {
    setDeletingId(row.id);
    const { error, count } = await supabase
      .from("kol_commission_settings")
      .delete({ count: "exact" })
      .eq("id", row.id);
    setDeletingId(null);
    if (error) {
      toast.error("刪除失敗：" + error.message);
      return;
    }
    if (!count) {
      toast.error("刪除失敗：沒有權限或紀錄不存在");
      return;
    }
    toast.success("已刪除");
    await load();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          載入中...
        </CardContent>
      </Card>
    );
  }

  const groupsWithRows = groups.filter((g) => g.rows.length > 0);
  const totalRows = groupsWithRows.reduce((n, g) => n + g.rows.length, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">KOL 分潤費率</CardTitle>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" />
          新增費率
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">館別</TableHead>
                <TableHead className="whitespace-nowrap">生效日期</TableHead>
                <TableHead className="whitespace-nowrap text-right">分潤%</TableHead>
                <TableHead className="whitespace-nowrap">建立時間</TableHead>
                <TableHead className="whitespace-nowrap text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totalRows === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                groupsWithRows.flatMap((g) =>
                  g.rows.map((r, idx) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {idx === 0 ? g.name : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.effective_from}
                        {idx === 0 && (
                          <Badge className="ml-2 bg-green-100 text-green-700 border-green-200">
                            目前生效
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.rate}%</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {r.created_at?.slice(0, 19).replace("T", " ") ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {idx !== 0 && g.rows.length > 1 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={deletingId === r.id}
                                title="刪除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確定刪除？</AlertDialogTitle>
                                <AlertDialogDescription>
                                  將刪除 {g.name} 生效日期 {r.effective_from} 的 {r.rate}% 費率，此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(r)}>
                                  確認刪除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  )),
                )
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增費率</DialogTitle>
            <DialogDescription>
              新增的費率會以「新一筆」紀錄寫入，舊紀錄保留作為歷史。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>館別</Label>
              <Select value={formAccId} onValueChange={setFormAccId}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇館別" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>分潤%</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={formRate}
                onChange={(e) => setFormRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>生效日期</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
