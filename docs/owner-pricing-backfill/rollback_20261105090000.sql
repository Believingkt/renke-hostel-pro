-- 20261105090000 rollback：回到 20260825131931／20260817075237 的狀態（log 表會一併刪除，必要時先匯出）
BEGIN;
DROP FUNCTION IF EXISTS public.owner_pricing_rule_revert_date(uuid, text);
DROP FUNCTION IF EXISTS public.owner_pricing_rule_delete_backfill(uuid, text);
DROP TRIGGER IF EXISTS trg_owner_pricing_rule_date_log ON public.owner_settlement_pricing_rules;
DROP TRIGGER IF EXISTS trg_owner_pricing_rule_insert_guard ON public.owner_settlement_pricing_rules;
DROP FUNCTION IF EXISTS public.owner_pricing_rule_date_log();
DROP FUNCTION IF EXISTS public.owner_pricing_rule_insert_guard();
DROP TABLE IF EXISTS public.owner_pricing_rule_date_logs;
ALTER TABLE public.owner_settlement_pricing_rules DROP COLUMN IF EXISTS date_change_reason;
CREATE OR REPLACE FUNCTION public.owner_pricing_rule_update_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'effective_from') IS DISTINCT FROM (to_jsonb(OLD) - 'effective_from') THEN
    RAISE EXCEPTION '歷史版本僅允許修正生效月份，其他內容請新增版本';
  END IF;
  IF EXTRACT(day FROM NEW.effective_from) <> 1 THEN
    RAISE EXCEPTION '生效月份必須是該月 1 號';
  END IF;
  RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.can_fix_pricing_rule_date(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin', 'admin'));
$$;
CREATE POLICY "AM team can insert first backdated pricing rule" ON public.owner_settlement_pricing_rules FOR INSERT TO authenticated
WITH CHECK (public.is_am_team(auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.owner_settlement_pricing_rules r WHERE r.accommodation_id = owner_settlement_pricing_rules.accommodation_id) AND effective_from >= public.pricing_rule_min_month(accommodation_id) AND effective_from <= (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei'))::date);
CREATE POLICY "AM team can fix first pricing rule date" ON public.owner_settlement_pricing_rules FOR UPDATE TO authenticated
USING (public.is_am_team(auth.uid()) AND (SELECT count(*) FROM public.owner_settlement_pricing_rules r WHERE r.accommodation_id = owner_settlement_pricing_rules.accommodation_id) = 1)
WITH CHECK (public.is_am_team(auth.uid()) AND effective_from >= public.pricing_rule_min_month(accommodation_id) AND effective_from <= (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei'))::date);
COMMIT;
