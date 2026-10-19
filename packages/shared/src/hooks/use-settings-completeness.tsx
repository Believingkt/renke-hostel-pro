import { useCallback, useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { buildRagicRows, type AccRow } from "@lakeze/shared/lib/settingsCompleteness/ragicChecks";
import {
  buildBonusGlobalRows,
  buildBonusVenueRows,
  type PeriodRow,
} from "@lakeze/shared/lib/settingsCompleteness/bonusChecks";
import type { GlobalCheckRow, VenueCheckRow } from "@lakeze/shared/lib/settingsCompleteness/types";

interface State {
  ragicRows: VenueCheckRow[];
  bonusVenueRows: VenueCheckRow[];
  bonusGlobalRows: GlobalCheckRow[];
  /** 因 RLS 讀不到而不可信任的檢查 key（避免對無權限角色誤報缺漏） */
  blockedChecks: string[];
  loading: boolean;
}

/** 台北時區今日 yyyy-MM-dd */
function taipeiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

/**
 * 一次抓齊三個檢查群組所需資料（單趟平行查詢），再交給純函式判讀。
 * 三個群組共用 accommodation_info 與合作期間，避免重複查詢。
 */
export function useSettingsCompleteness() {
  const [state, setState] = useState<State>({
    ragicRows: [],
    bonusVenueRows: [],
    bonusGlobalRows: [],
    blockedChecks: [],
    loading: true,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const today = taipeiToday();
    const month = today.slice(0, 7);

    const [
      accRes,
      ruleRes,
      consultRes,
      periodRes,
      bookingRes,
      commissionRes,
      profileRes,
      closingRes,
      tierRes,
      rateRes,
      sharedRes,
      kolRes,
      closerTeamRes,
      multiplierRes,
      roleRes,
      quotaRes,
      scoutTierRes,
      scoutSalaryRes,
      amSettingsRes,
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
        .select(
          "accommodation_id, start_date, end_date, counts_team_bonus, counts_closer_commission, payout_basis",
        ),
      supabase.from("booking_settings").select("accommodation_id, manual_refund_fee_amount"),
      supabase
        .from("accommodation_commission_settings")
        .select("accommodation_id, closer_rate, video_rate, effective_from")
        .lte("effective_from", today)
        .order("effective_from", { ascending: false }),
      supabase
        .from("team_member_profiles")
        .select("am_managed_accommodation_ids, is_active, resigned_at"),
      supabase
        .from("teamcommission_venue_closing_assignments")
        .select("accommodation_id, effective_from")
        .lte("effective_from", today),
      supabase
        .from("venue_team_bonus_tier_rules")
        .select("accommodation_id, effective_from")
        .lte("effective_from", today),
      supabase
        .from("teamcommission_bonus_rate_settings")
        .select("bonus_type, effective_from")
        .lte("effective_from", today),
      supabase
        .from("teamcommission_shared_revenue_source_whitelist")
        .select("included_order_sources, effective_from")
        .lte("effective_from", today)
        .order("effective_from", { ascending: false })
        .limit(1),
      supabase
        .from("teamcommission_kol_revenue_source_whitelist")
        .select("included_order_sources, effective_from")
        .lte("effective_from", today)
        .order("effective_from", { ascending: false })
        .limit(1),
      supabase
        .from("closer_team_bonus_settings")
        .select("bonus_rate, effective_from")
        .lte("effective_from", today)
        .order("effective_from", { ascending: false })
        .limit(1),
      supabase.from("bonus_multiplier_settings").select("bonus_type, multiplier, start_month, end_month"),
      supabase
        .from("teamcommission_role_bindings")
        .select("role_type, effective_from")
        .lte("effective_from", today),
      supabase
        .from("kol_reciprocal_monthly_quotas")
        .select("accommodation_id, quota")
        .eq("year_month", month),
      supabase.from("scout_tier_settings").select("id").lte("effective_from", today).limit(1),
      supabase.from("scout_salary_settings").select("id").lte("effective_from", today).limit(1),
      supabase
        .from("accommodation_am_settings" as any)
        .select("accommodation_id")
        .eq("am_not_required", true),
    ]);

    const accs = ((accRes.data ?? []) as AccRow[]).filter((a) => a.id && a.name);
    const periods = (periodRes.data ?? []) as unknown as PeriodRow[];

    const ragicRows = buildRagicRows({
      today,
      accs,
      rules: (ruleRes.data ?? []) as any[],
      consults: (consultRes.data ?? []) as any[],
      periods: periods as any[],
      bookings: (bookingRes.data ?? []) as any[],
    });

    const amManagedIds = ((profileRes.data ?? []) as any[])
      .filter((p) => p.is_active !== false && !p.resigned_at)
      .flatMap((p) => (p.am_managed_accommodation_ids ?? []) as string[]);

    const bonusVenueRows = buildBonusVenueRows({
      today,
      accs,
      periods,
      commissionSettings: (commissionRes.data ?? []) as any[],
      amManagedIds,
      amNotRequiredIds: ((amSettingsRes.data ?? []) as any[]).map((r) => r.accommodation_id),
      venueClosingAccIds: ((closingRes.data ?? []) as any[]).map((r) => r.accommodation_id),
      tierRuleAccIds: ((tierRes.data ?? []) as any[]).map((r) => r.accommodation_id),
      kolQuotaAccIds: ((quotaRes.data ?? []) as any[])
        .filter((r) => Number(r.quota) > 0)
        .map((r) => r.accommodation_id),
    });

    const activeMultipliers = ((multiplierRes.data ?? []) as any[])
      .filter((m) => {
        const s = m.start_month ? String(m.start_month).slice(0, 7) : null;
        const e = m.end_month ? String(m.end_month).slice(0, 7) : null;
        return (!s || month >= s) && (!e || month <= e) && Number(m.multiplier) !== 1;
      })
      .map((m) => ({ bonus_type: m.bonus_type, multiplier: Number(m.multiplier) }));

    const bonusGlobalRows = buildBonusGlobalRows({
      today,
      rateBonusTypes: Array.from(
        new Set(((rateRes.data ?? []) as any[]).map((r) => r.bonus_type as string)),
      ),
      sharedSources: ((sharedRes.data ?? [])[0] as any)?.included_order_sources ?? null,
      kolSources: ((kolRes.data ?? [])[0] as any)?.included_order_sources ?? null,
      boundRoleTypes: Array.from(
        new Set(((roleRes.data ?? []) as any[]).map((r) => r.role_type as string)),
      ),
      hasCloserTeamBonus: (closerTeamRes.data ?? []).length > 0,
      hasScoutTiers: (scoutTierRes.data ?? []).length > 0,
      hasScoutSalary: (scoutSalaryRes.data ?? []).length > 0,
      activeMultipliers,
    });

    // 讀取被 RLS 擋下時，該群組的檢查結果不可信任，統一標記為 blocked
    const blockedChecks = [
      ...(ruleRes.error ? ["settlementRule", "marketingFee", "legacyRate"] : []),
      ...(periodRes.error ? ["partnership", "teamBonusFlag", "closerFlag", "payoutBasis"] : []),
      ...(bookingRes.error ? ["bookingSetting"] : []),
      ...(commissionRes.error ? ["closerRate", "videoRate"] : []),
      ...(profileRes.error ? ["amScope"] : []),
      ...(closingRes.error ? ["venueClosing"] : []),
      ...(tierRes.error ? ["tierRule"] : []),
      ...(quotaRes.error ? ["kolQuota"] : []),
      ...(rateRes.error ? ["rate_version"] : []),
      ...(sharedRes.error ? ["shared_sources"] : []),
      ...(kolRes.error ? ["kol_sources"] : []),
      ...(roleRes.error ? ["role_binding"] : []),
      ...(closerTeamRes.error ? ["closer_team_bonus"] : []),
      ...(scoutTierRes.error ? ["scout_tier"] : []),
      ...(scoutSalaryRes.error ? ["scout_salary"] : []),
      ...(multiplierRes.error ? ["bonus_multiplier"] : []),
    ];

    setState({ ragicRows, bonusVenueRows, bonusGlobalRows, blockedChecks, loading: false });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
