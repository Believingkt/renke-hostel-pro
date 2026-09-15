-- V5.5A.8 ROLLBACK — 移除 alert_recipients.notify_order_rooms_failure
-- 0 業務資料異動

BEGIN;

-- 1) PRECHECK：欄位必須存在且為本次新增的定義
DO $$
DECLARE r record; v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 9 THEN
    RAISE EXCEPTION 'V5.5A.8 ROLLBACK PRECHECK FAILED: cols=%', v_cols;
  END IF;

  SELECT * INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients'
    AND column_name='notify_order_rooms_failure';
  IF r IS NULL OR r.data_type <> 'boolean' OR r.is_nullable <> 'NO' OR r.column_default <> 'true' THEN
    RAISE EXCEPTION 'V5.5A.8 ROLLBACK PRECHECK FAILED: unexpected column def';
  END IF;
END $$;

-- 2) 移除欄位
ALTER TABLE public.alert_recipients DROP COLUMN notify_order_rooms_failure;

-- 3) POSTCHECK：欄位數與指紋必須回到 V5.5A.8 之前
DO $$
DECLARE v_md5 text; v_cols int;
BEGIN
  SELECT md5(string_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'-'), ',' ORDER BY ordinal_position)),
         count(*)
    INTO v_md5, v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';

  IF v_cols <> 8 OR v_md5 IS DISTINCT FROM '1dc2bb34db294ed2ef7328f6f1e5f338' THEN
    RAISE EXCEPTION 'V5.5A.8 ROLLBACK POSTCHECK FAILED: cols=% md5=%', v_cols, v_md5;
  END IF;
  RAISE NOTICE 'V5.5A.8 ROLLBACK POSTCHECK OK';
END $$;

COMMIT;
