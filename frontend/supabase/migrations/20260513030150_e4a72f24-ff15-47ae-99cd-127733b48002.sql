ALTER TABLE public.accommodation_packages
ADD COLUMN IF NOT EXISTS child_count_max integer,
ADD COLUMN IF NOT EXISTS child_age_note text;