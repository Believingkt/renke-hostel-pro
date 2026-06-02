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
          "id, order_number, discount_code, check_in_date, order_date, total_price, final_price, order_status, accommodation_id",
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

  // 每位 KOL 在當前篩選期間內的業績與分潤
  const kolMetrics = useMemo(() => {
    const prefix =
      filterMonth === "all"
        ? null
        : `${filterYear}-${String(filterMonth).padStart(2, "0")}`;
    const map = new Map<string, { revenue: number; commission: number }>();
    for (const k of rows) {
      const code = (k.cid_code ?? "").trim().toUpperCase();
      const list = ordersByCode.get(code) ?? [];
      let revenue = 0;
      let commission = 0;
      for (const o of list) {
        if (prefix) {
          if (!o.order_date?.startsWith(prefix)) continue;
        }
        const r = Number(o.final_price ?? o.total_price ?? 0);
        const rate = latestRateByAcc.get(o.accommodation_id || "") ?? 0;
        revenue += r;
        commission += r * (rate / 100);
      }
      map.set(k.id, { revenue, commission: Math.round(commission) });
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
            </div>
            <div className="overflow-x-auto">
              <Table className="fixed-table">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">KOL 名稱</TableHead>
                    <TableHead>折扣碼 / CID</TableHead>
                    <TableHead>館別</TableHead>
                    <TableHead className="text-right">{metricsLabel}業績</TableHead>
                    <TableHead className="text-right">{metricsLabel}分潤</TableHead>
                    <TableHead>連結狀態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-8"
                      >
                        此期間無資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map((r) => {
                      const m = kolMetrics.get(r.id) ?? { revenue: 0, commission: 0 };
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
                            {fmtMoney(m.revenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmtMoney(m.commission)}
                          </TableCell>
                          <TableCell>{renderStatusBadge(r)}</TableCell>
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
}

function KolDetailDrawer({
  kol,
  onClose,
  ordersByCode,
  latestRateByAcc,
  initialMonth,
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
    });
    set.add(initialMonth);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [matched, initialMonth]);

  const rowsInMonth = useMemo(
    () => matched.filter((o) => o.order_date?.slice(0, 7) === month),
    [matched, month],
  );

  // 同一 KOL 通常 1 館，但仍以 accommodation_id 分組以防多館
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { count: number; revenue: number; rate: number }
    >();
    for (const o of rowsInMonth) {
      const accId = o.accommodation_id || "";
      const rate = latestRateByAcc.get(accId) ?? 0;
      const revenue = Number(o.final_price ?? o.total_price ?? 0);
      const cur = map.get(accId) ?? { count: 0, revenue: 0, rate };
      cur.count += 1;
      cur.revenue += revenue;
      cur.rate = rate;
      map.set(accId, cur);
    }
    return Array.from(map.entries());
  }, [rowsInMonth, latestRateByAcc]);

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

          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>館別</TableHead>
                  <TableHead>折扣碼</TableHead>
                  <TableHead className="text-right">
                    有效訂單筆數
                    <div className="text-xs font-normal text-muted-foreground">依訂單日期統計</div>
                  </TableHead>
                  <TableHead className="text-right">總業績</TableHead>
                  <TableHead className="text-right">分潤%</TableHead>
                  <TableHead className="text-right">分潤金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-6"
                    >
                      此月份無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  grouped.map(([accId, g]) => {
                    const amount = Math.round(g.revenue * (g.rate / 100));
                    return (
                      <TableRow key={accId || "unknown"}>
                        <TableCell>{kol?.venue_name || "—"}</TableCell>
                        <TableCell className="font-mono">
                          {kol?.cid_code}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtMoney(g.revenue)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.rate}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtMoney(amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
