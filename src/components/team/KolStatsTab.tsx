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

/**
 * 期別 → 日期區間。
 * start：含當日 00:00；endExclusive：結束日次日 00:00（不含）。
 * 與 calculate-scout-payout Edge Function 對齊：[start, endExclusive)
 * - period=10：上月21 ~ 當月05（含），endExclusive = 當月06
 * - period=25：當月06 ~ 當月20（含），endExclusive = 當月21
 */
function periodRange(
  year: number,
  period: string,
): { start: string; end: string; endExclusive: string } | null {
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
    return {
      start: `${py}-${pad(pm)}-21`,
      end: `${year}-${pad(m)}-05`,
      endExclusive: `${year}-${pad(m)}-06`,
    };
  }
  return {
    start: `${year}-${pad(m)}-06`,
    end: `${year}-${pad(m)}-20`,
    endExclusive: `${year}-${pad(m)}-21`,
  };
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
  target_count: number | null;
  venue_name: string | null;
}
interface ScoutProfile {
  user_id: string;
  display_name: string | null;
  is_scout_team_member: boolean;
  employment_type: string | null;
  fulltime_start_yearmonth: string | null;
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
  invited_at: string | null;
  created_at: string | null;
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
  targets: Array<{ venue_name: string; personal_min: number; target_count: number }>;
  total_personal_min: number;
  venueBreakdown: Array<{ venue_name: string; personal_min: number; actual: number; achieved: boolean }>;
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
    discount_code: string;
    kol_name: string;
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

        const [profilesRes, rolesRes, rarityRes, tierRes, salaryRes, accsRes, targetsRes] = await Promise.all([
          supabase
            .from("team_member_profiles")
            .select("user_id, display_name, is_scout_team_member, employment_type, fulltime_start_yearmonth")
            .eq("is_scout_team_member", true),
          supabase
            .from("user_roles")
            .select("user_id, role")
            .in("role", ["scout", "scout_manager"] as never),
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
          supabase.from("accommodation_info").select("id, name"),
          showSalary && month
            ? supabase
                .from("scout_team_targets")
                .select("year, month, personal_min, target_count, venue_name")
                .eq("year", month === 1 ? effYear - 1 : effYear)
                .eq("month", month === 1 ? 12 : month - 1)
            : Promise.resolve({ data: [] as TargetRow[], error: null }),
        ]);

        if (profilesRes.error) throw profilesRes.error;
        if (rolesRes.error) throw rolesRes.error;
        if (rarityRes.error) throw rarityRes.error;
        if (tierRes.error) throw tierRes.error;
        if (salaryRes.error) throw salaryRes.error;
        if (accsRes.error) throw accsRes.error;
        if (targetsRes.error) throw targetsRes.error;

        const teamScouts: ScoutProfile[] = (profilesRes.data ?? []) as ScoutProfile[];
        const teamScoutIdSet = new Set(teamScouts.map((s) => s.user_id));

