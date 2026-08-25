import { useMemo, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

/** 與 KolBonus.tsx 對齊的最小欄位定義（僅取儀表板需要的部分） */
export interface DashboardKolRow {
  rowKey: string;
  name: string | null;
  cid_code: string | null;
  accommodation_id: string | null;
  accommodation_name: string | null;
  scout_name: string | null;
}

export interface DashboardOrderRow {
  id: string;
  discount_code: string | null;
  order_date: string | null;
  check_out_date: string | null;
  order_status: string;
  accommodation_id: string | null;
  total_price: number | null;
  final_price: number | null;
  gross_revenue?: number | null;
}

interface Props {
  rows: DashboardKolRow[];
  ordersByKey: Map<string, DashboardOrderRow[]>;
  yearOptions: number[];
  loading?: boolean;
}

const fmtMoney = (n: number) => `NT$ ${Math.round(Number(n) || 0).toLocaleString()}`;

/** 訂單原始總額（未扣加購），與進單管理頁一致 */
const grossOf = (o: DashboardOrderRow) =>
  Number(o.gross_revenue ?? o.final_price ?? o.total_price ?? 0);

const CHART_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

function HelpTip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${title}計算說明`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm leading-relaxed" align="start">
        <p className="font-medium mb-1">{title}</p>
        <div className="text-muted-foreground space-y-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export default function KolBonusDashboardTab({
  rows,
  ordersByKey,
  yearOptions,
  loading,
}: Props) {
  const [venue, setVenue] = useState<string>("all");
  const nowTpe = useMemo(() => {
    const s = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return { year: Number(s.slice(0, 4)), month: String(Number(s.slice(5, 7))) };
  }, []);
  const [year, setYear] = useState<number>(nowTpe.year);
  const [month, setMonth] = useState<string>(nowTpe.month);
  const isAllPeriod = year === 0 && month === "all";
  const isThisMonth = year === nowTpe.year && month === nowTpe.month;

  const [sortBy, setSortBy] = useState<"revenue" | "orders">("revenue");
  const [showAll, setShowAll] = useState(false);

  const venueOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.accommodation_id) {
        map.set(r.accommodation_id, r.accommodation_name || "未命名館別");
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const matchPeriod = (date?: string | null) => {
    if (!date) return false;
    if (year === 0) {
      if (month === "all") return true;
      return date.slice(5, 7) === String(month).padStart(2, "0");
    }
    const prefix =
      month === "all"
        ? `${year}-`
        : `${year}-${String(month).padStart(2, "0")}`;
    return date.startsWith(prefix);
  };

  /** 每個 KOL（CID × 館別）在篩選條件下的訂單數與業績 */
  const ranking = useMemo(() => {
    const list = rows
      .filter((r) => venue === "all" || r.accommodation_id === venue)
      .map((r) => {
        const orders = (ordersByKey.get(r.rowKey) ?? []).filter(
          (o) => o.order_status !== "cancelled" && matchPeriod(o.order_date),
        );
        const revenue = orders.reduce((s, o) => s + grossOf(o), 0);
        return {
          row: r,
          orderCount: orders.length,
          revenue,
        };
      })
      .filter((x) => x.orderCount > 0);
    list.sort((a, b) =>
      sortBy === "revenue" ? b.revenue - a.revenue : b.orderCount - a.orderCount,
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ordersByKey, venue, year, month, sortBy]);

  const kpi = useMemo(() => {
    const revenue = ranking.reduce((s, x) => s + x.revenue, 0);
    const orderCount = ranking.reduce((s, x) => s + x.orderCount, 0);
    const kolCount = new Set(
      ranking.map((x) => (x.row.cid_code ?? "").toUpperCase()).filter(Boolean),
    ).size;
    return { revenue, orderCount, kolCount };
  }, [ranking]);

  /** 月度業績趨勢（依館別堆疊） */
  const trend = useMemo(() => {
    const venueTotals = new Map<string, number>();
    const byMonth = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (venue !== "all" && r.accommodation_id !== venue) continue;
      const vName = r.accommodation_name || "未指定館別";
      for (const o of ordersByKey.get(r.rowKey) ?? []) {
        if (o.order_status === "cancelled") continue;
        if (!o.order_date) continue;
        if (!matchPeriod(o.order_date)) continue;
        const m = o.order_date.slice(0, 7);
        const amount = grossOf(o);
        if (!byMonth.has(m)) byMonth.set(m, new Map());
        const bucket = byMonth.get(m)!;
        bucket.set(vName, (bucket.get(vName) ?? 0) + amount);
        venueTotals.set(vName, (venueTotals.get(vName) ?? 0) + amount);
      }
    }
    const venues = Array.from(venueTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);
    const months = Array.from(byMonth.keys()).sort();
    const data = months.map((m) => {
      const bucket = byMonth.get(m)!;
      const others = Array.from(bucket.entries())
        .filter(([name]) => !venues.includes(name))
        .reduce((s, [, v]) => s + v, 0);
      const segments = venues
        .map((name) => ({ name, value: bucket.get(name) ?? 0 }))
        .filter((s) => s.value > 0);
      if (others > 0) segments.push({ name: "其他", value: others });
      const total = segments.reduce((s, x) => s + x.value, 0);
      return { month: m, segments, total };
    });
    const max = Math.max(1, ...data.map((d) => d.total));
    const legend = others0(venues, data);
    return { data, max, legend };
  }, [rows, ordersByKey, venue, year, month]);

  const topBars = useMemo(() => {
    const top = ranking.slice(0, 10);
    const max = Math.max(1, ...top.map((x) => x.revenue));
    return { top, max };
  }, [ranking]);

  const visible = showAll ? ranking : ranking.slice(0, 10);

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* 篩選器 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">館別</span>
            <Select value={venue} onValueChange={setVenue}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部館別</SelectItem>
                {venueOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">期間</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">全部年份</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[110px]">
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
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              總業績
              <HelpTip title="總業績怎麼算">
                <p>
                  篩選條件下，所有使用 KOL 折扣代碼（CID）之訂單的
                  <b>原始總額</b>加總。
                </p>
                <p>取數欄位優先序：gross_revenue → final_price → total_price。</p>
                <p>已排除狀態為「已取消」的訂單。</p>
                <p>期間以訂單的<b>成交日（order_date）</b>判定。</p>
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fmtMoney(kpi.revenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              使用折扣代碼總訂單數
              <HelpTip title="總訂單數怎麼算">
                <p>篩選條件下，帶有 KOL 折扣代碼的訂單筆數。</p>
                <p>已排除「已取消」訂單；期間以成交日（order_date）判定。</p>
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpi.orderCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              有貢獻的 KOL 數
              <HelpTip title="有貢獻的 KOL 數怎麼算">
                <p>篩選條件下，至少帶進 1 筆有效訂單的<b>不重複折扣代碼（CID）</b>數量。</p>
                <p>同一 KOL 若跨多個館別出單，仍以 CID 計為 1 位。</p>
              </HelpTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{kpi.kolCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* 圖 A：Top 10 業績橫向長條 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1">
            KOL 業績 Top 10
            <HelpTip title="Top 10 圖怎麼算">
              <p>依篩選後的總業績由高至低取前 10 名。</p>
              <p>長條長度為「該 KOL 業績 ÷ 第一名業績」的相對比例。</p>
              <p>同一 CID 在不同館別的業績會分列計算。</p>
            </HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topBars.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">此條件下沒有資料</p>
          ) : (
            topBars.top.map((x) => (
              <div key={x.row.rowKey} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    {x.row.name || x.row.cid_code || "—"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {x.row.accommodation_name || "—"}
                    </span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {fmtMoney(x.revenue)}
                  </span>
                </div>
                <div className="h-2 w-full rounded bg-muted">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${(x.revenue / topBars.max) * 100}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 圖 B：月度業績趨勢（依館別堆疊） */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-1">
            月度業績趨勢
            <HelpTip title="月度趨勢怎麼算">
              <p>依訂單成交日（order_date）的年月分組，加總業績。</p>
              <p>每根長條依館別堆疊，僅顯示業績前 5 大館別，其餘併為「其他」。</p>
              <p>長條高度為「該月總業績 ÷ 期間內最高月份業績」。</p>
            </HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trend.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">此條件下沒有資料</p>
          ) : (
            <>
              <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ height: 200 }}>
                {trend.data.map((d) => (
                  <div key={d.month} className="flex flex-col items-center gap-1 min-w-[44px]">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round(d.total / 1000).toLocaleString()}k
                    </span>
                    <div
                      className="w-8 flex flex-col-reverse rounded overflow-hidden bg-muted"
                      style={{ height: `${(d.total / trend.max) * 140}px`, minHeight: 4 }}
                      title={`${d.month}：${fmtMoney(d.total)}`}
                    >
                      {d.segments.map((s) => (
                        <div
                          key={s.name}
                          className={
                            CHART_COLORS[trend.legend.indexOf(s.name) % CHART_COLORS.length]
                          }
                          style={{ height: `${(s.value / d.total) * 100}%` }}
                          title={`${s.name}：${fmtMoney(s.value)}`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {d.month.slice(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                {trend.legend.map((name, i) => (
                  <span key={name} className="flex items-center gap-1 text-xs">
                    <span
                      className={`inline-block h-2 w-2 rounded-sm ${CHART_COLORS[i % CHART_COLORS.length]}`}
                    />
                    {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 排名表 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-1">
              KOL 業績排名
              <HelpTip title="排名表怎麼算">
                <p>每一列為「折扣代碼（CID）× 館別」的組合。</p>
                <p>訂單數／業績皆已排除取消訂單，並以成交日落在篩選期間為準。</p>
                <p>可切換依業績或依訂單數排序。</p>
              </HelpTip>
            </CardTitle>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "revenue" | "orders")}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">依業績排序</SelectItem>
                <SelectItem value="orders">依訂單數排序</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">名次</TableHead>
                  <TableHead className="w-[160px]">KOL</TableHead>
                  <TableHead className="w-[130px]">CID</TableHead>
                  <TableHead className="w-[160px]">館別</TableHead>
                  <TableHead className="w-[120px]">星探</TableHead>
                  <TableHead className="w-[90px] text-right">訂單數</TableHead>
                  <TableHead className="w-[140px] text-right">總業績</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      此條件下沒有資料
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((x, i) => (
                    <TableRow key={x.row.rowKey}>
                      <TableCell className="tabular-nums">{i + 1}</TableCell>
                      <TableCell className="truncate">{x.row.name || "—"}</TableCell>
                      <TableCell className="truncate">
                        <Badge variant="outline">{x.row.cid_code || "—"}</Badge>
                      </TableCell>
                      <TableCell className="truncate">
                        {x.row.accommodation_name || "—"}
                      </TableCell>
                      <TableCell className="truncate">{x.row.scout_name || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.orderCount}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {fmtMoney(x.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {ranking.length > 10 && (
            <div className="pt-3 text-center">
              <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "只顯示前 10 名" : `顯示全部（${ranking.length}）`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** 圖例順序：前 5 大館別 + （若有）其他 */
function others0(
  venues: string[],
  data: Array<{ segments: Array<{ name: string }> }>,
): string[] {
  const hasOthers = data.some((d) => d.segments.some((s) => s.name === "其他"));
  return hasOthers ? [...venues, "其他"] : venues;
}
