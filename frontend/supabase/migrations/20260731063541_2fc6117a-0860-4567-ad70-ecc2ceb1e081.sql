ALTER TABLE public.addon_settings
  ADD COLUMN IF NOT EXISTS auto_include boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;