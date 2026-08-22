import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ANALYTICS_FILTERS,
  COMMISSION_STATE_VARIANT,
  ORDER_STATUS_TEXT,
  analyticsFilterLabel,
  commissionCellText,
  filterAnalyticsRows,
  summarizeAnalytics,
  twdPlain,
  type AnalyticsFilterKey,
  type GroupBuyAnalyticsRow,
} from "@/lib/groupBuyAnalytics";
import { DEPOSIT_STATE_LABEL, REFUND_STATE_LABEL, REFUND_STATE_VARIANT } from "@/lib/groupBuyPayment";
import { exportAnalyticsExcel, exportAnalyticsPdf, printAnalytics, type ExportMeta } from "@/lib/groupBuyExport";
import AdminDateRangeField from "@/components/admin/AdminDateRangeField";


interface Props {
  rows: GroupBuyAnalyticsRow[];
  campaignTitle: string;
  kolName: string;
  salePeriod: string;
  stayPeriod: string;
  currentRate: number;
  onOpenOrder: (orderNumber: string) => void;
}

const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10).replace(/-/g, "/") : "—");

export function GroupBuyAnalyticsTab({
  rows,
  campaignTitle,
  kolName,
  salePeriod,
  stayPeriod,
  currentRate,
  onOpenOrder,
}: Props) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<AnalyticsFilterKey>("all");
  const [dateField, setDateField] = useState<"order_date" | "check_in_date">("order_date");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(
    () => filterAnalyticsRows(rows, filter, { field: dateField, from: from || null, to: to || null }),
    [rows, filter, dateField, from, to],
  );
  /** KPI 與明細同源：兩者都吃 filtered，確保「KPI = 明細加總」 */
  const summary = useMemo(() => summarizeAnalytics(filtered), [filtered]);

  const meta: ExportMeta = {
    campaignTitle,
    kolName,
    salePeriod,
    stayPeriod,
    currentRate,
    filterLabel:
      analyticsFilterLabel(filter) +
      (from || to
        ? `（${dateField === "order_date" ? "下單日期" : "入住日期"} ${from || "不限"} ~ ${to || "不限"}）`
        : ""),
  };

  const guardEmpty = () => {
    if (filtered.length === 0) {
      toast({ title: "目前沒有可匯出的訂單資料。", variant: "destructive" });
      return true;
    }
    return false;
  };

  const doExcel = async () => {
    if (guardEmpty()) return;
    setBusy(true);
    try {
      await exportAnalyticsExcel(filtered, summary, meta);
    } catch {
      toast({ title: "匯出 Excel 失敗，請稍後再試。", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const doPdf = async () => {
    if (guardEmpty()) return;
    setBusy(true);
    try {
      await exportAnalyticsPdf(filtered, summary, meta);
    } catch {
      toast({ title: "匯出 PDF 失敗，請稍後再試。", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const kpis = [
    { label: "有效訂單", value: `${summary.validOrders} 筆` },
    { label: "待匯款 / 待核對", value: `${summary.pendingTransfer} / ${summary.awaitingCheck}` },
    { label: "取消訂單", value: `${summary.cancelledOrders} 筆` },
    { label: "有效訂單總額", value: twdPlain(summary.validRevenue), hint: "未取消訂單金額合計" },
    { label: "已收訂金", value: twdPlain(summary.collected) },
    {
      label: "網紅分潤總額",
      value: twdPlain(summary.commissionTotal),
      hint: `符合分潤訂單：${summary.commissionOrders} 筆・目前新訂單分潤比例：${currentRate}%`,
    },
  ];

  return (
    <div className="gb-print-area space-y-4">
      <div className="hidden gb-print-only">
        <h2 className="text-lg font-semibold">團購銷售分析</h2>
        <p className="text-sm">{campaignTitle}</p>
        <p className="text-xs text-muted-foreground">
          合作網紅：{kolName || "—"}　販售期間：{salePeriod}　可入住期間：{stayPeriod}
        </p>
        <p className="text-xs text-muted-foreground">資料範圍：{meta.filterLabel}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        {kpis.map((s) => (
          <Card key={s.label} className="min-w-0">
            <CardHeader className="p-3 pb-1 md:p-6 md:pb-2">
              <CardTitle className="text-xs font-normal text-muted-foreground md:text-sm">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <p className="text-lg font-semibold tabular-nums text-foreground md:text-2xl">{s.value}</p>
              {s.hint && <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">{s.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>


      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">訂單銷售明細</CardTitle>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gb-no-print" disabled={busy}>
                <Download className="mr-1 h-4 w-4" /> 匯出
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void doExcel()}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void doPdf()}>
                <FileText className="mr-2 h-4 w-4" /> PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => printAnalytics()}>
                <Printer className="mr-2 h-4 w-4" /> 列印
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="space-y-3 p-0">
          <div className="gb-no-print flex flex-wrap items-center gap-2 px-4">
            {ANALYTICS_FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "outline"}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={dateField}
                onChange={(e) => setDateField(e.target.value as "order_date" | "check_in_date")}
              >
                <option value="order_date">下單日期</option>
                <option value="check_in_date">入住日期</option>
              </select>
              <AdminDateRangeField
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                }}
              />

              {(from || to) && (
                <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>
                  清除
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                  <TableHead className="whitespace-nowrap">下單日期</TableHead>
                  <TableHead className="whitespace-nowrap">旅客</TableHead>
                  <TableHead className="whitespace-nowrap">入住／退房</TableHead>
                  <TableHead className="whitespace-nowrap">方案</TableHead>
                  <TableHead className="whitespace-nowrap text-right">訂單總額</TableHead>
                  <TableHead className="whitespace-nowrap text-right">已收金額</TableHead>
                  <TableHead className="whitespace-nowrap">訂單狀態</TableHead>
                  <TableHead className="whitespace-nowrap">退款狀態</TableHead>
                  <TableHead className="whitespace-nowrap">分潤狀態</TableHead>
                  <TableHead className="whitespace-nowrap text-right">網紅分潤</TableHead>
                  <TableHead className="gb-no-print whitespace-nowrap">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const c = commissionCellText(r);
                  return (
                    <TableRow key={r.order.id}>
                      <TableCell className="whitespace-nowrap font-medium">
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() => onOpenOrder(r.order.order_number)}
                        >
                          {r.order.order_number}
                        </button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{ymd(r.order.order_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.order.guest_name}
                        <div className="text-xs text-muted-foreground">{r.order.guest_phone}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {ymd(r.order.check_in_date)}
                        <div className="text-xs text-muted-foreground">{ymd(r.order.check_out_date)}</div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.packageName}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {twdPlain(Number(r.order.final_price) || 0)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {twdPlain(Number(r.order.paid_amount) || 0)}
                        <div className="text-xs text-muted-foreground">{DEPOSIT_STATE_LABEL[r.deposit]}</div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{ORDER_STATUS_TEXT(r.order)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={REFUND_STATE_VARIANT[r.refund]}>{REFUND_STATE_LABEL[r.refund]}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant={COMMISSION_STATE_VARIANT[r.state]}>{r.stateLabel}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        <div>{c.amount}</div>
                        <div className="text-xs text-muted-foreground">{c.note || c.rate}</div>
                      </TableCell>
                      <TableCell className="gb-no-print whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => onOpenOrder(r.order.order_number)}>
                          查看訂單
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="py-10 text-center text-muted-foreground">
                      目前沒有符合條件的訂單資料。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default GroupBuyAnalyticsTab;
