BEGIN;

DO $$
DECLARE r record; BEGIN
  RAISE NOTICE 'PRECHECK ---';
  FOR r IN select p.oid::regprocedure::text as sig, p.prosecdef, coalesce(p.proacl::text,'(null)') as acl
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('update_order_with_context','update_order_fields_v1','change_order_dates')
  LOOP RAISE NOTICE 'PRECHECK % secdef=% acl=%', r.sig, r.prosecdef, r.acl; END LOOP;
END $$;

-- (1) 服務端 RPC：擴充白名單 + 併發護欄 + 回傳筆數
CREATE OR REPLACE FUNCTION public.update_order_with_context(
  p_order_id uuid, p_patch jsonb, p_source text,
  p_reason text DEFAULT NULL, p_actor_label text DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_expect jsonb DEFAULT NULL,
  p_not jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    'payment_status','paid_amount','refunded_amount','payment_method',
    'balance_payment_method','deposit_payment_method',
    'order_status','cancelled_at','confirmed_at',
    'refund_status','refunded_at','refund_rec_trade_id',
    'deposit_status','deposit_method','deposit_charged_amount','deposit_charged_at',
    'deposit_refunded_amount','deposit_refunded_at',
    'room_charge_status','room_charge_scheduled_date',
    'room_charge_at','room_charge_rec_trade_id','room_charge_error',
    'notes',
    'room_type_id','package_id','check_in_date','check_out_date','guest_count',
    'guest_name','guest_phone','guest_email',
    'total_price','final_price','discount_amount',
    'ota_channel','owlting_reservation_id','owlting_unique_id','owlting_sync_state',
    'hotelnabe_res_id','hotelnabe_last_modify','hotelnabe_sync_state',
    'is_pii_pending','requires_owner_review','internal_email_sent','internal_email_sent_at',
    'refund_fee_amount','cancellation_fee_amount','cancellation_fee_percent','member_id'
  ];
  v_key text; v_type text; v_sets text[] := '{}'; v_where text[] := '{}'; v_n integer;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'update_order_with_context: p_order_id 不可為 NULL';
  END IF;

  PERFORM public.set_order_change_context(p_source, p_reason, p_actor_label, p_actor_type);

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_with_context: 欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type);
  END LOOP;

  IF array_length(v_sets, 1) IS NULL THEN RETURN 0; END IF;

  FOR v_key IN SELECT jsonb_object_keys(COALESCE(p_expect,'{}'::jsonb)) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_with_context: 護欄欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_where := v_where || format('%I IS NOT DISTINCT FROM ($3->>%L)::%s', v_key, v_key, v_type);
  END LOOP;
  FOR v_key IN SELECT jsonb_object_keys(COALESCE(p_not,'{}'::jsonb)) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_with_context: 護欄欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_where := v_where || format('%I IS DISTINCT FROM ($4->>%L)::%s', v_key, v_key, v_type);
  END LOOP;

  EXECUTE format(
    'UPDATE public.orders SET %s, updated_at = now() WHERE id = $2%s',
    array_to_string(v_sets, ', '),
    CASE WHEN array_length(v_where,1) IS NULL THEN ''
         ELSE ' AND ' || array_to_string(v_where, ' AND ') END
  ) USING p_patch, p_order_id, p_expect, p_not;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)
  TO service_role;
DROP FUNCTION IF EXISTS public.update_order_with_context(uuid,jsonb,text,text,text,text);

