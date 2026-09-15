-- Add employment_type column to team_member_profiles for distinguishing 正職/兼職
ALTER TABLE public.team_member_profiles
  ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'parttime';

-- Constrain to allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_member_profiles_employment_type_check'
  ) THEN
    ALTER TABLE public.team_member_profiles
      ADD CONSTRAINT team_member_profiles_employment_type_check
      CHECK (employment_type IN ('fulltime','parttime'));
  END IF;
END $$;

COMMENT ON COLUMN public.team_member_profiles.employment_type IS '雇用類型：fulltime=正職, parttime=兼職';