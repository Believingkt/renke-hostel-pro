CREATE POLICY "Team members can view team roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_has_any_team_role(auth.uid())
  AND role = ANY (ARRAY['scout','scout_manager','admin','super_admin','hotel_admin','franchise_manager']::app_role[])
);