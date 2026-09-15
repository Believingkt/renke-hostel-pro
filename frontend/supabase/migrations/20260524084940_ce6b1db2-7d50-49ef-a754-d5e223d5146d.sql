DROP TABLE IF EXISTS public.meta_ad_weekly;

CREATE TABLE public.meta_ad_weekly (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  campaign_name text,
  status text,
  start_date text,
  stop_date text,
  date_range text NOT NULL,
  spend numeric DEFAULT 0,
  impressions integer DEFAULT 0,
  reach integer DEFAULT 0,
  msg_started integer DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, date_range)
);

ALTER TABLE public.meta_ad_weekly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can manage meta_ad_weekly"
ON public.meta_ad_weekly FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin')
  )
);