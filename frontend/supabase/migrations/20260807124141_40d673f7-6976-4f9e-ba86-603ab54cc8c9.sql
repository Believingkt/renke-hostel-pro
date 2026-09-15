CREATE OR REPLACE FUNCTION public.calculate_room_remaining(_accommodation_id uuid, _room_type_id uuid, _date date)
 RETURNS TABLE(available_rooms integer, occupied integer, remaining integer, is_available boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _avail int;
  _rip_is_available boolean;
  _has_rip boolean := false;
  _occupied int;
BEGIN
  SELECT rip.available_rooms, rip.is_available, true
    INTO _avail, _rip_is_available, _has_rip
  FROM public.room_inventory_pricing rip
  WHERE rip.room_type_id = _room_type_id
    AND rip.date = _date
    AND rip.pricing_template_id IS NULL
  LIMIT 1;

  IF NOT COALESCE(_has_rip, false) THEN
    SELECT rt.room_count INTO _avail
    FROM public.room_types rt
    WHERE rt.id = _room_type_id;
    _rip_is_available := true;
  END IF;

  _avail := COALESCE(_avail, 0);

  SELECT COALESCE(SUM(orn.quantity), 0)::int INTO _occupied
  FROM public.order_room_nights orn
  WHERE orn.accommodation_id = _accommodation_id
    AND orn.room_type_id = _room_type_id
    AND orn.stay_date = _date;

  available_rooms := _avail;
  occupied := _occupied;
  remaining := GREATEST(_avail - _occupied, 0);
  is_available := COALESCE(_rip_is_available, true) AND (remaining > 0);
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_adjusted_room_inventory(p_room_type_id uuid, p_date date, p_accommodation_id uuid)
 RETURNS TABLE(available_rooms integer, is_blocked boolean, blocked_by_room_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type record;
  v_original_available integer;
  v_self_booked_count integer;
  v_booking_info record;
  v_booked_room record;
BEGIN
  SELECT * INTO v_room_type FROM room_types WHERE id = p_room_type_id;

  SELECT COALESCE(rip.available_rooms, 0)
  INTO v_original_available
  FROM room_inventory_pricing rip
  WHERE rip.room_type_id = p_room_type_id
    AND rip.date = p_date
    AND rip.pricing_template_id IS NULL
  LIMIT 1;

  IF v_original_available IS NULL THEN
    v_original_available := 0;
  END IF;

  SELECT COALESCE(SUM(cnt), 0)::int INTO v_self_booked_count
  FROM (
    SELECT orr.quantity AS cnt
    FROM order_rooms orr
    JOIN orders o ON orr.order_id = o.id
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status NOT IN ('cancelled')
      AND p_date >= o.check_in_date
      AND p_date < o.check_out_date
      AND orr.room_type_id = p_room_type_id
    UNION ALL
    SELECT 1 AS cnt
    FROM orders o
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status NOT IN ('cancelled')
      AND p_date >= o.check_in_date
      AND p_date < o.check_out_date
      AND o.room_type_id = p_room_type_id
      AND NOT EXISTS (SELECT 1 FROM order_rooms orr2 WHERE orr2.order_id = o.id)
  ) t;

  IF v_room_type.is_exclusive_package = true OR v_room_type.is_bound_to_exclusive = true THEN
    SELECT * INTO v_booking_info FROM check_exclusive_room_booking(p_accommodation_id, p_date);

    IF v_booking_info.has_booking THEN
      SELECT is_exclusive_package, is_bound_to_exclusive, name
      INTO v_booked_room
      FROM room_types WHERE id = v_booking_info.booked_room_type_id;

      IF v_booked_room.is_exclusive_package = true THEN
        IF v_booking_info.booked_room_type_id = p_room_type_id THEN
          RETURN QUERY SELECT GREATEST(v_original_available - v_self_booked_count, 0), false, NULL::text;
          RETURN;
        ELSE
          RETURN QUERY SELECT 0, true, v_booking_info.booked_room_type_name;
          RETURN;
        END IF;
      ELSIF v_booked_room.is_bound_to_exclusive = true THEN
        IF v_room_type.is_exclusive_package = true THEN
          RETURN QUERY SELECT 0, true, v_booking_info.booked_room_type_name;
          RETURN;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT GREATEST(v_original_available - v_self_booked_count, 0), false, NULL::text;
END;
$function$;

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
  v_olivia_id constant uuid := '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8';
  v_blocking_order_no text;
  v_available_rooms integer;
  v_template_available boolean;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id, accommodation_id, check_in_date, check_out_date, order_status,
         COALESCE(lock_whole_building, false) AS lock_whole_building,
         order_number
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

  IF v_order.accommodation_id = v_olivia_id THEN
    SELECT o.order_number INTO v_blocking_order_no
    FROM public.orders o
    WHERE o.accommodation_id = v_olivia_id
      AND o.id <> NEW.order_id
      AND o.order_status NOT IN ('cancelled')
      AND COALESCE(o.lock_whole_building, false) = true
      AND o.check_in_date < v_order.check_out_date
      AND o.check_out_date > v_order.check_in_date
    LIMIT 1;

    IF v_blocking_order_no IS NOT NULL THEN
      RAISE EXCEPTION '奧莉薇雅該日期已有包棟訂單（%），整棟已保留，無法新增其他訂單。', v_blocking_order_no
        USING ERRCODE = 'P0001';
    END IF;

    IF v_order.lock_whole_building = true THEN
      SELECT o.order_number INTO v_blocking_order_no
      FROM public.orders o
      WHERE o.accommodation_id = v_olivia_id
        AND o.id <> NEW.order_id
        AND o.order_status NOT IN ('cancelled')
        AND o.check_in_date < v_order.check_out_date
        AND o.check_out_date > v_order.check_in_date
      LIMIT 1;

      IF v_blocking_order_no IS NOT NULL THEN
        RAISE EXCEPTION '本訂單標記為包棟，但奧莉薇雅該日期已有其他訂單（%），無法同時成立。', v_blocking_order_no
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  v_current_date := v_order.check_in_date;
  WHILE v_current_date < v_order.check_out_date LOOP
    SELECT available_rooms, is_available
    INTO v_inventory
    FROM public.room_inventory_pricing
    WHERE room_type_id = NEW.room_type_id
      AND date = v_current_date
      AND pricing_template_id IS NULL
    LIMIT 1;

    IF v_inventory IS NULL THEN
      SELECT
        EXISTS (
          SELECT 1
          FROM public.pricing_templates pt
          WHERE pt.accommodation_id = v_order.accommodation_id
            AND NEW.room_type_id = ANY(pt.room_type_ids)
            AND (pt.valid_from IS NULL OR pt.valid_from <= v_current_date)
            AND (pt.valid_until IS NULL OR pt.valid_until >= v_current_date)
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(pt.excluded_dates) ed
              WHERE ed = v_current_date::text
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.pricing_template_availability pta
              WHERE pta.template_id = pt.id
                AND pta.date = v_current_date
                AND pta.is_closed = true
            )
        ),
        COALESCE(
          (SELECT MAX(pt.available_rooms)
           FROM public.pricing_templates pt
           WHERE pt.accommodation_id = v_order.accommodation_id
             AND NEW.room_type_id = ANY(pt.room_type_ids)
             AND (pt.valid_from IS NULL OR pt.valid_from <= v_current_date)
             AND (pt.valid_until IS NULL OR pt.valid_until >= v_current_date)
          ), 1)
      INTO v_template_available, v_available_rooms;

      IF NOT v_template_available THEN
        RAISE EXCEPTION 'Room not available on %', v_current_date;
      END IF;
    ELSE
      IF v_inventory.is_available = false OR COALESCE(v_inventory.available_rooms, 0) <= 0 THEN
        RAISE EXCEPTION 'Room not available on %', v_current_date;
      END IF;
      v_available_rooms := v_inventory.available_rooms;
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

    IF v_existing_booked + v_order_required > v_available_rooms THEN
      RAISE EXCEPTION 'Inventory exceeded on % for %: remaining %, requested %',
        v_current_date,
        COALESCE(v_room_name, 'room'),
        GREATEST(v_available_rooms - v_existing_booked, 0),
        v_order_required;
    END IF;

    v_current_date := v_current_date + 1;
  END LOOP;

  RETURN NEW;
END;
$function$;