DO $$
DECLARE v_md5 text; v_len int; v_secdef boolean;
BEGIN
  SELECT md5(p.prosrc), length(p.prosrc), p.prosecdef INTO v_md5, v_len, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='update_order_fields_v1' AND n.nspname='public';
  RAISE NOTICE 'precheck: md5=% length=% prosecdef=%', v_md5, v_len, v_secdef;
  IF v_secdef THEN RAISE EXCEPTION 'precheck failed: 預期 SECURITY INVOKER'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_order_fields_v1(p_order_id uuid, p_patch jsonb, p_source text, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
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
    'final_price','deposit_amount','paid_amount','customer_id','member_id','notes',
    'guest_gender','guest_address','guest_nationality',
    'deposit_payment_method','balance_payment_method'
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

DO $$
DECLARE v_md5 text; v_len int; v_secdef boolean; v_acl text;
BEGIN
  SELECT md5(p.prosrc), length(p.prosrc), p.prosecdef, p.proacl::text
    INTO v_md5, v_len, v_secdef, v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='update_order_fields_v1' AND n.nspname='public';
  RAISE NOTICE 'postcheck: md5=% length=% prosecdef=% acl=%', v_md5, v_len, v_secdef, v_acl;
  IF v_secdef THEN RAISE EXCEPTION 'postcheck failed: prosecdef 變更為 true'; END IF;
END $$;