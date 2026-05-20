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
    const { order_number, accommodation_id } = await req.json();

    if (!order_number || !accommodation_id) {
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

    const { data, error } = await admin
      .from("orders")
      .select(
        "id, guest_name, guest_phone, guest_email, final_price, paid_amount, payment_status, order_status, payment_link_created_at, deposit_method, deposit_status, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, payment_method, balance_payment_method",
      )
      .eq("order_number", order_number)
      .eq("accommodation_id", accommodation_id)
      .maybeSingle();

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
      .select("name")
      .eq("id", accommodation_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ order: data, accommodation_name: accData?.name ?? "" }),
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
