
CREATE OR REPLACE FUNCTION public.validate_room_unit_no_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_conflict RECORD;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.room_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, check_in_date, check_out_date, order_status
  INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order.id IS NULL OR v_order.order_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT o.order_number, o.guest_name
  INTO v_conflict
  FROM public.order_rooms orr
  JOIN public.orders o ON o.id = orr.order_id
  WHERE orr.room_unit_id = NEW.room_unit_id
    AND orr.id <> NEW.id
    AND o.order_status NOT IN ('cancelled')
    AND o.check_in_date < v_order.check_out_date
    AND o.check_out_date > v_order.check_in_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '此房間單位於該日期區間已被訂單 % (%) 佔用',
      v_conflict.order_number, COALESCE(v_conflict.guest_name, '');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_ryoan_order_bypass(p_order jsonb, p_rooms jsonb, p_meta jsonb)
RETURNS TABLE(out_order_id uuid, out_was_update boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_existing_id uuid;
  v_was_update boolean := false;
  v_order_number text;
BEGIN
  PERFORM set_config('app.bypass_inventory_check', 'on', true);

  v_order_number := p_order->>'order_number';

  SELECT o.id INTO v_existing_id
  FROM public.orders o
  WHERE o.order_number = v_order_number;
  v_was_update := v_existing_id IS NOT NULL;

  INSERT INTO public.orders (
    order_number, accommodation_id, guest_name, guest_phone, guest_count,
    order_date, check_in_date, check_out_date,
    total_price, final_price, paid_amount, deposit_amount,
    order_source, room_type_id, order_status, payment_status,
    notes, discount_code
  ) VALUES (
    v_order_number,
    (p_order->>'accommodation_id')::uuid,
    p_order->>'guest_name',
    COALESCE(p_order->>'guest_phone', '0000000000'),
    COALESCE((p_order->>'guest_count')::int, 1),
    NULLIF(p_order->>'order_date','')::date,
    (p_order->>'check_in_date')::date,
    (p_order->>'check_out_date')::date,
    COALESCE((p_order->>'total_price')::numeric, 0),
    COALESCE((p_order->>'final_price')::numeric, 0),
    0,
    0,
    p_order->>'order_source',
    NULLIF(p_order->>'room_type_id','')::uuid,
    p_order->>'order_status',
    p_order->>'payment_status',
    p_order->>'notes',
    NULLIF(p_order->>'discount_code','')
  )
  ON CONFLICT (order_number) DO UPDATE SET
    total_price     = EXCLUDED.total_price,
    final_price     = EXCLUDED.final_price,
    order_status    = EXCLUDED.order_status,
    payment_status  = EXCLUDED.payment_status,
    notes           = EXCLUDED.notes,
    discount_code   = EXCLUDED.discount_code,
    order_source    = EXCLUDED.order_source,
    check_in_date   = EXCLUDED.check_in_date,
    check_out_date  = EXCLUDED.check_out_date,
    room_type_id    = EXCLUDED.room_type_id
  RETURNING id INTO v_order_id;

  DELETE FROM public.order_rooms orr WHERE orr.order_id = v_order_id;

  IF jsonb_array_length(COALESCE(p_rooms, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.order_rooms (order_id, room_type_id, room_unit_id, quantity, room_price)
    SELECT
      v_order_id,
      (r->>'room_type_id')::uuid,
      NULLIF(r->>'room_unit_id','')::uuid,
      COALESCE((r->>'quantity')::int, 1),
      COALESCE((r->>'room_price')::numeric, 0)
    FROM jsonb_array_elements(p_rooms) r;
  END IF;

  IF p_meta IS NOT NULL THEN
    INSERT INTO public.order_meta (order_id, accommodation_id, addon_amount, import_source)
    VALUES (
      v_order_id,
      (p_meta->>'accommodation_id')::uuid,
      COALESCE((p_meta->>'addon_amount')::numeric, 0),
      p_meta->>'import_source'
    )
    ON CONFLICT (order_id) DO UPDATE SET
      addon_amount  = EXCLUDED.addon_amount,
      import_source = EXCLUDED.import_source;
  END IF;

  out_order_id := v_order_id;
  out_was_update := v_was_update;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) TO service_role;
