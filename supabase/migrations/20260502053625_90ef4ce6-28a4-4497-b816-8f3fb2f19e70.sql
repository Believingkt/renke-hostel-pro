ALTER TABLE public.accommodation_info
  DROP COLUMN IF EXISTS google_reviews_auto_sync_enabled,
  DROP COLUMN IF EXISTS google_reviews_auto_sync_interval_hours;