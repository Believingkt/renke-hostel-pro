ALTER TABLE public.addon_settings
ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'per_night';

ALTER TABLE public.addon_settings
DROP CONSTRAINT IF EXISTS addon_settings_pricing_mode_check;

ALTER TABLE public.addon_settings
ADD CONSTRAINT addon_settings_pricing_mode_check
CHECK (pricing_mode IN ('per_night', 'per_stay'));