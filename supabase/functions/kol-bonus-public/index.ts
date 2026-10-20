import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { resolveCaller, hasGlobalTeamRole } from "../_shared/authz.ts";
import { commissionBaseFromOrder, extractAddonTotal } from "../_shared/addonTotal.ts";
import { buildCommissionExclusionResolver, type CommissionExclusionResolver } from "../_shared/commissionExclusionRule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INTERNAL_ROLES = ["admin", "scout_manager", "scout", "am", "am_manager"];

/** 唯一真相：單筆訂單的分潤基準金額
 *  1) order_meta.team_commission_price 有值 → 優先採用（人工覆蓋）
 *  2) 否則 commissionBaseFromOrder()：final_price − 加購項目總額
 *  註：本函式「不」套用 exempt_order_sources 排除，
 *      KOL 分潤只看訂單是否使用該 KOL 的折扣碼。
 */
function resolveCommissionBase(
  order: {
    final_price?: number | null;
    total_price?: number | null;
    custom_addon_details?: unknown;
    notes?: string | null;
    order_date?: string | null;
    accommodation_id?: string | null;
  },
  manualOverride: number | null | undefined,
  exclRule?: CommissionExclusionResolver,
) {
  const gross = Number(order.final_price ?? order.total_price ?? 0) || 0;
  const addonTotal = extractAddonTotal(order.custom_addon_details);
  if (manualOverride !== null && manualOverride !== undefined) {
    return { gross, addonTotal, base: Number(manualOverride) || 0, manual: true };
  }
  // final_price 缺值時退回 total_price，再扣加購
  const base = order.final_price === null || order.final_price === undefined
    ? Math.max(0, gross - addonTotal)
    : commissionBaseFromOrder(order as any, exclRule?.(order.accommodation_id, order.order_date) ?? null);
  return { gross, addonTotal, base, manual: false };
}

const ORDER_SELECT =
  "id, order_number, discount_code, check_in_date, check_out_date, order_date, total_price, final_price, order_status, accommodation_id, custom_addon_details, notes, currency_at_booking";

type EnrichedOrder = Record<string, unknown>;

function enrich(rows: any[], metaMap: Map<string, number | null>, exclRule?: CommissionExclusionResolver) {
  const orders: EnrichedOrder[] = [];
  let nonTwdCount = 0;
  let addonExcludedTotal = 0;
  for (const o of rows) {
    const currency = (o.currency_at_booking ?? "TWD") || "TWD";
    // 只計台幣訂單，非台幣訂單不計入分潤（僅回報筆數）
    if (String(currency).toUpperCase() !== "TWD") {
      nonTwdCount += 1;
      continue;
    }
    const { gross, addonTotal, base, manual } = resolveCommissionBase(o, metaMap.get(o.id), exclRule);
    if (!manual) addonExcludedTotal += addonTotal;
    orders.push({
      id: o.id,
      order_number: o.order_number,
      discount_code: o.discount_code,
      check_in_date: o.check_in_date,
      check_out_date: o.check_out_date,
      order_date: o.order_date,
      total_price: o.total_price,
      final_price: o.final_price,
      order_status: o.order_status,
      accommodation_id: o.accommodation_id,
      currency_at_booking: currency,
      gross_revenue: gross,
      addon_total: addonTotal,
      commission_base: base,
      is_manual_base: manual,
    });
  }
  return { orders, nonTwdCount, addonExcludedTotal };
}

async function fetchMetaMap(admin: any, ids: string[]) {
  const map = new Map<string, number | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const { data, error } = await admin
      .from("order_meta")
      .select("order_id, team_commission_price")
      .in("order_id", chunk);
    if (error) throw error;
    for (const m of data ?? []) {
      if (m.team_commission_price !== null && m.team_commission_price !== undefined) {
        map.set(m.order_id, Number(m.team_commission_price));
      }
    }
  }
  return map;
}

