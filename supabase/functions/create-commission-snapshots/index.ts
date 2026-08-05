import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { isSuperAdmin, resolveCaller } from "../_shared/authz.ts";
import { buildExemptResolver } from "../_shared/ownerPricingRule.ts";
import { commissionBaseFromOrder } from "../_shared/addonTotal.ts";

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
        .select("id, accommodation_id, final_price, custom_addon_details, check_out_date, order_date, order_status, currency_at_booking, owner_direct, order_source")
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
        const closerAmt = baseAmount * rates.closer;
        const videoAmt = meta.video_creator_id ? baseAmount * rates.video : 0;

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

    // ===== 本期（上月 / test_month）=====
    const current = await processMonth(snapYear, snapMonth);

    // ===== 回溯補建：上上月起往前 3 個月 =====
    const backfillResults: MonthResult[] = [];
    for (let i = 1; i <= BACKFILL_MONTHS; i++) {
      const { y, m } = addMonths(snapYear, snapMonth, -i);
      backfillResults.push(await processMonth(y, m));
    }

    const createdBackfill = backfillResults
      .filter((r) => r.created > 0)
      .map((r) => ({ month: r.month, count: r.created, amount: Math.round(r.amount * 100) / 100 }));
    const skippedBackfill = backfillResults.reduce((s, r) => s + r.skipped, 0);
    const createdBackfillTotal = backfillResults.reduce((s, r) => s + r.created, 0);
    const errors = [
      ...current.errors,
      ...backfillResults.flatMap((r) => r.errors.map((e) => ({ ...e, month: r.month }))),
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
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
