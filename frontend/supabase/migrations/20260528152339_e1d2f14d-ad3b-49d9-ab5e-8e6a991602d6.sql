ALTER TABLE public.accommodation_commission_settings
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS rate,
  DROP COLUMN IF EXISTS created_by;