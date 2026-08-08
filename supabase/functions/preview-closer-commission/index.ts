// 成交組分潤「本月預估」即時試算（只計算、不寫入任何表）
//
// 與 create-commission-snapshots 使用完全相同的公式：
//   base = order_meta.team_commission_price（人工指定時）
//        ?? commissionBaseFromOrder(final_price − 加購)
//   排除：cancelled / order_meta.is_excluded / 非台幣 / isExempt(owner_direct、exempt_order_sources)
//   費率：accommodation_commission_settings 取 effective_from <= order_date 的最新一筆
//
// 分月基準統一為 orders.order_date（Asia/Taipei 月界），與正式快照一致。
//
// 權限：呼叫者需帶使用者 JWT。
//   scope=self → 只回傳呼叫者自己的預估
//   scope=team → 需 super_admin / hotel_admin / closer 角色
// 查詢一律使用 service role client（繞過 RLS），但輸出範圍由上述權限決定。

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { resolveCaller } from "../_shared/authz.ts";
import { buildExemptResolver } from "../_shared/ownerPricingRule.ts";
import { commissionBaseFromOrder } from "../_shared/addonTotal.ts";
import { buildThresholdFactorResolver } from "../_shared/commissionThreshold.ts";
import { buildPartnershipResolver } from "../_shared/partnershipGate.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 台北 (y, m, d) 00:00 對應的 UTC ISO
function taipeiMidnightUtcISO(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, -8, 0, 0)).toISOString();
}

