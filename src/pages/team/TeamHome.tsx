import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Eye } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTeam } from "@/components/team/TeamContext";
import { supabase } from "@/integrations/supabase/client";
import { createTeamViewClient } from "@/lib/teamViewClient";
import type { TeamRole } from "@/components/team/teamConfig";
import { payoutMonthKeyFromDataMonth, pickMultiplier, type BonusMultiplierRow } from "@/lib/bonusMultiplier";
import { countsTowardTeamTarget, evaluateTeamAchievement } from "@/lib/scoutTeamAchievement";
import PayoutPeriodBanner from "@/components/team/PayoutPeriodBanner";
import {
  resolveNextPayoutPeriod,
  resolvePrevPayoutPeriod,
  resolveFollowingPayoutPeriod,
} from "@/lib/scoutPayoutPeriod";


import {
  getBonusRateSettings,
  getRoleBinding,
  getRevenueSourceWhitelist,
  getAccommodationRevenue,
  getAccommodationRevenueByAcc,
  getVenueClosingAccommodations,
  getMarketingFeeFlags,
} from "@/lib/teamBonusRevenue";
/** 館別營收／獎金明細列 */
interface VenueRevenueLine {
  name: string;
  revenue: number;
  amount: number;
}


function taipeiParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

// UTC ISO representing Taipei wall-clock (y, m, d) 00:00 (Taipei = UTC+8)
function taipeiMidnightUtcISO(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0)).toISOString();
}

// Taipei-zone YYYY-MM-DD string
function taipeiDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

// 成交組分潤費率由 preview-closer-commission Edge Function 統一計算，
// 此處不再保留前端費率挑選邏輯。


