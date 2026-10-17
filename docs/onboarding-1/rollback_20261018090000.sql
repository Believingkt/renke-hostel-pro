-- rollback：20261018090000_accommodation_is_active_guard.sql
-- 移除 is_active 保護 trigger 與函式；不動任何資料列
BEGIN;

DROP TRIGGER IF EXISTS trg_accommodation_info_guard_is_active ON public.accommodation_info;
DROP FUNCTION IF EXISTS public.accommodation_info_guard_is_active();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.accommodation_info'::regclass
      AND tgname = 'trg_accommodation_info_guard_is_active'
  ) OR to_regprocedure('public.accommodation_info_guard_is_active()') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：trigger 或函式仍存在';
  END IF;
END $$;

COMMIT;
