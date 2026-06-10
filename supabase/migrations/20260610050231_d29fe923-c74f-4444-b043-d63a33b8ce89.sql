ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS room_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;