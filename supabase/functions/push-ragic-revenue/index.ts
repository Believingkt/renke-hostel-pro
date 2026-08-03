// Push PMS monthly revenue to Ragic (income-source form)
// Body: { year: number, month: number (1-12), accommodation_id?: string, dry_run?: boolean }
// - dry_run=true → compute & return payload(s) without POSTing to Ragic
// - dry_run=false → POST to Ragic, return record IDs

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildExemptResolver } from "../_shared/ownerPricingRule.ts";
import { RAGIC_FIELD as FIELD, pushRows } from "../_shared/ragic.ts";
import { buildMarketingFeeResolver, resolveMarketingFee } from "../_shared/marketingFee.ts";

// Only 森山寫照 is currently a franchise venue
const FRANCHISE_IDS = new Set<string>([
  "5f764d55-ae11-4631-80fe-2e611853deae",
]);


const NO_FEE_NOTE =
  "PMS尚未設定管顧費率，請查看 https://pms.lakeze.com/team/commission";

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

/** Accrue an order's final_price nightly onto [monthStart, monthEnd) (inclusive-exclusive). */
function accruedInMonth(
  o: any,
  monthStart: Date,
  monthEnd: Date,
  isExempt: (order: any) => boolean,
  ignoreExempt = false,
): number {
  if (o.order_status === "cancelled") return 0;
  // 保留單：靠姓名字串判斷，維持既有行為（不在 exempt 規則涵蓋範圍內）
  if (String(o.guest_name ?? "").trim() === "保留單") return 0;
  // 排除來源一律以 owner_settlement_pricing_rules.exempt_order_sources（DB 驅動）＋ owner_direct 判斷
  if (!ignoreExempt && isExempt(o)) return 0;
  // 註：kol 已包含在除「天送幸福和苑」外所有館別的 DB 清單中；天送的清單目前未含 kol，
  // 若日後天送需要排除 kol，請由 AM 在後台勾選，不在此硬寫。

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
      mode = "upsert", // "insert" (legacy always-create) or "upsert" (match by year_month+venue+income_type)
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
    const monthStartStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, "0")}-01`;

    // 1. Fetch accommodations
    let accQuery = supabase
      .from("accommodation_info")
      .select("id, name, building_count, secondary_currency, secondary_currency_rate")
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

    // 2b. 排除規則：沿用正式試算共用邏輯（DB 驅動 owner_settlement_pricing_rules + legacy fallback）
    const isExempt = await buildExemptResolver(supabase, accIds);
    // 2c. 行銷推廣費規則（與前端 resolveMarketingFee 同一套邏輯）
    const marketingRuleFor = await buildMarketingFeeResolver(supabase, accIds, monthStartStr);

    const results: any[] = [];

    for (const acc of accommodations || []) {
      // 3a. 先在查詢層取得該館「日幣訂單」的 id，後續直接排除，不撈進計算
      const { data: jpyMeta, error: jpyErr } = await supabase
        .from("order_meta")
        .select("order_id, orders!inner(accommodation_id)")
        .eq("display_currency", "JPY")
        .eq("orders.accommodation_id", acc.id);
      if (jpyErr) throw jpyErr;
      const jpyIds = (jpyMeta || []).map((m: any) => m.order_id).filter(Boolean);

      // 3b. Fetch orders overlapping the month (排除日幣訂單)
      let ordQuery = supabase
        .from("orders")
        .select(
          "id, order_number, guest_name, check_in_date, check_out_date, final_price, order_status, order_source, order_date, owner_direct, accommodation_id",
        )
        .eq("accommodation_id", acc.id)
        .lt("check_in_date", monthEndStr)
        .gt("check_out_date", monthStartStr);
      if (jpyIds.length > 0) {
        ordQuery = ordQuery.not("id", "in", `(${jpyIds.join(",")})`);
      }
      const { data: orders, error: ordErr } = await ordQuery;
      if (ordErr) throw ordErr;

      // 4. Aggregate revenue (TWD only)
      let revenueTwd = 0;
      // 行銷費門檻基礎：毛營收（含 exempt 訂單），與前端 getStandardThresholdBase 一致
      let grossRevenueTwd = 0;
      for (const o of orders || []) {
        revenueTwd += accruedInMonth(o, monthStart, monthEnd, isExempt);
        grossRevenueTwd += accruedInMonth(o, monthStart, monthEnd, isExempt, true);
      }

      revenueTwd = Math.round(revenueTwd);
      grossRevenueTwd = Math.round(grossRevenueTwd);


      const feeCfg = feeMap.get(acc.id) ?? null;
      const hasFee = !!feeCfg;
      const managementFee = feeCfg
        ? Math.max(0, revenueTwd - feeCfg.threshold) * feeCfg.rate
        : 0;
      const managementFeeRounded = Math.round(managementFee);

      const isFranchise = FRANCHISE_IDS.has(acc.id);
      const noteText = hasFee ? "" : NO_FEE_NOTE;

      // 行銷推廣費：每館每月一筆，0 元館別也照推
      const mRule = marketingRuleFor(acc.id);
      const marketingFee = Math.round(
        resolveMarketingFee(mRule, grossRevenueTwd, Number(acc.building_count) || 1),
      );
      const marketingRow: Record<string, string> = {
        [FIELD.DATA_SOURCE]: "PMS",
        [FIELD.YEAR_MONTH]: yyyyMm,
        [FIELD.BUSINESS_UNIT]: "人客多總部",
        [FIELD.INCOME_TYPE]: "行銷推廣費",
        [FIELD.AMOUNT]: String(marketingFee),
        [FIELD.VENUE]: acc.name,
        [FIELD.COMMISSION_RATE]: "",
        [FIELD.COMMISSION_FEE]: "",
        [FIELD.NOTE]: "",
      };

      // Skip venues with no revenue AND no management fee for the month,
      // OR venues that have a fee config but revenue is below threshold (fee = 0).
      // 註：此 skip 僅適用於「平台抽成／門市運營」，行銷推廣費仍照推。
      const skipUnderThreshold = hasFee && managementFeeRounded === 0;
      const skipCommissionRows =
        (revenueTwd === 0 && managementFeeRounded === 0) || skipUnderThreshold;

      const rows: Record<string, string>[] = [];

      // Ragic 抽成比例欄位為百分比型態，會自動 ×100 顯示；因此送出「小數」原值 (e.g. 0.25)
      const ratePercent = feeCfg ? Number(feeCfg.rate.toFixed(6)) : 0;

      if (!skipCommissionRows) {
        // 平台抽成 (always)
        rows.push({
          [FIELD.DATA_SOURCE]: "PMS",
          [FIELD.YEAR_MONTH]: yyyyMm,
          [FIELD.BUSINESS_UNIT]: "人客多總部",
          [FIELD.INCOME_TYPE]: "平台抽成",
          [FIELD.AMOUNT]: String(managementFeeRounded),
          [FIELD.VENUE]: acc.name,
          [FIELD.COMMISSION_RATE]: String(ratePercent),
          [FIELD.COMMISSION_FEE]: String(managementFeeRounded),
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
            [FIELD.COMMISSION_RATE]: "",
            [FIELD.COMMISSION_FEE]: "",
            [FIELD.NOTE]: noteText,
          });
        }
      }

      rows.push(marketingRow);

      const posts = dry_run ? [] : await pushRows(rows, yyyyMm, mode);

      results.push({
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        is_franchise: isFranchise,
        revenue_twd: revenueTwd,
        gross_revenue_twd: grossRevenueTwd,
        management_fee_twd: skipCommissionRows ? 0 : managementFeeRounded,
        marketing_fee_twd: marketingFee,
        marketing_rule: mRule,
        fee_config: feeCfg,
        ...(skipCommissionRows
          ? {
              commission_rows_skipped: true,
              skip_reason: skipUnderThreshold ? "under_threshold" : "no_revenue",
            }
          : {}),
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
