-- 20261105090000 業主月結（owner_settlement_pricing_rules）補登規則＋生效月份異動 log＋一鍵回復／刪除補登
-- 1. 可補登／修正生效月份＝super_admin、admin、AM 總管（am_manager）；一般 AM 不能補登、不能改月份
-- 2. 新增也必須是某月 1 日；補登（生效月份早於台北本月）與修正月份都必須填原因
-- 3. owner_pricing_rule_date_logs：補登／修正／回復／刪除都留紀錄（只由 trigger／RPC 寫入）
-- 4. owner_pricing_rule_revert_date(log_id, reason)：把某次修正改回原月份（只能從最新一筆回復）
-- 5. owner_pricing_rule_delete_backfill(rule_id, reason)：刪除補登錯的版本（限該月尚未產生獎金快照）
-- 6. 更新守門：除生效月份與原因外，也允許「增值服務抽成已審查」兩欄（原守門會擋審查標記）

BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.owner_settlement_pricing_rules') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：缺 owner_settlement_pricing_rules';
  END IF;
  IF to_regclass('public.owner_pricing_rule_date_logs') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：owner_pricing_rule_date_logs 已存在（已套用過）';
  END IF;
  IF to_regclass('public.teamcommission_bonus_snapshots') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：缺 teamcommission_bonus_snapshots';
  END IF;
  IF EXISTS (SELECT 1 FROM public.owner_settlement_pricing_rules WHERE EXTRACT(day FROM effective_from) <> 1) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：有生效日不是 1 日的版本，請先處理';
  END IF;
END
$pre$;

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
      AND role IN ('super_admin'::app_role, 'admin'::app_role, 'am_manager'::app_role)
  );
$$;

DROP POLICY "AM team can insert first backdated pricing rule" ON public.owner_settlement_pricing_rules;
DROP POLICY "AM team can fix first pricing rule date" ON public.owner_settlement_pricing_rules;

ALTER TABLE public.owner_settlement_pricing_rules ADD COLUMN date_change_reason text;

CREATE TABLE public.owner_pricing_rule_date_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL,
  accommodation_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('backfill', 'fix_date', 'revert', 'delete')),
  old_effective_from date,
  new_effective_from date,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  revert_of uuid REFERENCES public.owner_pricing_rule_date_logs(id),
  rule_snapshot jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_owner_pricing_rule_date_logs_acc ON public.owner_pricing_rule_date_logs (accommodation_id, changed_at DESC);
ALTER TABLE public.owner_pricing_rule_date_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_pricing_rule_date_logs_select ON public.owner_pricing_rule_date_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.can_fix_pricing_rule_date(auth.uid()) OR public.is_am_team(auth.uid()) OR public.user_has_team_role(auth.uid(), 'finance'::app_role));
REVOKE ALL ON public.owner_pricing_rule_date_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.owner_pricing_rule_date_logs FROM authenticated;
GRANT SELECT ON public.owner_pricing_rule_date_logs TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_pricing_rule_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  editable text[] := ARRAY['effective_from', 'date_change_reason', 'commission_exclusion_reviewed_at', 'commission_exclusion_reviewed_by'];
BEGIN
  IF (to_jsonb(NEW) - editable) IS DISTINCT FROM (to_jsonb(OLD) - editable) THEN
    RAISE EXCEPTION '歷史版本僅允許修正生效月份，其他內容請新增版本';
  END IF;
  IF EXTRACT(day FROM NEW.effective_from) <> 1 THEN
    RAISE EXCEPTION '生效月份必須是該月 1 號';
  END IF;
  IF NEW.effective_from IS DISTINCT FROM OLD.effective_from AND btrim(COALESCE(NEW.date_change_reason, '')) = '' THEN
    RAISE EXCEPTION '修正生效月份必須填寫原因';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_pricing_rule_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXTRACT(day FROM NEW.effective_from) <> 1 THEN
    RAISE EXCEPTION '生效月份必須是該月 1 號';
  END IF;
  IF NEW.effective_from < date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date AND btrim(COALESCE(NEW.date_change_reason, '')) = '' THEN
    RAISE EXCEPTION '補登過去月份必須填寫原因';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_owner_pricing_rule_insert_guard
BEFORE INSERT ON public.owner_settlement_pricing_rules
FOR EACH ROW EXECUTE FUNCTION public.owner_pricing_rule_insert_guard();

