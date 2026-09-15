import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface RyanOrderPayload {
  order: {
    order_number: string;
    guest_name: string;
    order_date: string;
    check_in_date: string;
    check_out_date: string;
    final_price: number;
    order_source: string;
    order_status: string;
    payment_status: string;
    notes: string;
    discount_code: string | null;
    room_type_id: string | null;
    accommodation_id: string;
  };
  order_rooms: Array<{
    room_type_id: string;
    room_unit_id: string | null;
    quantity: number;
    room_price: number;
  }>;
  order_meta: {
    addon_amount: number;
    import_source: string;
    accommodation_id: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require logged-in user (any authenticated user can import — RLS not needed because we use service role inside).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as RyanOrderPayload[];
    if (!Array.isArray(payload)) {
      return new Response(JSON.stringify({ error: "Body must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let inserted = 0;
    let updated = 0;
    const errors: Array<{ order_number: string; message: string }> = [];

    for (const item of payload) {
      const orderNumber = item.order?.order_number ?? "(unknown)";
      try {
        const { data, error } = await admin.rpc("import_ryoan_order_bypass", {
          p_order: item.order,
          p_rooms: item.order_rooms ?? [],
          p_meta: item.order_meta ?? null,
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.out_was_update) updated++;
        else inserted++;
      } catch (err) {
        const e = err as Record<string, unknown> | null;
        const message =
          (e && typeof e === "object" && (
            (e.message as string) ||
            (e.details as string) ||
            (e.hint as string) ||
            (e.code as string)
          )) ||
          (err instanceof Error ? err.message : "") ||
          (() => { try { return JSON.stringify(err); } catch { return String(err); } })();
        console.error(`[import-ryoan-orders] ${orderNumber} failed:`, err);
        errors.push({ order_number: orderNumber, message: String(message) });
      }
    }

    return new Response(JSON.stringify({ inserted, updated, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
