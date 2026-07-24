// Push PMS monthly revenue to Ragic (income-source form)
// Body: { year: number, month: number (1-12), accommodation_id?: string, dry_run?: boolean }
// - dry_run=true → compute & return payload(s) without POSTing to Ragic
// - dry_run=false → POST to Ragic, return record IDs

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const RAGIC_URL =
  "https://ap15.ragic.com/lakeze/income-source/2?api&naming=EID";

const FIELD = {
  DATA_SOURCE: "1001007",
  YEAR_MONTH: "1001009",
  BUSINESS_UNIT: "1001017",
  INCOME_TYPE: "1001018",
  AMOUNT: "1001010",
  VENUE: "1001008",
  COMMISSION_RATE: "1001019",
  COMMISSION_FEE: "1001020",
  EXCHANGE_RATE: "1001021",
  NOTE: "1001022",
} as const;

// Only 森山寫照 is currently a franchise venue
const FRANCHISE_IDS = new Set<string>([
  "5f764d55-ae11-4631-80fe-2e611853deae",
]);

const NO_FEE_NOTE =
  "PMS尚未設定管顧費率，請查看 https://sensaninn.lakeze.com/team/commission";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function parseDay(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function orderNights(o: any): number {
  if (!o.check_in_date || !o.check_out_date) return 0;
  const inD = parseDay(o.check_in_date);
  const outD = parseDay(o.check_out_date);
  const n = Math.round((outD.getTime() - inD.getTime()) / 86_400_000);
  return n > 0 ? n : 0;
}

/** Accrue an order's final_price nightly onto [monthStart, monthEnd] (inclusive-exclusive). */
function accruedInMonth(o: any, monthStart: Date, monthEnd: Date): number {
  if (o.order_status === "cancelled") return 0;
  if (o.order_source === "kol") return 0;
  const nights = orderNights(o);
  if (!nights) return 0;
  const share = (Number(o.final_price) || 0) / nights;
  const start = parseDay(o.check_in_date);
  let sum = 0;
  for (let i = 0; i < nights; i++) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
    );
    if (day >= monthStart && day < monthEnd) sum += share;
  }
  return sum;
}

function orderCurrency(o: any): string {
  const meta = o?.order_meta;
  const raw =
    (Array.isArray(meta) ? meta[0]?.display_currency : meta?.display_currency) ??
    o?.currency ??
    "TWD";
  return String(raw || "TWD").toUpperCase();
}

