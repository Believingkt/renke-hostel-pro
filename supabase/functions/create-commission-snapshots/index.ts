import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // payoutMonth = current Taipei month
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

    // Taipei [snapStart, snapEnd) UTC range for orders.order_date
    const snapStartUtc = taipeiMidnightUtcISO(snapYear, snapMonth, 1);
    const snapEndUtc = taipeiMidnightUtcISO(snapYear, snapMonth + 1, 1);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Orders in target month, not cancelled
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, accommodation_id, final_price, check_out_date, order_date, order_status")
      .neq("order_status", "cancelled")
      .gte("order_date", snapStartUtc)
      .lt("order_date", snapEndUtc);
    if (ordersErr) throw ordersErr;

    const orderList = orders ?? [];
    if (orderList.length === 0) {
      return jsonResponse({
        success: true,
        test_mode: testMode,
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        processed: 0, created: 0, skipped: 0, errors: [],
      });
    }

    const orderIds = orderList.map((o) => o.id as string);

    // 2) order_meta for these orders
    const { data: metas, error: metasErr } = await supabase
      .from("order_meta")
      .select("order_id, closer_id, video_creator_id, team_commission_price, is_excluded")
      .in("order_id", orderIds);
    if (metasErr) throw metasErr;
    const metaMap = new Map<string, any>();
    for (const m of metas ?? []) metaMap.set(m.order_id as string, m);

    // 3) Existing snapshots — to skip
    const { data: existing, error: existErr } = await supabase
      .from("closer_commission_snapshots")
      .select("order_id")
      .in("order_id", orderIds);
    if (existErr) throw existErr;
    const existingSet = new Set<string>((existing ?? []).map((r) => r.order_id as string));

    // 4) Commission settings — fetch all and pick latest effective_from <= order.order_date per accommodation
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
      // already ordered desc — first is latest applicable
      const top = candidates[0];
      return {
        closer: Number(top?.closer_rate ?? 0),
        video: Number(top?.video_rate ?? 0),
      };
    }

    // 5) Build snapshot rows
    const errors: Array<{ order_id: string; error: string }> = [];
    const toInsert: any[] = [];
    let skipped = 0;
    let processed = 0;

    for (const o of orderList) {
      const meta = metaMap.get(o.id as string);
      // exclude rules
      if (!meta) continue;
      if (meta.is_excluded === true) continue;
      if (!meta.closer_id) continue;
      processed++;

      if (existingSet.has(o.id as string)) {
        skipped++;
        continue;
      }

      const baseAmount = Number(
        meta.team_commission_price != null ? meta.team_commission_price : (o.final_price ?? 0),
      );
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
        snapshot_month: snapshotMonthStr,
        payout_month: payoutMonthStr,
        check_out_date: o.check_out_date,
      });
    }

    // 6) Insert one-by-one to tolerate per-row failures (UNIQUE on order_id provides safety)
    let created = 0;
    for (const row of toInsert) {
      const { error: insErr } = await supabase
        .from("closer_commission_snapshots")
        .insert(row);
      if (insErr) {
        // duplicate via UNIQUE → treat as skipped
        if ((insErr as any).code === "23505") {
          skipped++;
        } else {
          errors.push({ order_id: row.order_id, error: insErr.message });
        }
      } else {
        created++;
      }
    }

    return jsonResponse({
      success: true,
      test_mode: testMode,
      snapshot_month: snapshotMonthStr,
      payout_month: payoutMonthStr,
      processed,
      created,
      skipped,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
