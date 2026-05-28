import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const RARITIES = ["N", "R", "SR", "SSR", "UR", "ck"] as const;
const DETAIL_RARITIES = ["N", "R", "SR", "SSR", "UR"] as const;
type Rarity = (typeof RARITIES)[number];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** 期別 → 日期區間（依 check_in_date）。null = 不限日期 */
function periodRange(year: number, period: string): { start: string; end: string } | null {
  if (period === "all") return null;
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
  return { start: `${year}-${pad(m)}-06`, end: `${year}-${pad(m)}-20` };
}

function periodMonth(period: string): number | null {
  if (period === "all") return null;
  const m = Number(period.split("-")[0]);
  return Number.isInteger(m) ? m : null;
}

function periodIsDayTen(period: string) {
  return period !== "all" && period.endsWith("-10");
}

function periodLabel(period: string): string {
  if (period === "all") return "全年";
  const [m, d] = period.split("-");
  return `${m}月${d}日`;
}

interface RarityRow {
  rarity: string;
  bonus_amount: number;
  effective_from: string;
}
interface TierRow {
  tier_name: string;
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
  venue_name: string | null;
}
interface ScoutProfile {
  user_id: string;
  display_name: string | null;
  is_scout_team_member: boolean;
}
interface KolProfileRow {
  scout_id: string | null;
  name: string | null;
  rarity: string | null;
  kpi_qualified: boolean | null;
  booking_status: string | null;
  check_in_date: string | null;
  kpi_month: string | null;
  cid_code: string | null;
  order_number: string | null;
  is_error: boolean | null;
  venue_name: string | null;
}

interface ScoutStats {
  scout_id: string;
  display_name: string;
  tier_name: string;
  is_scout_team_member: boolean;
  cumulative_count: number;
  qualified_count: number;
  rarityCounts: Record<Rarity, number>;
  rarity_bonus: number;
  pms_order_count: number;
  pms_order_total: number;
  commission_rate: number;
  kol_commission: number;
  individual_achieved: boolean;
  monthly_success_count: number;
  base_salary: number;
  team_bonus: number;
  total: number;
  targets: Array<{ venue_name: string; personal_min: number }>;
  total_personal_min: number;
  qualifiedKols: Array<{
    name: string;
    rarity: string;
    check_in_date: string | null;
    bonus: number;
  }>;
  orderItems: Array<{
    venue_name: string;
    order_number: string;
    final_price: number;
    commission: number;
    created_at: string | null;
  }>;
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
        : `${currentMonth === 12 ? 1 : currentMonth + 1}-10`;

  // 0 = 全部年份
  const [year, setYear] = useState<number>(currentYear);
  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ScoutStats[]>([]);
  const [selectedScout, setSelectedScout] = useState<ScoutStats | null>(null);

  const yearOptions = useMemo(() => {
    const arr: number[] = [0];
    for (let y = currentYear - 2; y <= currentYear + 1; y++) arr.push(y);
    return arr;
  }, [currentYear]);

  const periodOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [{ value: "all", label: "全年" }];
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
        const yearAll = year === 0;
        const effYear = yearAll ? currentYear : year;
        const asOfDate = `${effYear}-12-31`;
        const range = periodRange(effYear, period);
        const month = periodMonth(period);
        const showSalary = periodIsDayTen(period);
        const isAll = period === "all" || yearAll;

        const [rolesRes, profilesRes, rarityRes, tierRes, salaryRes, accsRes, targetsRes] = await Promise.all([
          supabase.from("user_roles").select("user_id, role").in("role", ["scout", "scout_manager"]),
          supabase
            .from("team_member_profiles")
            .select("user_id, display_name, is_scout_team_member"),
          supabase
            .from("kol_rarity_settings")
            .select("rarity, bonus_amount, effective_from")
            .lte("effective_from", asOfDate)
            .order("effective_from", { ascending: false }),
          supabase
            .from("scout_tier_settings")
            .select("tier_name, min_count, max_count, commission_rate, effective_from")
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
                .select("year, month, personal_min, venue_name")
                .eq("year", effYear)
                .eq("month", month)
            : Promise.resolve({ data: [] as TargetRow[], error: null }),
        ]);

