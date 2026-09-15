
DROP POLICY IF EXISTS payout_marks_write ON public.commission_payout_marks;
CREATE POLICY payout_marks_write ON public.commission_payout_marks
FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR
  public.user_has_team_role(auth.uid(), 'admin'::app_role) OR
  public.user_has_team_role(auth.uid(), 'scout_manager'::app_role) OR
  public.user_has_team_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR
  public.user_has_team_role(auth.uid(), 'admin'::app_role) OR
  public.user_has_team_role(auth.uid(), 'scout_manager'::app_role) OR
  public.user_has_team_role(auth.uid(), 'finance'::app_role)
);

DROP POLICY IF EXISTS scout_payouts_select ON public.scout_monthly_payouts;
CREATE POLICY scout_payouts_select ON public.scout_monthly_payouts
FOR SELECT TO authenticated
USING (
  scout_id = auth.uid()
  OR public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
);

DROP POLICY IF EXISTS scout_payouts_write ON public.scout_monthly_payouts;
CREATE POLICY scout_payouts_write ON public.scout_monthly_payouts
FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
);
