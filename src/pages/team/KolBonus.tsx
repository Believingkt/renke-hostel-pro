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

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<KolRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [commissions, setCommissions] = useState<CommissionSetting[]>([]);
  const [genDialog, setGenDialog] = useState<KolRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerKol, setDrawerKol] = useState<KolRow | null>(null);
  const [filterYear, setFilterYear] = useState<number>(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(String(currentMonthNum)); // "all" | "1".."12"

  const fetchAll = async () => {
    setLoading(true);
    const [kolRes, orderRes, commRes, accRes] = await Promise.all([
      supabase
        .from("kol_profiles")
        .select(
          "id, name, cid_code, venue_name, accommodation_id, public_token, token_expires_at",
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
    }>;
    const accMap = new Map<string, string>(
      ((accRes.data ?? []) as Array<{ id: string; name: string }>).map((a) => [
        a.id,
        a.name,
      ]),
    );

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
        name: matched?.name ?? null,
        cid_code: matched?.cid_code ?? code,
        accommodation_id: accId,
        accommodation_name:
          (accId && accMap.get(accId)) || matched?.venue_name || null,
        public_token: matched?.public_token ?? null,
        token_expires_at: matched?.token_expires_at ?? null,
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
    return Array.from(set).sort((a, b) => b - a);
  }, [orders, currentYear]);

  // 根據年/月過濾：該列在選定區間內須至少有一筆 order_date 或 check_out_date；「全部月份」= 全期
  const filteredRows = useMemo(() => {
    const prefix =
      filterMonth === "all"
        ? null
        : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
    return rows.filter((k) => {
      const list = ordersByKey.get(k.rowKey) ?? [];
      if (!prefix) return list.length > 0;
      return list.some(
        (o) =>
          o.order_date?.startsWith(prefix) ||
          (o.order_status !== "cancelled" && o.check_out_date?.startsWith(prefix)),
      );
    });
  }, [rows, ordersByKey, filterYear, filterMonth]);

  // 開啟 Drawer 時要帶入的月份：若選「全部月份」則用當月
  const drawerInitialMonth =
    filterMonth === "all"
      ? `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`
      : `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;

  // 每列在當前篩選期間內的訂單/完成業績與分潤
  const kolMetrics = useMemo(() => {
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
        const orderMatch = prefix
          ? o.order_date?.startsWith(prefix)
          : true;
        const completedMatch = prefix
          ? o.check_out_date?.startsWith(prefix)
          : true;
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

  const metricsLabel = filterMonth === "all" ? "全期" : "當月";

  if (!allowed) return <Navigate to="/team" replace />;

  const handleGenerate = async () => {
    if (!genDialog) return;
    setSaving(true);
    const newToken = crypto.randomUUID();
    const newExpires = new Date(
      Date.now() + TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { error } = await supabase
      .from("kol_profiles")
      .update({ public_token: newToken, token_expires_at: newExpires })
      .eq("id", genDialog.id);
    setSaving(false);
    if (error) {
      toast.error("產生失敗：" + error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id && genDialog.id && r.id === genDialog.id
          ? { ...r, public_token: newToken, token_expires_at: newExpires }
          : r,
      ),
    );
    setDrawerKol((prev) =>
      prev && prev.id && genDialog.id && prev.id === genDialog.id
        ? { ...prev, public_token: newToken, token_expires_at: newExpires }
        : prev,
    );
    toast.success("已產生新連結");
    setGenDialog(null);
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

  const expiryNote = (() => {
    const d = new Date(Date.now() + TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <div className="space-y-6">
      <Tabs defaultValue="bonus" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bonus">獎金管理</TabsTrigger>
          <TabsTrigger value="rates">分潤設定</TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" className="mt-0">
      <Card>
        <CardHeader>
          <CardTitle>KOL 獎金管理</CardTitle>
          <p className="text-sm text-muted-foreground">
            查看 KOL 訂單分潤資料並產生專屬查詢連結
          </p>
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
                const totals = filteredRows.reduce(
                  (acc, r) => {
                    const m = kolMetrics.get(r.id) ?? empty;
                    acc.orderRevenue += m.orderRevenue;
                    acc.completedRevenue += m.completedRevenue;
                    acc.commission += m.commission;
                    return acc;
                  },
                  { orderRevenue: 0, completedRevenue: 0, commission: 0 },
                );
                return (
                  <div className="ml-auto text-sm text-muted-foreground">
                    共 {filteredRows.length} 位 KOL｜總訂單業績 {fmtMoney(totals.orderRevenue)}｜總完成業績 {fmtMoney(totals.completedRevenue)}｜總分潤 {fmtMoney(totals.commission)}
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
                      {metricsLabel}訂單筆數
                      <div className="text-xs font-normal text-muted-foreground">依訂單日期</div>
                    </TableHead>
                    <TableHead className="text-right whitespace-nowrap">{metricsLabel}訂單業績</TableHead>
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
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center text-muted-foreground py-8"
                      >
                        此期間無資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => {
                      const m = kolMetrics.get(r.rowKey) ?? {
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
                          onClick={() => setDrawerKol(r)}
                        >
                          <TableCell
                            className="whitespace-nowrap"
                            title={r.name || ""}
                          >
                            {r.name || "—"}
                          </TableCell>

                          <TableCell className="whitespace-nowrap font-mono">
                            {r.cid_code}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.accommodation_name || "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.orderCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(m.orderRevenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.completedCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(m.completedRevenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(m.commission)}
                          </TableCell>
                          <TableCell
                            className="text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDrawerKol(r)}
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
        </TabsContent>

        <TabsContent value="rates" className="mt-0">
          <KolRateSettingsTab />
        </TabsContent>
      </Tabs>

      <Dialog open={!!genDialog} onOpenChange={(o) => !o && setGenDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>產生專屬查詢連結</DialogTitle>
            <DialogDescription>
              此連結有效期為 90 天（至 {expiryNote}）。產生後請複製給 KOL，
              過期後須重新產生。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenDialog(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleGenerate} disabled={saving}>
              {saving ? "產生中..." : "確認產生"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KolDetailDrawer
        kol={drawerKol}
        onClose={() => setDrawerKol(null)}
        ordersByCode={ordersByCode}
        getRate={getRate}
        initialMonth={drawerInitialMonth}
        onCopy={copyLink}
        onGenerate={setGenDialog}
      />
    </div>
  );
}

interface DetailProps {
  kol: KolRow | null;
  onClose: () => void;
  ordersByCode: Map<string, OrderRow[]>;
  getRate: RateResolver;
  initialMonth: string;
  onCopy: (row: KolRow) => void;
  onGenerate: (row: KolRow) => void;
}

function KolDetailDrawer({
  kol,
  onClose,
  ordersByCode,
  getRate,
  initialMonth,
  onCopy,
  onGenerate,
}: DetailProps) {
  const [month, setMonth] = useState<string>(initialMonth);

  useEffect(() => {
    if (kol) setMonth(initialMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kol?.id, initialMonth]);

  const matched = useMemo(() => {
    if (!kol?.cid_code) return [];
    return ordersByCode.get(kol.cid_code.trim().toUpperCase()) ?? [];
  }, [kol, ordersByCode]);

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

  // 訂單明細：依 order_date 在當月
  const orderList = useMemo(
    () => matched.filter((o) => o.order_date?.slice(0, 7) === month),
    [matched, month],
  );
  // 完成業績明細：依 check_out_date 在當月
  const completedList = useMemo(
    () => matched.filter((o) => o.check_out_date?.slice(0, 7) === month),
    [matched, month],
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
          {kol && (
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
                  <Button size="sm" variant="outline" onClick={() => onCopy(kol)}>
                    <Copy className="h-3 w-3 mr-1" />
                    複製連結
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {kol.public_token ? "連結已過期" : "尚未產生連結"}
                  </span>
                  <Button size="sm" onClick={() => onGenerate(kol)}>
                    <LinkIcon className="h-3 w-3 mr-1" />
                    產生連結
                  </Button>
                </div>
              )}
            </div>
          )}

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
                        <TableCell>{kol?.venue_name || "—"}</TableCell>
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

          <div className="space-y-2">
            <div className="text-sm font-semibold">完成業績明細（依退房日期統計）</div>
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
                          <TableCell className="whitespace-nowrap">{kol?.venue_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs">{o.order_number}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono">{o.discount_code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(revenue)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{rate}%</TableCell>
                          <TableCell className="whitespace-nowrap text-right tabular-nums">{fmtMoney(amount)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{payoutDate}</TableCell>
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
