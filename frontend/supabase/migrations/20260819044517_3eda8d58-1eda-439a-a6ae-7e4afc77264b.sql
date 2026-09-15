ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS highlight_points text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS featured_facilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS featured_photo_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS short_summary text;