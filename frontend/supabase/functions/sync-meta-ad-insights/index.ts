// Sync Meta Ads daily ad-level insights into public.meta_ad_insights_daily
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ACCESS_TOKEN = Deno.env.get("META_ADS_ACCESS_TOKEN") ?? "";
const AD_ACCOUNT_ID = Deno.env.get("META_ADS_AD_ACCOUNT_ID") ?? "act_1011860687624710";
const API_VERSION = "v24.0";

function twDateStr(daysAgo: number): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  now.setUTCDate(now.getUTCDate() - daysAgo);
  return now.toISOString().slice(0, 10);
}

interface ActionRow { action_type?: string; value?: string }
interface InsightRow {
  date_start?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpc?: string;
  account_currency?: string;
  actions?: ActionRow[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!ACCESS_TOKEN) throw new Error("META_ADS_ACCESS_TOKEN is not configured");

    let days = 30;
    try {
      const body = await req.json();
      if (body?.days) days = Math.min(Math.max(Number(body.days) || 30, 1), 180);
    } catch { /* no body */ }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const params = new URLSearchParams({
      fields:
        "date_start,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,inline_link_clicks,ctr,cpc,account_currency,actions",
      time_range: JSON.stringify({ since: twDateStr(days), until: twDateStr(0) }),
      time_increment: "1",
      level: "ad",
      limit: "200",
      access_token: ACCESS_TOKEN,
    });

    let url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${params.toString()}`;
    const rows: InsightRow[] = [];
    let guard = 0;
    while (url && guard < 100) {
      guard++;
      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok) throw new Error(`Insights API ${r.status}: ${JSON.stringify(j)}`);
      if (Array.isArray(j.data)) rows.push(...j.data);
      url = j.paging?.next || "";
    }

    const upserts = rows
      .filter((r) => r.ad_id && r.date_start)
      .map((r) => {
        const msg = (r.actions ?? []).find((a) =>
          a.action_type === "onsite_conversion.messaging_conversation_started_7d"
        );
        return {
          stat_date: r.date_start,
          ad_id: r.ad_id,
          ad_name: r.ad_name ?? null,
          adset_id: r.adset_id ?? null,
          adset_name: r.adset_name ?? null,
          campaign_id: r.campaign_id ?? null,
          campaign_name: r.campaign_name ?? null,
          spend: num(r.spend),
          impressions: num(r.impressions),
          reach: num(r.reach),
          clicks: num(r.clicks),
          link_clicks: num(r.inline_link_clicks),
          ctr: num(r.ctr),
          cpc: num(r.cpc),
          messaging_started: num(msg?.value),
          currency: r.account_currency ?? null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

    let written = 0;
    for (let i = 0; i < upserts.length; i += 500) {
      const chunk = upserts.slice(i, i + 500);
      const { error } = await supabase
        .from("meta_ad_insights_daily")
        .upsert(chunk, { onConflict: "stat_date,ad_id" });
      if (error) throw error;
      written += chunk.length;
    }

    return new Response(
      JSON.stringify({ success: true, fetched: rows.length, written, days }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sync-meta-ad-insights] error", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
