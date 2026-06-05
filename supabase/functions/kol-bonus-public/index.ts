import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(
        JSON.stringify({ error: "missing_token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: kol, error: kolErr } = await admin
      .from("kol_profiles")
      .select("id, name, cid_code, venue_name, accommodation_id, public_token, token_expires_at")
      .eq("public_token", token)
      .maybeSingle();

    if (kolErr) throw kolErr;
    if (!kol) {
      return new Response(
        JSON.stringify({ error: "invalid" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!kol.token_expires_at || new Date(kol.token_expires_at).getTime() <= Date.now()) {
      return new Response(
        JSON.stringify({ error: "expired" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const code = (kol.cid_code ?? "").trim();
    if (!code) {
      return new Response(
        JSON.stringify({ kol, orders: [], commissions: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 重點：以 cid_code 跨「所有館別」撈訂單（不限 token 對應那筆 kol_profiles 的 accommodation_id）
    // 同一個折扣碼可能掛在多家民宿；分潤% 由前端依各筆訂單的 accommodation_id 對應 commissions 計算
    const codeUpper = code.toUpperCase();
    const [orderRes, commRes] = await Promise.all([
      admin
        .from("orders")
        .select(
          "id, order_number, discount_code, check_in_date, check_out_date, order_date, total_price, final_price, order_status, accommodation_id",
        )
        .neq("order_status", "cancelled")
        .not("discount_code", "is", null),
      admin
        .from("kol_commission_settings")
        .select("accommodation_id, effective_from, rate, created_at")
        .is("kol_id", null)
        .order("effective_from", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (orderRes.error) throw orderRes.error;
    if (commRes.error) throw commRes.error;

    // 在 server 端做精確（大小寫不敏感）折扣碼比對，避免 ilike 的 _/% 萬用字元誤匹配
    const filteredOrders = (orderRes.data ?? []).filter(
      (o: any) => (o.discount_code ?? "").trim().toUpperCase() === codeUpper,
    );

    return new Response(
      JSON.stringify({
        kol: {
          id: kol.id,
          name: kol.name,
          cid_code: kol.cid_code,
          venue_name: kol.venue_name,
          accommodation_id: kol.accommodation_id,
          token_expires_at: kol.token_expires_at,
        },
        orders: filteredOrders,
        commissions: (commRes.data ?? []).map((c: any) => ({
          accommodation_id: c.accommodation_id,
          effective_from: c.effective_from,
          rate: c.rate,
        })),
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
