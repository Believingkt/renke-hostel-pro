// Sync Meta Ads insights into public.meta_ads
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCESS_TOKEN =
  Deno.env.get("META_ADS_ACCESS_TOKEN") ||
  "EAAQZCVF5SJi0BP1x1R91ZAIoOg6mfoRudBqavBNtzYxGzHZAnO6IHmwG1AZBZAakm94LjHzb8cxvFZBZCIEdoK09LjBYslr3zIGZCiH4MCB7j2P3pNfj2GGyjKhsd9oQJAqsu4NMNdmPCZBrdaHIDZCMhusTWbIYelRxD4DyWakJZCuxDK6TOvLVd6LLY843pLwrnxyZCQZDZD";
const AD_ACCOUNT_ID =
  Deno.env.get("META_ADS_AD_ACCOUNT_ID") || "act_1011860687624710";
const API_VERSION = "v24.0";

function twDateStr(daysAgo: number): string {
  // Today in Asia/Taipei (UTC+8)
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  now.setUTCDate(now.getUTCDate() - daysAgo);
  return now.toISOString().slice(0, 10);
}

function toDateOnly(s: string | undefined | null): string | null {
  if (!s) return null;
  // Meta returns ISO like "2024-05-23T14:00:00+0000" or "2024-05-23"
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_stop?: string;
  created_time?: string;
}

interface CampaignInfo {
  status?: string;
  start_time?: string;
  stop_time?: string;
}

async function fetchAllInsights(): Promise<InsightRow[]> {
  const since = twDateStr(7);
  const until = twDateStr(0);
  const params = new URLSearchParams({
    fields: "campaign_name,campaign_id,ad_id,ad_name,date_stop,created_time",
    time_range: JSON.stringify({ since, until }),
    level: "ad",
    limit: "100",
    access_token: ACCESS_TOKEN,
  });
  let url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${params.toString()}`;
  const out: InsightRow[] = [];
  let safety = 0;
  while (url && safety < 50) {
    safety++;
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) {
      throw new Error(`Insights API ${r.status}: ${JSON.stringify(j)}`);
    }
    if (Array.isArray(j.data)) out.push(...j.data);
    url = j.paging?.next || "";
  }
  return out;
}

const campaignCache = new Map<string, CampaignInfo>();
async function fetchCampaign(campaignId: string): Promise<CampaignInfo> {
  if (campaignCache.has(campaignId)) return campaignCache.get(campaignId)!;
  const params = new URLSearchParams({
    fields: "start_time,stop_time,status",
    access_token: ACCESS_TOKEN,
  });
  const r = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${campaignId}?${params.toString()}`,
  );
  const j = await r.json();
  if (!r.ok) {
    console.warn("[sync-meta-ads] campaign fetch failed", campaignId, j);
    const info: CampaignInfo = {};
    campaignCache.set(campaignId, info);
    return info;
  }
  const info: CampaignInfo = {
    status: j.status,
    start_time: j.start_time,
    stop_time: j.stop_time,
  };
  campaignCache.set(campaignId, info);
  return info;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const insights = await fetchAllInsights();
    console.log(`[sync-meta-ads] fetched ${insights.length} insight rows`);

    // De-duplicate by ad_id (insights may include the same ad on multiple days)
    const byAd = new Map<string, InsightRow>();
    for (const row of insights) {
      if (!row.ad_id) continue;
      const prev = byAd.get(row.ad_id);
      if (!prev || (row.date_stop || "") > (prev.date_stop || "")) {
        byAd.set(row.ad_id, row);
      }
    }

    const upserts: Record<string, unknown>[] = [];
    for (const row of byAd.values()) {
      let status: string | null = null;
      let start_date: string | null = null;
      let stop_date: string | null = null;
      if (row.campaign_id) {
        try {
          const c = await fetchCampaign(row.campaign_id);
          status = c.status ?? null;
          start_date = toDateOnly(c.start_time);
          stop_date = toDateOnly(c.stop_time);
        } catch (e) {
          console.warn("[sync-meta-ads] campaign error", row.campaign_id, e);
        }
      }
      upserts.push({
        ad_id: row.ad_id,
        ad_name: row.ad_name ?? null,
        campaign_id: row.campaign_id ?? null,
        campaign_name: row.campaign_name ?? null,
        status,
        start_date,
        stop_date,
        created_time: toDateOnly(row.created_time),
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    let written = 0;
    if (upserts.length > 0) {
      const { error, count } = await supabase
        .from("meta_ads")
        .upsert(upserts, { onConflict: "ad_id", count: "exact" });
      if (error) throw error;
      written = count ?? upserts.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        fetched: insights.length,
        unique_ads: upserts.length,
        written,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-meta-ads] error", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
