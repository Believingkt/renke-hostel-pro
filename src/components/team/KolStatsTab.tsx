import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const RARITIES = ["N", "R", "SR", "SSR", "UR", "ck"] as const;
type Rarity = (typeof RARITIES)[number];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 期別 → 日期區間（依 check_in_date） */
function periodRange(year: number, period: string): { start: string; end: string } | null {
  if (period === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const m = Number(period.split("-")[0]);
  const d = Number(period.split("-")[1]);
  if (!Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (d === 10) {
    let pm = m - 1;
    let py = year;
    if (pm === 0) {
      pm = 12;
      py = year - 1;
    }
    return { start: `${py}-${pad(pm)}-21`, end: `${year}-${pad(m)}-05` };
  }
  // 25
  return { start: `${year}-${pad(m)}-06`, end: `${year}-${pad(m)}-20` };
}

/** 「X月10日」這類期別取出對應的「當月」（用於底薪計算） */
function periodMonth(period: string): number | null {
  if (period === "year") return null;
  const m = Number(period.split("-")[0]);
  return Number.isInteger(m) ? m : null;
}

function periodIsDayTen(period: string) {
  return period !== "year" && period.endsWith("-10");
}

interface RarityRow {
  rarity: string;
  bonus_amount: number;
  effective_from: string;
}
interface TierRow {
  min_count: number;
  max_count: number | null;
  commission_rate: number;
  effective_from: string;
}
interface SalaryRow {
  base_salary: number;
  team_bonus: number;
  team_threshold_pct: number;
  effective_from: string;
}
interface TargetRow {
  year: number;
  month: number;
  personal_min: number;
}
interface ScoutProfile {
  user_id: string;
  display_name: string | null;
}
interface KolProfileRow {
  scout_id: string | null;
  rarity: string | null;
  kpi_qualified: boolean | null;
  booking_status: string | null;
  check_in_date: string | null;
  kpi_month: string | null;
  cid_code: string | null;
  is_error: boolean | null;
  venue_name: string | null;
}

interface ScoutStats {
  scout_id: string;
  display_name: string;
  cumulative_count: number;
  qualified_count: number;
  rarityCounts: Record<Rarity, number>;
  rarity_bonus: number;
  pms_order_count: number;
  pms_order_total: number;
  commission_rate: number;
  kol_commission: number;
  individual_achieved: boolean;
  base_salary: number;
  team_bonus: number;
  total: number;
}

export function KolStatsTab() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const defaultPeriod =
    today.getDate() <= 5
      ? `${currentMonth}-10`
      : today.getDate() <= 20
        ? `${currentMonth}-25`
        : `${currentMonth}-10`;

  const [year, setYear] = useState<number>(currentYear);
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ScoutStats[]>([]);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear - 2; y <= currentYear + 1; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const periodOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [
      { value: "year", label: "全年" },
    ];
    for (let m = 1; m <= 12; m++) {
      arr.push({ value: `${m}-10`, label: `${m}月10日` });
      arr.push({ value: `${m}-25`, label: `${m}月25日` });
    }
    return arr;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const asOfDate = `${year}-12-31`;
        const range = periodRange(year, period);
        const month = periodMonth(period);
        const showSalary = periodIsDayTen(period);

        const [scoutsRes, rarityRes, tierRes, salaryRes, accsRes, targetsRes] =
          await Promise.all([
            supabase
              .from("team_member_profiles")
              .select("user_id, display_name")
              .eq("is_scout_team_member", true),
            supabase
              .from("kol_rarity_settings")
              .select("rarity, bonus_amount, effective_from")
              .lte("effective_from", asOfDate)
              .order("effective_from", { ascending: false }),
            supabase
              .from("scout_tier_settings")
              .select("min_count, max_count, commission_rate, effective_from")
              .lte("effective_from", asOfDate)
              .order("effective_from", { ascending: false }),
            supabase
              .from("scout_salary_settings")
              .select("base_salary, team_bonus, team_threshold_pct, effective_from")
              .lte("effective_from", asOfDate)
              .order("effective_from", { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from("accommodation_info").select("name"),
            month
              ? supabase
                  .from("scout_team_targets")
                  .select("year, month, personal_min")
                  .eq("year", year)
                  .eq("month", month)
              : Promise.resolve({ data: [] as TargetRow[], error: null }),
          ]);

        if (scoutsRes.error) throw scoutsRes.error;
        if (rarityRes.error) throw rarityRes.error;
        if (tierRes.error) throw tierRes.error;
        if (salaryRes.error) throw salaryRes.error;
        if (accsRes.error) throw accsRes.error;
        if (targetsRes.error) throw targetsRes.error;

        const scouts: ScoutProfile[] = (scoutsRes.data ?? []) as ScoutProfile[];
        const scoutIds = scouts.map((s) => s.user_id);

        // 取最新版本（依 rarity 第一筆 / 依 tier 區間 第一筆）
        const rarityMap = new Map<string, number>();
        for (const r of (rarityRes.data ?? []) as RarityRow[]) {
          if (!rarityMap.has(r.rarity)) {
            rarityMap.set(r.rarity, Number(r.bonus_amount || 0));
          }
        }
        const tierKey = (t: TierRow) => `${t.min_count}-${t.max_count ?? "inf"}`;
        const tierMap = new Map<string, TierRow>();
        for (const t of (tierRes.data ?? []) as TierRow[]) {
          if (!tierMap.has(tierKey(t))) tierMap.set(tierKey(t), t);
        }
        const tiers = [...tierMap.values()].sort((a, b) => a.min_count - b.min_count);
        const commissionRateFor = (count: number): number => {
          for (const t of tiers) {
            if (count >= t.min_count && (t.max_count == null || count <= t.max_count)) {
              return Number(t.commission_rate || 0);
            }
          }
          return 0;
        };

        const salary = salaryRes.data as SalaryRow | null;
        const baseSalary = Number(salary?.base_salary ?? 0);
        const teamBonusAmount = Number(salary?.team_bonus ?? 0);
        const teamThresholdPct = Number(salary?.team_threshold_pct ?? 0);

        const pmsVenues = new Set(
          ((accsRes.data ?? []) as { name: string }[]).map((a) => a.name),
        );

        const totalPersonalMin = ((targetsRes.data ?? []) as TargetRow[]).reduce(
          (s, t) => s + Number(t.personal_min || 0),
          0,
        );

        if (scoutIds.length === 0) {
          if (!cancelled) {
            setStats([]);
            setLoading(false);
          }
          return;
        }

        // 一次撈所有相關 kol_profiles
        const { data: kolData, error: kolErr } = await supabase
          .from("kol_profiles")
          .select(
            "scout_id, rarity, kpi_qualified, booking_status, check_in_date, kpi_month, cid_code, is_error, venue_name",
          )
          .in("scout_id", scoutIds);
        if (kolErr) throw kolErr;
        const kolRows = (kolData ?? []) as KolProfileRow[];

        // 期別內所有「PMS 內部 + 有 cid_code + 成功訂房 + 非錯誤」筆，給 orders 查詢
        const inPeriod = (d: string | null): boolean => {
          if (!d || !range) return false;
          return d >= range.start && d <= range.end;
        };
        const cidByScout = new Map<string, string[]>();
        const allCidCodes = new Set<string>();
        for (const r of kolRows) {
          if (!r.scout_id) continue;
          if (r.booking_status !== "成功訂房") continue;
          if (r.is_error) continue;
          if (!r.cid_code) continue;
          if (!pmsVenues.has(r.venue_name ?? "")) continue;
          if (!inPeriod(r.check_in_date)) continue;
          const arr = cidByScout.get(r.scout_id) ?? [];
          arr.push(r.cid_code);
          cidByScout.set(r.scout_id, arr);
          allCidCodes.add(r.cid_code);
        }

        const orderMap = new Map<string, { count: number; total: number }>();
        if (allCidCodes.size > 0) {
          const { data: orders, error: ordErr } = await supabase
            .from("orders")
            .select("discount_code, final_price")
            .in("discount_code", Array.from(allCidCodes))
            .neq("order_status", "cancelled");
          if (ordErr) throw ordErr;
          for (const o of orders ?? []) {
            const code = (o as { discount_code: string | null }).discount_code;
            if (!code) continue;
            const entry = orderMap.get(code) ?? { count: 0, total: 0 };
            entry.count += 1;
            entry.total += Number((o as { final_price: number | null }).final_price || 0);
            orderMap.set(code, entry);
          }
        }

        // 計算每位星探
        const monthStart = month ? `${year}-${pad(month)}-01` : null;
        const monthEnd = month
          ? month === 12
            ? `${year + 1}-01-01`
            : `${year}-${pad(month + 1)}-01`
          : null;

        const results: ScoutStats[] = scouts.map((s) => {
          const rows = kolRows.filter((r) => r.scout_id === s.user_id);
          const cumulative = rows.filter(
            (r) => r.booking_status === "成功訂房" && !r.is_error,
          ).length;

          const periodQualified = rows.filter(
            (r) => r.kpi_qualified === true && inPeriod(r.check_in_date),
          );
          const qualifiedCount = periodQualified.length;
          const rarityCounts: Record<Rarity, number> = {
            N: 0,
            R: 0,
            SR: 0,
            SSR: 0,
            UR: 0,
            ck: 0,
          };
          let rarityBonus = 0;
          for (const r of periodQualified) {
            const rar = (r.rarity ?? "") as Rarity;
            if (RARITIES.includes(rar)) {
              rarityCounts[rar] += 1;
              rarityBonus += rarityMap.get(rar) ?? 0;
            }
          }

          const cidCodes = cidByScout.get(s.user_id) ?? [];
          let pmsOrderCount = 0;
          let pmsOrderTotal = 0;
          for (const code of cidCodes) {
            const ord = orderMap.get(code);
            if (ord) {
              pmsOrderCount += ord.count;
              pmsOrderTotal += ord.total;
            }
          }
          const commissionRate = commissionRateFor(cumulative);
          const kolCommission = Math.round(pmsOrderTotal * commissionRate);

          // 底薪：依當月 kpi_month 範圍累積成功邀約數 vs 所有場域 personal_min 加總
          let individualAchieved = false;
          if (showSalary && month && monthStart && monthEnd) {
            const monthCount = rows.filter(
              (r) =>
                r.booking_status === "成功訂房" &&
                !r.is_error &&
                r.kpi_month &&
                r.kpi_month >= monthStart &&
                r.kpi_month < monthEnd,
            ).length;
            individualAchieved =
              totalPersonalMin > 0 && monthCount >= totalPersonalMin;
          }
          const baseSalaryPayout = showSalary && individualAchieved ? baseSalary : 0;

          return {
            scout_id: s.user_id,
            display_name: s.display_name ?? "未命名",
            cumulative_count: cumulative,
            qualified_count: qualifiedCount,
            rarityCounts,
            rarity_bonus: rarityBonus,
            pms_order_count: pmsOrderCount,
            pms_order_total: pmsOrderTotal,
            commission_rate: commissionRate,
            kol_commission: kolCommission,
            individual_achieved: individualAchieved,
            base_salary: baseSalaryPayout,
            team_bonus: 0,
            total: 0,
          };
        });

        // 團隊達標：當月個人達標比例
        let teamBonusPayout = 0;
        if (showSalary && results.length > 0) {
          const achieved = results.filter((r) => r.individual_achieved).length;
          const rate = (achieved / results.length) * 100;
          if (rate >= teamThresholdPct) teamBonusPayout = teamBonusAmount;
        }
        for (const r of results) {
          r.team_bonus = showSalary ? teamBonusPayout : 0;
          r.total = r.rarity_bonus + r.kol_commission + r.base_salary + r.team_bonus;
        }

        if (!cancelled) {
          setStats(
            results.sort((a, b) => b.cumulative_count - a.cumulative_count),
          );
          setLoading(false);
        }
      } catch (e) {
        console.error("[KolStatsTab] load error:", e);
        if (!cancelled) {
          setStats([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, period]);

  const showSalary = periodIsDayTen(period);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">年份</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[120px]">
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
          </div>
          <div className="space-y-1">
            <Label className="text-xs">發放期別</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">星探</TableHead>
                <TableHead className="text-right whitespace-nowrap">累積邀約</TableHead>
                <TableHead className="text-right whitespace-nowrap">符合資格</TableHead>
                {RARITIES.map((r) => (
                  <TableHead key={r} className="text-right whitespace-nowrap">
                    {r}
                  </TableHead>
                ))}
                <TableHead className="text-right whitespace-nowrap">稀有度獎金</TableHead>
                <TableHead className="text-right whitespace-nowrap">KOL分潤訂單</TableHead>
                <TableHead className="text-right whitespace-nowrap">分潤%</TableHead>
                <TableHead className="text-right whitespace-nowrap">KOL分潤金額</TableHead>
                <TableHead className="text-right whitespace-nowrap">底薪</TableHead>
                <TableHead className="text-right whitespace-nowrap">團隊獎金</TableHead>
                <TableHead className="text-right whitespace-nowrap">合計</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    載入中…
                  </TableCell>
                </TableRow>
              ) : stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                stats.map((s) => (
                  <TableRow key={s.scout_id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {s.display_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.cumulative_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.qualified_count}
                    </TableCell>
                    {RARITIES.map((r) => (
                      <TableCell key={r} className="text-right tabular-nums">
                        {s.rarityCounts[r]}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">
                      {s.rarity_bonus.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.pms_order_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {(s.commission_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.kol_commission.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {showSalary ? s.base_salary.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {showSalary ? s.team_bonus.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {s.total.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
