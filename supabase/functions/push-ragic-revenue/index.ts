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
  // 保留單：以 order_status = "hold" 判斷（轉正後即視為一般成交單）
  if (String(o.order_status ?? "") === "hold") return 0;
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

    // 2d. Gate A：合作期間。資料月只要與任一合作期間有交集就列入
    //     （例：6/26 終止 → 6 月資料月照算，7 月起不列入）
    const { data: periodRows, error: periodErr } = await supabase
      .from("accommodation_partnership_periods")
      .select("accommodation_id, start_date, end_date")
      .in("accommodation_id", accIds);
    if (periodErr) throw periodErr;
    const lastDayStr = new Date(monthEnd.getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const partneredIds = new Set<string>();
    for (const p of periodRows || []) {
      const start = String(p.start_date ?? "").slice(0, 10);
      const end = p.end_date ? String(p.end_date).slice(0, 10) : null;
      if (start && start > lastDayStr) continue;
      if (end && end < monthStartStr) continue;
      partneredIds.add(p.accommodation_id);
    }

    // 2e. Gate C：是否約定收取行銷推廣費（owner_settlement_pricing_rules.charges_marketing_fee）
    const { data: chargeRows, error: chargeErr } = await supabase
      .from("owner_settlement_pricing_rules")
      .select("accommodation_id, charges_marketing_fee, effective_from")
      .in("accommodation_id", accIds)
      .lte("effective_from", monthStartStr)
      .order("effective_from", { ascending: false });
    if (chargeErr) throw chargeErr;
    const chargesMarketing = new Map<string, boolean>();
    for (const r of chargeRows || []) {
      if (!chargesMarketing.has(r.accommodation_id)) {
        chargesMarketing.set(r.accommodation_id, r.charges_marketing_fee === true);
      }
    }

    const results: any[] = [];
    const skipped: any[] = [];

    // 3. 批次撈取（優化 A/B）：只針對通過 Gate A 的館別，一次撈完所有訂單與日幣訂單，
    //    取代原本「逐館 2 次查詢」的 N+1 串行往返。
    const activeAccIds = (accommodations || [])
      .map((a: any) => a.id)
      .filter((id: string) => partneredIds.has(id));

    const jpyIdSet = new Set<string>();
    const ordersByAcc = new Map<string, any[]>();

    if (activeAccIds.length > 0) {
      const [jpyRes, ordRes] = await Promise.all([
        supabase
          .from("order_meta")
          .select("order_id, orders!inner(accommodation_id)")
          .eq("display_currency", "JPY")
          .in("orders.accommodation_id", activeAccIds),
        supabase
          .from("orders")
          .select(
            "id, order_number, guest_name, check_in_date, check_out_date, final_price, order_status, order_source, order_date, owner_direct, accommodation_id",
          )
          .in("accommodation_id", activeAccIds)
          .lt("check_in_date", monthEndStr)
          .gt("check_out_date", monthStartStr),
      ]);
      if (jpyRes.error) throw jpyRes.error;
      if (ordRes.error) throw ordRes.error;

      for (const m of jpyRes.data || []) {
        if (m.order_id) jpyIdSet.add(m.order_id as string);
      }
      for (const o of ordRes.data || []) {
        if (jpyIdSet.has(o.id)) continue; // 排除日幣訂單（記憶體過濾，取代 not-in 長字串）
        const list = ordersByAcc.get(o.accommodation_id);
        if (list) list.push(o);
        else ordersByAcc.set(o.accommodation_id, [o]);
      }
    }

    for (const acc of accommodations || []) {
      // Gate A：非合作期間（含從未合作、已終止）→ 整館不產生任何列
      if (!partneredIds.has(acc.id)) {
        const hadPeriod = (periodRows || []).some((p: any) => p.accommodation_id === acc.id);
        skipped.push({
          accommodation_id: acc.id,
          accommodation_name: acc.name,
          scope: "venue",
          gate: "A",
          skip_reason: hadPeriod ? "partnership_ended" : "no_active_partnership",
          has_commission_setting: feeMap.has(acc.id),
          charges_marketing_fee: chargesMarketing.get(acc.id) === true,
          detail: hadPeriod
            ? "合作期間與此資料月無交集（已終止或尚未開始）"
            : "查無任何合作期間紀錄",
        });
        continue;
      }

      const orders = ordersByAcc.get(acc.id) ?? [];


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

      // Gate C：行銷推廣費：僅在合約有約定（charges_marketing_fee = true）時才產生列
      const chargesMkt = chargesMarketing.get(acc.id) === true;
      const mRule = marketingRuleFor(acc.id);
      const marketingFee = chargesMkt
        ? Math.round(
            resolveMarketingFee(mRule, grossRevenueTwd, Number(acc.building_count) || 1),
          )
        : 0;
      const marketingRow: Record<string, string> | null = chargesMkt
        ? {
            [FIELD.DATA_SOURCE]: "PMS",
            [FIELD.YEAR_MONTH]: yyyyMm,
            [FIELD.BUSINESS_UNIT]: "人客多總部",
            [FIELD.INCOME_TYPE]: "行銷推廣費",
            [FIELD.AMOUNT]: String(marketingFee),
            [FIELD.VENUE]: acc.name,
            [FIELD.COMMISSION_RATE]: "",
            [FIELD.COMMISSION_FEE]: "",
            [FIELD.NOTE]: "",
          }
        : null;

      // Gate B：沒有管顧費率設定（該館不收抽成）→ 不產生平台抽成／門市運營列
      // 另：有設定但當月抽成為 0（未達門檻或無營收）亦不推。
      const skipUnderThreshold = hasFee && managementFeeRounded === 0;
      const skipCommissionRows =
        !hasFee ||
        (revenueTwd === 0 && managementFeeRounded === 0) ||
        skipUnderThreshold;


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

      if (marketingRow) rows.push(marketingRow);

      const commonSkipInfo = {
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        has_commission_setting: hasFee,
        charges_marketing_fee: chargesMkt,
        revenue_twd: revenueTwd,
        gross_revenue_twd: grossRevenueTwd,
      };

      // 整館都沒有任何列（不收抽成也不收月費）→ 不列入預覽／推送
      if (rows.length === 0) {
        skipped.push({
          ...commonSkipInfo,
          scope: "venue",
          gate: !hasFee && !chargesMkt ? "B+C" : "B",
          skip_reason: !hasFee && !chargesMkt
            ? "no_commission_no_marketing"
            : skipUnderThreshold
              ? "under_threshold"
              : "no_revenue",
          detail: !hasFee && !chargesMkt
            ? "無管顧抽成設定，且合約未勾選行銷推廣費 → 整館無任何列"
            : skipUnderThreshold
              ? `當月營收 ${revenueTwd.toLocaleString()} 未達抽成門檻，抽成為 0`
              : "當月無可計營收",
        });
        continue;
      }

      // 該館有列送出，但「平台抽成／門市運營」被排除 → 列級差異報告
      if (skipCommissionRows) {
        skipped.push({
          ...commonSkipInfo,
          scope: "row",
          gate: "B",
          income_type: "平台抽成",
          skip_reason: !hasFee
            ? "no_commission_setting"
            : skipUnderThreshold
              ? "under_threshold"
              : "no_revenue",
          detail: !hasFee
            ? "查無管顧費率設定（該館不收抽成）"
            : skipUnderThreshold
              ? `當月營收 ${revenueTwd.toLocaleString()} 未達門檻 ${feeCfg?.threshold?.toLocaleString() ?? 0}`
              : "當月無可計營收",
        });
      }

      // 有抽成列但未勾選月費 → 列級差異報告
      if (!chargesMkt) {
        skipped.push({
          ...commonSkipInfo,
          scope: "row",
          gate: "C",
          income_type: "行銷推廣費",
          skip_reason: "marketing_fee_not_contracted",
          detail: "合約未勾選「收取行銷推廣費（月費）」",
        });
      }


      const posts = dry_run ? [] : await pushRows(rows, yyyyMm, mode);

      results.push({
        accommodation_id: acc.id,
        accommodation_name: acc.name,
        is_franchise: isFranchise,
        revenue_twd: revenueTwd,
        gross_revenue_twd: grossRevenueTwd,
        management_fee_twd: skipCommissionRows ? 0 : managementFeeRounded,
        marketing_fee_twd: marketingFee,
        charges_marketing_fee: chargesMkt,
        marketing_rule: mRule,
        fee_config: feeCfg,
        ...(skipCommissionRows
          ? {
              commission_rows_skipped: true,
              skip_reason: !hasFee
                ? "no_commission_setting"
                : skipUnderThreshold
                  ? "under_threshold"
                  : "no_revenue",
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
        skipped,

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
