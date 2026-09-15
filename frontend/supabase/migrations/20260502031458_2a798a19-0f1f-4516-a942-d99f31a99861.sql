
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS google_reviews_cache jsonb,
  ADD COLUMN IF NOT EXISTS google_reviews_cached_at timestamp with time zone;
