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
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(d)) parts[p.type] = p.value;
  return { y: Number(parts.year), m: Number(parts.month), day: Number(parts.day) };
}

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const testMode = body?.test_mode === true;
    const testMonth = typeof body?.test_month === "string" ? body.test_month : null;

    const now = new Date();
    const tp = getTaipeiParts(now);

    // adjustment_month = current Taipei month
    const adjMonthStr = `${tp.y}-${pad2(tp.m)}`;

    // Target month range (previous month by default; override via test_month)
    let tYear: number;
    let tMonth: number;
    if (testMonth && /^\d{4}-\d{2}$/.test(testMonth)) {
      const [y, m] = testMonth.split("-").map(Number);
      tYear = y; tMonth = m;
    } else {
      tYear = tp.m === 1 ? tp.y - 1 : tp.y;
      tMonth = tp.m === 1 ? 12 : tp.m - 1;
    }
    const targetMonthStr = `${tYear}-${pad2(tMonth)}`;

    // Taipei [start, end) UTC range
    const startUtc = taipeiMidnightUtcISO(tYear, tMonth, 1);
    const endUtc = taipeiMidnightUtcISO(tYear, tMonth + 1, 1);
    // Date-only range for check_out_date
    const startDate = `${tYear}-${pad2(tMonth)}-01`;
    const endYear = tMonth === 12 ? tYear + 1 : tYear;
    const endMonth = tMonth === 12 ? 1 : tMonth + 1;
    const endDate = `${endYear}-${pad2(endMonth)}-01`;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const errors: Array<{ scenario: string; order_id?: string; error: string }> = [];
    let amountChanges = 0;
    let cancellations = 0;
    let reactivations = 0;

    // ===== Scenario A: amount_change — snapshots with check_out_date in target month =====
    const { data: snapsA, error: snapsAErr } = await supabase
      .from("closer_commission_snapshots")
      .select("id, order_id, closer_id, video_creator_id, final_price_snapshot, closer_rate, video_rate")
      .gte("check_out_date", startDate)
      .lt("check_out_date", endDate);
    if (snapsAErr) throw snapsAErr;

    const aSnaps = snapsA ?? [];
    if (aSnaps.length > 0) {
      const orderIds = aSnaps.map((s) => s.order_id as string);

      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id, order_status, final_price")
        .in("id", orderIds);
      if (ordersErr) throw ordersErr;
      const ordersMap = new Map<string, any>();
      for (const o of orders ?? []) ordersMap.set(o.id as string, o);

      const { data: metas, error: metasErr } = await supabase
        .from("order_meta")
        .select("order_id, team_commission_price")
        .in("order_id", orderIds);
      if (metasErr) throw metasErr;
      const metaMap = new Map<string, any>();
      for (const m of metas ?? []) metaMap.set(m.order_id as string, m);

      for (const s of aSnaps) {
        const orderId = s.order_id as string;
        const ord = ordersMap.get(orderId);
        if (!ord) continue;
        if (ord.order_status === "cancelled") continue; // handled in scenario B

        const meta = metaMap.get(orderId);
        const currentBase = Number(
          meta?.team_commission_price != null
            ? meta.team_commission_price
            : (ord.final_price ?? 0),
        );
        const snapBase = Number(s.final_price_snapshot ?? 0);
        if (currentBase === snapBase) continue;

        const diff = currentBase - snapBase;
        const closerRate = Number(s.closer_rate ?? 0);
        const videoRate = Number(s.video_rate ?? 0);
        const closerAmt = diff * closerRate;
        const videoAmt = s.video_creator_id ? diff * videoRate : 0;

        const row = {
          snapshot_id: s.id,
          order_id: orderId,
          closer_id: s.closer_id,
          video_creator_id: s.video_creator_id,
          adjustment_type: "amount_change",
          closer_amount: closerAmt,
          video_amount: videoAmt,
          reason: `退房後金額異動：原 ${snapBase} → 現 ${currentBase}`,
          adjustment_month: adjMonthStr,
        };

        // upsert on (order_id, adjustment_month, adjustment_type)
        const { error: upErr } = await supabase
          .from("closer_commission_adjustments")
          .upsert(row, { onConflict: "order_id,adjustment_month,adjustment_type" });
        if (upErr) {
          errors.push({ scenario: "amount_change", order_id: orderId, error: upErr.message });
        } else {
          amountChanges++;
        }
      }
    }

    // ===== Scenario B: cancellation — orders cancelled in target month with existing snapshot =====
    const { data: cancelledOrders, error: cancErr } = await supabase
      .from("orders")
      .select("id")
      .eq("order_status", "cancelled")
      .gte("cancelled_at", startUtc)
      .lt("cancelled_at", endUtc);
    if (cancErr) throw cancErr;

    const cancelledIds = (cancelledOrders ?? []).map((o) => o.id as string);
    if (cancelledIds.length > 0) {
      const { data: snapsB, error: snapsBErr } = await supabase
        .from("closer_commission_snapshots")
        .select("id, order_id, closer_id, video_creator_id, closer_commission_amount, video_commission_amount")
        .in("order_id", cancelledIds);
      if (snapsBErr) throw snapsBErr;

      // Already-existing cancellation adjustments
      const snapOrderIds = (snapsB ?? []).map((s) => s.order_id as string);
      let existingCancel = new Set<string>();
      if (snapOrderIds.length > 0) {
        const { data: existB, error: existBErr } = await supabase
          .from("closer_commission_adjustments")
          .select("order_id")
          .eq("adjustment_type", "cancellation")
          .in("order_id", snapOrderIds);
        if (existBErr) throw existBErr;
        existingCancel = new Set((existB ?? []).map((r) => r.order_id as string));
      }

      for (const s of snapsB ?? []) {
        const orderId = s.order_id as string;
        if (existingCancel.has(orderId)) continue;

        const row = {
          snapshot_id: s.id,
          order_id: orderId,
          closer_id: s.closer_id,
          video_creator_id: s.video_creator_id,
          adjustment_type: "cancellation",
          closer_amount: -Number(s.closer_commission_amount ?? 0),
          video_amount: -Number(s.video_commission_amount ?? 0),
          reason: "訂單已取消，全額扣回",
          adjustment_month: adjMonthStr,
        };

        const { error: insErr } = await supabase
          .from("closer_commission_adjustments")
          .insert(row);
        if (insErr) {
          if ((insErr as any).code === "23505") {
            // race / unique on (order_id, adjustment_month, adjustment_type)
            continue;
          }
          errors.push({ scenario: "cancellation", order_id: orderId, error: insErr.message });
        } else {
          cancellations++;
        }
      }
    }

    // ===== Scenario C: reactivation — previously-cancelled but now active =====
    const { data: cancelAdjs, error: cAdjErr } = await supabase
      .from("closer_commission_adjustments")
      .select("snapshot_id, order_id, closer_id, video_creator_id")
      .eq("adjustment_type", "cancellation");
    if (cAdjErr) throw cAdjErr;

    const cAdjList = cancelAdjs ?? [];
    if (cAdjList.length > 0) {
      const cIds = cAdjList.map((r) => r.order_id as string);

      const { data: cOrders, error: cOrdErr } = await supabase
        .from("orders")
        .select("id, order_status")
        .in("id", cIds);
      if (cOrdErr) throw cOrdErr;
      const statusMap = new Map<string, string>();
      for (const o of cOrders ?? []) statusMap.set(o.id as string, o.order_status as string);

      const { data: existReact, error: existRErr } = await supabase
        .from("closer_commission_adjustments")
        .select("order_id")
        .eq("adjustment_type", "reactivation")
        .in("order_id", cIds);
      if (existRErr) throw existRErr;
      const existingReact = new Set((existReact ?? []).map((r) => r.order_id as string));

      // Need snapshot amounts to restore
      const { data: snapsC, error: snapsCErr } = await supabase
        .from("closer_commission_snapshots")
        .select("id, order_id, closer_commission_amount, video_commission_amount")
        .in("order_id", cIds);
      if (snapsCErr) throw snapsCErr;
      const snapByOrder = new Map<string, any>();
      for (const s of snapsC ?? []) snapByOrder.set(s.order_id as string, s);

      for (const adj of cAdjList) {
        const orderId = adj.order_id as string;
        const status = statusMap.get(orderId);
        if (!status || status === "cancelled") continue;
        if (existingReact.has(orderId)) continue;
        const snap = snapByOrder.get(orderId);
        if (!snap) continue;

        const row = {
          snapshot_id: snap.id,
          order_id: orderId,
          closer_id: adj.closer_id,
          video_creator_id: adj.video_creator_id,
          adjustment_type: "reactivation",
          closer_amount: Number(snap.closer_commission_amount ?? 0),
          video_amount: Number(snap.video_commission_amount ?? 0),
          reason: "⚠️ 訂單取消後恢復，已補回原分潤金額，請人工確認",
          adjustment_month: adjMonthStr,
        };

        const { error: insErr } = await supabase
          .from("closer_commission_adjustments")
          .insert(row);
        if (insErr) {
          if ((insErr as any).code === "23505") continue;
          errors.push({ scenario: "reactivation", order_id: orderId, error: insErr.message });
        } else {
          reactivations++;
        }
      }
    }

    return jsonResponse({
      success: true,
      test_mode: testMode,
      target_month: targetMonthStr,
      adjustment_month: adjMonthStr,
      amount_changes: amountChanges,
      cancellations,
      reactivations,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ success: false, error: msg }, 500);
  }
});
