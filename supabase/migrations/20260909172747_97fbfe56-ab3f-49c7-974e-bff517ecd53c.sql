BEGIN;

-- ============ PART 1: alert_recipients 新增 notify_owlting_sync_failure ============
DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 9 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: alert_recipients cols=% (expected 9)', v_cols;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='alert_recipients'
               AND column_name='notify_owlting_sync_failure') THEN
    RAISE EXCEPTION 'PRECHECK FAILED: column already exists';
  END IF;
  RAISE NOTICE 'PRECHECK OK: alert_recipients cols=9';
END $$;

ALTER TABLE public.alert_recipients
  ADD COLUMN notify_owlting_sync_failure boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.alert_recipients.notify_owlting_sync_failure
  IS '是否接收「OTA 同步（OwlTing / HotelNabe）部分失敗」技術告警';

DO $$
DECLARE v_cols int; r record; v_bad int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients';
  IF v_cols <> 10 THEN RAISE EXCEPTION 'POSTCHECK FAILED: cols=%', v_cols; END IF;

  SELECT * INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='alert_recipients'
    AND column_name='notify_owlting_sync_failure';
  IF r IS NULL OR r.data_type <> 'boolean' OR r.is_nullable <> 'NO' OR r.column_default <> 'true' THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: unexpected column def';
  END IF;

  SELECT count(*) INTO v_bad FROM public.alert_recipients
  WHERE notify_owlting_sync_failure IS NOT TRUE;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'POSTCHECK FAILED: % rows not true', v_bad; END IF;
  RAISE NOTICE 'POSTCHECK OK: alert_recipients cols=10';
END $$;

-- ============ PART 2: update_order_with_context 擴充白名單 ============
DO $$
DECLARE v_len int;
BEGIN
  SELECT length(pg_get_functiondef(oid)) INTO v_len FROM pg_proc
  WHERE proname='update_order_with_context' AND pronamespace='public'::regnamespace;
  IF v_len IS NULL THEN RAISE EXCEPTION 'PRECHECK FAILED: function missing'; END IF;
  RAISE NOTICE 'PRECHECK OK: existing definition length=%', v_len;
END $$;

CREATE OR REPLACE FUNCTION public.update_order_with_context(
  p_order_id uuid,
  p_patch jsonb,
  p_source text,
  p_reason text DEFAULT NULL::text,
  p_actor_label text DEFAULT NULL::text,
  p_actor_type text DEFAULT 'system'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    -- 金流／押金／入住扣款（批次一，原樣保留）
    'payment_status','paid_amount','refunded_amount','payment_method',
    'balance_payment_method','deposit_payment_method',
    'order_status','cancelled_at','confirmed_at',
    'refund_status','refunded_at','refund_rec_trade_id',
    'deposit_status','deposit_method','deposit_charged_amount','deposit_charged_at',
    'deposit_refunded_amount','deposit_refunded_at',
    'room_charge_status','room_charge_scheduled_date',
    'room_charge_at','room_charge_rec_trade_id','room_charge_error',
    'notes',
    -- 批次二／三：OTA 同步欄位
    'room_type_id','package_id','check_in_date','check_out_date','guest_count',
    'guest_name','guest_phone','guest_email',
    'total_price','final_price','discount_amount',
    'ota_channel','owlting_reservation_id','owlting_unique_id','owlting_sync_state',
    'hotelnabe_res_id','hotelnabe_last_modify','hotelnabe_sync_state',
    'is_pii_pending','requires_owner_review','internal_email_sent','internal_email_sent_at'
  ];
  v_key text;
  v_type text;
  v_sets text[] := '{}';
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'update_order_with_context: p_order_id 不可為 NULL';
  END IF;

  PERFORM public.set_order_change_context(p_source, p_reason, p_actor_label, p_actor_type);

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_with_context: 欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type
      FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type);
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE public.orders SET %s, updated_at = now() WHERE id = $2',
    array_to_string(v_sets, ', ')
  ) USING p_patch, p_order_id;
END;
$function$;

-- 同一交易內立即收權（規則：SECURITY DEFINER 建立即收權）
REVOKE ALL ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid, jsonb, text, text, text, text)
  TO service_role;

DO $$
DECLARE v_anon bool; v_auth bool; v_svc bool; v_len int; v_has_new bool;
BEGIN
  SELECT length(pg_get_functiondef(oid)),
         pg_get_functiondef(oid) LIKE '%hotelnabe_sync_state%'
    INTO v_len, v_has_new
  FROM pg_proc WHERE proname='update_order_with_context' AND pronamespace='public'::regnamespace;
  IF NOT v_has_new THEN RAISE EXCEPTION 'POSTCHECK FAILED: whitelist not extended'; END IF;

  v_anon := has_function_privilege('anon','public.update_order_with_context(uuid,jsonb,text,text,text,text)','EXECUTE');
  v_auth := has_function_privilege('authenticated','public.update_order_with_context(uuid,jsonb,text,text,text,text)','EXECUTE');
  v_svc  := has_function_privilege('service_role','public.update_order_with_context(uuid,jsonb,text,text,text,text)','EXECUTE');
  IF v_anon OR v_auth OR NOT v_svc THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: privileges anon=% authenticated=% service_role=%', v_anon, v_auth, v_svc;
  END IF;
  RAISE NOTICE 'POSTCHECK OK: def_len=% anon=% authenticated=% service_role=%', v_len, v_anon, v_auth, v_svc;
END $$;

COMMIT;