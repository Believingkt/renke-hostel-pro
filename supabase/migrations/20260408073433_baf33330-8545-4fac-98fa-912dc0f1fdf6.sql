ALTER TABLE public.platform_members
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS nationality text;