ALTER TABLE public.scout_team_targets
  ADD COLUMN IF NOT EXISTS personal_min integer,
  ADD COLUMN IF NOT EXISTS is_starlink boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS venue_name text;

ALTER TABLE public.scout_team_targets
  ALTER COLUMN accommodation_id DROP NOT NULL;