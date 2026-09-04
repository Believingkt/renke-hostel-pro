DROP POLICY IF EXISTS "team members can read venue tier rules" ON public.venue_team_bonus_tier_rules;
CREATE POLICY "team members can read venue tier rules"
ON public.venue_team_bonus_tier_rules
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));

DROP POLICY IF EXISTS "team members can read venue tier rule logs" ON public.venue_team_bonus_tier_rule_logs;
CREATE POLICY "team members can read venue tier rule logs"
ON public.venue_team_bonus_tier_rule_logs
FOR SELECT
TO authenticated
USING (public.user_has_any_team_role(auth.uid()));