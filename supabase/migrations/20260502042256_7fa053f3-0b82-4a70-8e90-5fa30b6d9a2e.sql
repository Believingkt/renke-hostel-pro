
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS google_reviews_auto_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_reviews_auto_sync_interval_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.accommodation_info
  DROP CONSTRAINT IF EXISTS accommodation_info_google_reviews_auto_sync_interval_check;

ALTER TABLE public.accommodation_info
  ADD CONSTRAINT accommodation_info_google_reviews_auto_sync_interval_check
  CHECK (google_reviews_auto_sync_interval_hours BETWEEN 1 AND 168);
