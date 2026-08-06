REVOKE EXECUTE ON FUNCTION public.is_am_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_am_team(uuid) TO authenticated, service_role;