import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Link as LinkIcon, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  id: string;
  name: string | null;
  cid_code: string | null;
  venue_name: string | null;
  accommodation_id: string | null;
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
  closer_rate: number | null;
}

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
    const [kolRes, orderRes, commRes] = await Promise.all([
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
        .from("accommodation_commission_settings")
        .select("accommodation_id, effective_from, closer_rate")
        .order("effective_from", { ascending: false }),
    ]);
    if (kolRes.error) toast.error("載入 KOL 失敗：" + kolRes.error.message);
    if (orderRes.error) toast.error("載入訂單失敗：" + orderRes.error.message);
    if (commRes.error) toast.error("載入分潤設定失敗：" + commRes.error.message);
    const allOrders = (orderRes.data ?? []) as OrderRow[];
    const activeCodes = new Set(
      allOrders
        .map((o) => (o.discount_code ?? "").trim().toUpperCase())
        .filter(Boolean),
    );
    const allKols = (kolRes.data ?? []) as KolRow[];
    const filteredKols = allKols.filter((k) =>
      activeCodes.has((k.cid_code ?? "").trim().toUpperCase()),
    );
    setRows(filteredKols);
    setOrders(allOrders);
    setCommissions((commRes.data ?? []) as CommissionSetting[]);
    setLoading(false);
  };

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed]);

  // 取每館最新分潤
  const latestRateByAcc = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commissions) {
      if (!map.has(c.accommodation_id)) {
        map.set(c.accommodation_id, Number(c.closer_rate ?? 0));
      }
    }
    return map;
  }, [commissions]);

  // 訂單依折扣碼分組（大小寫不敏感）
  const ordersByCode = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const o of orders) {
      const key = (o.discount_code ?? "").trim().toUpperCase();
      if (!key) continue;
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

  // 根據年/月過濾 KOL：該 KOL 在選定區間內須至少有一筆 order_date；「全部月份」= 全期
  const filteredRows = useMemo(() => {
    const prefix =
      filterMonth === "all"
        ? null
        : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
    return rows.filter((k) => {
      const code = (k.cid_code ?? "").trim().toUpperCase();
      const list = ordersByCode.get(code) ?? [];
      if (!prefix) return list.length > 0;
      return list.some((o) => o.order_date?.startsWith(prefix));
    });
  }, [rows, ordersByCode, filterYear, filterMonth]);

  // 開啟 Drawer 時要帶入的月份：若選「全部月份」則用當月
  const drawerInitialMonth =
    filterMonth === "all"
      ? `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`
      : `${filterYear}-${String(Number(filterMonth)).padStart(2, "0")}`;

  // 每位 KOL 在當前篩選期間內的訂單/完成業績與分潤
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
      const code = (k.cid_code ?? "").trim().toUpperCase();
      const list = ordersByCode.get(code) ?? [];
      let orderCount = 0;
      let orderRevenue = 0;
      let completedCount = 0;
      let completedRevenue = 0;
      let commission = 0;
      for (const o of list) {
        const r = Number(o.final_price ?? o.total_price ?? 0);
        const rate = latestRateByAcc.get(o.accommodation_id || "") ?? 0;
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
      map.set(k.id, {
        orderCount,
        orderRevenue,
        completedCount,
        completedRevenue,
        commission: Math.round(commission),
      });
    }
    return map;
  }, [rows, ordersByCode, latestRateByAcc, filterYear, filterMonth]);

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
        r.id === genDialog.id
          ? { ...r, public_token: newToken, token_expires_at: newExpires }
          : r,
      ),
    );
    setDrawerKol((prev) =>
      prev && prev.id === genDialog.id
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
              <Table className="fixed-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">KOL 名稱</TableHead>
                    <TableHead>折扣碼 / CID</TableHead>
                    <TableHead>館別</TableHead>
                    <TableHead className="text-right">
                      {metricsLabel}訂單筆數
                      <div className="text-xs font-normal text-muted-foreground">依訂單日期</div>
                    </TableHead>
                    <TableHead className="text-right">{metricsLabel}訂單業績</TableHead>
                    <TableHead className="text-right">
                      {metricsLabel}完成筆數
                      <div className="text-xs font-normal text-muted-foreground">依退房日期</div>
                    </TableHead>
                    <TableHead className="text-right">{metricsLabel}完成業績</TableHead>
                    <TableHead className="text-right">{metricsLabel}分潤</TableHead>
                    <TableHead className="text-right">操作</TableHead>
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
                      const m = kolMetrics.get(r.id) ?? {
                        orderCount: 0,
                        orderRevenue: 0,
                        completedCount: 0,
                        completedRevenue: 0,
                        commission: 0,
                      };
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDrawerKol(r)}
                        >
                          <TableCell
                            className="w-[200px] max-w-[200px] truncate"
                            title={r.name || ""}
                          >
                            {r.name || "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono">
                            {r.cid_code}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {r.venue_name || "—"}
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
        latestRateByAcc={latestRateByAcc}
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
  latestRateByAcc: Map<string, number>;
  initialMonth: string;
  onCopy: (row: KolRow) => void;
  onGenerate: (row: KolRow) => void;
}

function KolDetailDrawer({
  kol,
  onClose,
  ordersByCode,
  latestRateByAcc,
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
      const rate = latestRateByAcc.get(o.accommodation_id || "") ?? 0;
      count += 1;
      revenue += r;
      commission += r * (rate / 100);
    }
    return { count, revenue, commission: Math.round(commission) };
  }, [completedList, latestRateByAcc]);

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
                    <TableHead>折扣碼</TableHead>
                    <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                    <TableHead className="whitespace-nowrap">退房日期</TableHead>
                    <TableHead className="text-right">訂單金額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        此月份無資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    orderList.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell>{kol?.venue_name || "—"}</TableCell>
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
              <Table className="fixed-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>館別</TableHead>
                    <TableHead>折扣碼</TableHead>
                    <TableHead className="whitespace-nowrap">訂單日期</TableHead>
                    <TableHead className="whitespace-nowrap">退房日期</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="text-right">分潤%</TableHead>
                    <TableHead className="text-right">分潤金額</TableHead>
                    <TableHead className="whitespace-nowrap">預計發放日</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        此月份無資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    completedList.map((o) => {
                      const rate = latestRateByAcc.get(o.accommodation_id || "") ?? 0;
                      const revenue = Number(o.final_price ?? o.total_price ?? 0);
                      const amount = Math.round(revenue * (rate / 100));
                      return (
                        <TableRow key={o.id}>
                          <TableCell>{kol?.venue_name || "—"}</TableCell>
                          <TableCell className="font-mono">{o.discount_code}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.order_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{o.check_out_date?.slice(0, 10) || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{rate}%</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtMoney(amount)}</TableCell>
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
