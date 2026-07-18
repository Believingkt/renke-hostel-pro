// Cleans up stale auto-created OwlTing pending orders that never got a PII fillup
// within 72 hours. Cancels the order (releases inventory) and marks the linked
// staging row as expired. Meant to be invoked by pg_cron on an hourly schedule.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const STALE_HOURS = 72;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString();

  // Find still-pending auto-created orders older than cutoff.
  const { data: staleOrders, error: findErr } = await supabase
    .from("orders")
    .select("id, order_number, created_at, auto_created_from_email_id")
    .eq("is_pii_pending", true)
    .neq("order_status", "cancelled")
    .lt("created_at", cutoff)
    .limit(200);

  if (findErr) {
    return new Response(JSON.stringify({ error: findErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ order_id: string; ok: boolean; message?: string }> = [];

  for (const o of staleOrders ?? []) {
    try {
      const { error: uErr } = await supabase
        .from("orders")
        .update({
          order_status: "cancelled",
          is_pii_pending: false,
          notes: "🔒 系統自動取消：72 小時內未完成補單，釋放庫存",
        })
        .eq("id", o.id);
      if (uErr) throw uErr;

      // Mark related staging row expired.
      await supabase
        .from("owlting_email_parsed_staging")
        .update({ pii_status: "expired" })
        .eq("auto_order_id", o.id)
        .eq("pii_status", "pending_pii_fillup");

      results.push({ order_id: o.id, ok: true });
    } catch (e) {
      results.push({ order_id: o.id, ok: false, message: (e as Error).message });
    }
  }

  return new Response(
    JSON.stringify({
      checked_at: new Date().toISOString(),
      cutoff,
      candidates: staleOrders?.length ?? 0,
      cancelled: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
