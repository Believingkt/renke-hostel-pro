DO $pre$ BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='owlting_email_orders_raw' AND column_name='mail_sent_at') THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK：已是回滾後狀態';
  END IF;
END $pre$;
DROP FUNCTION IF EXISTS public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb);
ALTER TABLE public.owlting_email_orders_raw DROP COLUMN IF EXISTS mail_sent_at;
DO $post$ BEGIN
  IF to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='owlting_email_orders_raw' AND column_name='mail_sent_at') THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK：仍有殘留';
  END IF;
  IF md5(pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)'))) <> '8cc1ae289015f64c2d16801600af8cb2'
     OR md5(pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)'))) <> '7d7e88fcecddcab46c798c5916a1bed0' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK：既有函式指紋改變';
  END IF;
END $post$;
