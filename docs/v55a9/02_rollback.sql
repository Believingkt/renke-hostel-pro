-- V5.5A.9 rollback（設計稿，尚未執行）
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='sync_order_rooms_v1'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK FAILED: function 不存在';
  END IF;
END $$;

DROP FUNCTION public.sync_order_rooms_v1(uuid, timestamptz, jsonb);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='sync_order_rooms_v1'
  ) THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK FAILED: function 仍存在';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid='public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK FAILED: triggers 數量異常';
  END IF;
END $$;

COMMIT;
