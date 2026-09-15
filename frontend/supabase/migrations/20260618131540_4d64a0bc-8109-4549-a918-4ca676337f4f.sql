ALTER TABLE public.kol_profiles
  ADD COLUMN IF NOT EXISTS follower_count integer,
  ADD COLUMN IF NOT EXISTS follower_count_updated_at timestamptz;