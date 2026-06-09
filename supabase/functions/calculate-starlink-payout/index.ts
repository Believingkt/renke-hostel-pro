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

const pad = (n: number) => String(n).padStart(2, "0");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const year = Number(body?.year);
    const month = Number(body?.month);
    const periodNum = Number(body?.period ?? 10);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ success: false, error: "year and month (1-12) are required" }, 400);
    }
    if (periodNum !== 10) {
      return jsonResponse({ success: false, error: "period must be 10" }, 400);
    }
    const period = periodNum;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 結算上月
    const targetYear = month === 1 ? year - 1 : year;
    const targetMonth = month === 1 ? 12 : month - 1;
    const monthStart = `${targetYear}-${pad(targetMonth)}-01`;
    const monthEnd =
      targetMonth === 12
        ? `${targetYear + 1}-01-01`
        : `${targetYear}-${pad(targetMonth + 1)}-01`;

    // 撈訂單
    const { data: orders, error: ordErr } = await supabase
      .from("starlink_orders")
      .select(
        "id, sold_by, plan_price, commission_rate, commission_amount, sold_at, client_name, plan_name",
      )
      .gte("sold_at", monthStart)
      .lt("sold_at", monthEnd)
      .eq("payment_confirmed", true)
      .eq("payout_status", "pending");
    if (ordErr) throw ordErr;

    const ordersList = orders ?? [];

    // 依 sold_by 分組
    const grouped = new Map<string, typeof ordersList>();
    for (const o of ordersList) {
      if (!o.sold_by) continue;
      const arr = grouped.get(o.sold_by as string) ?? [];
      arr.push(o);
      grouped.set(o.sold_by as string, arr);
    }

    if (grouped.size === 0) {
      return jsonResponse({
        success: true,
        year,
        month,
        period,
        target_year: targetYear,
        target_month: targetMonth,
        sales_calculated: 0,
        results: [],
      });
    }

    // user_id → team_member_profiles
    const userIds = [...grouped.keys()];
    const { data: profiles, error: profErr } = await supabase
      .from("team_member_profiles")
      .select("id, user_id, display_name")
      .in("user_id", userIds);
    if (profErr) throw profErr;

    const profileByUser = new Map<string, { id: string; display_name: string | null }>();
    for (const p of profiles ?? []) {
      profileByUser.set(p.user_id as string, {
        id: p.id as string,
        display_name: (p.display_name as string) ?? null,
      });
    }

    const calculatedAt = new Date().toISOString();
    const results: Array<{
      scout_id: string;
      display_name: string;
      total_orders: number;
      total_sales: number;
      total_commission: number;
    }> = [];

    for (const [userId, list] of grouped.entries()) {
      const prof = profileByUser.get(userId);
      if (!prof) continue;

      const totalOrders = list.length;
      const totalSales = list.reduce((s, o) => s + Number(o.plan_price ?? 0), 0);
      const totalCommission = list.reduce(
        (s, o) => s + Number(o.commission_amount ?? 0),
        0,
      );
      const orderSnapshot = list.map((o) => ({
        id: o.id,
        client_name: o.client_name,
        plan_name: o.plan_name,
        plan_price: Number(o.plan_price ?? 0),
        commission_amount: Number(o.commission_amount ?? 0),
        sold_at: o.sold_at,
      }));

      // 檢查既有紀錄
      const { data: existing, error: exErr } = await supabase
        .from("starlink_monthly_payouts")
        .select("id, payout_status")
        .eq("scout_id", prof.id)
        .eq("year", year)
        .eq("month", month)
        .eq("period", period)
        .maybeSingle();
      if (exErr) throw exErr;

      if (existing && existing.payout_status === "paid") {
        results.push({
          scout_id: prof.id,
          display_name: prof.display_name ?? "",
          total_orders: 0,
          total_sales: 0,
          total_commission: 0,
        });
        continue;
      }

      const payload = {
        scout_id: prof.id,
        year,
        month,
        period,
        total_orders: totalOrders,
        total_sales: totalSales,
        total_commission: totalCommission,
        payout_status: existing?.payout_status ?? "pending",
        calculated_at: calculatedAt,
        order_snapshot: orderSnapshot,
      };

      if (existing) {
        const { error: updErr } = await supabase
          .from("starlink_monthly_payouts")
          .update(payload)
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase
          .from("starlink_monthly_payouts")
          .insert(payload);
        if (insErr) throw insErr;
      }

      results.push({
        scout_id: prof.id,
        display_name: prof.display_name ?? "",
        total_orders: totalOrders,
        total_sales: totalSales,
        total_commission: totalCommission,
      });
    }

    return jsonResponse({
      success: true,
      year,
      month,
      period,
      target_year: targetYear,
      target_month: targetMonth,
      sales_calculated: results.length,
      results,
    });
  } catch (e) {
    console.error("[calculate-starlink-payout] error:", e);
    return jsonResponse({ success: false, error: (e as Error).message }, 500);
  }
});
