import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
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

interface RagicRow {
  venue: string;
  business_unit: string;
  income_type: string;
  amount_twd: number;
  original_currency: string;
  exchange_rate: string | number;
  commission_rate: string;
  note: string;
  skipped?: boolean;
  reason?: string;
  no_fee_warning?: boolean;
  post_result?: {
    ok: boolean;
    action?: string;
    record_id?: string | number | null;
    error?: string;
  };
}

interface AccomResult {
  accommodation_id: string;
  accommodation_name: string;
  is_franchise: boolean;
  original_currency: string;
  exchange_rate: number;
  revenue_twd: number;
  management_fee_twd: number;
  fee_config: { rate: number; threshold: number } | null;
  payloads?: Array<Record<string, string>>;
  skipped?: boolean;
  reason?: string;
  ragic_responses?: Array<any>;
}

interface SkipEntry {
  accommodation_id: string;
  accommodation_name: string;
  scope?: "venue" | "row";
  gate?: string;
  income_type?: string;
  skip_reason: string;
  detail?: string;
  has_commission_setting?: boolean;
  charges_marketing_fee?: boolean;
  revenue_twd?: number;
  gross_revenue_twd?: number;
}

const SKIP_REASON_LABEL: Record<string, string> = {
  no_active_partnership: "無合作期間紀錄",
  partnership_ended: "不在合作期間內",
  no_commission_no_marketing: "無抽成設定且未收月費",
  no_commission_setting: "無管顧抽成設定",
  under_threshold: "未達抽成門檻",
  no_revenue: "當月無可計營收",
  marketing_fee_not_contracted: "合約未約定行銷推廣費",
};

const GATE_LABEL: Record<string, string> = {
  A: "合作期間",
  B: "抽成設定",
  C: "月費勾選",
  "B+C": "抽成設定 + 月費勾選",
};

// Field IDs must stay in sync with the edge function
const F = {
  BUSINESS_UNIT: "1001017",
  INCOME_TYPE: "1001018",
  AMOUNT: "1001010",
  VENUE: "1001008",
  COMMISSION_RATE: "1001019",
  COMMISSION_FEE: "1001020",
  EXCHANGE_RATE: "1001021",
  NOTE: "1001022",
  ORIGINAL_CURRENCY: "1001023",
};

function nowLastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function flatten(results: AccomResult[]): RagicRow[] {
  const rows: RagicRow[] = [];
  for (const r of results) {
    if (r.skipped) {
      rows.push({
        venue: r.accommodation_name,
        business_unit: "-",
        income_type: "-",
        amount_twd: 0,
        original_currency: r.original_currency,
        exchange_rate: r.original_currency === "JPY" ? (r.exchange_rate ?? "") : "",
        commission_rate: "",
        note: "",
        skipped: true,
        reason: r.reason ?? "no_revenue",
      });
      continue;
    }
    const payloads = r.payloads ?? [];
    const responses = r.ragic_responses ?? [];
    payloads.forEach((p, idx) => {
      const resp = responses[idx];
      rows.push({
        venue: p[F.VENUE],
        business_unit: p[F.BUSINESS_UNIT],
        income_type: p[F.INCOME_TYPE],
        amount_twd: Number(p[F.AMOUNT] || 0),
        original_currency: p[F.ORIGINAL_CURRENCY],
        exchange_rate: p[F.EXCHANGE_RATE] || "",
        commission_rate: p[F.COMMISSION_RATE] || "",
        note: p[F.NOTE] || "",
        no_fee_warning: !!p[F.NOTE] && r.revenue_twd > 0 && r.management_fee_twd === 0,
        post_result: resp
          ? {
              ok: !!resp.ok,
              action: resp.action,
              record_id: resp.record_id,
              error: resp.ok ? undefined : (resp.body?.msg ?? JSON.stringify(resp.body ?? "")),
            }
          : undefined,
      });
    });
  }
  return rows;
}