interface RateRow {
  accommodation_id: string;
  effective_from: string;
  closer_rate: number | null;
  video_rate: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) return json({ success: false, error: authRes.error }, authRes.status);
    const ctx = authRes.ctx;
    const supabase = ctx.admin;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const year = Number(body?.year);
    const month = Number(body?.month);
    const scope = body?.scope === "team" ? "team" : "self";
    const accommodationId = typeof body?.accommodation_id === "string" && body.accommodation_id !== "ALL"
      ? body.accommodation_id
      : null;

    // 可選：直接指定 UTC 區間（供自訂期間查詢），未指定時以 year/month 的台北月界為準
    const startIsoOverride = typeof body?.start_iso === "string" ? body.start_iso : null;
    const endIsoOverride = typeof body?.end_iso === "string" ? body.end_iso : null;
    const hasRange = !!(startIsoOverride && endIsoOverride);

    if (!hasRange && (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)) {
      return json({ success: false, error: "year / month 參數不正確" }, 400);
    }

    const roles = ctx.globalRoles ?? [];
    const isPrivileged = ctx.isServiceRole ||
      roles.some((r) => ["super_admin", "hotel_admin", "closer", "closer_manager"].includes(r));
    if (scope === "team" && !isPrivileged) {
      return json({ success: false, error: "Forbidden" }, 403);
    }
    if (scope === "self" && !ctx.userId && !ctx.isServiceRole) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    // 管理員檢視模式：可指定 target_user_id 代看其他成員的 self 預估
    const targetUserId = typeof body?.target_user_id === "string" && body.target_user_id
      ? body.target_user_id
      : null;
    const isAdminViewer = ctx.isServiceRole ||
      roles.includes("super_admin") || roles.includes("admin");
    if (targetUserId && targetUserId !== ctx.userId && !isAdminViewer) {
      return json({ success: false, error: "Forbidden" }, 403);
    }


    const startUtc = hasRange ? startIsoOverride! : taipeiMidnightUtcISO(year, month, 1);
    const endUtc = hasRange ? endIsoOverride! : taipeiMidnightUtcISO(year, month + 1, 1);

    const ORDER_COLS =
      "id, accommodation_id, final_price, custom_addon_details, check_in_date, order_date, order_status, guest_name, currency_at_booking, owner_direct, order_source";

    // 1) 該月 order_date 落在區間內、未取消／非保留、金額 > 0 的訂單
    let ordersQuery = supabase
      .from("orders")
      .select(ORDER_COLS)
      .neq("order_status", "cancelled")
      .neq("order_status", "hold")
      .gt("final_price", 0)
      .gte("order_date", startUtc)
      .lt("order_date", endUtc);
    if (accommodationId) ordersQuery = ordersQuery.eq("accommodation_id", accommodationId);

    const { data: orders, error: ordersErr } = await ordersQuery;
    if (ordersErr) throw ordersErr;

    const orderList = (orders ?? []) as any[];

    // 1b) 額外指定的訂單（例如已取消訂單），套用完全相同的 gate 與費率口徑
    const extraIds: string[] = Array.isArray(body?.extra_order_ids)
      ? (body.extra_order_ids as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const extraList: any[] = [];
    if (extraIds.length > 0) {
      const known = new Set(orderList.map((o) => o.id as string));
      const wanted = Array.from(new Set(extraIds)).filter((id) => !known.has(id));
      for (let i = 0; i < wanted.length; i += 300) {
        const chunk = wanted.slice(i, i + 300);
        const { data: extras, error: extraErr } = await supabase
          .from("orders")
          .select(ORDER_COLS)
          .in("id", chunk);
        if (extraErr) throw extraErr;
        for (const e of extras ?? []) extraList.push(e);
      }
    }

    const allOrders = [...orderList, ...extraList];
    if (allOrders.length === 0) {
      return json({
        success: true,
        scope,
        year,
        month,
        self: { closer_commission: 0, video_commission: 0 },
        team: { closer_commission: 0, video_commission: 0 },
        orders: [],
        extra_orders: [],
      });
    }

    const orderIds = allOrders.map((o) => o.id as string);


    // 2) order_meta（分批避免 URL 過長）
    const metaMap = new Map<string, any>();
    for (let i = 0; i < orderIds.length; i += 500) {
      const chunk = orderIds.slice(i, i + 500);
      const { data: metas, error: metaErr } = await supabase
        .from("order_meta")
        .select("order_id, closer_id, video_creator_id, team_commission_price, is_excluded")
        .in("order_id", chunk);
      if (metaErr) throw metaErr;
      for (const m of metas ?? []) metaMap.set(m.order_id as string, m);
    }

    // 3) 費率
    const accIds = Array.from(new Set(orderList.map((o) => o.accommodation_id).filter(Boolean))) as string[];
    const { data: rateRows, error: rateErr } = await supabase
      .from("accommodation_commission_settings")
      .select("accommodation_id, effective_from, closer_rate, video_rate")
      .in("accommodation_id", accIds)
      .order("effective_from", { ascending: false });
    if (rateErr) throw rateErr;
    const rates = (rateRows ?? []) as RateRow[];

    function rateFor(accId: string, orderDateIso: string, key: "closer_rate" | "video_rate"): number {
      const day = String(orderDateIso ?? "").slice(0, 10);
      const hit = rates.find(
        (r) => r.accommodation_id === accId && String(r.effective_from).slice(0, 10) <= day,
      );
      return Number(hit?.[key] ?? 0) || 0;
    }

    // 4) 免抽成判斷（與正式快照相同）
    const isExempt = await buildExemptResolver(supabase, accIds);

    const selfId = targetUserId ?? ctx.userId;
    let selfCloser = 0;
    let selfVideo = 0;
    let teamCloser = 0;
    let teamVideo = 0;
    const detail: any[] = [];

    for (const o of orderList) {
      const meta = metaMap.get(o.id as string);
      if (!meta) continue;
      if (meta.is_excluded === true) continue;
      const cur = o.currency_at_booking as string | null;
      if (cur && cur !== "TWD") continue;
      if (isExempt(o)) continue;

      const tcp = meta.team_commission_price;
      const finalPrice = Number(o.final_price ?? 0);
      const base = tcp == null || Number(tcp) === finalPrice
        ? commissionBaseFromOrder(o)
        : Number(tcp);

      const closerRate = meta.closer_id ? rateFor(o.accommodation_id, o.order_date, "closer_rate") : 0;
      const videoRate = meta.video_creator_id ? rateFor(o.accommodation_id, o.order_date, "video_rate") : 0;
      const closerAmt = meta.closer_id ? base * closerRate : 0;
      const videoAmt = meta.video_creator_id ? base * videoRate : 0;

      teamCloser += closerAmt;
      teamVideo += videoAmt;
      if (selfId && meta.closer_id === selfId) selfCloser += closerAmt;
      if (selfId && meta.video_creator_id === selfId) selfVideo += videoAmt;

      detail.push({
        order_id: o.id,
        accommodation_id: o.accommodation_id,
        closer_id: meta.closer_id ?? null,
        video_creator_id: meta.video_creator_id ?? null,
        base,
        closer_rate: closerRate,
        video_rate: videoRate,
        closer_commission: closerAmt,
        video_commission: videoAmt,
      });
    }

    return json({
      success: true,
      scope,
      year,
      month,
      self: { closer_commission: selfCloser, video_commission: selfVideo },
      team: scope === "team"
        ? { closer_commission: teamCloser, video_commission: teamVideo }
        : { closer_commission: 0, video_commission: 0 },
      orders: scope === "team" ? detail : detail.filter((d) => d.closer_id === selfId || d.video_creator_id === selfId),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: msg }, 500);
  }
});
