// Edge Function: auto-sync-google-reviews
// 由 pg_cron 每小時呼叫一次,掃描所有開啟「自動同步」且距上次同步已超過設定間隔的住宿,
// 逐一觸發 fetch-google-reviews 進行更新。
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: rows, error } = await admin
      .from("accommodation_info")
      .select(
        "id, google_place_id, google_reviews_cached_at, google_reviews_auto_sync_interval_hours"
      )
      .eq("google_reviews_auto_sync_enabled", true)
      .not("google_place_id", "is", null);

    if (error) {
      return jsonResp({ error: "query_failed", message: error.message }, 500);
    }

    const now = Date.now();
    const eligible = (rows || []).filter((r) => {
      const interval =
        (r.google_reviews_auto_sync_interval_hours || 24) * 3600_000;
      if (!r.google_reviews_cached_at) return true;
      return now - new Date(r.google_reviews_cached_at).getTime() >= interval;
    });

    const results: Array<{ id: string; ok: boolean; message?: string }> = [];

    for (const row of eligible) {
      try {
        const r = await fetch(
          `${supabaseUrl}/functions/v1/fetch-google-reviews`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              apikey: serviceKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ accommodationId: row.id, force: true }),
          }
        );
        const body = await r.json().catch(() => ({}));
        if (!r.ok || body?.error) {
          results.push({
            id: row.id,
            ok: false,
            message: body?.message || body?.error || `HTTP ${r.status}`,
          });
        } else {
          results.push({ id: row.id, ok: true });
        }
      } catch (e) {
        results.push({
          id: row.id,
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResp({
      checked: rows?.length || 0,
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