        // 補齊 external scout：有 scout / scout_manager role 但不是團隊成員
        const roleUserIds = Array.from(
          new Set(((rolesRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)),
        ).filter((uid) => !teamScoutIdSet.has(uid));

        let externalScouts: ScoutProfile[] = [];
        if (roleUserIds.length > 0) {
          const { data: extData, error: extErr } = await supabase
            .from("team_member_profiles")
            .select("user_id, display_name, is_scout_team_member, employment_type, fulltime_start_yearmonth")
            .in("user_id", roleUserIds)
            .eq("is_scout_team_member", false);
          if (extErr) throw extErr;
          externalScouts = (extData ?? []) as ScoutProfile[];
        }

        const scouts: ScoutProfile[] = [...teamScouts, ...externalScouts];
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
        void salary?.team_threshold_pct;

        const pmsVenues = new Set(((accsRes.data ?? []) as { id: string; name: string }[]).map((a) => a.name));
        const accIdToName = new Map<string, string>(
          ((accsRes.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
        );

        const targetRows = (targetsRes.data ?? []) as TargetRow[];
        const targetsList = targetRows
          .filter((t) => Number(t.personal_min || 0) > 0)
          .map((t) => ({
            venue_name: t.venue_name ?? "—",
            personal_min: Number(t.personal_min || 0),
            target_count: Number(t.target_count || 0),
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
            "scout_id, name, rarity, kpi_qualified, booking_status, check_in_date, kpi_month, cid_code, order_number, is_error, venue_name, invited_at, created_at",
          )
          .in("scout_id", scoutIds);
        if (kolErr) throw kolErr;
        const kolRows = (kolData ?? []) as KolProfileRow[];

        // 累積件數：對每位星探用 exact count 查詢，避免 PostgREST 預設 1000 筆截斷導致費率階級錯誤
        const cumulativeEntries = await Promise.all(
          scoutIds.map(async (sid) => {
            const { count, error } = await supabase
              .from("kol_profiles")
              .select("id", { count: "exact", head: true })
              .eq("scout_id", sid)
              .eq("kpi_qualified", true);
            if (error) throw error;
            return [sid, Number(count ?? 0)] as const;
          }),
        );
        const cumulativeMap = new Map<string, number>(cumulativeEntries);

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

        // KOL 分潤 cid 蒐集：所有歷史 kpi_qualified=true 的 cid_code
        const cidByScout = new Map<string, string[]>();
        const allCidCodes = new Set<string>();
        for (const r of kolRows) {
          if (!r.scout_id) continue;
          if (!r.cid_code) continue;
          if (r.kpi_qualified !== true) continue;
          const arr = cidByScout.get(r.scout_id) ?? [];
          if (!arr.includes(r.cid_code)) arr.push(r.cid_code);
          cidByScout.set(r.scout_id, arr);
          allCidCodes.add(r.cid_code);
        }

        const orderMap = new Map<
          string,
          {
            count: number;
            total: number;
            orders: Array<{
              order_number: string;
              final_price: number;
              created_at: string | null;
              accommodation_id: string | null;
            }>;
          }
        >();
        if (allCidCodes.size > 0) {
          // 與 Edge Function (calculate-scout-payout) 對齊：
          // 1) 不用 .in() — PostgREST .in() 大小寫敏感，會漏掉 DB 中小寫的 discount_code（例: fancy10）
          // 2) order_date 是 timestamptz，期別結束日要用 exclusive 次日（endExclusive），
          //    避免 .lte("order_date", "YYYY-MM-DD") 因被當成當日 00:00 而漏掉當天訂單
          // 3) 全期間 fetch 後在 JS 端 toUpperCase 比對 cidUpperSet
          const cidUpperSet = new Set(
            Array.from(allCidCodes)
              .map((c) => c.trim().toUpperCase())
              .filter((c) => !!c),
          );
          let q = supabase
            .from("orders")
            .select("order_number, discount_code, final_price, created_at, order_date, accommodation_id")
            .not("discount_code", "is", null)
            .neq("order_status", "cancelled");
          if (range) {
            q = q.gte("check_in_date", range.start).lt("check_in_date", range.endExclusive);
          }
          const { data: orders, error: ordErr } = await q;
          if (ordErr) throw ordErr;
          for (const o of orders ?? []) {
            const row = o as {
              discount_code: string | null;
              final_price: number | null;
              order_number: string | null;
              created_at: string | null;
              accommodation_id: string | null;
            };
            if (!row.discount_code) continue;
            const key = row.discount_code.trim().toUpperCase();
            if (!cidUpperSet.has(key)) continue;
            const entry = orderMap.get(key) ?? { count: 0, total: 0, orders: [] };
            entry.count += 1;
            entry.total += Number(row.final_price || 0);
            entry.orders.push({
              order_number: row.order_number ?? "",
              final_price: Number(row.final_price || 0),
              created_at: row.created_at,
              accommodation_id: row.accommodation_id,
            });
            orderMap.set(key, entry);
          }
        }

        // ⚠️ 底薪／團隊獎金：僅於 period=10 發放
        // 個人達標與團隊達標皆以 kpi_month = prevMonthStart（上月 YYYY-MM-01）為準
        let prevMonthStart: string | null = null;
        let selectedYM: string | null = null; // YYYYMM 字串，判定正職是否在職
        if (showSalary && month) {
          const targetYear = month === 1 ? effYear - 1 : effYear;
          const targetMonth = month === 1 ? 12 : month - 1;
          prevMonthStart = `${targetYear}-${pad(targetMonth)}-01`;
          selectedYM = `${targetYear}${pad(targetMonth)}`;
        }
        const isFulltimeAt = (p: ScoutProfile): boolean => {
          if (!selectedYM) return false;
          if (p.employment_type !== "fulltime") return false;
          const start = (p.fulltime_start_yearmonth ?? "").toString().replace(/[^0-9]/g, "").slice(0, 6);
          if (start.length !== 6) return false;
          return start <= selectedYM;
        };

        // 供團隊獎金計算用：per scout per venue 的實際貢獻數
        // - 兼職：kpi_qualified=true 的全部邀約
        // - 正職：kpi_qualified=true 且 rarity ∈ {SR,SSR,UR}
        const teamContribBy: Map<string, Map<string, number>> = new Map();

        const results: ScoutStats[] = scouts.map((s) => {
          const rows = kolRows.filter((r) => r.scout_id === s.user_id);
          // 費率階梯基礎：用 exact count 查到的全部歷史 kpi_qualified=true 件數
          const cumulative = cumulativeMap.get(s.user_id) ?? 0;

          const tier = tierFor(cumulative);
          const tierName = tier?.tier_name ?? "—";
          const isFulltime = isFulltimeAt(s);

          // 有效邀約：kpi_qualified=true、check_in_date 落在期別、invited_at 非空、is_error=false
          const periodQualified = rows.filter(
            (r) =>
              r.kpi_qualified === true &&
              !r.is_error &&
              !!r.invited_at &&
              inPeriod(r.check_in_date),
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
          // 【修改三】正職：期別內 SR/SSR/UR 依 created_at 升序，> 30 位才發，
          // 只取第 31 筆起依稀有度費率加總。N/R 不受影響（仍照 rarity_bonus 加總）。
          const fulltimeExcludedIds = new Set<string>();
          if (isFulltime) {
            const highRarity = periodQualified
              .filter((r) => r.rarity === "SR" || r.rarity === "SSR" || r.rarity === "UR")
              .slice()
              .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
            const excluded = highRarity.length > 30 ? highRarity.slice(0, 30) : highRarity;
            for (const r of excluded) {
              // 使用 name + created_at + rarity 組合鍵，避免 kol_profiles 無 id 欄位
              fulltimeExcludedIds.add(`${r.name ?? ""}|${r.created_at ?? ""}|${r.rarity ?? ""}`);
            }
          }

          let rarityBonus = 0;
          const qualifiedKols: ScoutStats["qualifiedKols"] = [];
          for (const r of periodQualified) {
            const rar = (r.rarity ?? "") as Rarity;
            const bonusFull = rarityMap.get(rar) ?? 0;
            const key = `${r.name ?? ""}|${r.created_at ?? ""}|${r.rarity ?? ""}`;
            const suppress =
              isFulltime &&
              (rar === "SR" || rar === "SSR" || rar === "UR") &&
              fulltimeExcludedIds.has(key);
            const bonus = suppress ? 0 : bonusFull;
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
          const kolNameByCid = new Map<string, string>();
          for (const r of rows) {
            if (r.cid_code) {
              if (r.venue_name) venueByCid.set(r.cid_code, r.venue_name);
              if (r.name) kolNameByCid.set(r.cid_code, r.name);
            }
          }
          for (const code of cidCodes) {
            const ord = orderMap.get(code.toUpperCase());
            if (ord) {
              pmsOrderCount += ord.count;
              pmsOrderTotal += ord.total;
              for (const o of ord.orders) {
                const venueFromOrder = o.accommodation_id ? accIdToName.get(o.accommodation_id) : undefined;
                orderItems.push({
                  venue_name: venueFromOrder ?? venueByCid.get(code) ?? "",
                  order_number: o.order_number,
                  final_price: o.final_price,
                  commission: Math.round(o.final_price * commissionRate),
                  created_at: o.created_at,
                  discount_code: code,
                  kol_name: kolNameByCid.get(code) ?? "",
                });
              }
            }
          }
          const kolCommission = Math.round(pmsOrderTotal * commissionRate);

          let monthlySuccess = 0;
          let individualAchieved = false;
          let venueBreakdown: ScoutStats["venueBreakdown"] = [];
          if (showSalary && prevMonthStart) {
            // 【修改一】兼職個人目標獎金（底薪）改用 kpi_month = prevMonthStart
            // 個人達標各館比對 personal_min（kpi_qualified、非錯誤、invited_at 非空）
            const monthRows = rows.filter(
              (r) =>
                r.kpi_qualified === true &&
                !r.is_error &&
                !!r.invited_at &&
                r.kpi_month === prevMonthStart,
            );
            monthlySuccess = monthRows.length;
            if (targetsList.length === 0) {
              individualAchieved = false;
            } else {
              individualAchieved = true;
              venueBreakdown = targetsList.map((t) => {
                const actual = monthRows.filter((r) => (r.venue_name ?? "—") === t.venue_name).length;
                const achieved = actual >= t.personal_min;
                if (!achieved) individualAchieved = false;
                return {
                  venue_name: t.venue_name,
                  personal_min: t.personal_min,
                  actual,
                  achieved,
                };
              });
            }

            // 【修改二】團隊獎金貢獻：兼職 → 全部；正職 → 只算 SR/SSR/UR
            const teamRows = isFulltime
              ? monthRows.filter((r) => r.rarity === "SR" || r.rarity === "SSR" || r.rarity === "UR")
              : monthRows;
            const perVenue = new Map<string, number>();
            for (const r of teamRows) {
              const v = r.venue_name ?? "—";
              perVenue.set(v, (perVenue.get(v) ?? 0) + 1);
            }
            teamContribBy.set(s.user_id, perVenue);
          }
          const baseSalaryPayout =
            showSalary && s.is_scout_team_member && !isFulltime && individualAchieved ? baseSalary : 0;

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
            venueBreakdown,
            qualifiedKols,
            orderItems,
          };
        });

        // 顯示全部 is_scout_team_member=true 的星探，與 Edge Function 一致
        // （不再以「當期是否有 kol_profile 記錄」過濾，避免有 KOL 分潤訂單但本期無新邀請的星探被隱藏）
        const periodFiltered = results;

        let teamBonusPayout = 0;
        if (showSalary && targetsList.length > 0) {
          // 【修改二】團隊達標：各 target 館別
          // 兼職邀約數（全部 kpi_qualified）＋ 正職 SR/SSR/UR 邀約數 >= target_count
          let teamAchieved = true;
          for (const t of targetsList) {
            let total = 0;
            for (const contrib of teamContribBy.values()) {
              total += contrib.get(t.venue_name) ?? 0;
            }
            if (total < t.target_count) {
              teamAchieved = false;
              break;
            }
          }
          if (teamAchieved) teamBonusPayout = teamBonusAmount;
        }
        for (const r of periodFiltered) {
          r.team_bonus = showSalary && r.is_scout_team_member ? teamBonusPayout : 0;
          r.total = r.rarity_bonus + r.kol_commission + r.base_salary + r.team_bonus;
        }

        if (!cancelled) {
          setStats(periodFiltered.sort((a, b) => b.cumulative_count - a.cumulative_count));
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
    <>
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
                  <TableHead className="whitespace-nowrap">等級名稱</TableHead>
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
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      載入中…
                    </TableCell>
                  </TableRow>
                ) : stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
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
                      <TableCell className="whitespace-nowrap text-muted-foreground">{s.tier_name}</TableCell>
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
                        {showSalary && s.is_scout_team_member ? s.base_salary.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {showSalary && s.is_scout_team_member ? s.team_bonus.toLocaleString() : "—"}
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

          {/*
            ⚠️ 注意：若未來修改期別結算區間邏輯，
            必須同步更新 KolStatsTab.tsx、TeamCommission.tsx 的說明文字，
            以及 calculate-scout-payout Edge Function 的對應邏輯。
          */}
          <div className="mt-3 px-1 text-xs text-muted-foreground space-y-1">
            <div className="font-medium">期別結算區間說明：</div>
            <div>・稀有度獎金／KOL分潤：</div>
            <div className="pl-3">X月10日期別：上月21日 ～ 當月05日（整天）</div>
            <div className="pl-3">X月25日期別：當月06日 ～ 當月20日（整天）</div>
            <div>・底薪／團隊獎金：僅於X月10日期發放，以上月（X-1月）整月達標為準</div>
            <div className="pt-2 font-medium">欄位計算方式：</div>
            <div>・「累積邀約」：星探主管在 KOL 名單將「符合資格」打勾的件數</div>
            <div>・「KOL分潤訂單」：匹配 PMS 民宿管理訂單列表的折扣代碼（不包含場域管理的民宿）</div>
            <div>
              ・此表單的「KOL分潤訂單清單」是以「訂單日期」為發放條件（目的是先發獎金給星探），與 KOL 獎金管理的表單條件不同
            </div>
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
                            <TableHead>折扣代碼</TableHead>
                            <TableHead>KOL名稱</TableHead>
                            <TableHead>訂單編號</TableHead>
                            <TableHead className="whitespace-nowrap">訂購時間</TableHead>
                            <TableHead className="text-right">訂單金額</TableHead>
                            <TableHead className="text-right">分潤金額</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedScout.orderItems.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
                                無資料
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedScout.orderItems.map((o, i) => (
                              <TableRow key={i}>
                                <TableCell className="whitespace-nowrap">{o.venue_name || "—"}</TableCell>
                                <TableCell className="whitespace-nowrap font-mono text-xs">
                                  {o.discount_code || "—"}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{o.kol_name || "—"}</TableCell>
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
                                <TableCell className="text-right tabular-nums">
                                  {o.commission.toLocaleString()}
                                </TableCell>
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

                  <section>
                    <h3 className="text-sm font-semibold mb-2">底薪達標明細</h3>
                    {!showSalary ? (
                      <div className="text-sm text-muted-foreground border rounded-md p-3">
                        底薪於每月10日隨上期結算發放（請改選N月10日，才會顯示明細資訊）
                      </div>
                    ) : (
                      <div className="border rounded-md p-3 space-y-3 text-sm">
                        <div>
                          <div className="font-medium mb-1">各場域個人目標</div>
                          {selectedScout.venueBreakdown.length === 0 ? (
                            <div className="text-muted-foreground">本月未設定目標</div>
                          ) : (
                            <div className="overflow-x-auto border rounded-md">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>場域</TableHead>
                                    <TableHead className="text-right">目標</TableHead>
                                    <TableHead className="text-right">實際</TableHead>
                                    <TableHead className="text-right">狀態</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {selectedScout.venueBreakdown.map((v, i) => (
                                    <TableRow key={i}>
                                      <TableCell className="whitespace-nowrap">{v.venue_name}</TableCell>
                                      <TableCell className="text-right tabular-nums">{v.personal_min} 件</TableCell>
                                      <TableCell className="text-right tabular-nums">{v.actual} 件</TableCell>
                                      <TableCell className={`text-right font-semibold ${v.achieved ? "text-green-600" : "text-orange-500"}`}>
                                        {v.achieved ? "✓ 達標" : "✗ 未達標"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          需所有館別皆達標才可領取底薪
                        </div>
                        <div className="flex justify-between">
                          <span>達標狀態</span>
                          <span
                            className={`font-semibold ${
                              selectedScout.individual_achieved ? "text-green-600" : "text-orange-500"
                            }`}
                          >
                            {selectedScout.individual_achieved ? "✓ 已達標" : "✗ 未達標"}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-2">
                          <span>底薪金額</span>
                          <span className="tabular-nums font-semibold">
                            NT$ {(selectedScout.is_scout_team_member ? selectedScout.base_salary : 0).toLocaleString()}
                          </span>
                        </div>
                        {!selectedScout.is_scout_team_member && (
                          <div className="text-xs text-muted-foreground">（非星探團隊成員，不發放底薪）</div>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </Card>
    </>
  );
}
