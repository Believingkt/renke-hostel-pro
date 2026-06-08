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

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

// 期別對應的 check_in_date 區間（含起、含迄）
// period=10 → 上月 21 ~ 當月 5
// period=25 → 當月 6 ~ 當月 20
function periodRange(year: number, month: number, period: 10 | 25): { startDate: string; endExclusive: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
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

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ success: false, error: "year and month (1-12) are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { start: monthStart, end: monthEnd } = monthRange(year, month);
    const asOfDate = `${year}-${String(month).padStart(2, "0")}-28`;

    const [salaryRes, tierRes, rarityRes] = await Promise.all([
      supabase
        .from("scout_salary_settings")
        .select("base_salary, team_bonus, team_threshold_pct, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scout_tier_settings")
        .select("min_count, max_count, commission_rate, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false }),
      supabase
        .from("kol_rarity_settings")
        .select("rarity, bonus_amount, effective_from")
        .lte("effective_from", asOfDate)
        .order("effective_from", { ascending: false }),
    ]);

    if (salaryRes.error) throw salaryRes.error;
    if (tierRes.error) throw tierRes.error;
    if (rarityRes.error) throw rarityRes.error;

    const salarySetting = salaryRes.data;
    if (!salarySetting) {
      return jsonResponse({ success: false, error: "No scout_salary_settings found" }, 400);
    }
    const baseSalary = Number(salarySetting.base_salary || 0);
    const teamBonusAmount = Number(salarySetting.team_bonus || 0);
    const teamThresholdPct = Number(salarySetting.team_threshold_pct || 0);

    const tierMap = new Map<string, { min: number; max: number | null; rate: number }>();
    for (const t of tierRes.data ?? []) {
      const key = `${t.min_count}-${t.max_count ?? "inf"}`;
      if (!tierMap.has(key)) {
        tierMap.set(key, {
          min: Number(t.min_count),
          max: t.max_count == null ? null : Number(t.max_count),
          rate: Number(t.commission_rate || 0),
        });
      }
    }
    const tiers = [...tierMap.values()].sort((a, b) => a.min - b.min);

    const rarityMap = new Map<string, number>();
    for (const r of rarityRes.data ?? []) {
      if (!rarityMap.has(r.rarity)) rarityMap.set(r.rarity, Number(r.bonus_amount || 0));
    }

    function commissionRateFor(count: number): number {
      for (const t of tiers) {
        if (count >= t.min && (t.max == null || count <= t.max)) return t.rate;
      }
      return 0;
    }

    const { data: profiles, error: profErr } = await supabase
      .from("team_member_profiles")
      .select("user_id, display_name, managed_venue")
      .eq("is_scout_team_member", true);
    if (profErr) throw profErr;

    if (!profiles || profiles.length === 0) {
      return jsonResponse({ success: true, year, month, scouts_calculated: 0, results: [] });
    }

    const userIds = profiles.map((p) => p.user_id);
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds)
      .in("role", ["scout", "scout_manager"]);
    if (rolesErr) throw rolesErr;
    const validUserIds = new Set((roles ?? []).map((r) => r.user_id));
    const scouts = profiles.filter((p) => validUserIds.has(p.user_id));

    const { data: targets, error: targetsErr } = await supabase
      .from("scout_team_targets")
      .select("venue_name, personal_min, target_count, accommodation_id")
      .eq("year", year)
      .eq("month", month);
    if (targetsErr) throw targetsErr;
    const totalPersonalMin = (targets ?? []).reduce(
      (s, t) => s + Number(t.personal_min || 0),
      0,
    );

    const { data: accs, error: accsErr } = await supabase
      .from("accommodation_info")
      .select("name");
    if (accsErr) throw accsErr;
    const pmsVenues = new Set((accs ?? []).map((a) => a.name));

    type ScoutCalc = {
      scout_id: string;
      display_name: string;
      managed_venue: string | null;
      personal_min: number;
      individual_count: number;
      individual_achieved: boolean;
      base_salary: number;
      rarity_bonus: number;
      kol_commission: number;
      commission_rate: number;
      pms_order_total: number;
      cidCodes: string[];
    };

    const calcs: ScoutCalc[] = [];

    for (const scout of scouts) {
      const personalMin = totalPersonalMin;

      const { data: invites, error: invErr } = await supabase
        .from("kol_profiles")
        .select("rarity, kpi_qualified, cid_code, venue_name")
        .eq("scout_id", scout.user_id)
        .gte("kpi_month", monthStart)
        .lt("kpi_month", monthEnd)
        .eq("booking_status", "成功訂房")
        .eq("is_error", false);
      if (invErr) throw invErr;

      const individualCount = invites?.length ?? 0;
      const individualAchieved = personalMin > 0 && individualCount >= personalMin;

      // 稀有度獎金：與 KolStatsTab 一致，改用 check_in_date 月份、不過濾 booking_status 與 is_error
      const { data: rarityInvites, error: rarityErr } = await supabase
        .from("kol_profiles")
        .select("rarity, kpi_qualified, check_in_date")
        .eq("scout_id", scout.user_id)
        .gte("check_in_date", monthStart)
        .lt("check_in_date", monthEnd)
        .eq("kpi_qualified", true);
      if (rarityErr) throw rarityErr;

      let rarityBonus = 0;
      for (const inv of rarityInvites ?? []) {
        if (inv.rarity) {
          rarityBonus += rarityMap.get(inv.rarity) ?? 0;
        }
      }

      const cidCodes = (invites ?? [])
        .filter((i) => i.cid_code && pmsVenues.has(i.venue_name ?? ""))
        .map((i) => i.cid_code as string);

      let pmsOrderTotal = 0;
      if (cidCodes.length > 0) {
        const { data: orders, error: ordErr } = await supabase
          .from("orders")
          .select("final_price")
          .in("discount_code", cidCodes)
          .neq("order_status", "cancelled");
        if (ordErr) throw ordErr;
        pmsOrderTotal = (orders ?? []).reduce((s, o) => s + Number(o.final_price || 0), 0);
      }

      const commissionRate = commissionRateFor(individualCount);
      const kolCommission = Math.round(pmsOrderTotal * commissionRate);

      calcs.push({
        scout_id: scout.user_id,
        display_name: scout.display_name ?? "",
        managed_venue: scout.managed_venue ?? null,
        personal_min: personalMin,
        individual_count: individualCount,
        individual_achieved: individualAchieved,
        base_salary: individualAchieved ? baseSalary : 0,
        rarity_bonus: rarityBonus,
        kol_commission: kolCommission,
        commission_rate: commissionRate,
        pms_order_total: pmsOrderTotal,
        cidCodes,
      });
    }

    const totalScouts = calcs.length;
    const achievedCount = calcs.filter((c) => c.individual_achieved).length;
    const teamRate = totalScouts > 0 ? (achievedCount / totalScouts) * 100 : 0;
    const teamAchieved = totalScouts > 0 && teamRate >= teamThresholdPct;

    const results: Array<{
      scout_id: string;
      display_name: string;
      total_payout: number;
      individual_achieved: boolean;
      team_achieved: boolean;
    }> = [];

    const calculatedAt = new Date().toISOString();

    for (const c of calcs) {
      const teamBonus = teamAchieved ? teamBonusAmount : 0;
      const bonusBreakdown = {
        base_salary: c.base_salary,
        rarity_bonus: c.rarity_bonus,
        kol_commission: c.kol_commission,
        team_bonus: teamBonus,
      };
      const totalPayout = Object.values(bonusBreakdown).reduce((s, v) => s + Number(v || 0), 0);

      const { data: existing } = await supabase
        .from("scout_monthly_payouts")
        .select("id, payout_status, locked_at")
        .eq("scout_id", c.scout_id)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();

      if (existing?.locked_at) {
        results.push({
          scout_id: c.scout_id,
          display_name: c.display_name,
          total_payout: 0,
          individual_achieved: c.individual_achieved,
          team_achieved: teamAchieved,
        });
        continue;
      }

      const payload = {
        year,
        month,
        scout_id: c.scout_id,
        base_salary: c.base_salary,
        team_bonus: teamBonus,
        kol_commission: c.kol_commission,
        total_payout: totalPayout,
        bonus_breakdown: bonusBreakdown,
        individual_achieved: c.individual_achieved,
        team_achieved: teamAchieved,
        kol_commission_rate: c.commission_rate,
        individual_target_snapshot: {
          managed_venue: c.managed_venue,
          personal_min: c.personal_min,
          individual_count: c.individual_count,
        },
        team_target_snapshot: {
          total_scouts: totalScouts,
          achieved_count: achievedCount,
          team_rate_pct: teamRate,
          threshold_pct: teamThresholdPct,
        },
        base_salary_rule: { base_salary: baseSalary },
        team_bonus_rule: { team_bonus: teamBonusAmount, threshold_pct: teamThresholdPct },
        data_source: "system_calculated",
        calculated_at: calculatedAt,
        payout_status: existing?.payout_status ?? "pending",
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
        scout_id: c.scout_id,
        display_name: c.display_name,
        total_payout: totalPayout,
        individual_achieved: c.individual_achieved,
        team_achieved: teamAchieved,
      });
    }

    return jsonResponse({
      success: true,
      year,
      month,
      scouts_calculated: results.length,
      results,
    });
  } catch (e) {
    console.error("[calculate-scout-payout] error:", e);
    return jsonResponse({ success: false, error: (e as Error).message }, 500);
  }
});
