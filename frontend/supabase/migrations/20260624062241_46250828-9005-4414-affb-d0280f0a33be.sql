ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS villa_header_rating_override numeric(2,1),
  ADD COLUMN IF NOT EXISTS villa_header_rating_label_override text,
  ADD COLUMN IF NOT EXISTS villa_header_review_count_override integer,
  ADD COLUMN IF NOT EXISTS villa_header_top_review_override text,
  ADD COLUMN IF NOT EXISTS villa_header_host_response_text text;