async function postToRagic(payload: Record<string, string>) {
  const apiKey = Deno.env.get("RAGIC_API_KEY");
  if (!apiKey) throw new Error("RAGIC_API_KEY not configured");
  // Ragic API key is already a base64 string — send it directly, do NOT re-encode.
  const body = new URLSearchParams(payload).toString();
  const resp = await fetch(RAGIC_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey.trim()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await resp.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { ok: resp.ok, status: resp.status, body: json ?? text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      year,
      month,
      accommodation_id,
      dry_run = true,
    } = await req.json();

    if (!year || !month || month < 1 || month > 12) {
      return new Response(
        JSON.stringify({ error: "year & month (1-12) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const yyyyMm = `${year}/${String(month).padStart(2, "0")}`;
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);

    // 1. Fetch accommodations
    let accQuery = supabase
      .from("accommodation_info")
      .select("id, name, secondary_currency, secondary_currency_rate")
      .eq("is_active", true);
    if (accommodation_id) accQuery = accQuery.eq("id", accommodation_id);
    const { data: accommodations, error: accErr } = await accQuery;
    if (accErr) throw accErr;

    // 2. Fetch consulting_fee_settings for those accommodations
    const accIds = (accommodations || []).map((a: any) => a.id);
    const { data: feeRows, error: feeErr } = await supabase
      .from("consulting_fee_settings")
      .select("accommodation_id, rate, revenue_threshold, effective_from")
      .in("accommodation_id", accIds)
      .lte("effective_from", monthEndStr)
      .order("effective_from", { ascending: false });
    if (feeErr) throw feeErr;
    // pick latest effective per accommodation
    const feeMap = new Map<
      string,
      { rate: number; threshold: number } | null
    >();
    for (const row of feeRows || []) {
      if (!feeMap.has(row.accommodation_id)) {
        feeMap.set(row.accommodation_id, {
          rate: Number(row.rate) || 0,
          threshold: Number(row.revenue_threshold) || 0,
        });
      }
    }

    const results: any[] = [];

    for (const acc of accommodations || []) {
      // 3. Fetch orders overlapping the month
      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select(
          "id, check_in_date, check_out_date, final_price, order_status, order_source, order_meta(display_currency)",
        )
        .eq("accommodation_id", acc.id)
        .lt("check_in_date", monthEndStr)
        .gt("check_out_date", monthStartStr);
      if (ordErr) throw ordErr;

      // 4. Aggregate revenue (native currency) + convert to TWD
      const isJpy =
        (acc.secondary_currency || "").toUpperCase() === "JPY" &&
        Number(acc.secondary_currency_rate) > 0;
      const jpyRate = Number(acc.secondary_currency_rate) || 0; // JPY per TWD
      const originalCurrency = isJpy ? "JPY" : "TWD";
      const exchangeRate = isJpy ? jpyRate : 1;

      let revenueTwd = 0;
      for (const o of orders || []) {
        const nightly = accruedInMonth(o, monthStart, monthEnd);
        if (!nightly) continue;
        const cur = orderCurrency(o);
        if (cur === "JPY" && jpyRate > 0) {
          revenueTwd += nightly / jpyRate; // JPY → TWD
        } else {
          revenueTwd += nightly;
        }
      }
      revenueTwd = Math.round(revenueTwd);

      const feeCfg = feeMap.get(acc.id) ?? null;
      const hasFee = !!feeCfg;
      const managementFee = feeCfg
        ? Math.max(0, revenueTwd - feeCfg.threshold) * feeCfg.rate
        : 0;
      const managementFeeRounded = Math.round(managementFee);

      const isFranchise = FRANCHISE_IDS.has(acc.id);
      const noteText = hasFee ? "" : NO_FEE_NOTE;

      const rows: Record<string, string>[] = [];

      // 平台抽成 (always)
      rows.push({
        [FIELD.DATA_SOURCE]: "PMS",
        [FIELD.YEAR_MONTH]: yyyyMm,
        [FIELD.BUSINESS_UNIT]: "人客多總部",
        [FIELD.INCOME_TYPE]: "平台抽成",
        [FIELD.AMOUNT]: String(managementFeeRounded),
        [FIELD.VENUE]: acc.name,
        [FIELD.EXCHANGE_RATE]: String(exchangeRate),
        [FIELD.NOTE]: noteText,
      });

      // 門市運營 (franchise only)
      if (isFranchise) {
        rows.unshift({
          [FIELD.DATA_SOURCE]: "PMS",
          [FIELD.YEAR_MONTH]: yyyyMm,
          [FIELD.BUSINESS_UNIT]: `營運門市_${acc.name}`,
          [FIELD.INCOME_TYPE]: "門市運營",
          [FIELD.AMOUNT]: String(revenueTwd),
          [FIELD.VENUE]: acc.name,
          [FIELD.EXCHANGE_RATE]: String(exchangeRate),
          [FIELD.NOTE]: noteText,
        });
      }

      const posts: any[] = [];
      if (!dry_run) {
        for (const row of rows) {
          const r = await postToRagic(row);
          posts.push({
            ok: r.ok,
            status: r.status,
            record_id: (r.body && (r.body._ragicId ?? r.body.ragicId)) ?? null,
            body: r.body,
          });
        }
      }

      results.push({
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        is_franchise: isFranchise,
        original_currency: originalCurrency,
        exchange_rate: exchangeRate,
        revenue_twd: revenueTwd,
        management_fee_twd: managementFeeRounded,
        fee_config: feeCfg,
        payloads: rows,
        ...(dry_run ? {} : { ragic_responses: posts }),
      });
    }

    return new Response(
      JSON.stringify({
        year_month: yyyyMm,
        dry_run,
        count: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[push-ragic-revenue]", e);
    return new Response(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
