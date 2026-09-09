-- V5.5C.2 (2): rename deposit validation trigger so it runs AFTER price recompute
-- PRECHECK
DO $$
DECLARE v_old INT; v_new INT;
BEGIN
  SELECT count(*) INTO v_old FROM pg_trigger
   WHERE tgrelid='public.orders'::regclass AND tgname='trg_validate_order_deposit_on_insert';
  SELECT count(*) INTO v_new FROM pg_trigger
   WHERE tgrelid='public.orders'::regclass AND tgname='zzz_validate_order_deposit_on_insert';
  RAISE NOTICE 'PRECHECK old=% new=%', v_old, v_new;
  IF v_old <> 1 OR v_new <> 0 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: old=% new=% (expected 1 / 0)', v_old, v_new;
  END IF;
END $$;

ALTER TRIGGER trg_validate_order_deposit_on_insert ON public.orders
  RENAME TO zzz_validate_order_deposit_on_insert;

-- POSTCHECK
DO $$
DECLARE v_old INT; v_new INT; v_order TEXT;
BEGIN
  SELECT count(*) INTO v_old FROM pg_trigger
   WHERE tgrelid='public.orders'::regclass AND tgname='trg_validate_order_deposit_on_insert';
  SELECT count(*) INTO v_new FROM pg_trigger
   WHERE tgrelid='public.orders'::regclass AND tgname='zzz_validate_order_deposit_on_insert';
  IF v_old <> 0 OR v_new <> 1 THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: old=% new=%', v_old, v_new;
  END IF;
  SELECT string_agg(tgname, ' > ' ORDER BY tgname) INTO v_order
    FROM pg_trigger
   WHERE tgrelid='public.orders'::regclass AND NOT tgisinternal AND (tgtype & 2) = 2;
  RAISE NOTICE 'POSTCHECK BEFORE-trigger order: %', v_order;
END $$;

-- ROLLBACK (do not run unless reverting):
-- ALTER TRIGGER zzz_validate_order_deposit_on_insert ON public.orders
--   RENAME TO trg_validate_order_deposit_on_insert;