export default function RagicSyncTab() {
  const init = nowLastMonth();
  const [year, setYear] = useState<number>(init.year);
  const [month, setMonth] = useState<number>(init.month);
  const [loading, setLoading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [rows, setRows] = useState<RagicRow[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipped, setSkipped] = useState<SkipEntry[] | null>(null);
  const [showSkipped, setShowSkipped] = useState(true);
  const [previewedAt, setPreviewedAt] = useState<{ year: number; month: number } | null>(null);



  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const call = async (dry_run: boolean) => {
    const { data, error } = await supabase.functions.invoke("push-ragic-revenue", {
      body: { year, month, dry_run, mode: "upsert" },
    });
    if (error) throw new Error(error.message ?? "呼叫失敗");
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as { results: AccomResult[]; skipped?: SkipEntry[] };
  };

  const handlePreview = async () => {
    setLoading(true);
    try {
      const data = await call(true);
      setRows(flatten(data.results));
      setSkipped(data.skipped ?? []);
      setPreviewedAt({ year, month });
      toast.success("預覽完成");
    } catch (e: any) {
      toast.error(e.message || "預覽失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleWrite = async () => {
    setWriting(true);
    try {
      const data = await call(false);
      const flat = flatten(data.results);
      setRows(flat);
      setSkipped(data.skipped ?? []);
      setPreviewedAt({ year, month });

      const posted = flat.filter((r) => r.post_result);
      const ok = posted.filter((r) => r.post_result?.ok).length;
      const fail = posted.length - ok;
      if (fail === 0) toast.success(`寫入成功 ${ok} 筆`);
      else toast.warning(`成功 ${ok} 筆，失敗 ${fail} 筆`);
    } catch (e: any) {
      toast.error(e.message || "寫入失敗");
    } finally {
      setWriting(false);
      setConfirmOpen(false);
    }
  };

  const isStale =
    !!rows &&
    !!previewedAt &&
    (previewedAt.year !== year || previewedAt.month !== month);
  const hasPreview = rows && rows.length > 0 && !isStale;
  const postedCount = rows?.filter((r) => r.post_result).length ?? 0;


  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">上傳至Ragic收入總表</CardTitle>
        <p className="text-sm text-muted-foreground">
          預覽並上傳指定月份的 PMS 營收至 Ragic「收入來源」表單。
          <br />
          以「年月份 + 場域館別 + 收入類型」比對，已存在資料更新，不存在資料則新增。
          <br />
          <span className="text-xs">
            ※ 月份篩選＝該月內實際入住晚數對應的營收（跨月訂單會拆分計算），非以訂單日或退房日歸屬。
          </span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>年份</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>月份</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handlePreview} disabled={loading || writing}>
            {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            預覽
          </Button>
          <Button
            variant="default"
            onClick={() => setConfirmOpen(true)}
            disabled={!hasPreview || writing || loading}
          >
            {writing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            確認寫入 Ragic
          </Button>
        </div>

        {rows && (
          <div className="text-sm text-muted-foreground">
            共 {rows.length} 筆
            {postedCount > 0 && `（已送出 ${postedCount} 筆）`}
            ・計算範圍是{year}年{month}月1日～{month}月{new Date(year, month, 0).getDate()}日
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>館別</TableHead>
                <TableHead>事業單位</TableHead>
                <TableHead>收入類型</TableHead>
                <TableHead className="text-right">金額 (TWD)</TableHead>
                <TableHead>原始幣別</TableHead>
                <TableHead>匯率</TableHead>
                <TableHead className="text-right">抽成%</TableHead>
                <TableHead>備註 / 狀態</TableHead>
                {postedCount > 0 && <TableHead>寫入結果</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!rows && (
                <TableRow>
                  <TableCell colSpan={postedCount > 0 ? 9 : 8} className="text-center text-muted-foreground py-8">
                    請先按「預覽」
                  </TableCell>
                </TableRow>
              )}
              {rows?.map((r, i) => (
                <TableRow key={i} className={r.no_fee_warning ? "bg-yellow-50 dark:bg-yellow-950/20" : r.skipped ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{r.venue}</TableCell>
                  <TableCell>{r.business_unit}</TableCell>
                  <TableCell>{r.income_type}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.skipped ? "—" : r.amount_twd.toLocaleString()}
                  </TableCell>
                  <TableCell>{r.original_currency}</TableCell>
                  <TableCell>{r.exchange_rate || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.skipped || !r.commission_rate || r.income_type === "門市運營" ? "—" : `${(Number(r.commission_rate) * 100).toFixed(2).replace(/\.?0+$/, "")}%`}
                  </TableCell>
                  <TableCell className="max-w-[300px]">

                    {r.skipped ? (
                      <Badge variant="secondary">
                        {r.reason === "under_threshold" ? "已跳過：未達抽成門檻" : "已跳過：無訂單"}
                      </Badge>
                    ) : r.no_fee_warning ? (
                      <div className="flex items-start gap-1 text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span className="text-xs">{r.note}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.note || "—"}</span>
                    )}
                  </TableCell>
                  {postedCount > 0 && (
                    <TableCell>
                      {r.post_result ? (
                        r.post_result.ok ? (
                          <div className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="h-4 w-4" />
                            {r.post_result.action === "update" ? "更新" : "新增"}
                          </div>
                        ) : (
                          <div className="flex items-start gap-1 text-red-600 text-xs">
                            <XCircle className="h-4 w-4 flex-shrink-0" />
                            <span className="break-all">{r.post_result.error}</span>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {skipped && skipped.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5">
            <button
              type="button"
              onClick={() => setShowSkipped((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                被排除的館別／列（{skipped.length}）
              </span>
              <span className="text-xs text-muted-foreground">
                {showSkipped ? "收合" : "展開"}
              </span>
            </button>
            {showSkipped && (
              <div className="overflow-x-auto border-t border-amber-500/30">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>館別</TableHead>
                      <TableHead>範圍</TableHead>
                      <TableHead>收入類型</TableHead>
                      <TableHead>排除原因</TableHead>
                      <TableHead>判定閘門</TableHead>
                      <TableHead className="text-right">當月營收</TableHead>
                      <TableHead>說明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {skipped.map((s, i) => (
                      <TableRow key={`${s.accommodation_id}-${i}`}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {s.accommodation_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={s.scope === "row" ? "outline" : "secondary"}>
                            {s.scope === "row" ? "單列" : "整館"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {s.income_type ?? "全部"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-amber-700 dark:text-amber-400">
                          {SKIP_REASON_LABEL[s.skip_reason] ?? s.skip_reason}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {s.gate ? (GATE_LABEL[s.gate] ?? s.gate) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {typeof s.revenue_twd === "number"
                            ? s.revenue_twd.toLocaleString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.detail ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>


      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認寫入 Ragic？</AlertDialogTitle>
            <AlertDialogDescription>
              將以「年月份 + 場域館別 + 收入類型」比對，存在則更新，不存在則新增。
              常用分錄、借貸科目、傳票號碼欄位不會被覆蓋。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={writing}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); handleWrite(); }} disabled={writing}>
              {writing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              確認寫入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
