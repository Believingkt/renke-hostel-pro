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
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, MinusCircle } from "lucide-react";

type CheckLevel = "ok" | "warn" | "error";

interface CheckResult {
  level: CheckLevel;
  label: string;
  /** 點擊後導向的設定頁（相對路徑）；沒有就不掛連結 */
  href?: string;
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
        const partnership: CheckResult = ps.length === 0
          ? { level: "error", label: "未設定合作期間", href: hqHref }
          : activePeriod
            ? { level: "ok", label: "合作中" }
            : { level: "warn", label: "目前無生效期間", href: hqHref };

        const rate = r ? num(r.commission_rate) : null;
        const settlementRule: CheckResult = !r
          ? { level: "error", label: "無生效費率規則", href: hqHref }
          : !rate || rate <= 0
            ? { level: "warn", label: "費率為 0%", href: hqHref }
            : { level: "ok", label: `${rate.toFixed(2)}%` };

        const marketingFee: CheckResult = !r
          ? { level: "error", label: "未設定", href: hqHref }
          : r.charges_marketing_fee === true
            ? { level: "ok", label: "有收取" }
            : { level: "warn", label: "未約定收取", href: hqHref };

        const bookingSetting: CheckResult = !b
          ? { level: "warn", label: "無訂房設定" }
          : b.manual_refund_fee_amount === null || b.manual_refund_fee_amount === undefined
            ? { level: "warn", label: "未設人工退款手續費" }
            : { level: "ok", label: "已設定" };

        let legacyRate: CheckResult = { level: "ok", label: "無殘留" };
        if (c && r) {
          const diffRate = Math.abs((num(r.commission_rate) ?? 0) - (num(c.rate) ?? 0)) > 0.001;
          const diffThreshold =
            Math.abs((num(r.commission_threshold) ?? 0) - (num(c.revenue_threshold) ?? 0)) > 0.5;
          if (diffRate || diffThreshold) legacyRate = { level: "warn", label: "舊表數值不同" };
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

        <div className="flex items-center gap-2">
          <Switch id="show-all-acc" checked={showAll} onCheckedChange={setShowAll} />
          <Label htmlFor="show-all-acc" className="text-sm">顯示全部館別（預設只顯示有缺漏）</Label>
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
                        </span>
                      );
                      return (
                        <TableCell key={c.key}>
                          {res.href && res.level !== "ok" ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => navigate(res.href!)}
                                  className="text-primary underline-offset-2 hover:underline"
                                >
                                  {content}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>前往此館的總部設定頁補齊</TooltipContent>
                            </Tooltip>
                          ) : (
                            content
                          )}
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
      </CardContent>
    </Card>
  );
}