/** 以 service_role 取館別名稱（含停用館別，避免公開頁因 RLS 取不到名字而 fallback 成別館名稱） */
async function attachAccommodationNames(admin: any, orders: EnrichedOrder[]) {
  const ids = Array.from(
    new Set(orders.map((o) => o.accommodation_id).filter(Boolean)),
  ) as string[];
  if (ids.length === 0) return;
  const { data, error } = await admin
    .from("accommodation_info")
    .select("id, name")
    .in("id", ids);
  if (error) throw error;
  const nameMap = new Map<string, string>();
  for (const a of data ?? []) nameMap.set(a.id as string, (a.name as string) ?? "");
  for (const o of orders) {
    o.accommodation_name = nameMap.get(String(o.accommodation_id ?? "")) ?? null;
  }
}


Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const mode = body?.mode === "internal" ? "internal" : "public";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: commRes, error: commErr } = await admin
      .from("kol_commission_settings")
      .select("accommodation_id, effective_from, rate, created_at")
      .is("kol_id", null)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (commErr) throw commErr;
    const commissions = (commRes ?? []).map((c: any) => ({
      accommodation_id: c.accommodation_id,
      effective_from: c.effective_from,
      rate: c.rate,
    }));

    // ---------- 內部模式：登入後台人員，取回所有折扣碼訂單（同一套計算） ----------
    if (mode === "internal") {
      // 只限實際使用的全域團隊角色：KolBonus（super_admin、scout_manager、scout、am、am_manager）、/hq/kol-overview（admin）
      const authRes = await resolveCaller(req);
      if (!authRes.ok) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: authRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await hasGlobalTeamRole(authRes.ctx, INTERNAL_ROLES))) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: rows, error: ordErr } = await admin
        .from("orders")
        .select(ORDER_SELECT)
        .not("discount_code", "is", null)
        .neq("discount_code", "")
        .neq("order_status", "cancelled");
      if (ordErr) throw ordErr;

      const metaMap = await fetchMetaMap(admin, (rows ?? []).map((o: any) => o.id));
      const exclRule = await buildCommissionExclusionResolver(admin, (rows ?? []).map((o: any) => o.accommodation_id));
      const { orders, nonTwdCount, addonExcludedTotal } = enrich(rows ?? [], metaMap, exclRule);
      await attachAccommodationNames(admin, orders);


      return new Response(
        JSON.stringify({
          mode: "internal",
          orders,
          commissions,
          non_twd_orders_count: nonTwdCount,
          addon_excluded_total: addonExcludedTotal,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- 公開模式：以 public_token 查單一 KOL ----------
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "missing_token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: kolRow, error: kolErr } = await admin
      .from("kol_profiles")
      .select("id, name, cid_code, venue_id, venue_name, accommodation_id, public_token, token_expires_at, primary_profile_id, publish_url, ig_url")
      .eq("public_token", token)
      .maybeSingle();

    if (kolErr) throw kolErr;
    if (!kolRow) {
      return new Response(
        JSON.stringify({ error: "invalid" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!kolRow.token_expires_at || new Date(kolRow.token_expires_at).getTime() <= Date.now()) {
      return new Response(
        JSON.stringify({ error: "expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 同住合拍：附屬記錄一律導向主檔的資料，避免同一批訂單重複請款
    let kol: any = kolRow;
    let mergedIntoName: string | null = null;
    if (kolRow.primary_profile_id) {
      const { data: parent } = await admin
        .from("kol_profiles")
        .select("id, name, cid_code, venue_id, venue_name, accommodation_id, token_expires_at, publish_url, ig_url")
        .eq("id", kolRow.primary_profile_id)
        .maybeSingle();
      if (parent) {
        mergedIntoName = (parent.name as string | null) ?? null;
        kol = { ...parent, token_expires_at: kolRow.token_expires_at };
      }
    }

    // 優先用 venue_id 從 kol_venues 取得顯示名稱；fallback 用 venue_name 欄位
    // venue_accommodation_id：場域對應的 PMS 母館（房型級場域亦帶父館 id）；外部場域為 null
    let displayVenueName: string | null = null;
    let venueAccommodationId: string | null = null;
    if (kol.venue_id) {
      const { data: kv } = await admin
        .from("kol_venues")
        .select("name, accommodation_id")
        .eq("id", kol.venue_id)
        .maybeSingle();
      displayVenueName = (kv?.name as string | null) ?? null;
      venueAccommodationId = (kv?.accommodation_id as string | null) ?? null;
    }
    displayVenueName = displayVenueName ?? (kol.venue_name as string | null);

    const kolPayload = {
      id: kol.id,
      name: kol.name,
      cid_code: kol.cid_code,
      venue_id: kol.venue_id,
      venue_name: displayVenueName,
      venue_accommodation_id: venueAccommodationId,
      accommodation_id: kol.accommodation_id,
      token_expires_at: kol.token_expires_at,
      merged_into_primary: !!mergedIntoName,
      primary_name: mergedIntoName,
      publish_url: (kol.publish_url as string | null) ?? null,
      ig_url: (kol.ig_url as string | null) ?? null,
    };




    const code = (kol.cid_code ?? "").trim();
    if (!code) {
      return new Response(
        JSON.stringify({
          kol: kolPayload,
          orders: [],
          commissions,
          gross_revenue: 0,
          commission_base_total: 0,
          addon_excluded_total: 0,
          non_twd_orders_count: 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 重點：以 cid_code 跨「所有館別」撈訂單（不限 token 對應那筆 kol_profiles 的 accommodation_id）
    const codeUpper = code.toUpperCase();
    const { data: rawOrders, error: orderErr } = await admin
      .from("orders")
      .select(ORDER_SELECT)
      .neq("order_status", "cancelled")
      .not("discount_code", "is", null);
    if (orderErr) throw orderErr;

    // 在 server 端做精確（大小寫不敏感）折扣碼比對，避免 ilike 的 _/% 萬用字元誤匹配
    const filteredOrders = (rawOrders ?? []).filter(
      (o: any) => (o.discount_code ?? "").trim().toUpperCase() === codeUpper,
    );

    const metaMap = await fetchMetaMap(admin, filteredOrders.map((o: any) => o.id));
    const exclRule = await buildCommissionExclusionResolver(admin, filteredOrders.map((o: any) => o.accommodation_id));
    const { orders, nonTwdCount, addonExcludedTotal } = enrich(filteredOrders, metaMap, exclRule);
    await attachAccommodationNames(admin, orders);


    const grossRevenue = orders.reduce((s, o) => s + Number(o.gross_revenue ?? 0), 0);
    const commissionBaseTotal = orders.reduce((s, o) => s + Number(o.commission_base ?? 0), 0);

    return new Response(
      JSON.stringify({
        kol: kolPayload,
        orders,
        commissions,
        gross_revenue: grossRevenue,
        commission_base_total: commissionBaseTotal,
        addon_excluded_total: addonExcludedTotal,
        non_twd_orders_count: nonTwdCount,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("kol-bonus-public error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
