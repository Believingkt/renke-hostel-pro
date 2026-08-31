-- Batch 1B: replace global is_admin_or_super() with true super_admin in group-buy financial manager policies.
DROP POLICY "Managers can manage bank accounts" ON public.group_buy_bank_accounts;
CREATE POLICY "Managers can manage bank accounts"
ON public.group_buy_bank_accounts
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_bank_accounts.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_bank_accounts.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
));

DROP POLICY "Managers can manage group buy commissions" ON public.group_buy_commissions;
CREATE POLICY "Managers can manage group buy commissions"
ON public.group_buy_commissions
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_commissions.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_commissions.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
));

DROP POLICY "Managers can view payment events" ON public.group_buy_payment_events;
CREATE POLICY "Managers can view payment events"
ON public.group_buy_payment_events
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_payment_events.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
));

DROP POLICY "Managers can insert payment events" ON public.group_buy_payment_events;
CREATE POLICY "Managers can insert payment events"
ON public.group_buy_payment_events
FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_buy_campaigns c
  WHERE c.id = group_buy_payment_events.campaign_id
    AND (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(c.accommodation_id))
));