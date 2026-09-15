ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS nearby_station text,
  ADD COLUMN IF NOT EXISTS review_summary text,
  ADD COLUMN IF NOT EXISTS rating_score numeric(2,1);