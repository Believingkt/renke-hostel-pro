CREATE POLICY "Team members can view scout discount codes"
ON public.scout_discount_codes FOR SELECT TO authenticated
USING (user_has_any_team_role(auth.uid()));