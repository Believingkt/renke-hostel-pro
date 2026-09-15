-- Allow staff with editable "group_buy" module permission to manage group buy content
CREATE POLICY "Group buy staff can view campaigns"
ON public.group_buy_campaigns FOR SELECT TO authenticated
USING (public.staff_can_edit_module(accommodation_id, 'group_buy'));

CREATE POLICY "Group buy staff can insert campaigns"
ON public.group_buy_campaigns FOR INSERT TO authenticated
WITH CHECK (public.staff_can_edit_module(accommodation_id, 'group_buy'));

CREATE POLICY "Group buy staff can update campaigns"
ON public.group_buy_campaigns FOR UPDATE TO authenticated
USING (public.staff_can_edit_module(accommodation_id, 'group_buy'))
WITH CHECK (public.staff_can_edit_module(accommodation_id, 'group_buy'));

CREATE POLICY "Group buy staff can delete campaigns"
ON public.group_buy_campaigns FOR DELETE TO authenticated
USING (public.staff_can_edit_module(accommodation_id, 'group_buy'));

CREATE POLICY "Group buy staff can manage campaign packages"
ON public.group_buy_campaign_packages FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_campaign_packages.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')))
WITH CHECK (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_campaign_packages.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')));

CREATE POLICY "Group buy staff can manage bank accounts"
ON public.group_buy_bank_accounts FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_bank_accounts.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')))
WITH CHECK (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_bank_accounts.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')));

CREATE POLICY "Group buy staff can manage notification settings"
ON public.group_buy_campaign_notification_settings FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_campaign_notification_settings.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')))
WITH CHECK (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_campaign_notification_settings.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')));

CREATE POLICY "Group buy staff can view commissions"
ON public.group_buy_commissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.group_buy_campaigns c WHERE c.id = group_buy_commissions.campaign_id AND public.staff_can_edit_module(c.accommodation_id, 'group_buy')));