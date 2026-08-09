-- 1. Meta 廣告每日成效
CREATE TABLE public.meta_ad_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL,
  ad_id text NOT NULL,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  reach bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  link_clicks bigint NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  messaging_started bigint NOT NULL DEFAULT 0,
  currency text,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stat_date, ad_id)
);
CREATE INDEX idx_meta_ad_insights_daily_date ON public.meta_ad_insights_daily (stat_date DESC);
CREATE INDEX idx_meta_ad_insights_daily_campaign ON public.meta_ad_insights_daily (campaign_id, stat_date DESC);

GRANT SELECT ON public.meta_ad_insights_daily TO authenticated;
GRANT ALL ON public.meta_ad_insights_daily TO service_role;
ALTER TABLE public.meta_ad_insights_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_ad_insights_daily_select" ON public.meta_ad_insights_daily
FOR SELECT TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);

CREATE POLICY "meta_ad_insights_daily_write" ON public.meta_ad_insights_daily
FOR ALL TO authenticated
USING (user_has_team_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_meta_ad_insights_daily_updated_at
BEFORE UPDATE ON public.meta_ad_insights_daily
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. 訂單廣告歸因
CREATE TABLE public.order_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  session_id text,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_content text,
  first_touch_at timestamptz,
  last_utm_source text,
  last_utm_medium text,
  last_utm_campaign text,
  last_utm_content text,
  last_touch_at timestamptz,
  referrer_domain text,
  fbclid text,
  line_source_param text,
  ad_id text,
  campaign_id text,
  landing_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);
CREATE INDEX idx_order_attributions_acc ON public.order_attributions (accommodation_id, created_at DESC);
CREATE INDEX idx_order_attributions_campaign ON public.order_attributions (campaign_id);
CREATE INDEX idx_order_attributions_session ON public.order_attributions (session_id);

GRANT SELECT, INSERT, UPDATE ON public.order_attributions TO authenticated;
GRANT INSERT ON public.order_attributions TO anon;
GRANT ALL ON public.order_attributions TO service_role;
ALTER TABLE public.order_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_attributions_insert_public" ON public.order_attributions
FOR INSERT WITH CHECK (order_id IS NOT NULL);

CREATE POLICY "order_attributions_select_members" ON public.order_attributions
FOR SELECT TO authenticated
USING (
  accommodation_id IS NOT NULL
  AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

CREATE POLICY "order_attributions_select_admin" ON public.order_attributions
FOR SELECT TO authenticated
USING (is_admin_or_super());

CREATE POLICY "order_attributions_update_admin" ON public.order_attributions
FOR UPDATE TO authenticated
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());

CREATE TRIGGER update_order_attributions_updated_at
BEFORE UPDATE ON public.order_attributions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. LINE 加好友事件
CREATE TABLE public.line_follow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.line_oa_channels(id) ON DELETE SET NULL,
  line_user_id text NOT NULL,
  event_type text NOT NULL,
  source_param text,
  ad_id text,
  campaign_id text,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (line_user_id, event_type, occurred_at)
);
CREATE INDEX idx_line_follow_events_occurred ON public.line_follow_events (occurred_at DESC);
CREATE INDEX idx_line_follow_events_source ON public.line_follow_events (source_param);

GRANT SELECT ON public.line_follow_events TO authenticated;
GRANT ALL ON public.line_follow_events TO service_role;
ALTER TABLE public.line_follow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_follow_events_select" ON public.line_follow_events
FOR SELECT TO authenticated
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
);

CREATE POLICY "line_follow_events_write" ON public.line_follow_events
FOR ALL TO authenticated
USING (user_has_team_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin'::app_role));