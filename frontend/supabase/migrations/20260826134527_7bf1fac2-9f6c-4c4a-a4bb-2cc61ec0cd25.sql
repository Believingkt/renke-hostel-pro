-- 會計（finance）唯讀查看業主月結所需資料

CREATE POLICY "Finance can view pricing rules"
ON public.owner_settlement_pricing_rules
FOR SELECT
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can view addon sales"
ON public.addon_sales
FOR SELECT
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can view split rules"
ON public.split_rules
FOR SELECT
TO authenticated
USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "Finance can view owner settlement settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'finance'::app_role)
  AND setting_key LIKE 'owner_settlement_config%'
);