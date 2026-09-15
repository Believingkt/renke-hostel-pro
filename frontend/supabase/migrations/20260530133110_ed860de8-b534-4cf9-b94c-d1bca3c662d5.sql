-- 0. Drop dependent policy first
DROP POLICY IF EXISTS "kol_profiles_select" ON public.kol_profiles;

-- 1. Change managed_venue to text[]
ALTER TABLE public.team_member_profiles
ALTER COLUMN managed_venue TYPE text[]
USING CASE
  WHEN managed_venue IS NULL OR managed_venue = '' THEN NULL
  ELSE ARRAY[managed_venue]
END;

-- 2. Recreate kol_profiles SELECT policy with array membership check
CREATE POLICY "kol_profiles_select" ON public.kol_profiles
FOR SELECT TO authenticated
USING (
  user_has_any_team_role(auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'venue_manager'
    )
    AND venue_name = ANY (
      SELECT unnest(managed_venue)
      FROM team_member_profiles
      WHERE user_id = auth.uid()
    )
  )
);