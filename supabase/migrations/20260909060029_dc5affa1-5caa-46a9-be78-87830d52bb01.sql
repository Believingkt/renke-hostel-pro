DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='orders'
               AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'PRECHECK FAIL: column already exists';
  END IF;
  RAISE NOTICE 'PRECHECK PASS: column absent';
END $$;

ALTER TABLE public.orders ADD COLUMN attribution_session_id text;

COMMENT ON COLUMN public.orders.attribution_session_id IS
  '前端 analytics_session_id，僅供驗證 order_attributions 寫入來源，不得對外回傳';

DO $$
DECLARE v int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='orders'
                   AND column_name='attribution_session_id') THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: column missing';
  END IF;
  SELECT count(*) INTO v FROM public.orders WHERE attribution_session_id IS NOT NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAIL: unexpected data %', v; END IF;
  RAISE NOTICE 'POSTCHECK PASS (0 business rows changed)';
END $$;