import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";
import { commissionBaseFromOrder, extractAddonTotal } from "../_shared/addonTotal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORDER_SELECT =
  "id, order_number, discount_code, check_in_date, check_out_date, order_date, total_price, final_price, order_status, accommodation_id, custom_addon_details, currency_at_booking";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 分潤基準金額：order_meta.team_commission_price 覆蓋值優先，否則 final_price − 加購 */
function resolveBase(order: any, manual: number | null | undefined) {
  const gross = Number(order.final_price ?? order.total_price ?? 0) || 0;
  const addon = extractAddonTotal(order.custom_addon_details);
  if (manual !== null && manual !== undefined) return { gross, addon, base: Number(manual) || 0 };
  const base =
    order.final_price === null || order.final_price === undefined
      ? Math.max(0, gross - addon)
      : commissionBaseFromOrder(order);
  return { gross, addon, base };
}

async function fetchMetaMap(admin: any, ids: string[]) {
  const map = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin
      .from("order_meta")
      .select("order_id, team_commission_price")
      .in("order_id", ids.slice(i, i + 500));
    for (const m of data ?? []) {
      if (m.team_commission_price !== null && m.team_commission_price !== undefined) {
        map.set(m.order_id, Number(m.team_commission_price));
      }
    }
  }
  return map;
}

type RateList = Array<{ accommodation_id: string; effective_from: string; rate: number }>;

function makeRateResolver(list: RateList) {
  const byAcc = new Map<string, RateList>();
  for (const c of list) {
    const arr = byAcc.get(c.accommodation_id) ?? [];
    arr.push(c);
    byAcc.set(c.accommodation_id, arr);
  }
  return (accId: string | null, refDate?: string | null) => {
    if (!accId) return 0;
    const arr = byAcc.get(accId);
    if (!arr || arr.length === 0) return 0;
    if (!refDate) return Number(arr[0].rate ?? 0);
    const ref = refDate.slice(0, 10);
    const hit = arr.find((s) => s.effective_from <= ref);
    return Number(hit?.rate ?? 0);
  };
}

