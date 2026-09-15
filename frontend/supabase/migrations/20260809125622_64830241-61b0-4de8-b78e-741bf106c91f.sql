CREATE POLICY "AM team can view pricing rules"
ON public.owner_settlement_pricing_rules
FOR SELECT
TO authenticated
USING (public.is_am_team(auth.uid()));

CREATE POLICY "AM team can insert current or future pricing rules"
ON public.owner_settlement_pricing_rules
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_am_team(auth.uid())
  AND effective_from >= date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei'))::date
);