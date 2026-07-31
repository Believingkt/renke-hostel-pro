ALTER TABLE public.addon_settings
  ADD COLUMN IF NOT EXISTS icon_key text,
  ADD COLUMN IF NOT EXISTS show_icon boolean NOT NULL DEFAULT true;