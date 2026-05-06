ALTER TABLE public.addon_settings ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_addon_settings_acc_sort ON public.addon_settings(accommodation_id, sort_order);
-- Initialize existing rows by created_at
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY accommodation_id ORDER BY created_at) - 1 AS rn
  FROM public.addon_settings
)
UPDATE public.addon_settings a SET sort_order = ranked.rn FROM ranked WHERE a.id = ranked.id AND a.sort_order = 0;