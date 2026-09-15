
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
      AND date = v_current_date;

    IF v_inventory IS NULL THEN
      -- Fallback：檢查定價模板是否涵蓋該日期與房型
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
