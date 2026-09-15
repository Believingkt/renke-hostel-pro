CREATE OR REPLACE FUNCTION public.validate_order_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_room_type RECORD;
  v_discount_result RECORD;
  v_calculated_discount INT := 0;
  v_day_price INT;
  v_calculated_total INT := 0;
  v_room_only_total INT := 0;
  v_current_date DATE;
  v_inventory RECORD;
  v_nights INT;
  v_is_past_order BOOLEAN;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    NEW.order_status := COALESCE(NEW.order_status, 'pending');
    NEW.payment_status := COALESCE(NEW.payment_status, 'unpaid');
    NEW.order_source := COALESCE(NEW.order_source, 'website');
    NEW.guest_count := COALESCE(NEW.guest_count, 2);
    NEW.final_price := COALESCE(NEW.final_price, NEW.total_price, 0);
    RETURN NEW;
  END IF;

  IF NEW.guest_name IS NULL OR LENGTH(TRIM(NEW.guest_name)) < 1 THEN
    RAISE EXCEPTION 'Guest name is required';
  END IF;

  IF NEW.guest_phone IS NULL OR LENGTH(TRIM(NEW.guest_phone)) < 8 THEN
    RAISE EXCEPTION 'Valid phone number is required';
  END IF;

  IF NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RAISE EXCEPTION 'Check-in and check-out dates are required';
  END IF;

  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION 'Check-out date must be after check-in date';
  END IF;

  v_is_past_order := NEW.check_in_date < CURRENT_DATE;

  IF NEW.order_source IN ('manual', 'owlting', 'hotelnabe') THEN
    IF NEW.room_type_id IS NOT NULL THEN
      SELECT * INTO v_room_type FROM room_types
      WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id;
      IF v_room_type.id IS NULL THEN RAISE EXCEPTION 'Invalid room type'; END IF;
    END IF;
    NEW.final_price := COALESCE(NEW.final_price, NEW.total_price, 0) - COALESCE(NEW.discount_amount, 0);
    IF NEW.final_price < 0 THEN NEW.final_price := 0; END IF;
    NEW.order_status := COALESCE(NEW.order_status, 'pending');
    NEW.payment_status := COALESCE(NEW.payment_status, 'unpaid');
    NEW.order_source := COALESCE(NEW.order_source, 'website');
    NEW.guest_count := COALESCE(NEW.guest_count, 2);
    RETURN NEW;
  END IF;

  IF NEW.room_type_id IS NOT NULL THEN
    SELECT * INTO v_room_type FROM room_types
    WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id;
    IF v_room_type.id IS NULL THEN RAISE EXCEPTION 'Invalid room type'; END IF;
    -- 入住人數上限改為前端警示，此處不再阻擋
    v_nights := NEW.check_out_date - NEW.check_in_date;
    v_current_date := NEW.check_in_date;
    WHILE v_current_date < NEW.check_out_date LOOP
      SELECT price, available_rooms, is_available INTO v_inventory
      FROM room_inventory_pricing
      WHERE room_type_id = NEW.room_type_id AND date = v_current_date;
      IF v_inventory IS NULL THEN
        v_day_price := v_room_type.base_price;
      ELSIF v_is_past_order THEN
        v_day_price := COALESCE(v_inventory.price, v_room_type.base_price);
      ELSIF v_inventory.is_available = FALSE THEN
        RAISE EXCEPTION 'Room not available on %', v_current_date;
      ELSIF v_inventory.available_rooms <= 0 THEN
        RAISE EXCEPTION 'No rooms available on %', v_current_date;
      ELSE
        v_day_price := v_inventory.price;
      END IF;
      v_room_only_total := v_room_only_total + v_day_price;
      v_current_date := v_current_date + 1;
    END LOOP;
    v_calculated_total := v_room_only_total;
  END IF;

  IF NEW.discount_code IS NOT NULL AND LENGTH(TRIM(NEW.discount_code)) > 0 THEN
    SELECT * INTO v_discount_result FROM validate_discount_code(
      NEW.discount_code,
      NEW.accommodation_id,
      v_calculated_total,
      NEW.check_in_date,
      NEW.check_out_date
    );
    IF v_discount_result.is_valid THEN
      v_calculated_discount := v_discount_result.discount_amount;
    END IF;
  END IF;

  NEW.total_price := v_calculated_total;
  NEW.discount_amount := v_calculated_discount;
  NEW.final_price := GREATEST(0, v_calculated_total - v_calculated_discount);
  NEW.order_status := COALESCE(NEW.order_status, 'pending');
  NEW.payment_status := COALESCE(NEW.payment_status, 'unpaid');
  NEW.order_source := COALESCE(NEW.order_source, 'website');
  NEW.guest_count := COALESCE(NEW.guest_count, 2);

  RETURN NEW;
END;
$function$;