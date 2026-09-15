CREATE OR REPLACE FUNCTION public.get_team_role_members(p_role public.app_role)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tmp.user_id, tmp.display_name
  FROM public.user_roles ur
  JOIN public.team_member_profiles tmp ON tmp.user_id = ur.user_id
  WHERE ur.role = p_role
    AND ur.accommodation_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_team_role_members(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_role_members(public.app_role) TO authenticated;