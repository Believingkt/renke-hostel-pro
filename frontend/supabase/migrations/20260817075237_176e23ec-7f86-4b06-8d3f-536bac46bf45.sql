
-- 可最終校正生效月份的總部角色
CREATE OR REPLACE FUNCTION public.can_fix_pricing_rule_date(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'admin', 'finance')
  );
$$;

-- 該館別合作生效日所在月（無設定則不設下限）
CREATE OR REPLACE FUNCTION public.pricing_rule_min_month(_accommodation_id uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT date_trunc('month', ai.partnership_start_date)::date
       FROM public.accommodation_info ai
      WHERE ai.id = _accommodation_id),
    DATE '2000-01-01'
  );
$$;

-- 首版可回填生效月份（該館別尚無任何規則時）
CREATE POLICY "AM team can insert first backdated pricing rule"
ON public.owner_settlement_pricing_rules
FOR INSERT TO authenticated
WITH CHECK (
  public.is_am_team(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.owner_settlement_pricing_rules r
    WHERE r.accommodation_id = owner_settlement_pricing_rules.accommodation_id
  )
  AND effective_from >= public.pricing_rule_min_month(accommodation_id)
  AND effective_from <= (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei'))::date
);

-- 總部角色可回填任意月份
CREATE POLICY "HQ can insert backdated pricing rules"
ON public.owner_settlement_pricing_rules
FOR INSERT TO authenticated
WITH CHECK (public.can_fix_pricing_rule_date(auth.uid()));

-- AM 僅能修正「該館唯一一版」的生效月份
CREATE POLICY "AM team can fix first pricing rule date"
ON public.owner_settlement_pricing_rules
FOR UPDATE TO authenticated
USING (
  public.is_am_team(auth.uid())
  AND (
    SELECT count(*) FROM public.owner_settlement_pricing_rules r
    WHERE r.accommodation_id = owner_settlement_pricing_rules.accommodation_id
  ) = 1
)
WITH CHECK (
  public.is_am_team(auth.uid())
  AND effective_from >= public.pricing_rule_min_month(accommodation_id)
  AND effective_from <= (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei'))::date
);

-- 總部角色可修正任何版本的生效月份
CREATE POLICY "HQ can fix pricing rule date"
ON public.owner_settlement_pricing_rules
FOR UPDATE TO authenticated
USING (public.can_fix_pricing_rule_date(auth.uid()))
WITH CHECK (public.can_fix_pricing_rule_date(auth.uid()));

-- 更新僅允許變更 effective_from，其餘欄位維持 append-only
CREATE OR REPLACE FUNCTION public.owner_pricing_rule_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'effective_from') IS DISTINCT FROM (to_jsonb(OLD) - 'effective_from') THEN
    RAISE EXCEPTION '歷史版本僅允許修正生效月份，其他內容請新增版本';
  END IF;
  IF EXTRACT(day FROM NEW.effective_from) <> 1 THEN
    RAISE EXCEPTION '生效月份必須是該月 1 號';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_pricing_rule_update_guard ON public.owner_settlement_pricing_rules;
CREATE TRIGGER trg_owner_pricing_rule_update_guard
BEFORE UPDATE ON public.owner_settlement_pricing_rules
FOR EACH ROW EXECUTE FUNCTION public.owner_pricing_rule_update_guard();
