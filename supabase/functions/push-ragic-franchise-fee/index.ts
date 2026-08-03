// Push franchise membership fees (特許會員費) to Ragic (income-source form)
// Body: { year?: number, month?: number (1-12), dry_run?: boolean, mode?: "insert" | "upsert" }
// 預設：上個月（Asia/Taipei）、dry_run = true
//
// 認列基準：payment_at（實際收款日期）
// 金額：內部單 franchise_orders = plan_price × quantity；外部單 franchise_external_orders = total_amount
// 僅推「會員費總額」，不編入任何分潤／獎金支出
// 事業單位：依 project_name 查 franchise_ragic_unit_mapping；查無對應時列入 warnings，不中斷執行

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { RAGIC_FIELD as FIELD, pushRows } from "../_shared/ragic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const INCOME_TYPE = "特許會員費";

/** 取 Asia/Taipei 當下的 { year, month } */
function taipeiNow(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dry_run = body?.dry_run !== false;
    const mode: "insert" | "upsert" = body?.mode === "insert" ? "insert" : "upsert";

    let year = Number(body?.year);
    let month = Number(body?.month);
    if (!year || !month || month < 1 || month > 12) {
      const now = taipeiNow();
      const p = prevMonth(now.year, now.month);
      year = p.year;
      month = p.month;
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const yyyyMm = `${year}/${String(month).padStart(2, "0")}`;
    const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    // 1. 對照表
    const { data: mapRows, error: mapErr } = await supabase
      .from("franchise_ragic_unit_mapping")
      .select("project_name, ragic_unit_name");
    if (mapErr) throw mapErr;
    const unitMap = new Map<string, string>();
    for (const r of mapRows ?? []) unitMap.set(String(r.project_name), String(r.ragic_unit_name));

    // 2. 內部單（project_name 以 plan_name 為準）
    const { data: internal, error: intErr } = await supabase
      .from("franchise_orders")
      .select("id, plan_name, plan_price, quantity, payment_at, customer_name")
      .gte("payment_at", startStr)
      .lt("payment_at", endDate);
    if (intErr) throw intErr;

    // 3. 外部單
    const { data: external, error: extErr } = await supabase
      .from("franchise_external_orders")
      .select("id, project_name, total_amount, payment_at, customer_name")
      .gte("payment_at", startStr)
      .lt("payment_at", endDate);
    if (extErr) throw extErr;

    interface Agg {
      project_name: string;
      amount: number;
      internal_count: number;
      external_count: number;
      internal_amount: number;
      external_amount: number;
    }
    const byProject = new Map<string, Agg>();
    const ensure = (name: string): Agg => {
      const key = name || "(未填寫專案)";
      let agg = byProject.get(key);
      if (!agg) {
        agg = {
          project_name: key,
          amount: 0,
          internal_count: 0,
          external_count: 0,
          internal_amount: 0,
          external_amount: 0,
        };
        byProject.set(key, agg);
      }
      return agg;
    };

    for (const o of internal ?? []) {
      const amt = (Number(o.plan_price) || 0) * (Number(o.quantity) || 0);
      const agg = ensure(String(o.plan_name ?? "").trim());
      agg.amount += amt;
      agg.internal_amount += amt;
      agg.internal_count += 1;
    }
    for (const o of external ?? []) {
      const amt = Number(o.total_amount) || 0;
      const agg = ensure(String(o.project_name ?? "").trim());
      agg.amount += amt;
      agg.external_amount += amt;
      agg.external_count += 1;
    }

    const rows: Record<string, string>[] = [];
    const results: any[] = [];
    const warnings: any[] = [];

    for (const agg of byProject.values()) {
      const unit = unitMap.get(agg.project_name) ?? null;
      if (!unit) {
        // 防呆：查無對應不靜默跳過、不中斷，明確列出提醒
        warnings.push({
          project_name: agg.project_name,
          reason: "查無 Ragic 事業單位對應，請先在 Ragic 建立事業單位，再回 PMS /team/franchise「Ragic 事業單位對照」新增登記",
          order_count: agg.internal_count + agg.external_count,
          internal_count: agg.internal_count,
          external_count: agg.external_count,
          amount: Math.round(agg.amount),
        });
        results.push({
          project_name: agg.project_name,
          ragic_unit_name: null,
          amount: Math.round(agg.amount),
          skipped: true,
          reason: "unmapped_project_name",
        });
        continue;
      }

      const amount = Math.round(agg.amount);
      const row: Record<string, string> = {
        [FIELD.DATA_SOURCE]: "PMS",
        [FIELD.YEAR_MONTH]: yyyyMm,
        [FIELD.BUSINESS_UNIT]: unit,
        [FIELD.INCOME_TYPE]: INCOME_TYPE,
        [FIELD.AMOUNT]: String(amount),
        [FIELD.VENUE]: unit,
        [FIELD.COMMISSION_RATE]: "",
        [FIELD.COMMISSION_FEE]: "",
        [FIELD.NOTE]: "",
      };
      rows.push(row);
      results.push({
        project_name: agg.project_name,
        ragic_unit_name: unit,
        amount,
        internal_count: agg.internal_count,
        internal_amount: Math.round(agg.internal_amount),
        external_count: agg.external_count,
        external_amount: Math.round(agg.external_amount),
        payload: row,
      });
    }

    const posts = dry_run ? [] : await pushRows(rows, yyyyMm, mode);

    return new Response(
      JSON.stringify({
        year_month: yyyyMm,
        dry_run,
        basis: "payment_at",
        count: results.length,
        total_amount: results.reduce((s, r) => s + (r.skipped ? 0 : r.amount), 0),
        results,
        warnings,
        ...(dry_run ? {} : { ragic_responses: posts }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[push-ragic-franchise-fee]", e);
    return new Response(
      JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
