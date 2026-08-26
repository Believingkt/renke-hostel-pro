CREATE POLICY "AM team can view orders for settlement"
ON public.orders FOR SELECT TO authenticated
USING (public.is_am_team(auth.uid()));

CREATE POLICY "AM team can view addon sales"
ON public.addon_sales FOR SELECT TO authenticated
USING (public.is_am_team(auth.uid()));

CREATE POLICY "AM team can view split rules"
ON public.split_rules FOR SELECT TO authenticated
USING (public.is_am_team(auth.uid()));

CREATE POLICY "AM team can view owner settlement settings"
ON public.system_settings FOR SELECT TO authenticated
USING (public.is_am_team(auth.uid()) AND setting_key LIKE 'owner_settlement_config%');