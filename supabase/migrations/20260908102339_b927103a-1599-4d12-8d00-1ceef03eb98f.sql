-- V5.5A.8 — alert_recipients 新增 notify_order_rooms_failure
-- 0 業務資料異動（僅 schema 變更）

BEGIN;

-- 1) PRECHECK：目前欄位清單指紋必須 exact match（8 欄）
DO $$
DECLARE v_md5 text; v_cols int;
BEGIN
  SELECT md5(string_agg(column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'-'), ',' ORDER BY ordinal_position)),
         count(*)
    INTO v_md5, v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';

  IF v_cols <> 8 OR v_md5 IS DISTINCT FROM '1dc2bb34db294ed2ef7328f6f1e5f338' THEN
    RAISE EXCEPTION 'V5.5A.8 PRECHECK FAILED: cols=% md5=%', v_cols, v_md5;
  END IF;
  RAISE NOTICE 'V5.5A.8 PRECHECK OK (md5=%)', v_md5;
END $$;

-- 2) 加欄位
ALTER TABLE public.alert_recipients
  ADD COLUMN notify_order_rooms_failure boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alert_recipients.notify_order_rooms_failure
  IS '是否接收「訂單房型明細重建失敗」技術告警（內部收件人用）';

-- 3) POSTCHECK
DO $$
DECLARE v_cols int; v_bad int; r record;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 9 THEN
    RAISE EXCEPTION 'V5.5A.8 POSTCHECK FAILED: cols=%', v_cols;
  END IF;

  SELECT * INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients'
    AND column_name='notify_order_rooms_failure';
  IF r IS NULL OR r.data_type <> 'boolean' OR r.is_nullable <> 'NO' OR r.column_default <> 'true' THEN
    RAISE EXCEPTION 'V5.5A.8 POSTCHECK FAILED: unexpected column def (%/%/%)',
      r.data_type, r.is_nullable, r.column_default;
  END IF;

  SELECT count(*) INTO v_bad FROM public.alert_recipients
  WHERE notify_order_rooms_failure IS NOT TRUE;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'V5.5A.8 POSTCHECK FAILED: % rows not true', v_bad;
  END IF;

  RAISE NOTICE 'V5.5A.8 POSTCHECK OK';
END $$;

COMMIT;