import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [videoAmt, setVideoAmt] = useState(0);
  const [scoutAmt, setScoutAmt] = useState(0);
  const [franchiseAmt, setFranchiseAmt] = useState(0);
  const [starlinkAmt, setStarlinkAmt] = useState(0);

  const monthInfo = useMemo(() => {
    const now = taipeiParts();
    const nextY = now.m === 12 ? now.y + 1 : now.y;
    const nextM = now.m === 12 ? 1 : now.m + 1;
    return {
      y: now.y,
      m: now.m,
      monthStartIso: taipeiMidnightUtcISO(now.y, now.m, 1),
      monthEndIso: taipeiMidnightUtcISO(nextY, nextM, 1),
      monthStartDate: taipeiDateStr(now.y, now.m, 1),
      monthEndDate: taipeiDateStr(nextY, nextM, 1),
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
          monthStartIso,
          monthEndIso,
          monthStartDate,
          monthEndDate,
        } = monthInfo;

        // profile id (for scout / franchise external)
        let profileId: string | null = null;
        if (showScout || showFranchise) {
          const { data } = await supabase
            .from("team_member_profiles")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          profileId = (data?.id as string | undefined) ?? null;
        }

        // ===== Closer / Video =====
        const needMeta = showCloser || showVideo;
        let closerSum = 0;
        let videoSum = 0;

        if (needMeta) {
          // 1) fetch order_meta where user is closer/video
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

        // ===== Scout / KOL =====
        let scoutSum = 0;
        if (showScout) {
          const [{ data: sdc }, { data: kols }] = await Promise.all([
            profileId
              ? supabase
                  .from("scout_discount_codes")
                  .select("discount_code, scout_rate")
                  .eq("scout_id", profileId)
              : Promise.resolve({ data: [] as any[] }),
            supabase
              .from("kol_profiles")
              .select("cid_code")
              .eq("scout_id", userId)
              .not("cid_code", "is", null),
          ]);

          const rateByCode = new Map<string, number>();
          (sdc ?? []).forEach((r: any) => {
            if (r.discount_code) {
              rateByCode.set(
                String(r.discount_code).toUpperCase(),
                Number(r.scout_rate ?? 0),
              );
            }
          });
          const kolCodeSet = new Set<string>(rateByCode.keys());
          (kols ?? []).forEach((k: any) => {
            if (k.cid_code) kolCodeSet.add(String(k.cid_code).toUpperCase());
          });

          if (kolCodeSet.size > 0) {
            const { data: kolOrders } = await supabase
              .from("orders")
              .select("final_price, discount_code, order_status, order_date")
              .neq("order_status", "cancelled")
              .not("discount_code", "is", null)
              .gte("order_date", monthStartIso)
              .lt("order_date", monthEndIso);

            for (const o of kolOrders ?? []) {
              const code = String((o as any).discount_code ?? "").toUpperCase();
              if (!kolCodeSet.has(code)) continue;
              const rate = rateByCode.get(code) ?? 0;
              scoutSum += Number((o as any).final_price ?? 0) * rate;
            }
          }
        }

        // ===== Franchise =====
        let franchiseSum = 0;
        if (showFranchise) {
          const { data: fInternal } = await supabase
            .from("franchise_orders")
            .select("commission_amount, sold_by, payment_confirmed, sold_at")
            .eq("sold_by", userId)
            .eq("payment_confirmed", true)
            .gte("sold_at", monthStartDate)
            .lt("sold_at", monthEndDate);
          for (const r of fInternal ?? []) {
            franchiseSum += Number((r as any).commission_amount ?? 0);
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
                franchiseSum += Number(row.sales_bonus ?? 0);
              }
              if (row.co_sales_member_id === profileId) {
                franchiseSum += Number(row.co_sales_bonus ?? 0);
              }
              if (row.co_sales_member_id2 === profileId) {
                franchiseSum += Number(row.co_sales_bonus2 ?? 0);
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

        if (cancelled) return;
        setCloserAmt(closerSum);
        setVideoAmt(videoSum);
        setScoutAmt(scoutSum);
        setFranchiseAmt(franchiseSum);
        setStarlinkAmt(starlinkSum);
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

  const cards: Array<{ key: string; title: string; amount: number }> = [];
  if (showCloser) cards.push({ key: "closer", title: "成交獎金", amount: closerAmt });
  if (showVideo) cards.push({ key: "video", title: "影音獎金", amount: videoAmt });
  if (showScout) cards.push({ key: "scout", title: "KOL 分潤", amount: scoutAmt });
  if (showFranchise) cards.push({ key: "franchise", title: "特許加盟", amount: franchiseAmt });
  if (showStarlink) cards.push({ key: "starlink", title: "星鏈", amount: starlinkAmt });

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
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {loading ? "—" : fmt(c.amount)}
                    </p>
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