-- (2) change_order_dates：內部設 context
CREATE OR REPLACE FUNCTION public.change_order_dates(
  _order_id uuid, _new_check_in date, _new_check_out date,
  _source text DEFAULT 'change_order_dates',
  _reason text DEFAULT NULL,
  _actor_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_room record;
BEGIN
  IF _new_check_in IS NULL OR _new_check_out IS NULL THEN
    RAISE EXCEPTION '入住/退房日期不可為空' USING ERRCODE = 'P0001';
  END IF;
  IF _new_check_out <= _new_check_in THEN
    RAISE EXCEPTION '退房日期必須晚於入住日期' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.set_order_change_context(
    COALESCE(_source, 'change_order_dates'), _reason, _actor_label,
    CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'user' END
  );

  SELECT id, accommodation_id, check_in_date, check_out_date, order_status,
         order_source, payment_status, order_number
    INTO v_order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION '訂單不存在' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RAISE EXCEPTION '已取消的訂單無法改期' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.check_in_date = _new_check_in AND v_order.check_out_date = _new_check_out THEN
    RAISE EXCEPTION '新舊日期相同，不需改期' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.orders
     SET check_in_date = _new_check_in,
         check_out_date = _new_check_out,
         updated_at = now()
   WHERE id = _order_id;

  FOR v_room IN SELECT id FROM public.order_rooms WHERE order_id = _order_id LOOP
    UPDATE public.order_rooms
       SET quantity = quantity
     WHERE id = v_room.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', _order_id,
    'order_number', v_order.order_number,
    'accommodation_id', v_order.accommodation_id,
    'order_source', v_order.order_source,
    'old_check_in', v_order.check_in_date,
    'old_check_out', v_order.check_out_date,
    'new_check_in', _new_check_in,
    'new_check_out', _new_check_out
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.change_order_dates(uuid,date,date);
REVOKE ALL ON FUNCTION public.change_order_dates(uuid,date,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_order_dates(uuid,date,date,text,text,text) TO authenticated, service_role;

-- (3) 前端專用 INVOKER RPC
CREATE OR REPLACE FUNCTION public.update_order_fields_v1(
  p_order_id uuid, p_patch jsonb, p_source text, p_reason text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    'order_status','payment_status','order_source','owner_direct',
    'order_date','confirmed_at','checked_in_at','checked_out_at','cancelled_at',
    'check_in_date','check_out_date','room_type_id','package_id',
    'display_room_type_name','room_quantity','lock_whole_building',
    'guest_name','guest_phone','guest_email','guest_count',
    'adult_count','child_count','toddler_count','infant_count',
    'pet_count','pet_plan_price','meal_plan','meal_plan_total','meal_plan_details',
    'custom_addon_details','total_price','discount_amount','discount_code',
    'final_price','deposit_amount','paid_amount','customer_id','member_id','notes'
  ];
  v_key text; v_type text; v_sets text[] := '{}'; v_n integer;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: p_order_id 不可為 NULL'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: 需要登入'; END IF;

  PERFORM public.set_order_change_context(p_source, p_reason, NULL, 'user');

  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(c_allowed)) THEN
      RAISE EXCEPTION 'update_order_fields_v1: 欄位不在白名單內 (%)', v_key;
    END IF;
    SELECT atttypid::regtype::text INTO v_type FROM pg_attribute
     WHERE attrelid = 'public.orders'::regclass AND attname = v_key AND attnum > 0;
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type);
  END LOOP;
  IF array_length(v_sets, 1) IS NULL THEN RETURN 0; END IF;

  EXECUTE format('UPDATE public.orders SET %s, updated_at = now() WHERE id = $2',
                 array_to_string(v_sets, ', ')) USING p_patch, p_order_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'update_order_fields_v1: 無權限或訂單不存在'; END IF;
  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_order_fields_v1(uuid,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid,jsonb,text,text) TO authenticated, service_role;

-- POSTCHECK
DO $$
DECLARE r record; v_cnt int;
BEGIN
  FOR r IN select p.oid, p.oid::regprocedure::text as sig, p.prosecdef, coalesce(p.proacl::text,'(null)') as acl,
                  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
                  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
                  has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_x
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('update_order_with_context','update_order_fields_v1','change_order_dates')
  LOOP
    RAISE NOTICE 'POSTCHECK % secdef=% anon=% auth=% svc=% acl=%', r.sig, r.prosecdef, r.anon_x, r.auth_x, r.svc_x, r.acl;
    IF r.anon_x THEN RAISE EXCEPTION 'POSTCHECK 失敗：% 仍有 anon EXECUTE', r.sig; END IF;
    IF r.acl LIKE '{=X/%' OR r.acl LIKE '%,=X/%' THEN RAISE EXCEPTION 'POSTCHECK 失敗：% 仍有 PUBLIC EXECUTE', r.sig; END IF;
  END LOOP;

  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_order_with_context';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context 簽章數 = %', v_cnt; END IF;

  SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='change_order_dates';
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'POSTCHECK 失敗：change_order_dates 簽章數 = %', v_cnt; END IF;

  IF has_function_privilege('authenticated','public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context 仍有 authenticated EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role','public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_with_context service_role 無權限';
  END IF;
  IF NOT has_function_privilege('authenticated','public.update_order_fields_v1(uuid,jsonb,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_order_fields_v1 authenticated 無權限';
  END IF;
  IF NOT has_function_privilege('authenticated','public.change_order_dates(uuid,date,date,text,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：change_order_dates authenticated 無權限';
  END IF;
  RAISE NOTICE 'POSTCHECK PASS';
END $$;

COMMIT;