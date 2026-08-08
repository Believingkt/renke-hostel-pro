import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildExemptResolver } from "../_shared/ownerPricingRule.ts";
import { commissionBaseFromOrder } from "../_shared/addonTotal.ts";
import { buildThresholdFactorResolver } from "../_shared/commissionThreshold.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

// 回溯補建的月份數（上上月起往前算，不含正常掃描的上月）
const BACKFILL_MONTHS = 1;

function getTaipeiParts(d: Date = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    day: Number(parts.day),
  };
}

// UTC ISO when Taipei wall-clock is (y, m, d) 00:00
function taipeiMidnightUtcISO(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0)).toISOString();
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const zero = y * 12 + (m - 1) + delta;
  return { y: Math.floor(zero / 12), m: (zero % 12) + 1 };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface MonthResult {
  month: string;
  processed: number;
  created: number;
  skipped: number;
  amount: number;
  errors: Array<{ order_id: string; error: string }>;
}

/** 台北時區日期字串（YYYY-MM-DD） */
function taipeiDateStr(iso: string): string {
  const d = new Date(iso);
  const p = getTaipeiParts(d);
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
}

/**
 * 合作期間 gate：以 accommodation_partnership_periods 判斷該館別在訂單日是否處於
 * 可採計的合作期間（bonus_policy = 'none' 或無任何期間 → 不採計）。
 */
