ALTER TABLE public.accommodation_packages
ADD COLUMN IF NOT EXISTS excluded_date_ranges jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.accommodation_packages.excluded_date_ranges IS 'Array of {start: YYYY-MM-DD, end: YYYY-MM-DD} ranges (inclusive) during which this package is not applicable.';