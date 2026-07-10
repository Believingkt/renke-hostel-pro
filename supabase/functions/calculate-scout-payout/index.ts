import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

// period=10 → 上月21日 ~ 當月5日
// period=25 → 當月6日 ~ 當月20日
function periodRange(year: number, month: number, period: 10 | 25) {
  if (period === 10) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return {
      startDate: `${prevYear}-${pad(prevMonth)}-21`,
      endExclusive: `${year}-${pad(month)}-06`,
    };
  }
  return {
    startDate: `${year}-${pad(month)}-06`,
    endExclusive: `${year}-${pad(month)}-21`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year);
    const month = Number(body?.month);
    const periodNum = Number(body?.period);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ success: false, error: "year and month (1-12) are required" }, 400);
    }
    if (periodNum !== 10 && periodNum !== 25) {
      return jsonResponse({ success: false, error: "period must be 10 or 25" }, 400);
    }
    const period = periodNum as 10 | 25;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { startDate: periodStart, endExclusive: periodEnd } = periodRange(year, month, period);
    const kpiMonth = `${year}-${pad(month)}-01`;
    const asOfDate = `${year}-${pad(month)}-28`;
    const currentYM = `${year}-${pad(month)}`;

    // ===== 一、讀取設定 =====
    const [
      salaryRes,
      teamTargetsRes,
      fulltimeTargetsRes,
      profilesRes,
      rarityRes,
      accsRes,
      tierRes,
    ] = await Promise.all([
      supabase
        .from("scout_salary_settings")
        .select("base_salary, team_bonus, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scout_team_targets")
        .select("accommodation_id, personal_min, target_count, venue_name")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("scout_fulltime_targets")
        .select("venue_name, fulltime_min")
        .eq("year", year)
        .eq("month", month),
      supabase
        .from("team_member_profiles")
        .select("user_id, display_name, employment_type, fulltime_start_yearmonth, managed_venue")
        .eq("is_scout_team_member", true),
      supabase
        .from("kol_rarity_settings")
        .select("rarity, bonus_amount, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false }),
      supabase
        .from("accommodation_info")
        .select("id, name"),
      supabase
        .from("scout_tier_settings")
        .select("min_count, max_count, commission_rate, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false }),
    ]);

    if (salaryRes.error) throw salaryRes.error;
    if (teamTargetsRes.error) throw teamTargetsRes.error;
    if (fulltimeTargetsRes.error) throw fulltimeTargetsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (rarityRes.error) throw rarityRes.error;
    if (accsRes.error) throw accsRes.error;
    if (tierRes.error) throw tierRes.error;

    // 等級階梯：依 effective_from desc 取最新版本（同 min_count 只保留最新）
    const tierMap = new Map<string, { min: number; max: number | null; rate: number }>();
    for (const t of tierRes.data ?? []) {
      const key = `${t.min_count}-${t.max_count ?? "inf"}`;
      if (!tierMap.has(key)) {
        tierMap.set(key, {
          min: Number(t.min_count),
          max: t.max_count == null ? null : Number(t.max_count),
          rate: Number(t.commission_rate ?? 0),
        });
      }
    }
    const tiers = [...tierMap.values()].sort((a, b) => a.min - b.min);
    function commissionRateFor(count: number): number {
      for (const t of tiers) {
        if (count >= t.min && (t.max == null || count <= t.max)) return t.rate;
      }
      return 0;
    }

    const salarySetting = salaryRes.data;
    const baseSalaryAmount = Number(salarySetting?.base_salary ?? 0);
    const teamBonusAmount = Number(salarySetting?.team_bonus ?? 0);

    const teamTargets = teamTargetsRes.data ?? [];
    const fulltimeTargets = fulltimeTargetsRes.data ?? [];
    const profiles = profilesRes.data ?? [];

    // venue_name → accommodation_id
    const venueToAccId = new Map<string, string>();
    for (const a of accsRes.data ?? []) {
      if (a.name) venueToAccId.set(a.name, a.id as string);
    }

    // 正職目標 venue_name → accommodation_id + fulltime_min
    const fulltimeByAcc = new Map<string, number>();
    for (const t of fulltimeTargets) {
      const accId = venueToAccId.get(t.venue_name ?? "");
      if (accId) fulltimeByAcc.set(accId, Number(t.fulltime_min ?? 0));
    }

    // 稀有度獎金：取每個 rarity 最新一筆
    const rarityMap = new Map<string, number>();
    for (const r of rarityRes.data ?? []) {
      if (!rarityMap.has(r.rarity)) rarityMap.set(r.rarity, Number(r.bonus_amount ?? 0));
    }

    if (profiles.length === 0) {
      return jsonResponse({
        success: true,
        year, month, period,
        scouts_calculated: 0,
        results: [],
      });
    }

    // 抓取範圍：涵蓋期別區間 + 當月區間（用於底薪/團隊達標）
    // ⚠️ 底薪／團隊獎金：僅於 period=10 發放，且以「上月整月」達標為準
    // period=25 不計算底薪與團隊獎金
    // 若未來修改此邏輯，必須同步更新 KolStatsTab.tsx、TeamCommission.tsx 的說明文字
    const targetMonthRaw = month - 1;
    const targetYear = targetMonthRaw < 1 ? year - 1 : year;
    const targetMonth = targetMonthRaw < 1 ? 12 : targetMonthRaw;
    const monthStart = `${targetYear}-${pad(targetMonth)}-01`;
    const nextTargetMonth = targetMonth === 12 ? 1 : targetMonth + 1;
    const nextTargetYear = targetMonth === 12 ? targetYear + 1 : targetYear;
    const monthEndExclusive = `${nextTargetYear}-${pad(nextTargetMonth)}-01`;
    const fetchStart = periodStart < monthStart ? periodStart : monthStart;
    const fetchEndExclusive = periodEnd > monthEndExclusive ? periodEnd : monthEndExclusive;

    // ===== 三、撈有效邀約（kpi_qualified + 非錯誤 + invited_at 非空 + check_in_date 在抓取範圍） =====
    const { data: monthInvitesRaw, error: monthInvErr } = await supabase
      .from("kol_profiles")
      .select("scout_id, accommodation_id, rarity, check_in_date, created_at")
      .eq("is_error", false)
      .eq("kpi_qualified", true)
      .not("invited_at", "is", null)
      .gte("check_in_date", fetchStart)
      .lt("check_in_date", fetchEndExclusive);
    if (monthInvErr) throw monthInvErr;

    const allInvites = monthInvitesRaw ?? [];
    // 當月內（底薪/個人/團隊達標用）：check_in_date ∈ [monthStart, monthEndExclusive)
    const allMonthInvites = allInvites.filter(
      (i) => i.check_in_date && i.check_in_date >= monthStart && i.check_in_date < monthEndExclusive,
    );
    // 期別內（稀有度獎金用）：check_in_date ∈ [periodStart, periodEnd)
    const allPeriodInvites = allInvites.filter(
      (i) => i.check_in_date && i.check_in_date >= periodStart && i.check_in_date < periodEnd,
    );

    // ===== 七、團隊獎金：每個 scout_team_targets 館別「上月」有效邀約數 >= target_count =====
    // period=25 不計算團隊獎金（直接 false）
    let teamAchieved = false;
    if (period === 10 && teamTargets.length > 0) {
      teamAchieved = true;
      for (const t of teamTargets) {
        const cnt = allMonthInvites.filter(
          (i) => i.accommodation_id === t.accommodation_id,
        ).length;
        if (cnt < Number(t.target_count ?? 0)) {
          teamAchieved = false;
          break;
        }
      }
    }

    // ===== 為每位星探計算 =====
    type ScoutCalc = {
      scout_id: string;
      display_name: string;
      employment_type: string | null;
      is_fulltime: boolean;
      individual_achieved: boolean;
      base_salary: number;
      rarity_bonus: number;
      kol_commission: number;
      team_bonus: number;
      total_payout: number;
      individual_target_snapshot: Record<string, unknown>;
      team_target_snapshot: Record<string, unknown>;
    };

    const results: ScoutCalc[] = [];
    const calculatedAt = new Date().toISOString();

    for (const scout of profiles) {
      const scoutId = scout.user_id as string;
      const startYM = scout.fulltime_start_yearmonth as string | null;
      const isFulltime =
        scout.employment_type === "fulltime" &&
        !!startYM &&
        startYM <= currentYM;

      // 該星探當月有效邀約（底薪/個人達標用）與期別內邀約（稀有度獎金用）
      const myMonthInvites = allMonthInvites.filter((i) => i.scout_id === scoutId);
      const myPeriodInvites = allPeriodInvites.filter((i) => i.scout_id === scoutId);

      // ===== 四、個人達標 =====
      let individualAchieved = false;
      const venueBreakdown: Array<{
        accommodation_id: string;
        venue_name?: string | null;
        required: number;
        actual: number;
        achieved: boolean;
      }> = [];

      // period=25 不做個人達標判斷（底薪/團隊獎金都不發）
      if (period !== 10) {
        individualAchieved = false;
      } else if (isFulltime) {
        if (fulltimeByAcc.size === 0) {
          individualAchieved = false;
        } else {
          individualAchieved = true;
          for (const [accId, minCount] of fulltimeByAcc.entries()) {
            const actual = myMonthInvites.filter(
              (i) =>
                i.accommodation_id === accId &&
                ["SR", "SSR", "UR"].includes(i.rarity ?? ""),
            ).length;
            const achieved = actual >= minCount;
            if (!achieved) individualAchieved = false;
            venueBreakdown.push({
              accommodation_id: accId,
              required: minCount,
              actual,
              achieved,
            });
          }
        }
      } else {
        if (teamTargets.length === 0) {
          individualAchieved = false;
        } else {
          individualAchieved = true;
          for (const t of teamTargets) {
            const required = Number(t.personal_min ?? 0);
            const actual = myMonthInvites.filter(
              (i) => i.accommodation_id === t.accommodation_id,
            ).length;
            const achieved = actual >= required;
            if (!achieved) individualAchieved = false;
            venueBreakdown.push({
              accommodation_id: t.accommodation_id as string,
              venue_name: t.venue_name as string | null,
              required,
              actual,
              achieved,
            });
          }
        }
      }

      // 底薪：兼職 period=10 且達標→base；正職一律 0
      const baseSalary =
        !isFulltime && period === 10 && individualAchieved ? baseSalaryAmount : 0;

      // ===== 五、稀有度獎金 =====
      // 正職：當月（check_in_date ∈ 當月）SR/SSR/UR 超過 30 位後，第 31 筆起才計獎（依 created_at 升序）
      // 兼職：期別內每筆 rarity 都計獎（維持原邏輯）
      let rarityBonus = 0;
      if (isFulltime) {
        const myMonthRare = myMonthInvites
          .filter((i) => ["SR", "SSR", "UR"].includes(i.rarity ?? ""))
          .sort((a, b) => ((a as any).created_at || "").localeCompare((b as any).created_at || ""));
        if (myMonthRare.length > 30) {
          for (const inv of myMonthRare.slice(30)) {
            if (inv.rarity) rarityBonus += rarityMap.get(inv.rarity) ?? 0;
          }
        }
      } else {
        for (const inv of myPeriodInvites) {
          if (inv.rarity) rarityBonus += rarityMap.get(inv.rarity) ?? 0;
        }
      }

      // ===== 六、KOL 分潤（依 scout_tier_settings 等級階梯） =====
      // 1) 取該星探所有歷史 kpi_qualified=true 的 cid_code（不限期別，給訂單比對用）
      const { data: allQualified, error: allQErr } = await supabase
        .from("kol_profiles")
        .select("cid_code")
        .eq("scout_id", scoutId)
        .eq("kpi_qualified", true)
        .not("cid_code", "is", null);
      if (allQErr) throw allQErr;

      const cidUpperSet = new Set(
        (allQualified ?? [])
          .map((r) => (r.cid_code as string | null)?.trim())
          .filter((c): c is string => !!c)
          .map((c) => c.toUpperCase()),
      );

      // 2) 累積邀約件數：所有歷史 kpi_qualified=true 的件數（不限日期、不限 invited_at）
      const { count: cumulativeCount, error: cumErr } = await supabase
        .from("kol_profiles")
        .select("id", { count: "exact", head: true })
        .eq("scout_id", scoutId)
        .eq("kpi_qualified", true);
      if (cumErr) throw cumErr;

      const tierCount = Number(cumulativeCount ?? 0);
      const commissionRate = commissionRateFor(tierCount);

      let kolCommission = 0;
      if (cidUpperSet.size > 0 && commissionRate > 0) {
        const { data: orders, error: ordErr } = await supabase
          .from("orders")
          .select("final_price, discount_code, order_date")
          .not("discount_code", "is", null)
          .gte("order_date", periodStart)
          .lt("order_date", periodEnd)
          .neq("order_status", "cancelled");
        if (ordErr) throw ordErr;

        for (const o of orders ?? []) {
          const code = String(o.discount_code ?? "").toUpperCase();
          if (!code || !cidUpperSet.has(code)) continue;
          kolCommission += Number(o.final_price ?? 0) * commissionRate;
        }
        kolCommission = Math.round(kolCommission);
      }

      // ===== 團隊獎金 =====
      const teamBonus = teamAchieved ? teamBonusAmount : 0;

      const totalPayout = baseSalary + rarityBonus + kolCommission + teamBonus;

      const bonusBreakdown = {
        base_salary: baseSalary,
        rarity_bonus: rarityBonus,
        kol_commission: kolCommission,
        team_bonus: teamBonus,
      };

      const individualSnapshot = {
        employment_type: isFulltime ? "fulltime" : "parttime",
        venue_breakdown: venueBreakdown,
        individual_achieved: individualAchieved,
      };

      const teamSnapshot = {
        team_achieved: teamAchieved,
        team_targets: teamTargets.map((t) => ({
          accommodation_id: t.accommodation_id,
          venue_name: t.venue_name,
          target_count: Number(t.target_count ?? 0),
          actual: allMonthInvites.filter(
            (i) => i.accommodation_id === t.accommodation_id,
          ).length,
        })),
      };

      // ===== 八、寫入 scout_monthly_payouts =====
      const { data: existing, error: exErr } = await supabase
        .from("scout_monthly_payouts")
        .select("id, payout_status")
        .eq("scout_id", scoutId)
        .eq("year", year)
        .eq("month", month)
        .eq("period", period)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing && existing.payout_status === "paid") {
        results.push({
          scout_id: scoutId,
          display_name: (scout.display_name as string) ?? "",
          employment_type: (scout.employment_type as string) ?? null,
          is_fulltime: isFulltime,
          individual_achieved: individualAchieved,
          base_salary: 0,
          rarity_bonus: 0,
          kol_commission: 0,
          team_bonus: 0,
          total_payout: 0,
          individual_target_snapshot: individualSnapshot,
          team_target_snapshot: teamSnapshot,
        });
        continue;
      }

      const payload = {
        scout_id: scoutId,
        year,
        month,
        period,
        base_salary: baseSalary,
        kol_commission: kolCommission,
        kol_commission_rate: commissionRate,
        team_bonus: teamBonus,
        total_payout: totalPayout,
        individual_achieved: individualAchieved,
        team_achieved: teamAchieved,
        payout_status: existing?.payout_status ?? "pending",
        calculated_at: calculatedAt,
        bonus_breakdown: bonusBreakdown,
        individual_target_snapshot: individualSnapshot,
        team_target_snapshot: teamSnapshot,
        data_source: "system_calculated",
      };

      if (existing) {
        const { error: updErr } = await supabase
          .from("scout_monthly_payouts")
          .update(payload)
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from("scout_monthly_payouts")
          .insert(payload);
        if (insErr) throw insErr;
      }

      results.push({
        scout_id: scoutId,
        display_name: (scout.display_name as string) ?? "",
        employment_type: (scout.employment_type as string) ?? null,
        is_fulltime: isFulltime,
        individual_achieved: individualAchieved,
        base_salary: baseSalary,
        rarity_bonus: rarityBonus,
        kol_commission: kolCommission,
        team_bonus: teamBonus,
        total_payout: totalPayout,
        individual_target_snapshot: individualSnapshot,
        team_target_snapshot: teamSnapshot,
      });
    }

    return jsonResponse({
      success: true,
      year,
      month,
      period,
      team_achieved: teamAchieved,
      scouts_calculated: results.length,
      results,
    });
  } catch (e) {
    console.error("[calculate-scout-payout] error:", e);
    return jsonResponse({ success: false, error: (e as Error).message }, 500);
  }
});
