import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, ArrowUpRight, CheckCircle2, RefreshCw, XCircle, MinusCircle } from "lucide-react";

type CheckLevel = "ok" | "warn" | "error";

interface CheckResult {
  level: CheckLevel;
  label: string;
  /** 點擊後導向的設定頁（相對路徑）；沒有就不掛連結 */
  href?: string;
  /** 修補指引：告訴使用者要去哪裡、做什麼 */
  hint?: string;
  /** 目標頁面名稱（彈窗顯示） */
  target?: string;
  /** 需要補齊的欄位清單（彈窗顯示） */
  fields?: string[];
}


interface Row {
  accId: string;
  accName: string;
  partnership: CheckResult;
  settlementRule: CheckResult;
  marketingFee: CheckResult;
  bookingSetting: CheckResult;
  legacyRate: CheckResult;
}

const CHECKS = [
  { key: "partnership", label: "合作期間" },
  { key: "settlementRule", label: "業主月結費率" },
  { key: "marketingFee", label: "行銷推廣費約定" },
  { key: "bookingSetting", label: "訂房設定" },
  { key: "legacyRate", label: "歷史費率殘留" },
] as const;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function LevelIcon({ level }: { level: CheckLevel }) {
  if (level === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

/**
 * 館別設定完整性儀表板（唯讀）
 * 逐館檢查「會影響營收計算／Ragic 匯出」的關鍵設定是否齊備，
 * 紅色代表該館會被 Ragic 排除，黃色代表建議補上但不影響計算。
 */
export default function RateConsistencyCheckTab() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [fix, setFix] = useState<{ accName: string; checkLabel: string; res: CheckResult } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [
        { data: accData },
        { data: ruleData },
        { data: consultData },
        { data: periodData },
        { data: bookingData },
      ] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, is_active")
          .eq("is_active", true)
          .neq("name", "奧丁丁測試")
          .order("name"),
        supabase
          .from("owner_settlement_pricing_rules")
          .select("accommodation_id, commission_rate, commission_threshold, charges_marketing_fee, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
        supabase
          .from("consulting_fee_settings")
          .select("accommodation_id, rate, revenue_threshold, effective_from")
          .lte("effective_from", today)
          .order("effective_from", { ascending: false }),
        supabase
          .from("accommodation_partnership_periods")
          .select("accommodation_id, start_date, end_date"),
        supabase
          .from("booking_settings")
          .select("accommodation_id, manual_refund_fee_amount"),
      ]);

      const rules = (ruleData ?? []) as any[];
      const consults = (consultData ?? []) as any[];
      const periods = (periodData ?? []) as any[];
      const bookings = (bookingData ?? []) as any[];

      const out: Row[] = ((accData ?? []) as any[]).map((a) => {
        const r = rules.find((x) => x.accommodation_id === a.id);
        const c = consults.find((x) => x.accommodation_id === a.id);
        const ps = periods.filter((x) => x.accommodation_id === a.id);
        const b = bookings.find((x) => x.accommodation_id === a.id);

        const hqHref = `/hq/bonus-settings?tab=owner-settlement&acc=${a.id}`;

        const activePeriod = ps.some((p) => {
          const s = String(p.start_date ?? "").slice(0, 10);
          const e = p.end_date ? String(p.end_date).slice(0, 10) : null;
          return s && today >= s && (e === null || today <= e);
        });
        const HQ_TARGET = "總部設定頁 →「基準金額規則（業主月結）」";
        const partnership: CheckResult = ps.length === 0
          ? { level: "error", label: "未設定合作期間", href: hqHref, target: HQ_TARGET, fields: ["合作起始日", "合作結束日（未定可留空）"], hint: "到總部設定頁 →「合作期間」新增起訖日，否則此館營收不會送出 Ragic。" }
          : activePeriod
            ? { level: "ok", label: "合作中" }
            : { level: "warn", label: "目前無生效期間", href: hqHref, target: HQ_TARGET, fields: ["合作結束日（是否需延長）", "新的合作期間起訖日"], hint: "合作期間已結束或尚未開始，請確認起訖日是否需要延長。" };

        const rate = r ? num(r.commission_rate) : null;
        const settlementRule: CheckResult = !r
          ? { level: "error", label: "無生效費率規則", href: hqHref, target: HQ_TARGET, fields: ["生效日（需 ≤ 今天）", "管顧費率 %", "營收門檻"], hint: "到總部設定頁 →「業主月結設定」新增一筆生效中的費率規則（生效日需 ≤ 今天）。" }
          : !rate || rate <= 0
            ? { level: "warn", label: "費率為 0%", href: hqHref, target: HQ_TARGET, fields: ["管顧費率 %"], hint: "目前費率為 0%，若非刻意設定請到總部設定頁修正管顧費率。" }
            : { level: "ok", label: `${rate.toFixed(2)}%` };

        const marketingFee: CheckResult = !r
          ? { level: "error", label: "未設定", href: hqHref, target: HQ_TARGET, fields: ["先新增一筆月結費率規則", "勾選是否收取行銷推廣費"], hint: "沒有月結費率規則就無法判斷是否收行銷推廣費，請先新增費率規則。" }
          : r.charges_marketing_fee === true
            ? { level: "ok", label: "有收取" }
            : { level: "warn", label: "未約定收取", href: hqHref, target: HQ_TARGET, fields: ["收取行銷推廣費（勾選）"], hint: "若此館合約有收行銷推廣費，請到總部設定頁勾選「收取行銷推廣費」。" };

        const bookingSetting: CheckResult = !b
          ? { level: "warn", label: "無訂房設定", target: "該館後台 →「訂房設定」", fields: ["建立訂房設定基本資料", "人工退款手續費金額"], hint: "此館尚未建立訂房設定，請到該館後台「訂房設定」建立基本設定。" }
          : b.manual_refund_fee_amount === null || b.manual_refund_fee_amount === undefined
            ? { level: "warn", label: "未設人工退款手續費", target: "該館後台 →「訂房設定」", fields: ["人工退款手續費金額"], hint: "到該館後台「訂房設定」填寫人工退款手續費金額，退款時才能正確扣除。" }
            : { level: "ok", label: "已設定" };

        let legacyRate: CheckResult = { level: "ok", label: "無殘留" };
        if (c && r) {
          const diffRate = Math.abs((num(r.commission_rate) ?? 0) - (num(c.rate) ?? 0)) > 0.001;
          const diffThreshold =
            Math.abs((num(r.commission_threshold) ?? 0) - (num(c.revenue_threshold) ?? 0)) > 0.5;
          if (diffRate || diffThreshold)
            legacyRate = {
              level: "warn",
              label: "舊表數值不同",
              hint: "歷史管顧費率表殘留舊數值，僅供查詢不影響計算；可到總部設定頁確認後刪除舊版本。",
              target: HQ_TARGET,
              fields: ["確認最新費率／門檻正確", "刪除歷史管顧費率表的舊版本"],
              href: hqHref,
            };
        }


        return { accId: a.id, accName: a.name, partnership, settlementRule, marketingFee, bookingSetting, legacyRate };
      });

      const weight = (row: Row) => {
        const levels = CHECKS.map((c) => row[c.key].level);
        if (levels.includes("error")) return 0;
        if (levels.includes("warn")) return 1;
        return 2;
      };
      out.sort((a, b) => weight(a) - weight(b) || a.accName.localeCompare(b.accName));
      setRows(out);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let complete = 0;
    let warn = 0;
    let error = 0;
    for (const row of rows) {
      const levels = CHECKS.map((c) => row[c.key].level);
      if (levels.includes("error")) error += 1;
      else if (levels.includes("warn")) warn += 1;
      else complete += 1;
    }
    return { complete, warn, error };
  }, [rows]);

  const visibleRows = showAll
    ? rows
    : rows.filter((row) => CHECKS.some((c) => row[c.key].level !== "ok"));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>館別設定完整性檢查（唯讀）</CardTitle>
            <CardDescription>
              逐館檢查會影響營收計算與 Ragic 匯出的關鍵設定是否齊備。
              <span className="text-destructive font-medium">紅色</span> 代表該館會被 Ragic 匯出排除，
              <span className="text-amber-600 font-medium">黃色</span> 為建議補齊但不影響計算。此頁不會修改任何設定。
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            重新檢查
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!loading && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">設定完整</div>
              <div className="text-xl font-bold tabular-nums">{stats.complete}</div>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">有缺漏（不影響計算）</div>
              <div className="text-xl font-bold tabular-nums">{stats.warn}</div>
            </div>
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
              <div className="text-xs text-muted-foreground">嚴重（會被 Ragic 排除）</div>
              <div className="text-xl font-bold tabular-nums">{stats.error}</div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch id="show-all-acc" checked={showAll} onCheckedChange={setShowAll} />
            <Label htmlFor="show-all-acc" className="text-sm">顯示全部館別（預設只顯示有缺漏）</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            提示：有 <span className="underline decoration-dotted">底線與 <ArrowUpRight className="inline h-3 w-3" /> 箭頭</span> 的格子可直接點擊，會帶你到對應設定頁修補。
          </p>
        </div>

        <TooltipProvider>
          <div className="overflow-x-auto">
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow>
                  <TableHead>館別</TableHead>
                  {CHECKS.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.accId}>
                    <TableCell className="whitespace-nowrap font-medium">{row.accName}</TableCell>
                    {CHECKS.map((c) => {
                      const res = row[c.key];
                      const content = (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
                          <LevelIcon level={res.level} />
                          <span className={res.level === "ok" ? "text-muted-foreground" : ""}>{res.label}</span>
                          {res.level !== "ok" && <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />}
                        </span>
                      );
                      if (res.level === "ok") {
                        return <TableCell key={c.key}>{content}</TableCell>;
                      }
                      return (
                        <TableCell key={c.key}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setFix({ accName: row.accName, checkLabel: c.label, res })}
                                className="rounded text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {content}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px]">
                              <p className="text-xs leading-relaxed">
                                {res.hint ?? "此項目尚未設定完成。"}
                              </p>
                              <p className="mt-1 text-xs font-medium">點擊查看修補指引 →</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}

                {visibleRows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={CHECKS.length + 1} className="py-8 text-center text-sm text-muted-foreground">
                      <MinusCircle className="mr-1 inline h-4 w-4" />
                      所有館別設定皆完整。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>

        <Dialog open={!!fix} onOpenChange={(o) => !o && setFix(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {fix && <LevelIcon level={fix.res.level} />}
                {fix?.accName}：{fix?.checkLabel}
              </DialogTitle>
              <DialogDescription>依下列指引補齊設定，完成後回來按「已完成，重新檢查」。</DialogDescription>
            </DialogHeader>

            {fix && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-muted-foreground">缺漏原因</div>
                  <p className="mt-1 leading-relaxed">
                    <Badge variant={fix.res.level === "error" ? "destructive" : "secondary"} className="mr-2">
                      {fix.res.level === "error" ? "嚴重（會被 Ragic 排除）" : "建議補齊"}
                    </Badge>
                    {fix.res.hint ?? "此項目尚未設定完成。"}
                  </p>
                </div>
                <div>
                  <div className="text-xs font-medium text-muted-foreground">要到哪個頁面</div>
                  <p className="mt-1">{fix.res.target ?? "對應設定頁"}</p>
                </div>
                {fix.res.fields?.length ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">需要補的欄位</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {fix.res.fields.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setFix(null);
                  load();
                }}
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                已完成，重新檢查
              </Button>
              {fix?.res.href && (
                <Button
                  onClick={() => {
                    const href = fix.res.href!;
                    setFix(null);
                    navigate(href);
                  }}
                >
                  前往設定頁
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
