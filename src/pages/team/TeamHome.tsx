import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTeam } from "@/components/team/TeamContext";
import { supabase } from "@/integrations/supabase/client";
import type { TeamRole } from "@/components/team/teamConfig";

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

interface RateRow {
  accommodation_id: string;
  effective_from: string;
  closer_rate: number | null;
  video_rate: number | null;
}

function pickRate(
  rates: RateRow[],
  accId: string,
  orderDateIso: string,
  key: "closer_rate" | "video_rate",
): number {
  const dateKey = (orderDateIso ?? "").slice(0, 10);
  const cands = rates
    .filter((r) => r.accommodation_id === accId && r.effective_from <= dateKey)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return Number(cands[0]?.[key] ?? 0);
}

export default function TeamHome() {
  const { userId, displayName, roles } = useTeam();

  const hasRole = (r: TeamRole) => roles.includes(r);
  const showCloser = hasRole("closer");
  const showVideo = hasRole("video");
  const showScout = hasRole("scout") || hasRole("scout_manager");
  const showFranchise = hasRole("franchise") || hasRole("franchise_manager");
  const showStarlink = hasRole("starlink");

  const anyCard = showCloser || showVideo || showScout || showFranchise || showStarlink;

  const [loading, setLoading] = useState(true);
  const [closerAmt, setCloserAmt] = useState(0);
  const [scoutCloserAmt, setScoutCloserAmt] = useState(0);
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

  const monthInfo = useMemo(() => {
    const now = taipeiParts();
    const nextY = now.m === 12 ? now.y + 1 : now.y;
    const nextM = now.m === 12 ? 1 : now.m + 1;
    const prevY = now.m === 1 ? now.y - 1 : now.y;
    const prevM = now.m === 1 ? 12 : now.m - 1;
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
        } = monthInfo;

        // profile id (for scout / franchise external)
        let profileId: string | null = null;
        let scoutTeamMember = false;
        if (showScout || showFranchise) {
          const { data } = await supabase
            .from("team_member_profiles")
            .select("id, is_scout_team_member")
            .eq("user_id", userId)
            .maybeSingle();
          profileId = (data?.id as string | undefined) ?? null;
          scoutTeamMember = !!(data as { is_scout_team_member?: boolean } | null)?.is_scout_team_member;
        }

        // ===== Closer / Video =====
        const needMeta = showCloser || showVideo;
        let closerSum = 0;
        let videoSum = 0;

        if (needMeta) {
          const orFilter = [
            showCloser ? `closer_id.eq.${userId}` : null,
            showVideo ? `video_creator_id.eq.${userId}` : null,
          ]
            .filter(Boolean)
            .join(",");

          const { data: metas } = await supabase
            .from("order_meta")
            .select(
              "order_id, closer_id, video_creator_id, team_commission_price, is_excluded",
            )
            .or(orFilter)
            .or("is_excluded.is.null,is_excluded.eq.false");

          const metaList = (metas ?? []).filter((m: any) => m.is_excluded !== true);
          const orderIds = metaList.map((m: any) => m.order_id as string);

          if (orderIds.length > 0) {
            const { data: orders } = await supabase
              .from("orders")
              .select(
                "id, accommodation_id, final_price, order_date, confirmed_at, order_status, guest_name",
              )
              .in("id", orderIds)
              .neq("order_status", "cancelled")
              .neq("guest_name", "保留單")
              .gt("final_price", 0)
              .or(
                `and(confirmed_at.gte.${monthStartIso},confirmed_at.lt.${monthEndIso}),and(confirmed_at.is.null,order_date.gte.${monthStartIso},order_date.lt.${monthEndIso})`,
              );

            const orderList = orders ?? [];
            const accIds = Array.from(
              new Set(orderList.map((o: any) => o.accommodation_id).filter(Boolean)),
            );

            let rates: RateRow[] = [];
            if (accIds.length > 0) {
              const { data: r } = await supabase
                .from("accommodation_commission_settings")
                .select("accommodation_id, effective_from, closer_rate, video_rate")
                .in("accommodation_id", accIds);
              rates = (r ?? []) as RateRow[];
            }

            const metaByOrder = new Map<string, any>();
            metaList.forEach((m: any) => metaByOrder.set(m.order_id, m));

            for (const o of orderList) {
              const meta = metaByOrder.get(o.id as string);
              if (!meta) continue;
              const base = Number(
                meta.team_commission_price != null
                  ? meta.team_commission_price
                  : o.final_price ?? 0,
              );
              const orderDateIso = (o.confirmed_at ?? o.order_date) as string;

              if (showCloser && meta.closer_id === userId) {
                const rate = pickRate(rates, o.accommodation_id, orderDateIso, "closer_rate");
                closerSum += base * rate;
              }
              if (showVideo && meta.video_creator_id === userId) {
                const rate = pickRate(rates, o.accommodation_id, orderDateIso, "video_rate");
                videoSum += base * rate;
              }
            }
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

          // KOL 分潤: orders in current month matching cid codes
          if (cidUpperSet.size > 0 && commissionRate > 0) {
            const { data: kolOrders } = await supabase
              .from("orders")
              .select("final_price, discount_code, order_status, order_date")
              .neq("order_status", "cancelled")
              .not("discount_code", "is", null)
              .gte("order_date", monthStartIso)
              .lt("order_date", monthEndIso);

            let sumPrice = 0;
            for (const o of kolOrders ?? []) {
              const code = String((o as any).discount_code ?? "").trim().toUpperCase();
              if (!cidUpperSet.has(code)) continue;
              sumPrice += Number((o as any).final_price ?? 0);
            }
            scoutSum = sumPrice * commissionRate;
          }

          // 稀有度獎金: 本月 check_in_date 落在當月且 kpi_qualified、非 error、invited_at 非空、rarity != 'ck'
          const [{ data: rarityRows }, { data: monthKols }] = await Promise.all([
            supabase
              .from("kol_rarity_settings")
              .select("rarity, bonus_amount, effective_from")
              .lte("effective_from", today)
              .order("effective_from", { ascending: false }),
            supabase
              .from("kol_profiles")
              .select("rarity, check_in_date, invited_at, is_error, kpi_qualified")
              .eq("scout_id", userId)
              .eq("kpi_qualified", true)
              .eq("is_error", false)
              .not("invited_at", "is", null)
              .gte("check_in_date", monthStartDate)
              .lt("check_in_date", monthEndDate),
          ]);

          const rarityMap = new Map<string, number>();
          for (const r of (rarityRows ?? []) as any[]) {
            if (!rarityMap.has(r.rarity)) rarityMap.set(r.rarity, Number(r.bonus_amount ?? 0));
          }
          for (const r of (monthKols ?? []) as any[]) {
            const rar = String(r.rarity ?? "");
            if (!rar || rar === "ck") continue;
            raritySum += rarityMap.get(rar) ?? 0;
          }

          // 底薪 / 團隊獎金 — 僅 is_scout_team_member 才計
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
                .select("venue_name, personal_min, target_count")
                .eq("year", prevY)
                .eq("month", prevM),
              supabase
                .from("kol_profiles")
                .select("venue_name, invited_at")
                .eq("scout_id", userId)
                .eq("kpi_qualified", true)
                .eq("is_error", false)
                .not("invited_at", "is", null)
                .gte("invited_at", prevMonthStartDate)
                .lt("invited_at", prevMonthEndDate),
            ]);

            const baseSalaryAmount = Number((salaryRow as any)?.base_salary ?? 0);
            const teamBonusAmount = Number((salaryRow as any)?.team_bonus ?? 0);
            const targetList = ((targetsData ?? []) as any[])
              .map((t) => ({
                venue_name: (t.venue_name ?? "—") as string,
                personal_min: Number(t.personal_min ?? 0),
                target_count: Number(t.target_count ?? 0),
              }))
              .filter((t) => t.personal_min > 0 || t.target_count > 0);

            // 個人達標
            if (targetList.length > 0) {
              let allPersonalOk = true;
              for (const t of targetList) {
                if (t.personal_min <= 0) continue;
                const actual = ((myPrevKols ?? []) as any[]).filter(
                  (r) => (r.venue_name ?? "—") === t.venue_name,
                ).length;
                if (actual < t.personal_min) {
                  allPersonalOk = false;
                  break;
                }
              }
              if (allPersonalOk) baseSalary = baseSalaryAmount;

              // 團隊達標: 全部 scout team members 的上月 invited_at
              const { data: allScouts } = await supabase
                .from("team_member_profiles")
                .select("user_id")
                .eq("is_scout_team_member", true);
              const scoutIds = ((allScouts ?? []) as any[])
                .map((s) => s.user_id as string)
                .filter(Boolean);

              if (scoutIds.length > 0) {
                const { data: teamKols } = await supabase
                  .from("kol_profiles")
                  .select("venue_name, scout_id, invited_at")
                  .in("scout_id", scoutIds)
                  .eq("kpi_qualified", true)
                  .eq("is_error", false)
                  .not("invited_at", "is", null)
                  .gte("invited_at", prevMonthStartDate)
                  .lt("invited_at", prevMonthEndDate);

                let teamOk = true;
                for (const t of targetList) {
                  if (t.target_count <= 0) continue;
                  const total = ((teamKols ?? []) as any[]).filter(
                    (r) => (r.venue_name ?? "—") === t.venue_name,
                  ).length;
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
          const { data: fInternal } = await supabase
            .from("franchise_orders")
            .select("commission_amount, sold_by, payment_confirmed, sold_at")
            .eq("sold_by", userId)
            .eq("payment_confirmed", true)
            .gte("sold_at", monthStartDate)
            .lt("sold_at", monthEndDate);
          for (const r of fInternal ?? []) {
            franchiseInternalSum += Number((r as any).commission_amount ?? 0);
          }

          if (profileId) {
            const { data: fExt } = await supabase
              .from("franchise_external_orders")
              .select(
                "sales_member_id, co_sales_member_id, co_sales_member_id2, sales_bonus, co_sales_bonus, co_sales_bonus2, contract_progress, signed_at",
              )
              .eq("contract_progress", "已完成")
              .gte("signed_at", monthStartDate)
              .lt("signed_at", monthEndDate)
              .or(
                `sales_member_id.eq.${profileId},co_sales_member_id.eq.${profileId},co_sales_member_id2.eq.${profileId}`,
              );

            for (const r of fExt ?? []) {
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

        // ===== Multipliers（當月 YYYY-MM）=====
        const { data: multRows } = await supabase
          .from("bonus_multiplier_settings")
          .select("bonus_type, multiplier, start_month, end_month")
          .lte("start_month", monthInfo.currentMonthKey)
          .gte("end_month", monthInfo.currentMonthKey);
        const multMap: Record<string, number> = {};
        (multRows ?? []).forEach((r: any) => {
          multMap[r.bonus_type] = Number(r.multiplier ?? 1);
        });

        if (cancelled) return;
        setCloserAmt(closerSum);
        setScoutCloserAmt(scoutCloserSum);
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
      } catch (e) {
        console.error("[TeamHome] load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, anyCard, showCloser, showVideo, showScout, showFranchise, showStarlink, monthInfo]);

  // 加倍倍率取用：套用 bonus_type 專屬 × "all"（若同時存在則相乘）
  const allMult = multipliers.all ?? 1;
  const multOf = (bt: string) => (multipliers[bt] ?? 1) * allMult;

  const cards: Array<{
    key: string;
    title: string;
    amount: number;              // 加倍後金額（顯示 + 合計用）
    multiplier: number;          // 用於 badge
    note?: string;
    lines?: Array<{ label: string; amount: number; multiplier: number }>;
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
      multiplier: closerMult,
      lines,
    });
  }
  if (showVideo) {
    const m = multOf("video");
    cards.push({ key: "video", title: "影音獎金", amount: Math.round(videoAmt * m), multiplier: m });
  }
  if (showScout) {
    const kolM = multOf("scout_kol");
    const rarityM = multOf("scout_rarity");
    const baseM = multOf("scout_base");
    const teamM = multOf("scout_team");
    cards.push({ key: "scout_kol", title: "KOL 分潤", amount: Math.round(scoutAmt * kolM), multiplier: kolM });
    cards.push({ key: "scout_rarity", title: "稀有度獎金", amount: Math.round(rarityAmt * rarityM), multiplier: rarityM });
    cards.push({
      key: "scout_base",
      title: "底薪",
      amount: Math.round(baseSalaryAmt * baseM),
      multiplier: baseM,
      note: isScoutTeamMember
        ? "依上月邀約達標計算，本月 10 日發放"
        : "非全職星探不發底薪",
    });
    cards.push({
      key: "scout_team",
      title: "團隊獎金",
      amount: Math.round(teamBonusAmt * teamM),
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
      multiplier: combinedMult,
      lines: lines.length > 1 ? lines : undefined,
    });
  }
  if (showStarlink) {
    const m = multOf("starlink");
    cards.push({ key: "starlink", title: "星鏈", amount: Math.round(starlinkAmt * m), multiplier: m });
  }

  const total = cards.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold">歡迎回來，{displayName}</h2>
        <p className="text-muted-foreground mt-1">
          當月預估，尚未結算；預計 {monthInfo.nextMonthLabel} 10 日發放
        </p>
      </div>

      {!anyCard ? (
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
                <Card key={c.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-medium">
                      {c.title}
                    </CardTitle>
                    {c.note ? (
                      <p className="text-xs text-muted-foreground/80 mt-0.5">{c.note}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {loading ? "—" : fmt(c.amount)}
                    </p>
                    {!loading && c.lines && c.lines.length > 1 ? (
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