CREATE OR REPLACE FUNCTION public.owner_pricing_rule_date_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rev text := NULLIF(current_setting('app.pricing_rule_revert_of', true), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.effective_from < date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date THEN
      INSERT INTO public.owner_pricing_rule_date_logs (rule_id, accommodation_id, action, old_effective_from, new_effective_from, reason, changed_by)
      VALUES (NEW.id, NEW.accommodation_id, 'backfill', NULL, NEW.effective_from, NEW.date_change_reason, auth.uid());
    END IF;
  ELSIF NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    INSERT INTO public.owner_pricing_rule_date_logs (rule_id, accommodation_id, action, old_effective_from, new_effective_from, reason, revert_of, changed_by)
    VALUES (NEW.id, NEW.accommodation_id, CASE WHEN rev IS NULL THEN 'fix_date' ELSE 'revert' END, OLD.effective_from, NEW.effective_from, NEW.date_change_reason, rev::uuid, auth.uid());
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_owner_pricing_rule_date_log
AFTER INSERT OR UPDATE ON public.owner_settlement_pricing_rules
FOR EACH ROW EXECUTE FUNCTION public.owner_pricing_rule_date_log();

CREATE OR REPLACE FUNCTION public.owner_pricing_rule_revert_date(_log_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lg public.owner_pricing_rule_date_logs%ROWTYPE;
  latest uuid;
BEGIN
  IF NOT public.can_fix_pricing_rule_date(auth.uid()) THEN
    RAISE EXCEPTION '沒有回復生效月份的權限';
  END IF;
  IF btrim(COALESCE(_reason, '')) = '' THEN
    RAISE EXCEPTION '回復必須填寫原因';
  END IF;
  SELECT * INTO lg FROM public.owner_pricing_rule_date_logs WHERE id = _log_id;
  IF NOT FOUND OR lg.action NOT IN ('fix_date', 'revert') THEN
    RAISE EXCEPTION '只能回復「修正生效月份」的紀錄';
  END IF;
  SELECT id INTO latest FROM public.owner_pricing_rule_date_logs
   WHERE rule_id = lg.rule_id AND action IN ('fix_date', 'revert')
   ORDER BY changed_at DESC, id DESC LIMIT 1;
  IF latest IS DISTINCT FROM lg.id THEN
    RAISE EXCEPTION '這個版本之後又改過月份，請從最新一筆回復';
  END IF;
  PERFORM set_config('app.pricing_rule_revert_of', lg.id::text, true);
  UPDATE public.owner_settlement_pricing_rules
     SET effective_from = lg.old_effective_from, date_change_reason = _reason
   WHERE id = lg.rule_id AND effective_from = lg.new_effective_from;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到要回復的版本（可能已被刪除或月份不符）';
  END IF;
  PERFORM set_config('app.pricing_rule_revert_of', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_pricing_rule_delete_backfill(_rule_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.owner_settlement_pricing_rules%ROWTYPE;
BEGIN
  IF NOT public.can_fix_pricing_rule_date(auth.uid()) THEN
    RAISE EXCEPTION '沒有刪除補登版本的權限';
  END IF;
  IF btrim(COALESCE(_reason, '')) = '' THEN
    RAISE EXCEPTION '刪除必須填寫原因';
  END IF;
  SELECT * INTO r FROM public.owner_settlement_pricing_rules WHERE id = _rule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到這個版本';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.owner_pricing_rule_date_logs WHERE rule_id = _rule_id AND action = 'backfill') THEN
    RAISE EXCEPTION '只能刪除補登的版本';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teamcommission_bonus_snapshots WHERE snapshot_month = to_char(r.effective_from, 'YYYY-MM')) THEN
    RAISE EXCEPTION '% 已產生獎金快照，不能刪除；請改用修正月份或新增版本', to_char(r.effective_from, 'YYYY-MM');
  END IF;
  INSERT INTO public.owner_pricing_rule_date_logs (rule_id, accommodation_id, action, old_effective_from, new_effective_from, reason, rule_snapshot, changed_by)
  VALUES (r.id, r.accommodation_id, 'delete', r.effective_from, NULL, _reason, to_jsonb(r), auth.uid());
  DELETE FROM public.owner_settlement_pricing_rules WHERE id = _rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_pricing_rule_revert_date(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owner_pricing_rule_delete_backfill(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_pricing_rule_revert_date(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_pricing_rule_delete_backfill(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.owner_pricing_rule_insert_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.owner_pricing_rule_date_log() FROM PUBLIC, anon, authenticated;

COMMIT;