        if (rolesRes.error) throw rolesRes.error;
        if (profilesRes.error) throw profilesRes.error;
        if (rarityRes.error) throw rarityRes.error;
        if (tierRes.error) throw tierRes.error;
        if (salaryRes.error) throw salaryRes.error;
        if (accsRes.error) throw accsRes.error;
        if (targetsRes.error) throw targetsRes.error;

        const scoutRoleIds = new Set<string>(
          ((rolesRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter(Boolean),
        );
        const allProfiles = (profilesRes.data ?? []) as ScoutProfile[];
        const scouts: ScoutProfile[] = allProfiles.filter((p) => scoutRoleIds.has(p.user_id));
        const scoutIds = scouts.map((s) => s.user_id);

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
        const tierFor = (count: number): TierRow | null => {
          for (const t of tiers) {
            if (count >= t.min_count && (t.max_count == null || count <= t.max_count)) return t;
          }
          return null;
        };
        const commissionRateFor = (count: number): number => Number(tierFor(count)?.commission_rate ?? 0);

        const salary = salaryRes.data as SalaryRow | null;
        const baseSalary = Number(salary?.base_salary ?? 0);
        const teamBonusAmount = Number(salary?.team_bonus ?? 0);
        const teamThresholdPct = Number(salary?.team_threshold_pct ?? 0);

        const pmsVenues = new Set(((accsRes.data ?? []) as { name: string }[]).map((a) => a.name));

        const targetRows = (targetsRes.data ?? []) as TargetRow[];
        const targetsList = targetRows.map((t) => ({
          venue_name: t.venue_name ?? "—",
          personal_min: Number(t.personal_min || 0),
        }));
        const totalPersonalMin = targetsList.reduce((s, t) => s + t.personal_min, 0);

        if (scoutIds.length === 0) {
          if (!cancelled) {
            setStats([]);
            setLoading(false);
          }
          return;
        }

        const { data: kolData, error: kolErr } = await supabase
          .from("kol_profiles")
          .select(
            "scout_id, name, rarity, kpi_qualified, booking_status, check_in_date, kpi_month, cid_code, order_number, is_error, venue_name",
          )
          .in("scout_id", scoutIds);
        if (kolErr) throw kolErr;
        const kolRows = (kolData ?? []) as KolProfileRow[];

        const inPeriod = (d: string | null): boolean => {
          if (!range) return true; // 全年 → 不限
          if (!d) return false;
          return d >= range.start && d <= range.end;
        };

        // 年份範圍（period != all 時用來限制累積邀約）
        const yearStart = `${effYear}-01-01`;
        const yearEnd = `${effYear}-12-31`;
        const inYearScope = (d: string | null): boolean => {
          if (isAll) return true;
          if (!d) return false;
          return d >= yearStart && d <= yearEnd;
        };

        // 期別內 PMS 內部訂單對應 cid
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

        const orderMap = new Map<
          string,
          {
            count: number;
            total: number;
            orders: Array<{ order_number: string; final_price: number; created_at: string | null }>;
          }
        >();
        if (allCidCodes.size > 0) {
          const { data: orders, error: ordErr } = await supabase
            .from("orders")
            .select("order_number, discount_code, final_price, created_at")
            .in("discount_code", Array.from(allCidCodes))
            .neq("order_status", "cancelled");
          if (ordErr) throw ordErr;
          for (const o of orders ?? []) {
            const row = o as {
              discount_code: string | null;
              final_price: number | null;
              order_number: string | null;
              created_at: string | null;
            };
            if (!row.discount_code) continue;
            const entry = orderMap.get(row.discount_code) ?? { count: 0, total: 0, orders: [] };
            entry.count += 1;
            entry.total += Number(row.final_price || 0);
            entry.orders.push({
              order_number: row.order_number ?? "",
              final_price: Number(row.final_price || 0),
              created_at: row.created_at,
            });
            orderMap.set(row.discount_code, entry);
          }
        }

        const monthStart = month ? `${effYear}-${pad(month)}-01` : null;
        const monthEnd = month ? (month === 12 ? `${effYear + 1}-01-01` : `${effYear}-${pad(month + 1)}-01`) : null;

        const results: ScoutStats[] = scouts.map((s) => {
          const rows = kolRows.filter((r) => r.scout_id === s.user_id);
          const cumulative = rows.filter(
            (r) => r.booking_status === "成功訂房" && !r.is_error && inYearScope(r.check_in_date),
          ).length;

          const tier = tierFor(cumulative);
          const tierName = tier?.tier_name ?? "—";

          const periodQualified = rows.filter((r) => r.kpi_qualified === true && inPeriod(r.check_in_date));
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
          const qualifiedKols: ScoutStats["qualifiedKols"] = [];
          for (const r of periodQualified) {
            const rar = (r.rarity ?? "") as Rarity;
            const bonus = rarityMap.get(rar) ?? 0;
            if (RARITIES.includes(rar)) {
              rarityCounts[rar] += 1;
              rarityBonus += bonus;
            }
            if (rar !== "ck") {
              qualifiedKols.push({
                name: r.name ?? "(未命名)",
                rarity: rar,
                check_in_date: r.check_in_date,
                bonus,
              });
            }
          }
          qualifiedKols.sort((a, b) => (a.check_in_date ?? "").localeCompare(b.check_in_date ?? ""));

          const cidCodes = cidByScout.get(s.user_id) ?? [];
          let pmsOrderCount = 0;
          let pmsOrderTotal = 0;
          const commissionRate = commissionRateFor(cumulative);
          const orderItems: ScoutStats["orderItems"] = [];
          const venueByCid = new Map<string, string>();
          for (const r of rows) {
            if (r.cid_code && r.venue_name) venueByCid.set(r.cid_code, r.venue_name);
          }
          for (const code of cidCodes) {
            const ord = orderMap.get(code);
            if (ord) {
              pmsOrderCount += ord.count;
              pmsOrderTotal += ord.total;
              for (const o of ord.orders) {
                orderItems.push({
                  venue_name: venueByCid.get(code) ?? "",
                  order_number: o.order_number,
                  final_price: o.final_price,
                  commission: Math.round(o.final_price * commissionRate),
                  created_at: o.created_at,
                });
              }
            }
          }
          const kolCommission = Math.round(pmsOrderTotal * commissionRate);

          let monthlySuccess = 0;
          let individualAchieved = false;
          if (month && monthStart && monthEnd) {
            monthlySuccess = rows.filter(
              (r) =>
                r.booking_status === "成功訂房" &&
                !r.is_error &&
                r.kpi_month &&
                r.kpi_month >= monthStart &&
                r.kpi_month < monthEnd,
            ).length;
            individualAchieved = totalPersonalMin > 0 && monthlySuccess >= totalPersonalMin;
          }
          const baseSalaryPayout = showSalary && s.is_scout_team_member && individualAchieved ? baseSalary : 0;

          return {
            scout_id: s.user_id,
            display_name: s.display_name ?? "未命名",
            tier_name: tierName,
            is_scout_team_member: !!s.is_scout_team_member,
            cumulative_count: cumulative,
            qualified_count: qualifiedCount,
            rarityCounts,
            rarity_bonus: rarityBonus,
            pms_order_count: pmsOrderCount,
            pms_order_total: pmsOrderTotal,
            commission_rate: commissionRate,
            kol_commission: kolCommission,
            individual_achieved: individualAchieved,
            monthly_success_count: monthlySuccess,
            base_salary: baseSalaryPayout,
            team_bonus: 0,
            total: 0,
            targets: targetsList,
            total_personal_min: totalPersonalMin,
            qualifiedKols,
            orderItems,
          };
        });

        // 過濾：當期沒有任何 kol_profile 記錄的星探不顯示
        const periodFiltered = results.filter((r) => {
          const rows = kolRows.filter((k) => k.scout_id === r.scout_id);
          if (!range) return rows.length > 0;
          return rows.some((k) => inPeriod(k.check_in_date));
        });

        let teamBonusPayout = 0;
        if (showSalary) {
          const teamMembers = periodFiltered.filter((r) => r.is_scout_team_member);
          if (teamMembers.length > 0) {
            const achieved = teamMembers.filter((r) => r.individual_achieved).length;
            const rate = (achieved / teamMembers.length) * 100;
            if (rate >= teamThresholdPct) teamBonusPayout = teamBonusAmount;
          }
        }
        for (const r of periodFiltered) {
          r.team_bonus = showSalary && r.is_scout_team_member ? teamBonusPayout : 0;
          r.total = r.rarity_bonus + r.kol_commission + r.base_salary + r.team_bonus;
        }


        if (!cancelled) {
          setStats(results.sort((a, b) => b.cumulative_count - a.cumulative_count));
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
                    {y === 0 ? "全部" : `${y} 年`}
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
                <TableHead className="text-right whitespace-nowrap">整年累積邀約</TableHead>
                <TableHead className="text-right whitespace-nowrap">本期符合資格</TableHead>
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
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    載入中…
                  </TableCell>
                </TableRow>
              ) : stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                stats.map((s) => (
                  <TableRow
                    key={s.scout_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedScout(s)}
                  >
                    <TableCell className="whitespace-nowrap font-medium">{s.display_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.cumulative_count}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold ${
                        s.qualified_count > 0 ? "text-orange-500" : "text-muted-foreground"
                      }`}
                    >
                      {s.qualified_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.rarity_bonus.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.pms_order_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{(s.commission_rate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{s.kol_commission.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {showSalary ? s.base_salary.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {showSalary ? s.team_bonus.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{s.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Sheet open={!!selectedScout} onOpenChange={(open) => !open && setSelectedScout(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedScout && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedScout.display_name} — {periodLabel(period)}業績明細
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <section>
                  <h3 className="text-sm font-semibold mb-2">本期符合資格 KOL 清單</h3>
                  <div className="overflow-x-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>KOL名稱</TableHead>
                          <TableHead>稀有度</TableHead>
                          <TableHead>入住日期</TableHead>
                          <TableHead className="text-right">單筆獎金</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedScout.qualifiedKols.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                              無資料
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedScout.qualifiedKols.map((k, i) => (
                            <TableRow key={i}>
                              <TableCell className="whitespace-nowrap">{k.name}</TableCell>
                              <TableCell>
                                {DETAIL_RARITIES.includes(k.rarity as (typeof DETAIL_RARITIES)[number])
                                  ? k.rarity
                                  : "—"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{k.check_in_date ?? "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">{k.bonus.toLocaleString()}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-2 text-right text-sm">
                    小計：
                    <span className="font-semibold tabular-nums ml-1">
                      {selectedScout.qualifiedKols.reduce((s, k) => s + k.bonus, 0).toLocaleString()}
                    </span>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold mb-2">KOL分潤訂單清單</h3>
                  <div className="overflow-x-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>館別</TableHead>
                          <TableHead>訂單編號</TableHead>
                          <TableHead className="whitespace-nowrap">訂購時間</TableHead>
                          <TableHead className="text-right">訂單金額</TableHead>
                          <TableHead className="text-right">分潤金額</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedScout.orderItems.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                              無資料
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedScout.orderItems.map((o, i) => (
                            <TableRow key={i}>
                              <TableCell className="whitespace-nowrap">{o.venue_name || "—"}</TableCell>
                              <TableCell className="whitespace-nowrap">{o.order_number || "—"}</TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                {o.created_at
                                  ? new Date(o.created_at).toLocaleString("zh-TW", {
                                      year: "numeric",
                                      month: "2-digit",
                                      day: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {o.final_price.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{o.commission.toLocaleString()}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-2 text-right text-sm">
                    小計：
                    <span className="font-semibold tabular-nums ml-1">
                      {selectedScout.orderItems.reduce((s, o) => s + o.commission, 0).toLocaleString()}
                    </span>
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
