-- ============================================================
-- 上架精靈 2b＋2c ③：M3 首次核准開賣硬擋
--   CREATE OR REPLACE public.accommodation_info_guard_is_active()（trigger 本身不變）
--   - auth.uid() 為 NULL（後端系統、SQL Editor、migration）：照舊放行
--   - 非 super_admin：照舊不能改 is_active（42501）
--   - super_admin 把 is_active 改成 true，且 first_activated_at 為 NULL（從未開賣）時：
--       final_check 必須是 submitted，且 wizard_precheck_core 紅色全部通過，否則 42501
--   - 曾開賣過（first_activated_at 不為 NULL）：暫停／重新開賣不受影響
--   - 任何身分第一次變成 is_active = true 時，first_activated_at 寫入 now()
-- precheck：docs/onboarding-3/precheck_20261018120002.sql
-- postcheck：docs/onboarding-3/postcheck_20261018120002.sql
-- rollback：docs/onboarding-3/rollback_20261018120002.sql（還原為 20261018090000 版本）
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regprocedure('public.accommodation_info_guard_is_active()') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info_guard_is_active() 不存在（請先套用 20261018090000）';
  END IF;
  IF position('first_activated_at' IN pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info_guard_is_active() 已含 first_activated_at，疑似已套用過本 migration';
  END IF;
  IF to_regprocedure('public.wizard_precheck_core(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：請先套用 20261018120001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.accommodation_info'::regclass
                 AND tgname = 'trg_accommodation_info_guard_is_active') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：trigger trg_accommodation_info_guard_is_active 不存在';
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE OR REPLACE FUNCTION public.accommodation_info_guard_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_activating boolean := NEW.is_active IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM true);
  v_check jsonb;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_super_admin(v_uid) THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_active IS TRUE THEN
        RAISE EXCEPTION '只有總部最高管理員可以核准開賣（only_super_admin_can_change_is_active）'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION '只有總部最高管理員可以核准或暫停開賣（only_super_admin_can_change_is_active）'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF v_activating AND NEW.first_activated_at IS NULL THEN
    IF v_uid IS NOT NULL THEN
      IF TG_OP = 'INSERT' OR NOT EXISTS (
        SELECT 1 FROM public.accommodation_onboarding_steps
        WHERE accommodation_id = NEW.id AND step_key = 'final_check' AND status = 'submitted'
      ) THEN
        RAISE EXCEPTION '新館第一次開賣須先由業主在上架精靈送審（first_activation_requires_submission）'
          USING ERRCODE = '42501';
      END IF;
      v_check := public.wizard_precheck_core(NEW.id);
      IF (v_check ->> 'red_ok')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION '開賣前檢查有紅色項目未通過，不能核准（first_activation_precheck_failed）'
          USING ERRCODE = '42501',
          DETAIL = (SELECT string_agg(e ->> 'label', '；') FROM jsonb_array_elements(v_check -> 'red') e WHERE (e ->> 'ok')::boolean IS NOT TRUE);
      END IF;
    END IF;
    NEW.first_activated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.accommodation_info_guard_is_active() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.accommodation_info_guard_is_active() IS
  '上架引導：is_active 只限 super_admin 變更；從未開賣的館第一次核准須已送審且開賣前檢查紅色全過；auth.uid() 為 NULL 的系統身分不受限';
