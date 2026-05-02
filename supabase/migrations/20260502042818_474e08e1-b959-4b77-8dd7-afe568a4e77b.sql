
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS google_reviews_display_count integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS google_reviews_selected_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.accommodation_info
  DROP CONSTRAINT IF EXISTS accommodation_info_google_reviews_display_count_check;

ALTER TABLE public.accommodation_info
  ADD CONSTRAINT accommodation_info_google_reviews_display_count_check
  CHECK (google_reviews_display_count BETWEEN 1 AND 50);