export default function TeamHome() {
  const { userId: selfUserId, displayName: selfDisplayName, roles: selfRoles } = useTeam();

  // ===== 管理員檢視模式 =====
  // 具備 super_admin / admin 全域角色者，可切換檢視其他成員的 TeamHome 總覽。
  // 預設一律先看自己；切換後資料改由 team-view-query Edge Function（service role）取得，
  // 計算邏輯完全沿用同一份程式碼。
  const isAdminViewer = selfRoles.includes("super_admin") || selfRoles.includes("admin");
  const [viewAsUserId, setViewAsUserId] = useState<string | null>(null);
  const [viewAsRoles, setViewAsRoles] = useState<TeamRole[]>([]);
  const [members, setMembers] = useState<
    Array<{ user_id: string; display_name: string; roles: TeamRole[] }>
  >([]);

  const isViewing = Boolean(viewAsUserId);
  const viewUserId = viewAsUserId ?? selfUserId;
  const roles = isViewing ? viewAsRoles : selfRoles;
  const displayName = isViewing
    ? members.find((m) => m.user_id === viewAsUserId)?.display_name ?? "成員"
    : selfDisplayName;

  const db = useMemo(
    () => (viewAsUserId ? (createTeamViewClient() as any) : (supabase as any)),
    [viewAsUserId],
  );

  // 管理員：載入可檢視的成員清單（含各自角色）
  useEffect(() => {
    if (!isAdminViewer) return;
    let cancelled = false;
    (async () => {
      const view = createTeamViewClient() as any;
      const [{ data: profiles }, { data: roleRows }] = await Promise.all([
        view.from("team_member_profiles").select("user_id, display_name"),
        view.from("user_roles").select("user_id, role").is("accommodation_id", null),
      ]);
      if (cancelled) return;
      const roleMap = new Map<string, TeamRole[]>();
      for (const r of (roleRows ?? []) as any[]) {
        if (!r?.user_id) continue;
        const list = roleMap.get(r.user_id) ?? [];
        if (!list.includes(r.role as TeamRole)) list.push(r.role as TeamRole);
        roleMap.set(r.user_id, list);
      }
      const list = ((profiles ?? []) as any[])
        .filter((p) => p?.user_id && roleMap.has(p.user_id))
        .map((p) => ({
          user_id: p.user_id as string,
          display_name: (p.display_name as string) || "未命名",
          // 排除財務角色（不參與獎金檢視）
          roles: (roleMap.get(p.user_id) ?? []).filter((r) => r !== "finance"),
        }))
        .filter((m) => m.roles.length > 0)
        .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh-Hant"));
      setMembers(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdminViewer]);

  const handleViewAs = (value: string) => {
    if (value === "self") {
      setViewAsUserId(null);
      setViewAsRoles([]);
      return;
    }
    const m = members.find((x) => x.user_id === value);
    setViewAsUserId(value);
    setViewAsRoles(m?.roles ?? []);
  };

  const hasRole = (r: TeamRole) => roles.includes(r);
  const showCloser = hasRole("closer") || hasRole("closer_manager");
  const showVideo = hasRole("video");
  const showScout = hasRole("scout") || hasRole("scout_manager");
  const showFranchise = hasRole("franchise") || hasRole("franchise_manager");
  const showStarlink = hasRole("starlink");
  const showAM = hasRole("am");

  // 只要是任一 team 角色成員就進入查詢流程（部分角色需 async 判斷，
  // 最終以 cards.length === 0 顯示「暫無獎金項目」）
  const anyCard = roles.length > 0;


  const [loading, setLoading] = useState(true);
  const [closerAmt, setCloserAmt] = useState(0);
  const [scoutCloserAmt, setScoutCloserAmt] = useState(0);
  const [closerTeamBonusAmt, setCloserTeamBonusAmt] = useState(0);
  const [closerTeamBonusRate, setCloserTeamBonusRate] = useState(0);
  const [closerTeamBonusNoSetting, setCloserTeamBonusNoSetting] = useState(false);
  const [closerTeamBonusFinalized, setCloserTeamBonusFinalized] = useState(false);
  const [videoAmt, setVideoAmt] = useState(0);
  const [scoutAmt, setScoutAmt] = useState(0);
  const [rarityAmt, setRarityAmt] = useState(0);
  const [baseSalaryAmt, setBaseSalaryAmt] = useState(0);
  const [teamBonusAmt, setTeamBonusAmt] = useState(0);
  const [isScoutTeamMember, setIsScoutTeamMember] = useState(false);
  const [franchiseInternalAmt, setFranchiseInternalAmt] = useState(0);
  const [franchiseExternalAmt, setFranchiseExternalAmt] = useState(0);
  const [starlinkAmt, setStarlinkAmt] = useState(0);
  const [multiplierRows, setMultiplierRows] = useState<BonusMultiplierRow[]>([]);

  // ===== 七種團隊獎金 =====
  const [isAmManager, setIsAmManager] = useState(false);
  const [isCloserManager, setIsCloserManager] = useState(false);
  const [isKolBonusRecipient, setIsKolBonusRecipient] = useState(false);
  const [amPerformanceAmt, setAmPerformanceAmt] = useState(0);
  const [amVenueBonusAmt, setAmVenueBonusAmt] = useState(0);
  const [closerPerformanceAmt, setCloserPerformanceAmt] = useState(0);
  const [amManagerAmt, setAmManagerAmt] = useState(0);
  const [closerManagerAmt, setCloserManagerAmt] = useState(0);
  const [kolCommissionAmt, setKolCommissionAmt] = useState(0);
  const [kolMonthlyAmt, setKolMonthlyAmt] = useState(0);
  const [venueClosingAmt, setVenueClosingAmt] = useState(0);
  const [venueClosingDetail, setVenueClosingDetail] = useState<
    Array<{ name: string; amount: number }>
  >([]);
  const [revenueBreakdown, setRevenueBreakdown] = useState<Record<string, VenueRevenueLine[]>>({});
  const [detailCardKey, setDetailCardKey] = useState<string | null>(null);
  const [missingRates, setMissingRates] = useState<Record<string, boolean>>({});
  // 星探系是否來自後端正式試算（scout_monthly_payouts）
  const [scoutFromPayout, setScoutFromPayout] = useState(false);
  // 月結系是否已由後端結算（snapshot 存在）
  const [monthlySettled, setMonthlySettled] = useState(false);

  // ===== 期別（台北時間）=====
  const nextPeriod = useMemo(() => resolveNextPayoutPeriod(), []);
  const prevPeriod = useMemo(() => resolvePrevPayoutPeriod(nextPeriod), [nextPeriod]);
  const [viewingPrev, setViewingPrev] = useState(false);
  const activePeriod = viewingPrev ? prevPeriod : nextPeriod;
  const followingPeriod = useMemo(
    () => resolveFollowingPayoutPeriod(activePeriod),
    [activePeriod],
  );

  const monthInfo = useMemo(() => {
    const p = activePeriod;
    const now = taipeiParts();
    // 月結型資料月 ＝ 發放月 - 1
    const dY = p.dataYear;
    const dM = p.dataMonth;
    // 資料月的前一個月（加盟寬鬆抓取用）
    const prevY = dM === 1 ? dY - 1 : dY;
    const prevM = dM === 1 ? 12 : dM - 1;

    return {
      // 月結型資料月
      y: dY,
      m: dM,
      today: taipeiDateStr(now.y, now.m, now.d),
      currentMonthKey: p.dataMonthKey,
      monthStartIso: taipeiMidnightUtcISO(dY, dM, 1),
      monthEndIso: taipeiMidnightUtcISO(p.year, p.month, 1),
      monthStartDate: taipeiDateStr(dY, dM, 1),
      monthEndDate: taipeiDateStr(p.year, p.month, 1),
      // 星探底薪／團隊獎金：kpi_month ＝ 發放月 - 1（＝資料月）
      prevMonthStartDate: taipeiDateStr(dY, dM, 1),
      prevMonthEndDate: taipeiDateStr(p.year, p.month, 1),
      prevY,
      prevM,
      // 發放期別
      payoutY: p.year,
      payoutM: p.month,
      period: p.period,
      payoutMonthKey: p.payoutMonthKey,
      isMonthlyPayout: p.isMonthlyPayout,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      periodLabel: `${p.label}（資料窗 ${p.windowLabel}）`,
      dataMonthLabel: `${dY} 年 ${dM} 月`,
      payoutLabel: p.label,
    };
  }, [activePeriod]);

  useEffect(() => {
    if (!anyCard) {
      setLoading(false);
      return;
    }
    const userId = viewUserId;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const {
          today,
          monthStartIso,
          monthEndIso,
          monthStartDate,
          monthEndDate,
          prevMonthStartDate,
          prevMonthEndDate,
          prevY,
          prevM,
          periodStart,
          periodEnd,
          currentMonthKey,
          payoutY,
          payoutM,
          period,
          payoutMonthKey,
          isMonthlyPayout,
        } = monthInfo;

        // profile id (for scout / franchise external / 團隊獎金角色綁定)
        let profileId: string | null = null;
        let myManagedAccIds: string[] = [];
        let scoutTeamMember = false;
        let myEmploymentType: string | null = null;
        let myFulltimeStart: string | null = null;
        {
          const { data } = await db
            .from("team_member_profiles")
            .select(
              "id, is_scout_team_member, employment_type, fulltime_start_yearmonth, am_managed_accommodation_ids",
            )
            .eq("user_id", userId)
            .maybeSingle();
          profileId = (data?.id as string | undefined) ?? null;
          const d = data as
            | {
                is_scout_team_member?: boolean;
                employment_type?: string;
                fulltime_start_yearmonth?: string;
                am_managed_accommodation_ids?: string[] | null;
              }
            | null;
          scoutTeamMember = !!d?.is_scout_team_member;
          myEmploymentType = d?.employment_type ?? null;
          myFulltimeStart = d?.fulltime_start_yearmonth ?? null;
          myManagedAccIds = Array.isArray(d?.am_managed_accommodation_ids)
            ? (d!.am_managed_accommodation_ids as string[]).filter(Boolean)
            : [];
        }

        // ===== Closer / Video =====
        // 月結型獎金只在 10 日期發放；25 日期直接不計算、不查詢。
        // 已有正式快照（closer_commission_snapshots）時以快照為準，與發放管理一致；
        // 尚未結算則改由 preview-closer-commission Edge Function 試算（公式相同）。
        const needMeta = (showCloser || showVideo) && isMonthlyPayout;
        let closerSum = 0;
        let videoSum = 0;
        let monthlySettledFlag = false;

        if (needMeta) {
          const { data: snapRows } = await db
            .from("closer_commission_snapshots")
            .select("closer_id, video_creator_id, closer_commission_amount, video_commission_amount")
            .eq("payout_month", payoutMonthKey)
            .or(`closer_id.eq.${userId},video_creator_id.eq.${userId}`);

          const snaps = (snapRows ?? []) as any[];
          if (snaps.length > 0) {
            monthlySettledFlag = true;
            for (const r of snaps) {
              if (showCloser && r.closer_id === userId) {
                closerSum += Number(r.closer_commission_amount ?? 0);
              }
              if (showVideo && r.video_creator_id === userId) {
                videoSum += Number(r.video_commission_amount ?? 0);
              }
            }
          } else {
            const { data: preview } = await supabase.functions.invoke(
              "preview-closer-commission",
              { body: { year: monthInfo.y, month: monthInfo.m, scope: "self", target_user_id: userId } },
            );
            if (preview?.success) {
              if (showCloser) closerSum = Number(preview.self?.closer_commission ?? 0);
              if (showVideo) videoSum = Number(preview.self?.video_commission ?? 0);
            }
          }
        }




        // ===== 星探成交獎金（scout_discount_codes partner，成交人 = 自己）=====
        let scoutCloserSum = 0;
        if (showCloser && isMonthlyPayout) {
          const { data: partnerCodes } = await db
            .from("scout_discount_codes")
            .select("discount_code, closer_rate")
            .eq("commission_type", "partner")
            .gt("closer_rate", 0)
            .eq("is_active", true);

          const rateMap = new Map<string, number>();
          (partnerCodes ?? []).forEach((c: any) => {
            if (c.discount_code && Number(c.closer_rate) > 0) {
              rateMap.set(String(c.discount_code).trim().toUpperCase(), Number(c.closer_rate));
            }
          });

          if (rateMap.size > 0) {
            const { data: ords } = await db
              .from("orders")
              .select("id, discount_code, final_price, order_date")
              .neq("order_status", "cancelled")
              .not("discount_code", "is", null)
              .gte("order_date", monthStartIso)
              .lt("order_date", monthEndIso);

            const orderList = ords ?? [];
            const orderIds = orderList.map((o: any) => o.id);
            const closerByOrderId = new Map<string, string>();
            const excluded = new Set<string>();
            if (orderIds.length > 0) {
              const { data: metas2 } = await db
                .from("order_meta")
                .select("order_id, closer_id, is_excluded")
                .in("order_id", orderIds);
              (metas2 ?? []).forEach((m: any) => {
                if (m.is_excluded === true) excluded.add(m.order_id);
                if (m.closer_id) closerByOrderId.set(m.order_id, m.closer_id);
              });
            }

            for (const o of orderList) {
              if (excluded.has(o.id)) continue;
              if (closerByOrderId.get(o.id) !== userId) continue;
              const rate = rateMap.get(String(o.discount_code).trim().toUpperCase());
              if (!rate) continue;
              scoutCloserSum += Math.round(Number(o.final_price ?? 0) * rate);
            }
          }
        }

        // ===== 成交組團隊獎金 =====
        // 已定案：顯示個人分配金額；未定案：顯示當月累積預估池
        let closerTeamBonusSum = 0;
        let closerTeamBonusRateVal = 0;
        let closerTeamBonusNoSet = false;
        let closerTeamBonusFinalizedFlag = false;
        if (showCloser && isMonthlyPayout) {
          const { data: bonusSetting } = await db
            .from("closer_team_bonus_settings")
            .select("bonus_rate, effective_from")
            .lte("effective_from", monthInfo.monthStartDate)
            .order("effective_from", { ascending: false })
            .limit(1)
            .maybeSingle();
          const bonusRate = Number((bonusSetting as any)?.bonus_rate ?? 0);
          closerTeamBonusRateVal = bonusRate;

          if (bonusRate > 0) {
            // 先查自己是否已有定案分配
            const { data: ownDist } = await db
              .from("closer_team_bonus_distribution")
              .select("bonus_amount, is_finalized")
              .eq("year", monthInfo.y)
              .eq("month", monthInfo.m)
              .eq("is_finalized", true)
              .eq("closer_id", userId)
              .maybeSingle();

            if (ownDist && (ownDist as any).is_finalized) {
              closerTeamBonusFinalizedFlag = true;
              closerTeamBonusSum = Math.round(Number((ownDist as any).bonus_amount ?? 0));
              closerTeamBonusNoSet = false;
            } else {
              // 未定案：全隊當月累積預估池（同樣改由 Edge Function 試算）
              const { data: teamPreview } = await supabase.functions.invoke(
                "preview-closer-commission",
                { body: { year: monthInfo.y, month: monthInfo.m, scope: "team" } },
              );
              if (teamPreview?.success) {
                const totalCloserCommission = Number(teamPreview.team?.closer_commission ?? 0);
                closerTeamBonusSum = Math.round(totalCloserCommission * bonusRate);
              }


              // 檢查全隊是否已有分配資料（任何 finalized 記錄）
              const { data: dist } = await db
                .from("closer_team_bonus_distribution")
                .select("id")
                .eq("year", monthInfo.y)
                .eq("month", monthInfo.m)
                .eq("is_finalized", true)
                .limit(1);
              closerTeamBonusNoSet = !dist || dist.length === 0;
            }
          }
        }



        // ===== Scout: KOL 分潤 / 稀有度 / 底薪 / 團隊獎金 =====
        let scoutSum = 0;
        let raritySum = 0;
        let baseSalary = 0;
        let teamBonus = 0;

        if (showScout) {
          // (a) 收集所有歷史 kpi_qualified cid_code
          const [
            { data: qualifiedKols },
            { data: sdc },
            cumulativeRes,
            { data: tierRows },
          ] = await Promise.all([
            db
              .from("kol_profiles")
              .select("cid_code")
              .eq("scout_id", userId)
              .eq("kpi_qualified", true)
              .not("cid_code", "is", null),
            profileId
              ? db
                  .from("scout_discount_codes")
                  .select("discount_code")
                  .eq("scout_id", profileId)
              : Promise.resolve({ data: [] as any[] }),
            db
              .from("kol_profiles")
              .select("id", { count: "exact", head: true })
              .eq("scout_id", userId)
              .eq("kpi_qualified", true),
            db
              .from("scout_tier_settings")
              .select("min_count, max_count, commission_rate, effective_from")
              .lte("effective_from", today)
              .order("effective_from", { ascending: false }),
          ]);

          const cidUpperSet = new Set<string>();
          (qualifiedKols ?? []).forEach((r: any) => {
            if (r.cid_code) cidUpperSet.add(String(r.cid_code).trim().toUpperCase());
          });
          (sdc ?? []).forEach((r: any) => {
            if (r.discount_code) cidUpperSet.add(String(r.discount_code).trim().toUpperCase());
          });

          const cumulativeCount = Number(cumulativeRes.count ?? 0);

          // tier rate: dedupe by min_count-max_count (keep newest effective_from)
          const tierMap = new Map<string, { min: number; max: number | null; rate: number }>();
          for (const t of (tierRows ?? []) as any[]) {
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
          let commissionRate = 0;
          for (const t of tiers) {
            if (cumulativeCount >= t.min && (t.max == null || cumulativeCount <= t.max)) {
              commissionRate = t.rate;
              break;
            }
          }

          // KOL 分潤: 期別內 check_in_date 且 discount_code 對應 cid
          if (cidUpperSet.size > 0 && commissionRate > 0) {
            const { data: kolOrders } = await db
              .from("orders")
              .select("final_price, discount_code, order_status, check_in_date")
              .neq("order_status", "cancelled")
              .not("discount_code", "is", null)
              .gte("check_in_date", periodStart)
              .lte("check_in_date", periodEnd);

            let sumPrice = 0;
            for (const o of kolOrders ?? []) {
              const code = String((o as any).discount_code ?? "").trim().toUpperCase();
              if (!cidUpperSet.has(code)) continue;
              sumPrice += Number((o as any).final_price ?? 0);
            }
            scoutSum = sumPrice * commissionRate;
          }

          // 稀有度獎金：逐筆依「邀約 check_in_date 所屬年月」判定正職（與後端 calculate-scout-payout 一致）
          //   check_in_date 年月 >= fulltime_start_yearmonth → 正職規則：N/R 不計獎，
          //     SR/SSR/UR 依 created_at 升序超過 30 位後第 31 筆起才計獎
          //   其餘（起始月之前的跨月區段、兼職）→ 每筆全額計獎
          // 底薪／團隊獎金用：以結算年月判定
          const isFullTime =
            myEmploymentType === "fulltime" &&
            !!myFulltimeStart &&
            myFulltimeStart <= currentMonthKey;
          const startYMDigits =
            myEmploymentType === "fulltime" && myFulltimeStart
              ? String(myFulltimeStart).replace(/[^0-9]/g, "").slice(0, 6)
              : null;
          const ymOf = (d: any) =>
            d ? String(d).slice(0, 7).replace("-", "") : null;
          const rowIsFulltime = (r: any) => {
            if (!startYMDigits || startYMDigits.length !== 6) return false;
            const ym = ymOf(r.check_in_date);
            return !!ym && startYMDigits <= ym;
          };

          const [{ data: rarityRows }, { data: periodKols }] = await Promise.all([
            db
              .from("kol_rarity_settings")
              .select("rarity, bonus_amount, effective_from")
              .lte("effective_from", today)
              .order("effective_from", { ascending: false }),
            db
              .from("kol_profiles")
              .select("rarity, check_in_date, invited_at, is_error, kpi_qualified, created_at")
              .eq("scout_id", userId)
              .eq("kpi_qualified", true)
              .eq("is_error", false)
              .not("invited_at", "is", null)
              .gte("check_in_date", periodStart)
              .lte("check_in_date", periodEnd)
              .order("created_at", { ascending: true }),
          ]);

          const rarityMap = new Map<string, number>();
          for (const r of (rarityRows ?? []) as any[]) {
            if (!rarityMap.has(r.rarity)) rarityMap.set(r.rarity, Number(r.bonus_amount ?? 0));
          }
          const rows = ((periodKols ?? []) as any[]).filter((r) => {
            const rar = String(r.rarity ?? "");
            return rar && rar !== "ck";
          });
          const ftRows = rows.filter(rowIsFulltime);
          const ptRows = rows.filter((r) => !rowIsFulltime(r));
          const ftRare = ftRows
            .filter((r) => ["SR", "SSR", "UR"].includes(String(r.rarity ?? "")))
            .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
          for (const r of ftRare.slice(30)) {
            raritySum += rarityMap.get(String(r.rarity ?? "")) ?? 0;
          }
          for (const r of ptRows) {
            raritySum += rarityMap.get(String(r.rarity ?? "")) ?? 0;
          }


          // 底薪 / 團隊獎金 — 僅 is_scout_team_member 才計，kpi_month = 上月月初
          if (scoutTeamMember) {
            const [{ data: salaryRow }, { data: targetsData }, { data: myPrevKols }] = await Promise.all([
              db
                .from("scout_salary_settings")
                .select("base_salary, team_bonus, effective_from")
                .lte("effective_from", today)
                .order("effective_from", { ascending: false })
                .limit(1)
                .maybeSingle(),
              db
                .from("scout_team_targets")
                .select("venue_id, venue_name, personal_min, target_count")
                // 與後端 calculate-scout-payout 一致：門檻用「結算年月（本月）」設定，
                // 實際邀約數則用 kpi_month = 上月。
                .eq("year", monthInfo.y)
                .eq("month", monthInfo.m),
              db
                .from("kol_profiles")
                .select("venue_id, venue_name, kpi_month")
                .eq("scout_id", userId)
                .eq("kpi_qualified", true)
                .eq("is_error", false)
                .not("invited_at", "is", null)
                .eq("kpi_month", prevMonthStartDate),
            ]);

            const baseSalaryAmount = Number((salaryRow as any)?.base_salary ?? 0);
            const teamBonusAmount = Number((salaryRow as any)?.team_bonus ?? 0);

            // 子館別 → 母館 venue_id normalize（用於 JOIN scout_team_targets）
            const { data: kolVenuesData } = await db
              .from("kol_venues" as any)
              .select("id, accommodation_id, room_type_id");
            const kvs = ((kolVenuesData ?? []) as unknown) as Array<{ id: string; accommodation_id: string | null; room_type_id: string | null }>;
            const childToParent = new Map<string, string>();
            for (const v of kvs) {
              if (v.room_type_id) {
                const parent = kvs.find((p) => p.accommodation_id === v.accommodation_id && !p.room_type_id);
                if (parent) childToParent.set(v.id, parent.id);
              }
            }
            const normVenueId = (vid: string | null | undefined) =>
              vid ? (childToParent.get(vid) ?? vid) : null;
            // 分組 key：先 normalize 子館別 → 母館，NULL 時用 name:<venue_name> 作為 fallback
            const groupKey = (venueId: string | null | undefined, venueName: string | null | undefined) => {
              const rid = normVenueId(venueId);
              return rid ? `id:${rid}` : `name:${venueName ?? "—"}`;
            };
            const targetList = ((targetsData ?? []) as any[])
              .map((t) => ({
                key: groupKey(t.venue_id, t.venue_name),
                venue_id: (t.venue_id ?? null) as string | null,
                venue_name: (t.venue_name ?? "—") as string,
                personal_min: Number(t.personal_min ?? 0),
                target_count: Number(t.target_count ?? 0),
              }))
              .filter((t) => t.personal_min > 0 || t.target_count > 0);

            if (targetList.length > 0) {
              // 個人達標（底薪）— 兼職才發，正職不發底薪
              if (!isFullTime) {
                let allPersonalOk = true;
                for (const t of targetList) {
                  if (t.personal_min <= 0) continue;
                  const actual = ((myPrevKols ?? []) as any[]).filter(
                    (r) => groupKey(r.venue_id, r.venue_name) === t.key,
                  ).length;
                  if (actual < t.personal_min) {
                    allPersonalOk = false;
                    break;
                  }
                }
                if (allPersonalOk) baseSalary = baseSalaryAmount;
              }


              // 團隊達標：所有 scout team members，兼職全計、正職只計 SR/SSR/UR
              const { data: allScouts } = await db
                .from("team_member_profiles")
                .select("user_id, employment_type, fulltime_start_yearmonth")
                .eq("is_scout_team_member", true);
              const scoutRows = ((allScouts ?? []) as any[]).filter((s) => !!s.user_id);
              const scoutIds = scoutRows.map((s) => s.user_id as string);
              const fulltimeSet = new Set<string>(
                scoutRows
                  .filter(
                    (s) =>
                      s.employment_type === "fulltime" &&
                      !!s.fulltime_start_yearmonth &&
                      String(s.fulltime_start_yearmonth) <= currentMonthKey,
                  )
                  .map((s) => s.user_id as string),
              );

              if (scoutIds.length > 0) {
                const { data: teamKols } = await db
                  .from("kol_profiles")
                  .select("venue_id, venue_name, scout_id, rarity, kpi_month")
                  .in("scout_id", scoutIds)
                  .eq("kpi_qualified", true)
                  .eq("is_error", false)
                  .not("invited_at", "is", null)
                  .eq("kpi_month", prevMonthStartDate);

                // 共用 scoutTeamAchievement：兼職全量 ＋ 正職 SR/SSR/UR 累加
                const counts = new Map<string, { parttime: number; fulltime: number }>();
                for (const r of ((teamKols ?? []) as any[])) {
                  const k = groupKey(r.venue_id, r.venue_name);
                  const full = fulltimeSet.has(r.scout_id);
                  if (!countsTowardTeamTarget(full, r.rarity)) continue;
                  const cur = counts.get(k) ?? { parttime: 0, fulltime: 0 };
                  if (full) cur.fulltime += 1;
                  else cur.parttime += 1;
                  counts.set(k, cur);
                }
                const { achieved: teamOk } = evaluateTeamAchievement(targetList, counts);
                if (teamOk) teamBonus = teamBonusAmount;

              }
            }
          }
        }


        // ===== Franchise =====
        let franchiseInternalSum = 0;
        let franchiseExternalSum = 0;
        if (showFranchise && isMonthlyPayout) {
          // Widen fetch to ±3 months so we can pick up early_payout_month rows via JS filter
          const wideStart = taipeiDateStr(prevY, prevM, 1);
          const nextY3 = monthInfo.y + (monthInfo.m + 3 > 12 ? 1 : 0);
          const nextM3 = ((monthInfo.m + 3 - 1) % 12) + 1;
          const wideEnd = taipeiDateStr(nextY3, nextM3, 1);

          // currentMonthKey already destructured above
          const matches = (r: any, dateField: string) => {
            const ep = (r?.early_payout_month ?? null) as string | null;
            if (ep) return ep === currentMonthKey;
            return String(r?.[dateField] ?? "").slice(0, 7) === currentMonthKey;
          };

          const { data: fInternal } = await db
            .from("franchise_orders")
            .select("commission_amount, sold_by, payment_confirmed, sold_at, early_payout_month")
            .eq("sold_by", userId)
            .eq("payment_confirmed", true)
            .gte("sold_at", wideStart)
            .lt("sold_at", wideEnd);
          for (const r of fInternal ?? []) {
            if (!matches(r, "sold_at")) continue;
            franchiseInternalSum += Number((r as any).commission_amount ?? 0);
          }

          if (profileId) {
            const { data: fExt } = await db
              .from("franchise_external_orders")
              .select(
                "sales_member_id, co_sales_member_id, co_sales_member_id2, sales_bonus, co_sales_bonus, co_sales_bonus2, contract_progress, signed_at, early_payout_month",
              )
              .eq("contract_progress", "已完成")
              .gte("signed_at", wideStart)
              .lt("signed_at", wideEnd)
              .or(
                `sales_member_id.eq.${profileId},co_sales_member_id.eq.${profileId},co_sales_member_id2.eq.${profileId}`,
              );

            for (const r of fExt ?? []) {
              if (!matches(r, "signed_at")) continue;
              const row = r as any;
              if (row.sales_member_id === profileId) {
                franchiseExternalSum += Number(row.sales_bonus ?? 0);
              }
              if (row.co_sales_member_id === profileId) {
                franchiseExternalSum += Number(row.co_sales_bonus ?? 0);
              }
              if (row.co_sales_member_id2 === profileId) {
                franchiseExternalSum += Number(row.co_sales_bonus2 ?? 0);
              }
            }
          }
        }

        // ===== Starlink =====
        let starlinkSum = 0;
        if (showStarlink && isMonthlyPayout) {
          const { data: slOrders } = await db
            .from("starlink_orders")
            .select("commission_amount, sold_by, payment_confirmed, sold_at")
            .eq("sold_by", userId)
            .eq("payment_confirmed", true)
            .gte("sold_at", monthStartDate)
            .lt("sold_at", monthEndDate);
          for (const r of slOrders ?? []) {
            starlinkSum += Number((r as any).commission_amount ?? 0);
          }
        }

        // ===== 七種團隊獎金（來源：teamcommission_* 設定表）=====
        let amPerfSum = 0;
        let amVenueSum = 0;
        let closerPerfSum = 0;
        let amManagerSum = 0;
        let closerManagerSum = 0;
        let kolCommissionSum = 0;
        let kolMonthlySum = 0;
        let venueClosingSum = 0;
        let venueClosingLines: Array<{ name: string; amount: number }> = [];
        // 各獎金類型的「館別營收 / 館別獎金」明細
        const breakdown: Record<string, VenueRevenueLine[]> = {};
        const accNameFallback = new Map<string, string>();
        let amManagerFlag = false;
        let closerManagerFlag = false;
        let kolRecipientFlag = false;
        const missing: Record<string, boolean> = {};

        {
          const client = db as any;
          const [rateSettings, sharedSources, amManagerId, closerManagerId, kolRecipientId] =
            await Promise.all([
              getBonusRateSettings(client),
              getRevenueSourceWhitelist(client, "teamcommission_shared_revenue_source_whitelist"),
              getRoleBinding(client, "am_manager"),
              getRoleBinding(client, "closer_manager"),
              getRoleBinding(client, "kol_bonus_recipient"),
            ]);

          amManagerFlag = !!profileId && amManagerId === profileId;
          closerManagerFlag = !!profileId && closerManagerId === profileId;
          kolRecipientFlag = !!profileId && kolRecipientId === profileId;

          const needCompanyRevenue =
            amManagerFlag || closerManagerFlag || showCloser || kolRecipientFlag;

          // 全公司範圍：所有啟用館別
          let allAccIds: string[] = [];
          const allAccNameById = new Map<string, string>();
          if (needCompanyRevenue) {
            const { data: accs } = await db
              .from("accommodation_info")
              .select("id, name")
              .eq("is_active", true);
            ((accs ?? []) as any[]).forEach((a) => {
              if (a?.id) allAccNameById.set(a.id, String(a.name ?? ""));
            });
            allAccIds = ((accs ?? []) as any[]).map((a) => a.id).filter(Boolean);
          }

          // 旅行日系列不列入抽成類獎金（AM績效、AM總管、成交組績效、成交大師管理、網紅營銷專利）
          const revenueAccIds = allAccIds.filter(
            (id) => !(allAccNameById.get(id) ?? "").startsWith("旅行日"),
          );

          const companyByAcc =
            needCompanyRevenue && sharedSources.length > 0
              ? await getAccommodationRevenueByAcc(
                  client,
                  revenueAccIds,
                  monthStartDate,
                  monthEndDate,
                  sharedSources,
                )
              : {};
          const companyRevenue = Object.values(companyByAcc).reduce((s, v) => s + v, 0);

          // 依館別營收 → 產生「營收 / 獎金」明細列（獎金以該館營收 × rate 計）
          const linesOf = (byAcc: Record<string, number>, rate: number) =>
            Object.entries(byAcc)
              .filter(([, rev]) => rev > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([accId, rev]) => ({
                name: allAccNameById.get(accId) ?? accNameFallback.get(accId) ?? "其他",
                revenue: rev,
                amount: rev * rate,
              }));

          // (1) AM 績效獎金：管理場館營收 × rate（排除旅行日系列）
          //     AM 場域獎金：固定金額 × 管理場館數（排除旅行日系列）
          if (showAM) {
            // 過濾掉「旅行日」開頭的場館
            let myManagedAccIdsExcludingTravelDays: string[] = [];
            if (myManagedAccIds.length > 0) {
              const { data: mAccs } = await db
                .from("accommodation_info")
                .select("id, name")
                .in("id", myManagedAccIds);
              const nameMap = new Map(
                ((mAccs ?? []) as any[]).map((a) => [a.id as string, String(a.name ?? "")]),
              );
              nameMap.forEach((n, id) => accNameFallback.set(id, n));
              myManagedAccIdsExcludingTravelDays = myManagedAccIds.filter(
                (id) => !(nameMap.get(id) ?? "").startsWith("旅行日"),
              );
            }

            const s = rateSettings.am_performance;
            if (!s || s.rate == null) missing.am_performance = true;
            const myByAcc =
              myManagedAccIdsExcludingTravelDays.length > 0 && sharedSources.length > 0
                ? await getAccommodationRevenueByAcc(
                    client,
                    myManagedAccIdsExcludingTravelDays,
                    monthStartDate,
                    monthEndDate,
                    sharedSources,
                  )
                : {};
            const myRevenue = Object.values(myByAcc).reduce((sum, v) => sum + v, 0);
            amPerfSum = myRevenue * Number(s?.rate ?? 0);
            breakdown.am_performance = linesOf(myByAcc, Number(s?.rate ?? 0));

            const vs = rateSettings.am_venue_bonus;
            if (!vs || vs.fixed_amount == null) missing.am_venue_bonus = true;
            amVenueSum =
              Number(vs?.fixed_amount ?? 0) * myManagedAccIdsExcludingTravelDays.length;
          }

          // (2) 成交組績效獎金：全公司營收 × rate
          if (showCloser) {
            const s = rateSettings.closer_performance;
            if (!s || s.rate == null) missing.closer_performance = true;
            closerPerfSum = companyRevenue * Number(s?.rate ?? 0);
            breakdown.closer_performance = linesOf(companyByAcc, Number(s?.rate ?? 0));
          }

          // (3) AM 總管獎金：全公司營收 × rate（抽成制）
          if (amManagerFlag) {
            const s = rateSettings.am_manager;
            if (!s || s.rate == null) missing.am_manager = true;
            amManagerSum = companyRevenue * Number(s?.rate ?? 0);
            breakdown.am_manager = linesOf(companyByAcc, Number(s?.rate ?? 0));
          }

          // (4) 成交大師管理獎金：全公司營收 × rate
          if (closerManagerFlag) {
            const s = rateSettings.closer_manager;
            if (!s || s.rate == null) missing.closer_manager = true;
            closerManagerSum = companyRevenue * Number(s?.rate ?? 0);
            breakdown.closer_manager = linesOf(companyByAcc, Number(s?.rate ?? 0));
          }

          // (5)(6) 網紅營銷專利獎金 / 月費
          if (kolRecipientFlag) {
            const kolSources = await getRevenueSourceWhitelist(
              client,
              "teamcommission_kol_revenue_source_whitelist",
            );
            const kolByAcc =
              kolSources.length > 0
                ? await getAccommodationRevenueByAcc(
                    client,
                    revenueAccIds,
                    monthStartDate,
                    monthEndDate,
                    kolSources,
                  )
                : {};
            const kolRevenue = Object.values(kolByAcc).reduce((sum, v) => sum + v, 0);
            const sc = rateSettings.kol_commission;
            if (!sc || sc.rate == null) missing.kol_commission = true;
            kolCommissionSum = kolRevenue * Number(sc?.rate ?? 0);
            breakdown.kol_commission = linesOf(kolByAcc, Number(sc?.rate ?? 0));

            const sm = rateSettings.kol_monthly;
            if (!sm || sm.fixed_amount == null) missing.kol_monthly = true;
            // 月費：以「目前合作中館別數」計價（旅行日系列合併只算一館，停用館別不計）
            const travelDayIds = allAccIds.filter((id) =>
              (allAccNameById.get(id) ?? "").startsWith("旅行日"),
            );
            const kolMonthlyAccCount =
              allAccIds.filter((id) => !(allAccNameById.get(id) ?? "").startsWith("旅行日")).length +
              (travelDayIds.length > 0 ? 1 : 0);
            kolMonthlySum = Number(sm?.fixed_amount ?? 0) * kolMonthlyAccCount;
          }

          // (7) 場域成交獎金：我是簽約人的館別中，charges_marketing_fee = true 者各發一份固定金額
          {
            const myClosingAccIds = profileId
              ? await getVenueClosingAccommodations(client, profileId, monthStartDate)
              : [];
            if (myClosingAccIds.length > 0) {
              const s = rateSettings.venue_closing;
              if (!s || s.fixed_amount == null) missing.venue_closing = true;
              const perVenue = Number(s?.fixed_amount ?? 0);
              const flags = await getMarketingFeeFlags(client, myClosingAccIds, monthStartDate);
              const hitIds = myClosingAccIds.filter((id) => flags[id] === true);
              if (hitIds.length > 0) {
                const { data: accNames } = await db
                  .from("accommodation_info")
                  .select("id, name")
                  .in("id", hitIds);
                const nameMap = new Map<string, string>(
                  ((accNames ?? []) as any[]).map((a) => [a.id, a.name as string]),
                );
                venueClosingLines = hitIds.map((id) => ({
                  name: nameMap.get(id) ?? id,
                  amount: perVenue,
                }));
                venueClosingSum = perVenue * hitIds.length;
              }
            }
          }

        }

        // ===== Multipliers =====
        // 加倍活動一律以「發放月」設定。不同獎金的資料月不同（例：星探底薪／團隊獎金
        // 的資料月是「上個月」、星探分潤依期別），所以這裡取回整份設定，
        // 由各卡片自行帶入正確的發放月比對，確保與「獎金管理 → 發放管理」一致。
        const { data: multRows } = await db
          .from("bonus_multiplier_settings")
          .select("bonus_type, multiplier, start_month, end_month");
        const multMap = (multRows ?? []) as unknown as BonusMultiplierRow[];


        if (cancelled) return;
        setCloserAmt(closerSum);
        setScoutCloserAmt(scoutCloserSum);
        setCloserTeamBonusAmt(closerTeamBonusSum);
        setCloserTeamBonusRate(closerTeamBonusRateVal);
        setCloserTeamBonusNoSetting(closerTeamBonusNoSet);
        setCloserTeamBonusFinalized(closerTeamBonusFinalizedFlag);
        setVideoAmt(videoSum);
        setScoutAmt(scoutSum);
        setRarityAmt(raritySum);
        setBaseSalaryAmt(baseSalary);
        setTeamBonusAmt(teamBonus);
        setIsScoutTeamMember(scoutTeamMember);
        setFranchiseInternalAmt(franchiseInternalSum);
        setFranchiseExternalAmt(franchiseExternalSum);
        setStarlinkAmt(starlinkSum);
        setMultiplierRows(multMap);
        setIsAmManager(amManagerFlag);
        setIsCloserManager(closerManagerFlag);
        setIsKolBonusRecipient(kolRecipientFlag);
        setAmPerformanceAmt(amPerfSum);
        setAmVenueBonusAmt(amVenueSum);
        setCloserPerformanceAmt(closerPerfSum);
        setAmManagerAmt(amManagerSum);
        setCloserManagerAmt(closerManagerSum);
        setKolCommissionAmt(kolCommissionSum);
        setKolMonthlyAmt(kolMonthlySum);
        setVenueClosingAmt(venueClosingSum);
        setVenueClosingDetail(venueClosingLines);
        setRevenueBreakdown(breakdown);
        setMissingRates(missing);
      } catch (e) {
        console.error("[TeamHome] load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewUserId, db, anyCard, showCloser, showVideo, showScout, showFranchise, showStarlink, showAM, monthInfo]);

  // 加倍倍率取用：一律以「發放月」比對（pickMultiplier 內含 bonus_type × "all" 相乘）
  // 各獎金資料月不同，需帶入各自的發放月，才會與「獎金管理 → 發放管理」完全一致。
  const defaultPayoutKey = payoutMonthKeyFromDataMonth(monthInfo.currentMonthKey);
  const scoutSalaryPayoutKey = monthInfo.currentMonthKey; // 底薪／團隊獎金：資料月＝上月 → 本月發放
  const scoutPeriodPayoutKey = String(monthInfo.periodEnd ?? "").slice(0, 7) || defaultPayoutKey;
  const multOf = (bt: string, payoutKey?: string) =>
    pickMultiplier(multiplierRows, bt, payoutKey ?? defaultPayoutKey);

  const cards: Array<{
    key: string;
    title: string;
    amount: number;              // 加倍後金額（顯示用）
    baseAmount?: number;         // 原始金額（未加倍）
    multiplier: number;          // 用於 badge
    note?: string;
    lines?: Array<{ label: string; amount: number; multiplier: number; revenue?: number }>;
    alwaysShowLines?: boolean;   // 只有一列時也顯示明細
    excludeFromTotal?: boolean;  // 不計入本月預估總收入
  }> = [];

  /** 由館別營收明細組出卡片的「營收／獎金」列（已套用加倍倍率） */
  const venueLines = (bonusType: string, m: number) =>
    (revenueBreakdown[bonusType] ?? []).map((d) => ({
      label: d.name,
      revenue: Math.round(d.revenue),
      amount: Math.round(d.amount * m),
      multiplier: m,
    }));

  if (showCloser) {
    const closerMult = multOf("closer");
    const closerBoosted = Math.round(closerAmt * closerMult);
    const scoutCloserBoosted = Math.round(scoutCloserAmt * closerMult);
    const lines = [{ label: "訂房成交獎金", amount: closerBoosted, multiplier: closerMult }];
    if (scoutCloserAmt > 0) lines.push({ label: "星探成交獎金", amount: scoutCloserBoosted, multiplier: closerMult });
    cards.push({
      key: "closer",
      title: "成交獎金",
      amount: closerBoosted + scoutCloserBoosted,
      baseAmount: closerAmt + scoutCloserAmt,
      multiplier: closerMult,
      lines,
    });
  }

  if (showCloser && closerTeamBonusRate > 0) {
    const m = multOf("closer");
    if (closerTeamBonusFinalized) {
      cards.push({
        key: "closer_team_bonus",
        title: "成交組團隊獎金",
        amount: Math.round(closerTeamBonusAmt * m),
        baseAmount: closerTeamBonusAmt,
        multiplier: m,
        note: "已定案分配金額",
      });
    } else {
      const noteParts = [
        "當月累積預估，需下個月初由管理員設定分配後才能確認個人實拿",
      ];
      if (closerTeamBonusNoSetting) {
        noteParts.push("本期尚未設定分配比例，請管理員至「成交大師 → 團隊成交統計」設定");
      }
      cards.push({
        key: "closer_team_bonus",
        title: "成交組團隊獎金",
        amount: Math.round(closerTeamBonusAmt * m),
        baseAmount: closerTeamBonusAmt,
        multiplier: m,
        note: noteParts.join("；"),
        excludeFromTotal: true,
      });
    }
  }
  if (showVideo) {
    const m = multOf("video");
    cards.push({ key: "video", title: "影音獎金", amount: Math.round(videoAmt * m), baseAmount: videoAmt, multiplier: m });
  }
  if (showScout) {
    const kolM = multOf("scout_kol", scoutPeriodPayoutKey);
    const rarityM = multOf("scout_rarity", scoutPeriodPayoutKey);
    const baseM = multOf("scout_base", scoutSalaryPayoutKey);
    const teamM = multOf("scout_team", scoutSalaryPayoutKey);
    cards.push({ key: "scout_kol", title: "KOL訂單星探分潤", amount: Math.round(scoutAmt * kolM), baseAmount: scoutAmt, multiplier: kolM, note: `目前顯示 ${monthInfo.periodLabel}` });
    cards.push({ key: "scout_rarity", title: "星探稀有度獎金", amount: Math.round(rarityAmt * rarityM), baseAmount: rarityAmt, multiplier: rarityM, note: `目前顯示 ${monthInfo.periodLabel}` });
    cards.push({
      key: "scout_base",
      title: "兼職星探底薪",
      amount: Math.round(baseSalaryAmt * baseM),
      baseAmount: baseSalaryAmt,
      multiplier: baseM,
      note: isScoutTeamMember
        ? "依上月邀約達標計算，本月 10 日發放"
        : "非全職星探不發底薪",
    });
    cards.push({
      key: "scout_team",
      title: "星探團隊獎金",
      amount: Math.round(teamBonusAmt * teamM),
      baseAmount: teamBonusAmt,
      multiplier: teamM,
      note: isScoutTeamMember
        ? "依全隊上月達標計算,本月 10 日發放"
        : "非參與星探團隊機制，則星探不發團隊獎金",
    });
  }
  if (showFranchise) {
    const intM = multOf("franchise_internal");
    const extM = multOf("franchise_external");
    const intBoosted = Math.round(franchiseInternalAmt * intM);
    const extBoosted = Math.round(franchiseExternalAmt * extM);
    // 內外兩者若倍率一致 → 用單一 badge；否則顯示最大倍率作標示
    const combinedMult = intM === extM ? intM : Math.max(intM, extM);
    const lines: Array<{ label: string; amount: number; multiplier: number }> = [];
    if (franchiseInternalAmt > 0 || intM > 1) {
      lines.push({ label: "特許加盟（內部）", amount: intBoosted, multiplier: intM });
    }
    if (franchiseExternalAmt > 0 || extM > 1) {
      lines.push({ label: "特許加盟（外部）", amount: extBoosted, multiplier: extM });
    }
    cards.push({
      key: "franchise",
      title: "特許加盟",
      amount: intBoosted + extBoosted,
      baseAmount: franchiseInternalAmt + franchiseExternalAmt,
      multiplier: combinedMult,
      lines: lines.length > 1 ? lines : undefined,
    });

  }
  if (showStarlink) {
    const m = multOf("starlink");
    cards.push({ key: "starlink", title: "星鏈", amount: Math.round(starlinkAmt * m), baseAmount: starlinkAmt, multiplier: m });
  }

  // ===== 七種團隊獎金卡片 =====
  const rateNote = (key: string) => (missingRates[key] ? "尚未設定費率" : undefined);

  if (showAM) {
    const m = multOf("am_performance");
    cards.push({
      key: "am_performance",
      title: "AM績效獎金",
      amount: Math.round(amPerformanceAmt * m),
      baseAmount: amPerformanceAmt,
      multiplier: m,
      note: rateNote("am_performance"),
      lines: venueLines("am_performance", m),
      alwaysShowLines: true,
    });
    const mv = multOf("am_venue_bonus");
    cards.push({
      key: "am_venue_bonus",
      title: "AM場域獎金",
      amount: Math.round(amVenueBonusAmt * mv),
      baseAmount: amVenueBonusAmt,
      multiplier: mv,
      note: rateNote("am_venue_bonus"),
    });
  }
  if (showCloser) {
    const m = multOf("closer_performance");
    cards.push({
      key: "closer_performance",
      title: "成交組績效獎金",
      amount: Math.round(closerPerformanceAmt * m),
      baseAmount: closerPerformanceAmt,
      multiplier: m,
      note: rateNote("closer_performance"),
      lines: venueLines("closer_performance", m),
      alwaysShowLines: true,
    });
  }
  if (isAmManager) {
    const m = multOf("am_manager");
    cards.push({
      key: "am_manager",
      title: "AM總管獎金",
      amount: Math.round(amManagerAmt * m),
      baseAmount: amManagerAmt,
      multiplier: m,
      note: rateNote("am_manager"),
      lines: venueLines("am_manager", m),
      alwaysShowLines: true,
    });
  }
  if (isCloserManager) {
    const m = multOf("closer_manager");
    cards.push({
      key: "closer_manager",
      title: "成交大師管理獎金",
      amount: Math.round(closerManagerAmt * m),
      baseAmount: closerManagerAmt,
      multiplier: m,
      note: rateNote("closer_manager"),
      lines: venueLines("closer_manager", m),
      alwaysShowLines: true,
    });
  }
  if (isKolBonusRecipient) {
    const mc = multOf("kol_commission");
    cards.push({
      key: "kol_commission",
      title: "網紅營銷專利獎金",
      amount: Math.round(kolCommissionAmt * mc),
      baseAmount: kolCommissionAmt,
      multiplier: mc,
      note: rateNote("kol_commission"),
      lines: venueLines("kol_commission", mc),
      alwaysShowLines: true,
    });
    const mm = multOf("kol_monthly");
    cards.push({
      key: "kol_monthly",
      title: "網紅營銷月獎金",
      amount: Math.round(kolMonthlyAmt * mm),
      baseAmount: kolMonthlyAmt,
      multiplier: mm,
      note: rateNote("kol_monthly"),
    });
  }
  if (venueClosingDetail.length > 0) {
    const m = multOf("venue_closing");
    cards.push({
      key: "venue_closing",
      title: "場域成交獎金",
      amount: Math.round(venueClosingAmt * m),
      baseAmount: venueClosingAmt,
      multiplier: m,
      note: rateNote("venue_closing"),
      lines: venueClosingDetail.map((d) => ({
        label: d.name,
        amount: Math.round(d.amount * m),
        multiplier: m,
      })),
    });
  }

  const total = cards.reduce((s, c) => s + (c.excludeFromTotal ? 0 : c.amount), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      {isAdminViewer && (
        <Card className="border-dashed">
          <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium shrink-0">
              <Eye className="h-4 w-4 text-muted-foreground" />
              檢視身分
            </div>
            <Select value={viewAsUserId ?? "self"} onValueChange={handleViewAs}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="選擇成員" />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background max-h-80">
                <SelectItem value="self">我自己（{selfDisplayName}）</SelectItem>
                {members
                  .filter((m) => m.user_id !== selfUserId)
                  .map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name}
                      <span className="text-muted-foreground ml-2 text-xs">
                        {m.roles.join(" / ")}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {isViewing && (
              <Badge variant="secondary" className="shrink-0">
                唯讀檢視中
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-2xl font-bold">
          {isViewing ? `檢視中：${displayName}` : `歡迎回來，${displayName}`}
        </h2>

        <p className="text-muted-foreground mt-1">
          當月預估，尚未結算；預計 {monthInfo.nextMonthLabel} 10 日發放
        </p>
      </div>

      {!loading && cards.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            暫無獎金項目
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">本月預估總收入</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">
                {loading ? "—" : fmt(total)}
              </p>
            </CardContent>
          </Card>

          <div>
            <h3 className="text-lg font-semibold mb-3">各來源獎金</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <Card key={c.key} className="relative">
                  {c.multiplier > 1 && !loading && (
                    <Badge className="absolute top-2 right-2 bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">
                      × {Number(c.multiplier).toFixed(2)} 倍
                    </Badge>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-medium">
                      {c.title}
                    </CardTitle>
                    {c.note ? (
                      <p className="text-xs text-muted-foreground/80 mt-0.5">{c.note}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    {!loading && c.multiplier > 1 ? (
                      <p className="text-sm text-muted-foreground line-through tabular-nums">
                        {fmt(c.baseAmount ?? Math.round(c.amount / c.multiplier))}
                      </p>
                    ) : null}
                    <p className="text-2xl font-semibold">
                      {loading ? "—" : fmt(c.amount)}
                    </p>

                    {!loading && c.lines && c.lines.length > 0
                      ? c.lines.some((ln) => ln.revenue !== undefined)
                        ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 text-xs"
                            onClick={() => setDetailCardKey(c.key)}
                          >
                            各館別明細（{c.lines.length} 館）
                          </Button>
                        )
                        : c.lines.length > 1 || c.key === "venue_closing" || c.alwaysShowLines
                          ? (
                            <div className="mt-2 space-y-0.5">
                              {c.lines.map((ln, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between gap-2 text-xs text-muted-foreground"
                                >
                                  <span className="truncate">{ln.label}</span>
                                  <span className="tabular-nums whitespace-nowrap">
                                    {fmt(ln.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )
                          : null
                      : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      <Drawer
        open={!!detailCardKey}
        onOpenChange={(o) => !o && setDetailCardKey(null)}
      >
        <DrawerContent>
          {(() => {
            const c = cards.find((x) => x.key === detailCardKey);
            if (!c) return null;
            const lines = c.lines ?? [];
            const totalRevenue = lines.reduce((s, l) => s + (l.revenue ?? 0), 0);
            const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
            return (
              <div className="mx-auto w-full max-w-2xl">
                <DrawerHeader>
                  <DrawerTitle>{c.title}－各館別明細</DrawerTitle>
                  <DrawerDescription>
                    營收合計 {fmt(totalRevenue)}　獎金合計 {fmt(totalAmount)}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-8 max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-2 font-medium">館別</th>
                        <th className="text-right py-2 font-medium">營收</th>
                        <th className="text-right py-2 font-medium">獎金</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((ln, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-2">{ln.label}</td>
                          <td className="py-2 text-right tabular-nums whitespace-nowrap">
                            {ln.revenue !== undefined ? fmt(ln.revenue) : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums whitespace-nowrap">
                            {fmt(ln.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
