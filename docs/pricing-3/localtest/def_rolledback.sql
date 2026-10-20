CREATE OR REPLACE FUNCTION public.update_order_fields_v1(p_order_id uuid, p_patch jsonb, p_source text, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    'order_status','payment_status','order_source',
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
  v_old public.orders%ROWTYPE;
  v_is_atm boolean;
  v_is_card boolean;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: p_order_id 不可為 NULL'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'update_order_fields_v1: 需要登入'; END IF;

  -- 取消防護：團購與信用卡訂單不得由通用欄位更新直接改成 cancelled
  IF (p_patch ? 'order_status') AND p_patch->>'order_status' = 'cancelled' THEN
    SELECT * INTO v_old FROM public.orders WHERE id = p_order_id;
    IF FOUND AND v_old.order_status IS DISTINCT FROM 'cancelled' THEN
      v_is_atm := coalesce(v_old.balance_payment_method in ('atm','ATM','atm_transfer'), false)
               or coalesce(v_old.payment_method in ('atm','ATM','atm_transfer'), false)
               or coalesce(v_old.deposit_payment_method in ('atm','ATM','atm_transfer'), false);

      v_is_card := coalesce(v_old.balance_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or coalesce(v_old.payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or coalesce(v_old.deposit_payment_method in ('credit_card','credit_card_3ds','card','信用卡'), false)
                or v_old.room_charge_rec_trade_id is not null;

      IF v_old.order_source = 'group_buy' OR (NOT v_is_atm AND v_is_card) THEN
        RAISE EXCEPTION 'ORDER_CANCEL_BLOCKED: 此訂單必須使用專屬取消流程';
      END IF;
    END IF;
  END IF;

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
$function$

