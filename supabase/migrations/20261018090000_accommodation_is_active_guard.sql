-- ============================================================
-- 上架引導第一批 ①：accommodation_info.is_active 只限 super_admin 變更
--   新增 BEFORE INSERT OR UPDATE OF is_active trigger：
--   - 登入使用者（auth.uid() 不為 NULL）且不是 super_admin（public.is_super_admin）時：
--       INSERT 帶 is_active = true → 拒絕
--       UPDATE 改變 is_active      → 拒絕
--   - auth.uid() 為 NULL（SQL Editor、migration、service role）不受限
--   錯誤代碼：only_super_admin_can_change_is_active（ERRCODE 42501）
-- precheck：docs/onboarding-1/precheck_20261018090000.sql
-- postcheck：docs/onboarding-1/postcheck_20261018090000.sql
-- rollback：docs/onboarding-1/rollback_20261018090000.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_info'
      AND column_name = 'is_active' AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.accommodation_info.is_active 不存在或型別不是 boolean';
  END IF;
  IF to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.is_super_admin(uuid) 不存在';
  END IF;
  IF to_regprocedure('public.accommodation_info_guard_is_active()') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.accommodation_info_guard_is_active() 已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.accommodation_info'::regclass
      AND tgname = 'trg_accommodation_info_guard_is_active'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：trigger trg_accommodation_info_guard_is_active 已存在';
  END IF;
END $$;

CREATE TEMP TABLE _onb1_guard_before AS
SELECT count(*)::bigint AS n_all,
       count(*) FILTER (WHERE is_active)::bigint AS n_active
FROM public.accommodation_info;

-- ============================= CHANGE =============================
CREATE FUNCTION public.accommodation_info_guard_is_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_super_admin(v_uid) THEN
    RETURN NEW;
  END IF;

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
END;
$$;

REVOKE ALL ON FUNCTION public.accommodation_info_guard_is_active() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_accommodation_info_guard_is_active
  BEFORE INSERT OR UPDATE OF is_active ON public.accommodation_info
  FOR EACH ROW EXECUTE FUNCTION public.accommodation_info_guard_is_active();

COMMENT ON FUNCTION public.accommodation_info_guard_is_active() IS
  '上架引導第一批：is_active（開賣）只限 super_admin 變更；auth.uid() 為 NULL 的系統身分不受限';

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_before RECORD;
  v_all bigint;
  v_active bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'public.accommodation_info'::regclass
      AND t.tgname = 'trg_accommodation_info_guard_is_active'
      AND t.tgenabled = 'O'
      AND t.tgfoid = 'public.accommodation_info_guard_is_active()'::regprocedure
      AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT OR UPDATE OF is_active ON public.accommodation_info FOR EACH ROW%'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：trigger 不存在、未啟用或定義不符';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.accommodation_info_guard_is_active()'::regprocedure) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式不是 SECURITY DEFINER';
  END IF;

  SELECT * INTO v_before FROM _onb1_guard_before;
  SELECT count(*), count(*) FILTER (WHERE is_active) INTO v_all, v_active FROM public.accommodation_info;
  IF v_before.n_all <> v_all OR v_before.n_active <> v_active THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：館別數或啟用數改變（% / % → % / %）',
      v_before.n_all, v_before.n_active, v_all, v_active;
  END IF;
END $$;

DROP TABLE _onb1_guard_before;
