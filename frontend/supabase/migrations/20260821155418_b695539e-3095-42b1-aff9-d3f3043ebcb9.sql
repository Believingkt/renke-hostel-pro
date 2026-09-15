CREATE TYPE public.group_buy_day_type AS ENUM ('weekday', 'peak', 'holiday');

ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN disabled_date_types public.group_buy_day_type[] NOT NULL DEFAULT '{}'::public.group_buy_day_type[],
  ADD COLUMN image_urls text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.group_buy_campaign_packages
   SET image_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND image_url <> ''
   AND cardinality(image_urls) = 0;