/** 依折扣碼取回該 KOL 所有訂單的彙總（與 kol-bonus-public 同一套口徑） */
async function summarizeByCode(admin: any, cidCode: string | null, getRate: (a: string | null, d?: string | null) => number) {
  const code = (cidCode ?? "").trim().toUpperCase();
  const empty = {
    orders: [] as any[],
    order_count: 0,
    gross_revenue: 0,
    commission_base_total: 0,
    commission_total: 0,
    settled_commission: 0,
    pending_commission: 0,
  };
  if (!code) return empty;

  const { data: raw, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .neq("order_status", "cancelled")
    .not("discount_code", "is", null);
  if (error) throw error;

  const rows = (raw ?? []).filter(
    (o: any) =>
      (o.discount_code ?? "").trim().toUpperCase() === code &&
      String(o.currency_at_booking ?? "TWD").toUpperCase() === "TWD",
  );
  const metaMap = await fetchMetaMap(admin, rows.map((o: any) => o.id));

  const today = new Date().toISOString().slice(0, 10);
  const orders: any[] = [];
  let gross = 0;
  let baseTotal = 0;
  let commissionTotal = 0;
  let settled = 0;

  for (const o of rows) {
    const { gross: g, addon, base } = resolveBase(o, metaMap.get(o.id));
    const rate = getRate(o.accommodation_id, o.check_out_date);
    const commission = Math.round(base * (rate / 100));
    const isSettleable = !!o.check_out_date && o.check_out_date.slice(0, 10) < today;
    gross += g;
    baseTotal += base;
    commissionTotal += commission;
    if (isSettleable) settled += commission;
    orders.push({
      id: o.id,
      order_number: o.order_number,
      discount_code: o.discount_code,
      order_date: o.order_date,
      check_in_date: o.check_in_date,
      check_out_date: o.check_out_date,
      order_status: o.order_status,
      accommodation_id: o.accommodation_id,
      gross_revenue: g,
      addon_total: addon,
      commission_base: base,
      commission_rate: rate,
      commission_amount: commission,
      is_settleable: isSettleable,
    });
  }
  orders.sort((a, b) => String(b.order_date ?? "").localeCompare(String(a.order_date ?? "")));

  return {
    orders,
    order_count: orders.length,
    gross_revenue: gross,
    commission_base_total: baseTotal,
    commission_total: commissionTotal,
    settled_commission: settled,
    pending_commission: Math.max(0, commissionTotal - settled),
  };
}

function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const action = body?.action === "create_invite" ? "create_invite" : "summary";
    if (!token) return json({ error: "missing_token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: kol, error: kolErr } = await admin
      .from("kol_profiles")
      .select("id, name, cid_code, ig_handle, venue_id, venue_name, accommodation_id, public_token, token_expires_at")
      .eq("public_token", token)
      .maybeSingle();
    if (kolErr) throw kolErr;
    if (!kol) return json({ error: "invalid" }, 404);
    if (!kol.token_expires_at || new Date(kol.token_expires_at).getTime() <= Date.now()) {
      return json({ error: "expired" }, 403);
    }

    // ---- 產生邀請碼 ----
    if (action === "create_invite") {
      const { data: setting } = await admin
        .from("system_settings")
        .select("value")
        .eq("key", "kol_referral_default_override_rate")
        .maybeSingle();
      const defaultRate = Number((setting as any)?.value ?? 0) || 0;

      let inserted: any = null;
      for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
        const code = randomCode();
        const { data, error } = await admin
          .from("kol_referrals")
          .insert({ inviter_kol_id: kol.id, invite_code: code, override_rate: defaultRate })
          .select("id, invite_code, status, override_rate, created_at")
          .maybeSingle();
        if (!error) inserted = data;
        else if (!String(error.message).includes("duplicate")) throw error;
      }
      if (!inserted) return json({ error: "code_generation_failed" }, 500);
      return json({ referral: inserted });
    }

    // ---- 儀表板彙總 ----
    const { data: rateRows, error: rateErr } = await admin
      .from("kol_commission_settings")
      .select("accommodation_id, effective_from, rate, created_at")
      .is("kol_id", null)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false });
    if (rateErr) throw rateErr;
    const getRate = makeRateResolver((rateRows ?? []) as RateList);

    const self = await summarizeByCode(admin, kol.cid_code, getRate);

    // 折扣碼清單（使用次數等來自既有 discount_codes）
    const codeUpper = (kol.cid_code ?? "").trim().toUpperCase();
    let codes: any[] = [];
    if (codeUpper) {
      const { data: codeRows } = await admin
        .from("discount_codes")
        .select(
          "id, code, name, accommodation_id, discount_type, discount_value, is_active, used_count, usage_limit, valid_from, valid_until, commission_rate",
        );
      codes = (codeRows ?? []).filter((c: any) => (c.code ?? "").trim().toUpperCase() === codeUpper);
    }

    // 館別名稱
    const accIds = Array.from(
      new Set([...self.orders.map((o: any) => o.accommodation_id), ...codes.map((c) => c.accommodation_id)].filter(Boolean)),
    );
    const accNames: Record<string, string> = {};
    if (accIds.length > 0) {
      const { data: accs } = await admin.from("accommodation_info").select("id, name").in("id", accIds);
      for (const a of accs ?? []) accNames[a.id] = a.name;
    }

    // 我的邀請
    const { data: refRows, error: refErr } = await admin
      .from("kol_referrals")
      .select("id, invite_code, status, override_rate, is_active, invitee_kol_id, invitee_name, invitee_ig, joined_at, created_at")
      .eq("inviter_kol_id", kol.id)
      .order("created_at", { ascending: false });
    if (refErr) throw refErr;

    const inviteeIds = (refRows ?? []).map((r: any) => r.invitee_kol_id).filter(Boolean);
    const inviteeMap = new Map<string, any>();
    if (inviteeIds.length > 0) {
      const { data: invitees } = await admin
        .from("kol_profiles")
        .select("id, name, cid_code")
        .in("id", inviteeIds);
      for (const p of invitees ?? []) inviteeMap.set(p.id, p);
    }

    const referrals: any[] = [];
    let overrideTotal = 0;
    for (const r of refRows ?? []) {
      const invitee = r.invitee_kol_id ? inviteeMap.get(r.invitee_kol_id) : null;
      let downlineCommission = 0;
      if (invitee?.cid_code && r.is_active) {
        const s = await summarizeByCode(admin, invitee.cid_code, getRate);
        downlineCommission = s.commission_total;
      }
      const overrideAmount = Math.round(downlineCommission * (Number(r.override_rate) || 0) / 100);
      overrideTotal += overrideAmount;
      referrals.push({
        ...r,
        invitee_display_name: invitee?.name ?? r.invitee_name ?? null,
        invitee_cid_code: invitee?.cid_code ?? null,
        downline_commission: downlineCommission,
        override_amount: overrideAmount,
      });
    }

    return json({
      kol: {
        id: kol.id,
        name: kol.name,
        cid_code: kol.cid_code,
        ig_handle: kol.ig_handle,
        venue_name: kol.venue_name,
        token_expires_at: kol.token_expires_at,
      },
      codes,
      accommodation_names: accNames,
      summary: {
        order_count: self.order_count,
        gross_revenue: self.gross_revenue,
        commission_base_total: self.commission_base_total,
        commission_total: self.commission_total,
        settled_commission: self.settled_commission,
        pending_commission: self.pending_commission,
        override_total: overrideTotal,
      },
      orders: self.orders,
      referrals,
    });
  } catch (err: any) {
    console.error("kol-dashboard error:", err);
    return json({ error: err?.message ?? "internal_error" }, 500);
  }
});
