import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface MarketingParams {
  accommodationId: string;
  startDate: Date;
  endDate: Date;
}

export interface CampaignPerformance {
  key: string;
  campaign_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  messaging_started: number;
  ctr: number;
  cpc: number;
  orders: number;
  revenue: number;
  roas: number;
  cpa: number;
  advice: "scale" | "keep" | "watch" | "cut";
}

export interface MarketingData {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  messagingStarted: number;
  attributedOrders: number;
  attributedRevenue: number;
  roas: number;
  cpa: number;
  lineFollows: number;
  lineUnfollows: number;
  lineConversations: number;
  campaigns: CampaignPerformance[];
  dailySpendRevenue: { date: string; 花費: number; 歸因營收: number }[];
  lineDaily: { date: string; 新好友: number; 封鎖: number; 對話: number }[];
  lineSources: { source: string; count: number }[];
  leadTimeBuckets: { bucket: string; 訂單數: number }[];
  hourBuckets: { hour: string; 訂單數: number }[];
  inventoryPressure: { bucket: string; 訂單數: number; 平均剩餘房數: number }[];
  hasAdData: boolean;
  hasAttributionData: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

const dayKey = (d: string) => format(new Date(d), "MM/dd");

export const useMarketingAnalytics = ({ accommodationId, startDate, endDate }: MarketingParams) => {
  const from = format(startDate, "yyyy-MM-dd");
  const to = format(endDate, "yyyy-MM-dd");

  return useQuery({
    queryKey: ["marketing-analytics", accommodationId, from, to],
    queryFn: async (): Promise<MarketingData> => {
      const fromTs = `${from}T00:00:00`;
      const toTs = `${to}T23:59:59`;

      const [adsRes, attrRes, followRes, convRes, ordersRes] = await Promise.all([
        supabase
          .from("meta_ad_insights_daily")
          .select("stat_date, campaign_id, campaign_name, ad_name, spend, impressions, clicks, link_clicks, ctr, cpc, messaging_started")
          .gte("stat_date", from)
          .lte("stat_date", to),
        supabase
          .from("order_attributions")
          .select("order_id, created_at, last_utm_campaign, last_utm_source, campaign_id, orders!inner(final_price, order_status, order_date, accommodation_id)")
          .eq("accommodation_id", accommodationId)
          .gte("created_at", fromTs)
          .lte("created_at", toTs),
        supabase
          .from("line_follow_events")
          .select("event_type, source_param, occurred_at")
          .gte("occurred_at", fromTs)
          .lte("occurred_at", toTs),
        supabase
          .from("ai_conversation_logs")
          .select("id, created_at, source")
          .eq("accommodation_id", accommodationId)
          .gte("created_at", fromTs)
          .lte("created_at", toTs),
        supabase
          .from("orders")
          .select("id, order_date, check_in_date, order_status, final_price")
          .eq("accommodation_id", accommodationId)
          .gte("order_date", fromTs)
          .lte("order_date", toTs)
          .neq("order_status", "cancelled"),
      ]);

      const ads = adsRes.data ?? [];
      const attrs = (attrRes.data ?? []) as unknown as Array<{
        order_id: string;
        created_at: string;
        last_utm_campaign: string | null;
        last_utm_source: string | null;
        campaign_id: string | null;
        orders: { final_price: number | null; order_status: string | null } | null;
      }>;
      const follows = followRes.data ?? [];
      const convs = convRes.data ?? [];
      const orders = ordersRes.data ?? [];

      // ── 廣告彙總（以 campaign 為單位）
      const campMap = new Map<string, CampaignPerformance>();
      for (const a of ads) {
        const key = norm(a.campaign_name) || a.campaign_id || "unknown";
        const c = campMap.get(key) ?? {
          key,
          campaign_name: a.campaign_name || a.campaign_id || "未命名活動",
          spend: 0, impressions: 0, clicks: 0, link_clicks: 0, messaging_started: 0,
          ctr: 0, cpc: 0, orders: 0, revenue: 0, roas: 0, cpa: 0, advice: "watch" as const,
        };
        c.spend += Number(a.spend || 0);
        c.impressions += Number(a.impressions || 0);
        c.clicks += Number(a.clicks || 0);
        c.link_clicks += Number(a.link_clicks || 0);
        c.messaging_started += Number(a.messaging_started || 0);
        campMap.set(key, c);
      }

      // ── 歸因訂單掛回 campaign
      let attributedOrders = 0;
      let attributedRevenue = 0;
      for (const at of attrs) {
        if (at.orders?.order_status === "cancelled") continue;
        const revenue = Number(at.orders?.final_price || 0);
        attributedOrders += 1;
        attributedRevenue += revenue;
        const key = norm(at.last_utm_campaign) || at.campaign_id || norm(at.last_utm_source) || "自然/未歸因";
        const c = campMap.get(key) ?? {
          key,
          campaign_name: at.last_utm_campaign || at.last_utm_source || "自然/未歸因",
          spend: 0, impressions: 0, clicks: 0, link_clicks: 0, messaging_started: 0,
          ctr: 0, cpc: 0, orders: 0, revenue: 0, roas: 0, cpa: 0, advice: "watch" as const,
        };
        c.orders += 1;
        c.revenue += revenue;
        campMap.set(key, c);
      }

      const campaigns = Array.from(campMap.values()).map((c) => {
        c.ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
        c.cpc = c.clicks > 0 ? c.spend / c.clicks : 0;
        c.roas = c.spend > 0 ? c.revenue / c.spend : 0;
        c.cpa = c.orders > 0 ? c.spend / c.orders : 0;
        if (c.spend === 0) c.advice = "keep";
        else if (c.roas >= 3) c.advice = "scale";
        else if (c.roas >= 1) c.advice = "keep";
        else if (c.orders > 0) c.advice = "watch";
        else c.advice = "cut";
        return c;
      }).sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

      // ── 每日花費 vs 歸因營收
      const dailyMap = new Map<string, { date: string; 花費: number; 歸因營收: number }>();
      for (const a of ads) {
        const k = dayKey(a.stat_date as string);
        const row = dailyMap.get(k) ?? { date: k, 花費: 0, 歸因營收: 0 };
        row.花費 += Number(a.spend || 0);
        dailyMap.set(k, row);
      }
      for (const at of attrs) {
        if (at.orders?.order_status === "cancelled") continue;
        const k = dayKey(at.created_at);
        const row = dailyMap.get(k) ?? { date: k, 花費: 0, 歸因營收: 0 };
        row.歸因營收 += Number(at.orders?.final_price || 0);
        dailyMap.set(k, row);
      }
      const dailySpendRevenue = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      // ── LINE
      const lineMap = new Map<string, { date: string; 新好友: number; 封鎖: number; 對話: number }>();
      const srcMap = new Map<string, number>();
      let lineFollows = 0;
      let lineUnfollows = 0;
      for (const f of follows) {
        const k = dayKey(f.occurred_at as string);
        const row = lineMap.get(k) ?? { date: k, 新好友: 0, 封鎖: 0, 對話: 0 };
        if (f.event_type === "follow") {
          row.新好友 += 1;
          lineFollows += 1;
          const s = f.source_param || "未帶來源";
          srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
        } else {
          row.封鎖 += 1;
          lineUnfollows += 1;
        }
        lineMap.set(k, row);
      }
      for (const c of convs) {
        const k = dayKey(c.created_at as string);
        const row = lineMap.get(k) ?? { date: k, 新好友: 0, 封鎖: 0, 對話: 0 };
        row.對話 += 1;
        lineMap.set(k, row);
      }
      const lineDaily = Array.from(lineMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const lineSources = Array.from(srcMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // ── 訂單成立時間 × 提前天數
      const leadDefs: Array<[string, (d: number) => boolean]> = [
        ["當天~3天", (d) => d <= 3],
        ["4-7天", (d) => d > 3 && d <= 7],
        ["8-14天", (d) => d > 7 && d <= 14],
        ["15-30天", (d) => d > 14 && d <= 30],
        ["30天以上", (d) => d > 30],
      ];
      const leadCounts = new Map(leadDefs.map(([l]) => [l, 0]));
      const hourCounts = new Map<number, number>();
      for (const o of orders) {
        const od = new Date(o.order_date as string);
        const ci = new Date(o.check_in_date as string);
        const lead = Math.max(0, Math.round((ci.getTime() - od.getTime()) / 86400000));
        const def = leadDefs.find(([, fn]) => fn(lead));
        if (def) leadCounts.set(def[0], (leadCounts.get(def[0]) ?? 0) + 1);
        // 以台北時間計算下單時段
        const h = new Date(od.getTime() + 8 * 3600000).getUTCHours();
        hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
      }
      const leadTimeBuckets = leadDefs.map(([bucket]) => ({ bucket, 訂單數: leadCounts.get(bucket) ?? 0 }));
      const hourBuckets = Array.from({ length: 24 }, (_, h) => ({
        hour: `${String(h).padStart(2, "0")}:00`,
        訂單數: hourCounts.get(h) ?? 0,
      }));

      // ── 庫存壓力：以入住日的訂單密度近似「越接近滿房越不需加預算」
      const perCheckIn = new Map<string, number>();
      for (const o of orders) perCheckIn.set(o.check_in_date as string, (perCheckIn.get(o.check_in_date as string) ?? 0) + 1);
      const pressureDefs = [
        { bucket: "低需求日(0-1單)", test: (n: number) => n <= 1 },
        { bucket: "中需求日(2-3單)", test: (n: number) => n >= 2 && n <= 3 },
        { bucket: "高需求日(4單以上)", test: (n: number) => n >= 4 },
      ];
      const inventoryPressure = pressureDefs.map((p) => {
        const dates = Array.from(perCheckIn.entries()).filter(([, n]) => p.test(n));
        const 訂單數 = dates.reduce((s, [, n]) => s + n, 0);
        const 平均剩餘房數 = dates.length > 0 ? Math.max(0, 6 - 訂單數 / dates.length) : 0;
        return { bucket: p.bucket, 訂單數, 平均剩餘房數: Number(平均剩餘房數.toFixed(1)) };
      });

      const spend = ads.reduce((s, a) => s + Number(a.spend || 0), 0);
      const impressions = ads.reduce((s, a) => s + Number(a.impressions || 0), 0);
      const clicks = ads.reduce((s, a) => s + Number(a.clicks || 0), 0);
      const linkClicks = ads.reduce((s, a) => s + Number(a.link_clicks || 0), 0);
      const messagingStarted = ads.reduce((s, a) => s + Number(a.messaging_started || 0), 0);

      return {
        spend,
        impressions,
        clicks,
        linkClicks,
        messagingStarted,
        attributedOrders,
        attributedRevenue,
        roas: spend > 0 ? attributedRevenue / spend : 0,
        cpa: attributedOrders > 0 ? spend / attributedOrders : 0,
        lineFollows,
        lineUnfollows,
        lineConversations: convs.length,
        campaigns,
        dailySpendRevenue,
        lineDaily,
        lineSources,
        leadTimeBuckets,
        hourBuckets,
        inventoryPressure,
        hasAdData: ads.length > 0,
        hasAttributionData: attrs.length > 0,
      };
    },
    enabled: !!accommodationId,
    staleTime: 5 * 60 * 1000,
  });
};

export default useMarketingAnalytics;
