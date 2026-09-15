ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS villa_header_feature_tags jsonb;