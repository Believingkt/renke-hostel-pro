DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_deposit_confirm_date';
  IF v_md5 IS DISTINCT FROM 'c55f05e2e28ed8d71189b89b71f498ed' THEN
    RAISE EXCEPTION 'PRECHECK FAILED: unexpected function md5 %', v_md5;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_deposit_confirm_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status = 'deposit_paid'
     AND (TG_OP = 'INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    INSERT INTO public.order_meta (order_id, accommodation_id, deposit_confirm_date, deposit_confirm_date_verified)
    VALUES (NEW.id, NEW.accommodation_id, (now() AT TIME ZONE 'Asia/Taipei')::date, false)
    ON CONFLICT (order_id) DO UPDATE
      SET deposit_confirm_date = COALESCE(public.order_meta.deposit_confirm_date, EXCLUDED.deposit_confirm_date),
          accommodation_id = COALESCE(public.order_meta.accommodation_id, EXCLUDED.accommodation_id);
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='sync_deposit_confirm_date';
  IF v_def NOT LIKE '%NEW.accommodation_id%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: accommodation_id not present';
  END IF;
  IF v_def NOT LIKE '%COALESCE(public.order_meta.accommodation_id, EXCLUDED.accommodation_id)%' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: conflict clause missing';
  END IF;
END $$;