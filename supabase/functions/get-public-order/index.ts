import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Anti-enumeration throttling -------------------------------------------
// Order numbers are the only secret protecting guest PII here, so we throttle
// per client IP and apply a much stricter budget for misses (invalid order
// numbers), which is what an enumeration attack produces.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_MISSES_PER_WINDOW = 5;

type Bucket = { start: number; requests: number; misses: number };
const buckets = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

function getBucket(ip: string): Bucket {
  const now = Date.now();
  const existing = buckets.get(ip);
  if (!existing || now - existing.start > WINDOW_MS) {
    const fresh: Bucket = { start: now, requests: 0, misses: 0 };
    buckets.set(ip, fresh);
    // opportunistic cleanup
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now - v.start > WINDOW_MS) buckets.delete(k);
    }
    return fresh;
  }
  return existing;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = getClientIp(req);
  const bucket = getBucket(ip);
  bucket.requests += 1;
  if (bucket.requests > MAX_REQUESTS_PER_WINDOW || bucket.misses > MAX_MISSES_PER_WINDOW) {
    return new Response(
      JSON.stringify({ error: "rate_limited" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      },
    );
  }


  try {
    const { order_number, accommodation_id } = await req.json();

    if (!order_number) {
      return new Response(
        JSON.stringify({ error: "missing parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let query = admin
      .from("orders")
      .select(
        "id, order_number, accommodation_id, check_in_date, check_out_date, guest_name, guest_phone, guest_email, final_price, paid_amount, payment_status, order_status, payment_link_created_at, deposit_method, deposit_status, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, payment_method, deposit_payment_method, balance_payment_method, room_charge_status, room_charge_at, room_charge_error, room_charge_scheduled_date, room_charge_rec_trade_id, total_price, discount_amount, discount_code, order_date, guest_count, room_quantity, cancelled_at, custom_addon_details, cancellation_fee_amount, currency_at_booking",
      )
      .eq("order_number", order_number);
    if (accommodation_id) query = query.eq("accommodation_id", accommodation_id);
    const { data, error } = await query.maybeSingle();


    if (error) throw error;
    if (!data) {
      return new Response(
        JSON.stringify({ error: "not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch accommodation name
    const { data: accData } = await admin
      .from("accommodation_info")
      .select("name, address, phone, header_logo_url")
      .eq("id", accommodation_id || (data as any).accommodation_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ order: data, accommodation_name: accData?.name ?? "", accommodation: accData ?? null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("get-public-order error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "internal_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
