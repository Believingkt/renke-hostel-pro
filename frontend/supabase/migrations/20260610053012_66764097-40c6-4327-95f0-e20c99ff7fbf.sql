
ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS weekday_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS peak_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekend_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS extra_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS excluded_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
