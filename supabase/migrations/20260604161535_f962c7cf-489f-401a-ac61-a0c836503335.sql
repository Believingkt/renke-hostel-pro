
-- Allow scout_manager to update team_member_profiles for members who have the scout role
-- Field-level restriction (only display_name and is_scout_team_member) is enforced via trigger

CREATE POLICY "team_profiles_update_scout_manager"
ON public.team_member_profiles
FOR UPDATE
USING (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = team_member_profiles.user_id
      AND ur.role = 'scout'::app_role
  )
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  AND user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = team_member_profiles.user_id
      AND ur.role = 'scout'::app_role
  )
);

-- Trigger: when actor is scout_manager (and NOT admin/super_admin),
-- only allow changes to display_name and is_scout_team_member
CREATE OR REPLACE FUNCTION public.enforce_scout_manager_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip enforcement for admin / super_admin
  IF user_has_team_role(auth.uid(), 'super_admin'::app_role)
     OR user_has_team_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only apply restriction when actor is scout_manager
  IF NOT user_has_team_role(auth.uid(), 'scout_manager'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Block changes to any column other than display_name / is_scout_team_member
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.managed_venue IS DISTINCT FROM OLD.managed_venue THEN
    RAISE EXCEPTION 'scout_manager 僅能修改顯示名稱與星探團隊機制開關';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_scout_manager_profile_update ON public.team_member_profiles;
CREATE TRIGGER trg_enforce_scout_manager_profile_update
BEFORE UPDATE ON public.team_member_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_scout_manager_profile_update();
