ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS villa_perk_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: convert existing villa_default_perks into a single template named 預設
UPDATE public.accommodation_info
SET villa_perk_templates = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', '預設',
    'title', COALESCE(villa_default_perks->>'title', '尊榮禮遇'),
    'items', COALESCE(villa_default_perks->'items', '[]'::jsonb)
  )
)
WHERE (villa_perk_templates = '[]'::jsonb OR villa_perk_templates IS NULL)
  AND villa_default_perks IS NOT NULL
  AND jsonb_typeof(villa_default_perks->'items') = 'array'
  AND jsonb_array_length(villa_default_perks->'items') > 0;