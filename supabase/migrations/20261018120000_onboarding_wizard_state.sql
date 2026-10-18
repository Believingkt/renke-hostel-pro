-- ============================================================
-- 上架精靈 2b＋2c ①：送審狀態與「是否曾開賣」
--   1. accommodation_info.first_activated_at（第一次開賣時間）
--      回填：套用當下已存在的館，除了測試館 ea55e271-15f8-4e63-9c4f-69fbd2022bc5，一律視為曾開賣
--            時間 = 最早一筆訂單 created_at；沒有訂單 = 套用時間 now()
--   2. accommodation_onboarding_steps：status 新增 submitted / returned；
--      新增 submitted_at、submitted_by、returned_at、returned_by、return_reason
--   3. trigger：final_check 的送審／退回狀態與相關欄位只能由 wizard_submit / wizard_return 修改
--      （函式內以 set_config('lakeze.wizard_write','on',true) 標記；auth.uid() 為空的系統身分不受限）
-- precheck：docs/onboarding-3/precheck_20261018120000.sql
-- postcheck：docs/onboarding-3/postcheck_20261018120000.sql
-- rollback：docs/onboarding-3/rollback_20261018120000.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'accommodation_info' AND column_name = 'first_activated_at') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info.first_activated_at 已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'accommodation_onboarding_steps' AND column_name = 'return_reason') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_onboarding_steps.return_reason 已存在';
  END IF;
  IF to_regclass('public.accommodation_onboarding_steps') IS NULL OR to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_onboarding_steps / orders 不存在';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.accommodation_onboarding_steps'::regclass
                   AND conname = 'accommodation_onboarding_steps_status_check') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_onboarding_steps_status_check 不存在';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_onboarding_steps
             WHERE status NOT IN ('pending', 'confirmed', 'not_applicable')) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_onboarding_steps 有非預期的 status';
  END IF;
END $$;

-- ============================= CHANGE =============================
ALTER TABLE public.accommodation_info ADD COLUMN first_activated_at timestamptz;

COMMENT ON COLUMN public.accommodation_info.first_activated_at IS
  '第一次核准開賣時間；NULL = 從未開賣（M3 首次核准硬擋只套用在 NULL 的館）';

UPDATE public.accommodation_info a
SET first_activated_at = COALESCE(
  (SELECT min(o.created_at) FROM public.orders o WHERE o.accommodation_id = a.id),
  now()
)
WHERE a.id <> 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'::uuid;

ALTER TABLE public.accommodation_onboarding_steps
  DROP CONSTRAINT accommodation_onboarding_steps_status_check,
  ADD CONSTRAINT accommodation_onboarding_steps_status_check
    CHECK (status IN ('pending', 'confirmed', 'not_applicable', 'submitted', 'returned')),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN submitted_by uuid,
  ADD COLUMN returned_at timestamptz,
  ADD COLUMN returned_by uuid,
  ADD COLUMN return_reason text;

CREATE FUNCTION public.onboarding_steps_guard_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('lakeze.wizard_write', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF COALESCE(NEW.step_key, OLD.step_key) <> 'final_check' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('submitted', 'returned') OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL
       OR NEW.returned_at IS NOT NULL OR NEW.returned_by IS NOT NULL OR NEW.return_reason IS NOT NULL THEN
      RAISE EXCEPTION '送審與退回只能透過上架精靈（wizard_submit / wizard_return）' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('submitted', 'returned') OR NEW.status IN ('submitted', 'returned')
       OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.returned_at IS DISTINCT FROM OLD.returned_at OR NEW.returned_by IS DISTINCT FROM OLD.returned_by
       OR NEW.return_reason IS DISTINCT FROM OLD.return_reason THEN
      RAISE EXCEPTION '送審與退回只能透過上架精靈（wizard_submit / wizard_return）' USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status IN ('submitted', 'returned') THEN
    RAISE EXCEPTION '送審與退回只能透過上架精靈（wizard_submit / wizard_return）' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_steps_guard_review() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_onboarding_steps_guard_review
  BEFORE INSERT OR UPDATE OR DELETE ON public.accommodation_onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.onboarding_steps_guard_review();

-- ============================= 套用後檢查 =============================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.accommodation_info
             WHERE id <> 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5'::uuid AND first_activated_at IS NULL) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有既有館 first_activated_at 為 NULL';
  END IF;
END $$;
