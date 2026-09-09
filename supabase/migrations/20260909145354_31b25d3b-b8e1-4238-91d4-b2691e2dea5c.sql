CREATE OR REPLACE FUNCTION public.update_order_with_context(
  p_order_id uuid,
  p_patch jsonb,
  p_source text,
  p_reason text DEFAULT NULL,
  p_actor_label text DEFAULT NULL,
  p_actor_type text DEFAULT 'system'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  c_allowed CONSTANT text[] := ARRAY[
    'payment_status','paid_amount','refunded_amount','payment_method',
    'balance_payment_method','deposit_payment_method',
    'order_status','cancelled_at','confirmed_at',
    'refund_status','refunded_at','refund_rec_trade_id',
    'deposit_status','deposit_method','deposit_charged_amount','deposit_charged_at',
    'deposit_refunded_amount','deposit_refunded_at',
    'room_charge_status','room_charge_scheduled_date',
    'notes'
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
$fn$;

REVOKE ALL ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_order_with_context(uuid,jsonb,text,text,text,text) TO service_role;