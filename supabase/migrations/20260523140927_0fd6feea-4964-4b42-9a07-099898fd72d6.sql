
-- Change franchise_team_settings.member_id to reference team_member_profiles.id
-- so that no-account members (user_id IS NULL) can also have settings.

ALTER TABLE public.franchise_team_settings
  DROP CONSTRAINT IF EXISTS franchise_team_settings_member_id_fkey;

ALTER TABLE public.franchise_team_settings
  DROP CONSTRAINT IF EXISTS franchise_team_settings_member_id_key;

-- Migrate existing member_id values (currently user_id) to corresponding team_member_profiles.id
UPDATE public.franchise_team_settings s
SET member_id = p.id
FROM public.team_member_profiles p
WHERE p.user_id = s.member_id;

-- Remove any rows that no longer match a profile (defensive)
DELETE FROM public.franchise_team_settings s
WHERE NOT EXISTS (SELECT 1 FROM public.team_member_profiles p WHERE p.id = s.member_id);

ALTER TABLE public.franchise_team_settings
  ADD CONSTRAINT franchise_team_settings_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.team_member_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.franchise_team_settings
  ADD CONSTRAINT franchise_team_settings_member_id_key UNIQUE (member_id);

-- Update RLS policy: the franchise-self-edit clause used auth.uid()=member_id, no longer valid.
DROP POLICY IF EXISTS "franchise_team_update" ON public.franchise_team_settings;
CREATE POLICY "franchise_team_update" ON public.franchise_team_settings
  FOR UPDATE TO authenticated
  USING (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
    OR (
      user_has_team_role(auth.uid(), 'franchise'::app_role)
      AND EXISTS (
        SELECT 1 FROM public.team_member_profiles p
        WHERE p.id = member_id AND p.user_id = auth.uid()
      )
    )
  );
