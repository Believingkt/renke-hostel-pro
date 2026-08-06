import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTeam } from "@/components/team/TeamContext";
import { supabase } from "@/integrations/supabase/client";
import type { TeamRole } from "@/components/team/teamConfig";
import {
  getBonusRateSettings,
  getRoleBinding,
  getRevenueSourceWhitelist,
  getAccommodationRevenue,
  getVenueClosingAccommodations,
  getMarketingFeeFlags,
} from "@/lib/teamBonusRevenue";

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
  const { userId, displayName, roles } = useTeam();

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
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});

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
  const [missingRates, setMissingRates] = useState<Record<string, boolean>>({});

  const monthInfo = useMemo(() => {
    const now = taipeiParts();
    const nextY = now.m === 12 ? now.y + 1 : now.y;
    const nextM = now.m === 12 ? 1 : now.m + 1;
    const prevY = now.m === 1 ? now.y - 1 : now.y;
    const prevM = now.m === 1 ? 12 : now.m - 1;

    // 期別判斷：日 <=20 → 當月 25 日期（當月 6 - 當月 20）
    //           日 >20  → 次月 10 日期（當月 21 - 次月 5）
    const isEarlyPeriod = now.d <= 20;
    let periodStart: string;
    let periodEnd: string;
    let periodLabel: string;
    if (isEarlyPeriod) {
      periodStart = taipeiDateStr(now.y, now.m, 6);
      periodEnd = taipeiDateStr(now.y, now.m, 20);
      periodLabel = `${now.m} 月 25 日期預估（${now.m}/6 - ${now.m}/20 入住）`;
    } else {
      periodStart = taipeiDateStr(now.y, now.m, 21);
      periodEnd = taipeiDateStr(nextY, nextM, 5);
      periodLabel = `${nextM} 月 10 日期預估（${now.m}/21 - ${nextM}/5 入住）`;
    }

    return {
      y: now.y,
      m: now.m,
      today: taipeiDateStr(now.y, now.m, now.d),
      currentMonthKey: `${now.y}-${String(now.m).padStart(2, "0")}`,
      monthStartIso: taipeiMidnightUtcISO(now.y, now.m, 1),
      monthEndIso: taipeiMidnightUtcISO(nextY, nextM, 1),
      monthStartDate: taipeiDateStr(now.y, now.m, 1),
      monthEndDate: taipeiDateStr(nextY, nextM, 1),
      prevMonthStartDate: taipeiDateStr(prevY, prevM, 1),
      prevMonthEndDate: taipeiDateStr(now.y, now.m, 1),
      prevY,
      prevM,
      periodStart,
      periodEnd,
      periodLabel,
      nextMonthLabel: `${nextY} 年 ${nextM} 月`,
    };
  }, []);

  useEffect(() => {
    if (!anyCard) {
      setLoading(false);
      return;
    }
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
        } = monthInfo;

        // profile id (for scout / franchise external / 團隊獎金角色綁定)
        let profileId: string | null = null;
        let myManagedAccIds: string[] = [];
        let scoutTeamMember = false;
        let myEmploymentType: string | null = null;
        let myFulltimeStart: string | null = null;
        {
          const { data } = await supabase
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
        // 分潤預估一律改由 preview-closer-commission Edge Function 試算，
        // 公式與正式快照 closer_commission_snapshots 完全一致（order_date 分月、
        // 扣加購、排除非台幣 / isExempt / is_excluded）。
        const needMeta = showCloser || showVideo;
        let closerSum = 0;
        let videoSum = 0;

        if (needMeta) {
          const { data: preview } = await supabase.functions.invoke(
            "preview-closer-commission",
            { body: { year: monthInfo.y, month: monthInfo.m, scope: "self" } },
          );
          if (preview?.success) {
            if (showCloser) closerSum = Number(preview.self?.closer_commission ?? 0);
            if (showVideo) videoSum = Number(preview.self?.video_commission ?? 0);
          }
        }




        // ===== 星探成交獎金（scout_discount_codes partner，成交人 = 自己）=====
        let scoutCloserSum = 0;
        if (showCloser) {
          const { data: partnerCodes } = await supabase
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
            const { data: ords } = await supabase
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
              const { data: metas2 } = await supabase
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
        if (showCloser) {
          const { data: bonusSetting } = await supabase
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
            const { data: ownDist } = await supabase
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
              const { data: dist } = await supabase
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
            supabase
              .from("kol_profiles")
              .select("cid_code")
              .eq("scout_id", userId)
              .eq("kpi_qualified", true)
              .not("cid_code", "is", null),
            profileId
              ? supabase
                  .from("scout_discount_codes")
                  .select("discount_code")
                  .eq("scout_id", profileId)
              : Promise.resolve({ data: [] as any[] }),
            supabase
              .from("kol_profiles")
              .select("id", { count: "exact", head: true })
              .eq("scout_id", userId)
              .eq("kpi_qualified", true),
            supabase
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
            const { data: kolOrders } = await supabase
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
            supabase
              .from("kol_rarity_settings")
              .select("rarity, bonus_amount, effective_from")
              .lte("effective_from", today)
              .order("effective_from", { ascending: false }),
            supabase
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
              supabase
                .from("scout_salary_settings")
                .select("base_salary, team_bonus, effective_from")
                .lte("effective_from", today)
                .order("effective_from", { ascending: false })
                .limit(1)
                .maybeSingle(),
              supabase
                .from("scout_team_targets")
                .select("venue_id, venue_name, personal_min, target_count")
                .eq("year", prevY)
                .eq("month", prevM),
              supabase
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
            const { data: kolVenuesData } = await supabase
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
              const { data: allScouts } = await supabase
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
                const { data: teamKols } = await supabase
                  .from("kol_profiles")
                  .select("venue_id, venue_name, scout_id, rarity, kpi_month")
                  .in("scout_id", scoutIds)
                  .eq("kpi_qualified", true)
                  .eq("is_error", false)
                  .not("invited_at", "is", null)
                  .eq("kpi_month", prevMonthStartDate);

                const rareSet = new Set(["SR", "SSR", "UR"]);
                let teamOk = true;
                for (const t of targetList) {
                  if (t.target_count <= 0) continue;
                  const total = ((teamKols ?? []) as any[]).filter((r) => {
                    if (groupKey(r.venue_id, r.venue_name) !== t.key) return false;
                    if (fulltimeSet.has(r.scout_id)) {
                      return rareSet.has(String(r.rarity ?? "").toUpperCase());
                    }
                    return true;
                  }).length;
                  if (total < t.target_count) {
                    teamOk = false;
                    break;
                  }
                }
                if (teamOk) teamBonus = teamBonusAmount;
              }
            }
          }
        }


        // ===== Franchise =====
        let franchiseInternalSum = 0;
        let franchiseExternalSum = 0;
        if (showFranchise) {
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

          const { data: fInternal } = await supabase
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
            const { data: fExt } = await supabase
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
        if (showStarlink) {
          const { data: slOrders } = await supabase
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
        let amManagerFlag = false;
        let closerManagerFlag = false;
        let kolRecipientFlag = false;
        const missing: Record<string, boolean> = {};

        {
          const client = supabase as any;
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
          if (needCompanyRevenue) {
            const { data: accs } = await supabase
              .from("accommodation_info")
              .select("id")
              .eq("is_active", true);
            allAccIds = ((accs ?? []) as any[]).map((a) => a.id).filter(Boolean);
          }

          const companyRevenue =
            needCompanyRevenue && sharedSources.length > 0
              ? await getAccommodationRevenue(
                  client,
                  allAccIds,
                  monthStartDate,
                  monthEndDate,
                  sharedSources,
                )
              : 0;

          // (1) AM 績效獎金：管理場館營收 × rate（排除旅行日系列）
          //     AM 場域獎金：固定金額 × 管理場館數（排除旅行日系列）
          if (showAM) {
            // 過濾掉「旅行日」開頭的場館
            let myManagedAccIdsExcludingTravelDays: string[] = [];
            if (myManagedAccIds.length > 0) {
              const { data: mAccs } = await supabase
                .from("accommodation_info")
                .select("id, name")
                .in("id", myManagedAccIds);
              const nameMap = new Map(
                ((mAccs ?? []) as any[]).map((a) => [a.id as string, String(a.name ?? "")]),
              );
              myManagedAccIdsExcludingTravelDays = myManagedAccIds.filter(
                (id) => !(nameMap.get(id) ?? "").startsWith("旅行日"),
              );
            }

            const s = rateSettings.am_performance;
            if (!s || s.rate == null) missing.am_performance = true;
            const myRevenue =
              myManagedAccIdsExcludingTravelDays.length > 0 && sharedSources.length > 0
                ? await getAccommodationRevenue(
                    client,
                    myManagedAccIdsExcludingTravelDays,
                    monthStartDate,
                    monthEndDate,
                    sharedSources,
                  )
                : 0;
            amPerfSum = myRevenue * Number(s?.rate ?? 0);

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
          }

          // (3) AM 總管獎金：全公司營收 × rate（抽成制）
          if (amManagerFlag) {
            const s = rateSettings.am_manager;
            if (!s || s.rate == null) missing.am_manager = true;
            amManagerSum = companyRevenue * Number(s?.rate ?? 0);
          }

          // (4) 成交大師管理獎金：全公司營收 × rate
          if (closerManagerFlag) {
            const s = rateSettings.closer_manager;
            if (!s || s.rate == null) missing.closer_manager = true;
            closerManagerSum = companyRevenue * Number(s?.rate ?? 0);
          }

          // (5)(6) 網紅營銷專利獎金 / 月費
          if (kolRecipientFlag) {
            const kolSources = await getRevenueSourceWhitelist(
              client,
              "teamcommission_kol_revenue_source_whitelist",
            );
            const kolRevenue =
              kolSources.length > 0
                ? await getAccommodationRevenue(
                    client,
                    allAccIds,
                    monthStartDate,
                    monthEndDate,
                    kolSources,
                  )
                : 0;
            const sc = rateSettings.kol_commission;
            if (!sc || sc.rate == null) missing.kol_commission = true;
            kolCommissionSum = kolRevenue * Number(sc?.rate ?? 0);

            const sm = rateSettings.kol_monthly;
            if (!sm || sm.fixed_amount == null) missing.kol_monthly = true;
            kolMonthlySum = Number(sm?.fixed_amount ?? 0);
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
                const { data: accNames } = await supabase
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
        // 加倍活動一律以「發放月」設定（發放月 = 資料月 + 1），需先換算再比對，
        // 否則會與「獎金管理 → 發放管理」差一個月。
        const multMonthKey = payoutMonthKeyFromDataMonth(monthInfo.currentMonthKey);
        const { data: multRows } = await supabase
          .from("bonus_multiplier_settings")
          .select("bonus_type, multiplier, start_month, end_month")
          .lte("start_month", multMonthKey)
          .gte("end_month", multMonthKey);
        const multMap: Record<string, number> = {};
        (multRows ?? []).forEach((r: any) => {
          multMap[r.bonus_type] = Number(r.multiplier ?? 1);
        });


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
        setMultipliers(multMap);
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
  }, [userId, anyCard, showCloser, showVideo, showScout, showFranchise, showStarlink, showAM, monthInfo]);

  // 加倍倍率取用：套用 bonus_type 專屬 × "all"（若同時存在則相乘）
  const allMult = multipliers.all ?? 1;
  const multOf = (bt: string) => (multipliers[bt] ?? 1) * allMult;

  const cards: Array<{
    key: string;
    title: string;
    amount: number;              // 加倍後金額（顯示用）
    baseAmount?: number;         // 原始金額（未加倍）
    multiplier: number;          // 用於 badge
    note?: string;
    lines?: Array<{ label: string; amount: number; multiplier: number }>;
    excludeFromTotal?: boolean;  // 不計入本月預估總收入
  }> = [];

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
    const kolM = multOf("scout_kol");
    const rarityM = multOf("scout_rarity");
    const baseM = multOf("scout_base");
    const teamM = multOf("scout_team");
    cards.push({ key: "scout_kol", title: "KOL訂單星探分潤", amount: Math.round(scoutAmt * kolM), baseAmount: scoutAmt, multiplier: kolM, note: `目前顯示 ${monthInfo.periodLabel}` });
    cards.push({ key: "scout_rarity", title: "稀有度獎金", amount: Math.round(rarityAmt * rarityM), baseAmount: rarityAmt, multiplier: rarityM, note: `目前顯示 ${monthInfo.periodLabel}` });
    cards.push({
      key: "scout_base",
      title: "底薪",
      amount: Math.round(baseSalaryAmt * baseM),
      baseAmount: baseSalaryAmt,
      multiplier: baseM,
      note: isScoutTeamMember
        ? "依上月邀約達標計算，本月 10 日發放"
        : "非全職星探不發底薪",
    });
    cards.push({
      key: "scout_team",
      title: "團隊獎金",
      amount: Math.round(teamBonusAmt * teamM),
      baseAmount: teamBonusAmt,
      multiplier: teamM,
      note: isScoutTeamMember
        ? "依全隊上月達標計算,本月 10 日發放"
        : "非全職星探不發團隊獎金",
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
      <div>
        <h2 className="text-2xl font-bold">歡迎回來，{displayName}</h2>
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

                    {!loading &&
                    c.lines &&
                    (c.lines.length > 1 || c.key === "venue_closing") ? (
                      <div className="mt-2 space-y-0.5">
                        {c.lines.map((ln, i) => (
                          <div key={i} className="flex justify-between text-xs text-muted-foreground">
                            <span>{ln.label}</span>
                            <span className="tabular-nums">{fmt(ln.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
