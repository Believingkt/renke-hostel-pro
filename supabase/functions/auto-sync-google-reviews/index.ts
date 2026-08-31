// Edge Function: auto-sync-google-reviews
//
// PRODUCT CONTRACT (2026-08):
// - Places per-accommodation auto-sync settings were REMOVED from the product
//   (columns google_reviews_auto_sync_enabled / _interval_hours were dropped
//   on 2026-05-02). This function must therefore NOT read them.
// - Places scheduled batch is DISABLED: the eligible set is intentionally empty.
//   Manual Places sync via `fetch-google-reviews` is unchanged.
// - Google Business Profile scheduled routing is retained: only accommodations
//   with review_source = BUSINESS_PROFILE AND connection_status = CONNECTED are
//   synced, and only into the GBP candidate pool (never the frontend cache).
// - There is currently NO cron calling this function.
// - Trusted callers only (service role / internal scheduler).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Places scheduled auto-sync has been retired at product level.
export const PLACES_SCHEDULED_SYNC = "DISABLED" as const;

export function getGbpScheduledTargets(
  gbpRows: Array<{
    accommodation_id: string;
    review_source: string | null;
    connection_status: string | null;
  }> | null
): string[] {
  return (gbpRows || [])
    .filter(
      (g) =>
        g.review_source === "BUSINESS_PROFILE" &&
        g.connection_status === "CONNECTED"
    )
    .map((g) => g.accommodation_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Trusted callers only: service role bearer token (scheduler / internal).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== serviceKey) {
      return jsonResp({ error: "unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // --- Places scheduled path: DISABLED (no eligible set, no fallback) ---
    const placesScheduledSync = PLACES_SCHEDULED_SYNC;

    // --- Business Profile scheduled path ---
    const { data: gbpRows, error: gbpError } = await admin
      .from("accommodation_google_business_profile")
      .select("accommodation_id, review_source, connection_status")
      .eq("review_source", "BUSINESS_PROFILE");

    if (gbpError) {
      return jsonResp({ error: "query_failed", message: gbpError.message }, 500);
    }

    const gbpTargets = getGbpScheduledTargets(gbpRows);
    const skipped = (gbpRows || []).length - gbpTargets.length;

    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    for (const id of gbpTargets) {
      try {
        const r = await fetch(
          `${supabaseUrl}/functions/v1/fetch-google-business-profile-reviews`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ accommodationId: id, force: true }),
          }
        );
        const body = await r.json().catch(() => ({}));
        if (!r.ok || body?.error) {
          results.push({
            id,
            ok: false,
            message: body?.message || body?.error || `HTTP ${r.status}`,
          });
        } else {
          results.push({ id, ok: true });
        }
      } catch (e) {
        results.push({
          id,
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResp({
      placesScheduledSync,
      checked: gbpTargets.length,
      skipped,
      synced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (e) {
    return jsonResp(
      { error: "internal", message: e instanceof Error ? e.message : String(e) },
      500
    );
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
