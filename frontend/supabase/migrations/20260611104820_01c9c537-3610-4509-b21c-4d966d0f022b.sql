
-- 1) Trigger 函數加入旗標跳過
CREATE OR REPLACE FUNCTION public.validate_order_rooms_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_current_date date;
  v_inventory record;
  v_existing_booked integer;
  v_order_required integer;
  v_room_name text;
BEGIN
  -- 匯入旗標：略過庫存檢查
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id, accommodation_id, check_in_date, check_out_date, order_status
  INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Room quantity must be greater than zero';
  END IF;

  IF v_order.order_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_room_name
  FROM public.room_types
  WHERE id = NEW.room_type_id;

  v_current_date := v_order.check_in_date;
  WHILE v_current_date < v_order.check_out_date LOOP
    SELECT available_rooms, is_available
    INTO v_inventory
    FROM public.room_inventory_pricing
    WHERE room_type_id = NEW.room_type_id
      AND date = v_current_date;

    IF v_inventory IS NULL OR v_inventory.is_available = false OR COALESCE(v_inventory.available_rooms, 0) <= 0 THEN
      RAISE EXCEPTION 'Room not available on %', v_current_date;
    END IF;

    SELECT COALESCE(SUM(oroom.quantity), 0)
    INTO v_existing_booked
    FROM public.order_rooms oroom
    JOIN public.orders o ON o.id = oroom.order_id
    WHERE o.accommodation_id = v_order.accommodation_id
      AND o.id <> NEW.order_id
      AND o.order_status IN ('hold', 'pending', 'confirmed')
      AND oroom.room_type_id = NEW.room_type_id
      AND o.check_in_date <= v_current_date
      AND o.check_out_date > v_current_date;

    SELECT COALESCE(SUM(oroom.quantity), 0)
    INTO v_order_required
    FROM public.order_rooms oroom
    WHERE oroom.order_id = NEW.order_id
      AND oroom.room_type_id = NEW.room_type_id;

    IF TG_OP = 'INSERT' THEN
      v_order_required := v_order_required + NEW.quantity;
    ELSIF TG_OP = 'UPDATE' THEN
      v_order_required := v_order_required - COALESCE(OLD.quantity, 0) + NEW.quantity;
    END IF;

    IF v_existing_booked + v_order_required > v_inventory.available_rooms THEN
      RAISE EXCEPTION 'Inventory exceeded on % for %: remaining %, requested %',
        v_current_date,
        COALESCE(v_room_name, 'room'),
        GREATEST(v_inventory.available_rooms - v_existing_booked, 0),
        v_order_required;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- 2) 匯入 RPC：改用旗標、不再嘗試改 session_replication_role
CREATE OR REPLACE FUNCTION public.import_ryoan_order_bypass(p_order jsonb, p_rooms jsonb, p_meta jsonb)
RETURNS TABLE(order_id uuid, was_update boolean)
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
  -- 設定匯入旗標（LOCAL：僅在當前 transaction 生效，不影響其他 session）
  PERFORM set_config('app.bypass_inventory_check', 'on', true);

  v_order_number := p_order->>'order_number';

  SELECT id INTO v_existing_id FROM public.orders WHERE order_number = v_order_number;
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
    COALESCE((p_order->>'final_price')::numeric, 0),
    COALESCE((p_order->>'final_price')::numeric, 0),
    CASE WHEN p_order->>'payment_status' = 'paid'
         THEN COALESCE((p_order->>'final_price')::numeric, 0) ELSE 0 END,
    0,
    p_order->>'order_source',
    NULLIF(p_order->>'room_type_id','')::uuid,
    p_order->>'order_status',
    p_order->>'payment_status',
    p_order->>'notes',
    NULLIF(p_order->>'discount_code','')
  )
  ON CONFLICT (order_number) DO UPDATE SET
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

  DELETE FROM public.order_rooms WHERE order_id = v_order_id;

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

  RETURN QUERY SELECT v_order_id, v_was_update;
END;
$function$;

-- 3) 權限收斂：僅 service_role 可執行
REVOKE ALL ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_ryoan_order_bypass(jsonb, jsonb, jsonb) TO service_role;