async function buildPartnershipResolver(
  client: any,
  accIds: string[],
): Promise<(accId: string, orderDateIso: string) => boolean> {
  const byAcc = new Map<string, Array<{ start: string; end: string | null }>>();
  const ids = Array.from(new Set((accIds ?? []).filter(Boolean)));
  if (ids.length > 0) {
    const { data } = await client
      .from("accommodation_partnership_periods")
      .select("accommodation_id, start_date, end_date, bonus_policy")
      .in("accommodation_id", ids);
    for (const row of (data ?? []) as any[]) {
      if (!row?.accommodation_id || !row?.start_date) continue;
      if (row?.bonus_policy === "none") continue;
      const list = byAcc.get(row.accommodation_id) ?? [];
      list.push({
        start: String(row.start_date).slice(0, 10),
        end: row.end_date ? String(row.end_date).slice(0, 10) : null,
      });
      byAcc.set(row.accommodation_id, list);
    }
  }
  return (accId: string, orderDateIso: string) => {
    const list = byAcc.get(accId);
    if (!list || list.length === 0) return false;
    const d = taipeiDateStr(orderDateIso);
    return list.some((p) => d >= p.start && (p.end === null || d <= p.end));
  };
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) {
      return jsonResponse({ success: false, error: authRes.error }, authRes.status);
    }
    if (!isSuperAdmin(authRes.ctx)) {
      return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const testMode = body?.test_mode === true;
    const testMonth = typeof body?.test_month === "string" ? body.test_month : null;

    // Determine target month (the month to snapshot) and payout month (current month)
    const now = new Date();
    const tp = getTaipeiParts(now);

    // Only run on day 10 of each Taipei month, unless test_mode
    if (!testMode && tp.day !== 10) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "今日非發放日（每月10日），不執行",
        today_taipei: `${tp.y}-${pad2(tp.m)}-${pad2(tp.day)}`,
      });
    }

    // payoutMonth = current Taipei month（補建的快照一律歸入本次執行的當期發放月）
    const payoutYear = tp.y;
    const payoutMonth = tp.m;

    // snapshotMonth = previous month by default, or override via test_month
    let snapYear: number;
    let snapMonth: number;
    if (testMonth && /^\d{4}-\d{2}$/.test(testMonth)) {
      const [y, m] = testMonth.split("-").map(Number);
      snapYear = y;
      snapMonth = m;
    } else {
      snapYear = payoutMonth === 1 ? payoutYear - 1 : payoutYear;
      snapMonth = payoutMonth === 1 ? 12 : payoutMonth - 1;
    }

    const snapshotMonthStr = `${snapYear}-${pad2(snapMonth)}`;
    const payoutMonthStr = `${payoutYear}-${pad2(payoutMonth)}`;

    const supabase = authRes.ctx.admin;

    /**
     * 掃描指定月份的訂單，為「從未存在 snapshot」的訂單補建快照。
     * 已存在的快照一律 skip，絕不更新或覆寫。
     */
    async function processMonth(y: number, m: number): Promise<MonthResult> {
      const monthStr = `${y}-${pad2(m)}`;
      const result: MonthResult = {
        month: monthStr, processed: 0, created: 0, skipped: 0, amount: 0, errors: [],
      };

      const startUtc = taipeiMidnightUtcISO(y, m, 1);
      const endUtc = taipeiMidnightUtcISO(y, m + 1, 1);

      // 1) Orders in target month, not cancelled
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, accommodation_id, final_price, custom_addon_details, check_in_date, check_out_date, order_date, order_status, currency_at_booking, owner_direct, order_source")
        .neq("order_status", "cancelled")
        .gte("order_date", startUtc)
        .lt("order_date", endUtc);
      if (ordersErr) throw ordersErr;

      const orderList = orders ?? [];
      if (orderList.length === 0) return result;

      const orderIds = orderList.map((o) => o.id as string);

      // 2) order_meta for these orders
      const { data: metas, error: metasErr } = await supabase
        .from("order_meta")
        .select("order_id, closer_id, video_creator_id, team_commission_price, is_excluded")
        .in("order_id", orderIds);
      if (metasErr) throw metasErr;
      const metaMap = new Map<string, any>();
      for (const mm of metas ?? []) metaMap.set(mm.order_id as string, mm);

      // 3) Existing snapshots — to skip（UNIQUE(order_id) 天然防重複）
      const { data: existing, error: existErr } = await supabase
        .from("closer_commission_snapshots")
        .select("order_id")
        .in("order_id", orderIds);
      if (existErr) throw existErr;
      const existingSet = new Set<string>((existing ?? []).map((r) => r.order_id as string));

      // 4) Commission settings — latest effective_from <= order.order_date per accommodation
      const accIds = Array.from(new Set(orderList.map((o) => o.accommodation_id as string)));
      const { data: settings, error: setErr } = await supabase
        .from("accommodation_commission_settings")
        .select("accommodation_id, closer_rate, video_rate, effective_from")
        .in("accommodation_id", accIds)
        .order("effective_from", { ascending: false });
      if (setErr) throw setErr;

      function rateFor(accId: string, orderDateIso: string): { closer: number; video: number } {
        const candidates = (settings ?? []).filter(
          (s) => s.accommodation_id === accId && s.effective_from <= orderDateIso.slice(0, 10),
        );
        const top = candidates[0];
        return {
          closer: Number(top?.closer_rate ?? 0),
          video: Number(top?.video_rate ?? 0),
        };
      }

      // 4b) 業主月結免抽成來源判斷（owner_direct / exempt_order_sources）
      const isExempt = await buildExemptResolver(supabase, accIds as string[]);
      // 4c) 合作期間 gate：無合作期間／已暫停的館別不產生分潤快照
      const inPartnership = await buildPartnershipResolver(supabase, accIds as string[]);
      // 4d) 月營收抽成門檻 gate：未達門檻 → factor = 0（不產生分潤）
      const thresholdFactor = await buildThresholdFactorResolver(supabase, accIds as string[]);

      // 5) Build snapshot rows
      const toInsert: any[] = [];

      for (const o of orderList) {
        const meta = metaMap.get(o.id as string);
        if (!meta) continue;
        if (meta.is_excluded === true) continue;
        if (!meta.closer_id) continue;
        // 非台幣訂單不計入獎金（null 視為台幣）
        const cur = (o as { currency_at_booking?: string | null }).currency_at_booking;
        if (cur && cur !== "TWD") continue;
        // 免抽成來源訂單不計入獎金
        if (isExempt(o as any)) continue;
        // 訂單日不在館別合作期間內 → 不計入獎金
        if (!inPartnership(o.accommodation_id as string, o.order_date as string)) continue;
        // 當月營收未達抽成門檻 → 不計入獎金
        const factor = thresholdFactor(o.accommodation_id as string, o.check_in_date as string);
        if (factor <= 0) continue;
        result.processed++;

        if (existingSet.has(o.id as string)) {
          result.skipped++;
          continue;
        }

        // team_commission_price 若未設定或等於 final_price（代表未人工調整），
        // 則以 final_price − 加購項目 為基礎；已人工指定則沿用人工值，不再扣加購。
        const tcp = meta.team_commission_price;
        const finalPrice = Number(o.final_price ?? 0);
        const baseAmount =
          tcp == null || Number(tcp) === finalPrice
            ? commissionBaseFromOrder(o as any)
            : Number(tcp);
        const rates = rateFor(o.accommodation_id as string, o.order_date as string);
        const closerAmt = baseAmount * rates.closer * factor;
        const videoAmt = meta.video_creator_id ? baseAmount * rates.video * factor : 0;

        toInsert.push({
          order_id: o.id,
          accommodation_id: o.accommodation_id,
          closer_id: meta.closer_id,
          video_creator_id: meta.video_creator_id,
          final_price_snapshot: baseAmount,
          closer_rate: rates.closer,
          video_rate: meta.video_creator_id ? rates.video : null,
          closer_commission_amount: closerAmt,
          video_commission_amount: videoAmt,
          // snapshot_month = 訂單原始所屬月份；payout_month = 本次執行的當期發放月
          snapshot_month: monthStr,
          payout_month: payoutMonthStr,
          check_out_date: o.check_out_date,
        });
      }

      // 6) Insert one-by-one to tolerate per-row failures (UNIQUE on order_id provides safety)
      for (const row of toInsert) {
        const { error: insErr } = await supabase
          .from("closer_commission_snapshots")
          .insert(row);
        if (insErr) {
          // duplicate via UNIQUE → treat as skipped（絕不改寫既有列）
          if ((insErr as any).code === "23505") {
            result.skipped++;
          } else {
            result.errors.push({ order_id: row.order_id, error: insErr.message });
          }
        } else {
          result.created++;
          result.amount += Number(row.closer_commission_amount ?? 0) +
            Number(row.video_commission_amount ?? 0);
        }
      }

      return result;
    }

    /**
     * 重算「未發放」快照：若訂單目前的分潤基準金額與快照凍結金額不同，
     * 直接改寫該快照（金額、費率、check_out_date），使發放金額與現況一致。
     * 已標記發放（commission_payout_marks.payout_status = 'paid'）的快照永不改寫。
     */
    async function resyncUnpaidSnapshots() {
      const out = {
        checked: 0,
        updated: 0,
        skipped_paid: 0,
        cancelled_adjustments: 0,
        revoked: 0,
        revoked_details: [] as Array<{ order_id: string; reason: string; amount: number }>,
        details: [] as Array<{
          order_id: string; before: number; after: number;
          closer_amount_before: number; closer_amount_after: number;
        }>,
        errors: [] as Array<{ order_id: string; error: string }>,
      };

      const { data: snaps, error: snapErr } = await supabase
        .from("closer_commission_snapshots")
        .select("id, order_id, accommodation_id, closer_id, video_creator_id, final_price_snapshot, closer_rate, video_rate, closer_commission_amount, video_commission_amount");
      if (snapErr) throw snapErr;

      const snapList = snaps ?? [];
      if (snapList.length === 0) return out;

      // 已發放標記
      const { data: marks, error: markErr } = await supabase
        .from("commission_payout_marks")
        .select("source_id")
        .eq("source_table", "closer_commission_snapshots")
        .eq("payout_status", "paid");
      if (markErr) throw markErr;
      const paidSet = new Set<string>((marks ?? []).map((r) => r.source_id as string));

      const pending = snapList.filter((s) => !paidSet.has(s.id as string));
      out.skipped_paid = snapList.length - pending.length;
      if (pending.length === 0) return out;

      const orderIds = pending.map((s) => s.order_id as string);

      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select("id, accommodation_id, final_price, custom_addon_details, check_in_date, check_out_date, order_date, order_status, currency_at_booking, owner_direct, order_source")
        .in("id", orderIds);
      if (ordErr) throw ordErr;
      const orderMap = new Map<string, any>();
      for (const o of orders ?? []) orderMap.set(o.id as string, o);

      const { data: metas, error: metaErr } = await supabase
        .from("order_meta")
        .select("order_id, team_commission_price, video_creator_id")
        .in("order_id", orderIds);
      if (metaErr) throw metaErr;
      const metaMap = new Map<string, any>();
      for (const mm of metas ?? []) metaMap.set(mm.order_id as string, mm);

      const accIds = Array.from(new Set((orders ?? []).map((o) => o.accommodation_id as string)));
      const { data: settings, error: setErr } = await supabase
        .from("accommodation_commission_settings")
        .select("accommodation_id, closer_rate, video_rate, effective_from")
        .in("accommodation_id", accIds)
        .order("effective_from", { ascending: false });
      if (setErr) throw setErr;
      const rateFor = (accId: string, orderDateIso: string) => {
        const top = (settings ?? []).find(
          (s) => s.accommodation_id === accId && s.effective_from <= String(orderDateIso).slice(0, 10),
        );
        return { closer: Number(top?.closer_rate ?? 0), video: Number(top?.video_rate ?? 0) };
      };

      const isExemptR = await buildExemptResolver(supabase, accIds as string[]);
      const inPartnershipR = await buildPartnershipResolver(supabase, accIds as string[]);
      const thresholdFactorR = await buildThresholdFactorResolver(supabase, accIds as string[]);

      /**
       * 撤銷未發放快照：連同其補差與未發放標記一併移除（已發放者永不進入此流程）。
       */
      async function revokeSnapshot(s: any, reason: string) {
        const { error: adjErr } = await supabase
          .from("closer_commission_adjustments")
          .delete()
          .eq("snapshot_id", s.id);
        if (adjErr) {
          out.errors.push({ order_id: s.order_id as string, error: adjErr.message });
          return;
        }
        await supabase
          .from("commission_payout_marks")
          .delete()
          .eq("source_table", "closer_commission_snapshots")
          .eq("source_id", s.id);
        const { error: delErr } = await supabase
          .from("closer_commission_snapshots")
          .delete()
          .eq("id", s.id);
        if (delErr) {
          out.errors.push({ order_id: s.order_id as string, error: delErr.message });
          return;
        }
        out.revoked++;
        out.revoked_details.push({
          order_id: s.order_id as string,
          reason,
          amount: Number(s.closer_commission_amount ?? 0) + Number(s.video_commission_amount ?? 0),
        });
      }

      // 已存在的取消扣回補差（避免重複產生）
      const { data: existCancel, error: existCancelErr } = await supabase
        .from("closer_commission_adjustments")
        .select("order_id")
        .eq("adjustment_type", "cancellation")
        .in("order_id", orderIds);
      if (existCancelErr) throw existCancelErr;
      const cancelledAdjSet = new Set<string>((existCancel ?? []).map((r) => r.order_id as string));

      const adjMonthStr = `${tp.y}-${pad2(tp.m)}`;

      for (const s of pending) {
        const ord = orderMap.get(s.order_id as string);
        if (!ord) continue;
        // 取消單：若尚未有取消扣回補差，於此補產生（金額不再改寫）
        if (ord.order_status === "cancelled") {
          if (cancelledAdjSet.has(s.order_id as string)) continue;
          if (isExemptR(ord)) continue;
          const { error: insErr } = await supabase
            .from("closer_commission_adjustments")
            .insert({
              snapshot_id: s.id,
              order_id: s.order_id,
              closer_id: s.closer_id,
              video_creator_id: s.video_creator_id,
              adjustment_type: "cancellation",
              closer_amount: -Number(s.closer_commission_amount ?? 0),
              video_amount: -Number(s.video_commission_amount ?? 0),
              reason: "訂單已取消，全額扣回",
              adjustment_month: adjMonthStr,
            });
          if (insErr) {
            if ((insErr as any).code !== "23505") {
              out.errors.push({ order_id: s.order_id as string, error: insErr.message });
            }
          } else {
            cancelledAdjSet.add(s.order_id as string);
            out.cancelled_adjustments++;
          }
          continue;
        }

        const cur = ord.currency_at_booking;
        if (cur && cur !== "TWD") {
          await revokeSnapshot(s, "非台幣訂單");
          continue;
        }
        if (isExemptR(ord)) {
          await revokeSnapshot(s, "免抽成來源（業主自帶／免抽成訂單來源）");
          continue;
        }
        if (!inPartnershipR(ord.accommodation_id as string, ord.order_date as string)) {
          await revokeSnapshot(s, "訂單日不在館別合作期間內（或合作政策為不採計）");
          continue;
        }
        const factor = thresholdFactorR(ord.accommodation_id as string, ord.check_in_date as string);
        if (factor <= 0) {
          await revokeSnapshot(s, "當月營收未達抽成門檻");
          continue;
        }

        out.checked++;

        const meta = metaMap.get(s.order_id as string);
        const tcp = meta?.team_commission_price;
        const finalPrice = Number(ord.final_price ?? 0);
        const baseAmount =
          tcp == null || Number(tcp) === finalPrice
            ? commissionBaseFromOrder(ord)
            : Number(tcp);

        const rates = rateFor(ord.accommodation_id as string, ord.order_date as string);
        const closerRate = s.closer_rate == null ? rates.closer : Number(s.closer_rate);
        const hasVideo = !!s.video_creator_id;
        const videoRate = hasVideo ? (s.video_rate == null ? rates.video : Number(s.video_rate)) : 0;

        const closerAmt = baseAmount * closerRate * factor;
        const videoAmt = hasVideo ? baseAmount * videoRate * factor : 0;

        const beforeBase = Number(s.final_price_snapshot ?? 0);
        const beforeCloser = Number(s.closer_commission_amount ?? 0);
        const beforeVideo = Number(s.video_commission_amount ?? 0);

        const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
        if (near(beforeBase, baseAmount) && near(beforeCloser, closerAmt) && near(beforeVideo, videoAmt)) {
          continue;
        }

        const { error: updErr } = await supabase
          .from("closer_commission_snapshots")
          .update({
            final_price_snapshot: baseAmount,
            closer_commission_amount: closerAmt,
            video_commission_amount: videoAmt,
            check_out_date: ord.check_out_date,
          })
          .eq("id", s.id);
        if (updErr) {
          out.errors.push({ order_id: s.order_id as string, error: updErr.message });
          continue;
        }

        out.updated++;
        out.details.push({
          order_id: s.order_id as string,
          before: beforeBase,
          after: baseAmount,
          closer_amount_before: Math.round(beforeCloser * 100) / 100,
          closer_amount_after: Math.round(closerAmt * 100) / 100,
        });
      }

      return out;
    }

    // ===== 本期（上月 / test_month）=====
    const current = await processMonth(snapYear, snapMonth);

    // ===== 回溯補建：上上月起往前 BACKFILL_MONTHS 個月 =====
    const backfillResults: MonthResult[] = [];
    for (let i = 1; i <= BACKFILL_MONTHS; i++) {
      const { y, m } = addMonths(snapYear, snapMonth, -i);
      backfillResults.push(await processMonth(y, m));
    }

    // ===== 未發放快照金額重算（金額異動 → 重寫快照）=====
    const resync = await resyncUnpaidSnapshots();

    const createdBackfill = backfillResults
      .filter((r) => r.created > 0)
      .map((r) => ({ month: r.month, count: r.created, amount: Math.round(r.amount * 100) / 100 }));
    const skippedBackfill = backfillResults.reduce((s, r) => s + r.skipped, 0);
    const createdBackfillTotal = backfillResults.reduce((s, r) => s + r.created, 0);
    const errors = [
      ...current.errors,
      ...backfillResults.flatMap((r) => r.errors.map((e) => ({ ...e, month: r.month }))),
      ...resync.errors.map((e) => ({ ...e, month: "resync" })),
    ];


    return jsonResponse({
      success: true,
      test_mode: testMode,
      snapshot_month: snapshotMonthStr,
      payout_month: payoutMonthStr,
      backfill_months: backfillResults.map((r) => r.month),
      processed: current.processed,
      // 本期新增
      created: current.created,
      created_current: current.created,
      skipped: current.skipped,
      // 回溯補建
      created_backfill: createdBackfill,
      created_backfill_total: createdBackfillTotal,
      skipped_backfill: skippedBackfill,
      // 未發放快照金額重算
      resynced: resync.updated,
      resync_cancelled_adjustments: resync.cancelled_adjustments,

      resync_checked: resync.checked,
      resync_skipped_paid: resync.skipped_paid,
      resync_revoked: resync.revoked,
      resync_revoked_details: resync.revoked_details,
      resync_details: resync.details,
      errors,

    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
