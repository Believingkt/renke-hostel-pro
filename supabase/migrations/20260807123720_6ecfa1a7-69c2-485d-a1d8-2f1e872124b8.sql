CREATE OR REPLACE FUNCTION public.validate_order_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
  v_nights INT;
  v_is_past_order BOOLEAN;
  v_has_pkg BOOLEAN := FALSE;
  v_pkg_sale NUMERIC := NULL;
  v_pkg_tiers JSONB := NULL;
  v_pkg_required BOOLEAN := FALSE;
  v_channel TEXT := NULL;
  v_dow INT;
  v_tier TEXT;
  v_is_holiday BOOLEAN;
  v_tier_sale NUMERIC;
  v_addons INT := 0;
  v_item JSONB;
  v_inv_found BOOLEAN := FALSE;
  v_inv_price NUMERIC;
  v_inv_rooms INT;
  v_inv_available BOOLEAN;
  v_qty INT := 1;
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
    RAISE EXCEPTION '請填寫訂購人姓名' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.guest_phone IS NULL OR LENGTH(TRIM(NEW.guest_phone)) < 8 THEN
    RAISE EXCEPTION '請填寫正確的聯絡電話（至少 8 碼）' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.check_in_date IS NULL OR NEW.check_out_date IS NULL THEN
    RAISE EXCEPTION '請選擇入住與退房日期' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION '退房日期必須晚於入住日期' USING ERRCODE = 'P0001';
  END IF;

  v_qty := GREATEST(1, COALESCE(NEW.room_quantity, 1));
  NEW.room_quantity := v_qty;
  v_is_past_order := NEW.check_in_date < CURRENT_DATE;

  IF NEW.order_source IN ('manual', 'owlting', 'hotelnabe') THEN
    IF NEW.room_type_id IS NOT NULL THEN
      SELECT * INTO v_room_type FROM public.room_types
      WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION '房型無效，請重新選擇房型' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    NEW.final_price := COALESCE(NEW.final_price, NEW.total_price, 0) - COALESCE(NEW.discount_amount, 0);
    IF NEW.final_price < 0 THEN NEW.final_price := 0; END IF;
    NEW.order_status := COALESCE(NEW.order_status, 'pending');
    NEW.payment_status := COALESCE(NEW.payment_status, 'unpaid');
    NEW.order_source := COALESCE(NEW.order_source, 'website');
    NEW.guest_count := COALESCE(NEW.guest_count, 2);
    RETURN NEW;
  END IF;

  v_addons := COALESCE(NEW.pet_plan_price, 0)::INT + COALESCE(NEW.meal_plan_total, 0)::INT;
  IF NEW.custom_addon_details IS NOT NULL AND jsonb_typeof(NEW.custom_addon_details) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.custom_addon_details) LOOP
      v_addons := v_addons + COALESCE((v_item->>'total')::NUMERIC, 0)::INT;
    END LOOP;
  END IF;

  IF NEW.package_id IS NOT NULL THEN
    SELECT sale_price, tier_prices INTO v_pkg_sale, v_pkg_tiers
    FROM public.accommodation_packages
    WHERE id = NEW.package_id AND accommodation_id = NEW.accommodation_id;
    v_has_pkg := FOUND;
    IF NOT v_has_pkg THEN
      RAISE EXCEPTION '入住方案無效，請重新選擇入住方案' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.room_type_id IS NOT NULL THEN
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.accommodation_owlting_config c
      WHERE c.accommodation_id = NEW.accommodation_id AND c.sync_enabled = TRUE
    ) THEN '奧丁丁' ELSE NULL END INTO v_channel;

    IF v_channel IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.accommodation_packages p
        WHERE p.accommodation_id = NEW.accommodation_id
          AND p.enabled = TRUE
          AND p.room_type_ids IS NOT NULL
          AND NEW.room_type_id::text = ANY (
            SELECT jsonb_array_elements_text(to_jsonb(p.room_type_ids))
          )
      ) INTO v_pkg_required;
      IF v_pkg_required THEN
        RAISE EXCEPTION '此房型會同步到 %，請先選擇對應方案', v_channel USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF NEW.room_type_id IS NOT NULL THEN
    SELECT * INTO v_room_type FROM public.room_types
    WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '房型無效，請重新選擇房型' USING ERRCODE = 'P0001';
    END IF;

    IF v_qty > GREATEST(1, COALESCE(v_room_type.room_count, 1)) THEN
      RAISE EXCEPTION '訂購間數（% 間）超過此房型實際房間數（% 間）',
        v_qty, GREATEST(1, COALESCE(v_room_type.room_count, 1)) USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(v_room_type.capacity, 0) > 0
       AND COALESCE(NEW.guest_count, 0) > v_room_type.capacity * v_qty THEN
      RAISE EXCEPTION '入住人數（% 人）超過上限：此房型每間最多 % 人，共 % 間，上限 % 人',
        NEW.guest_count, v_room_type.capacity, v_qty, v_room_type.capacity * v_qty
        USING ERRCODE = 'P0001';
    END IF;

    v_nights := NEW.check_out_date - NEW.check_in_date;
    v_current_date := NEW.check_in_date;
    WHILE v_current_date < NEW.check_out_date LOOP
      v_inv_price := NULL;
      v_inv_rooms := NULL;
      v_inv_available := NULL;
      SELECT rip.price, rip.available_rooms, rip.is_available
        INTO v_inv_price, v_inv_rooms, v_inv_available
      FROM public.room_inventory_pricing rip
      WHERE rip.room_type_id = NEW.room_type_id
        AND rip.date = v_current_date
        AND rip.pricing_template_id IS NULL
      LIMIT 1;
      v_inv_found := FOUND;

      IF v_inv_found AND NOT v_is_past_order THEN
        IF v_inv_available = FALSE THEN
          RAISE EXCEPTION '% 該日房型已關閉銷售，無法建立訂單', to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        ELSIF COALESCE(v_inv_rooms, 0) <= 0 THEN
          RAISE EXCEPTION '% 該日已無可售房間', to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        ELSIF COALESCE(v_inv_rooms, 0) < v_qty THEN
          RAISE EXCEPTION '% 該日僅剩 % 間，不足您訂購的 % 間',
            to_char(v_current_date, 'YYYY-MM-DD'), COALESCE(v_inv_rooms, 0), v_qty USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF v_has_pkg AND v_pkg_sale IS NOT NULL THEN
        SELECT EXTRACT(DOW FROM v_current_date)::INT INTO v_dow;
        SELECT EXISTS (
          SELECT 1 FROM public.public_holidays
          WHERE accommodation_id = NEW.accommodation_id
            AND holiday_date = v_current_date
            AND holiday_type IN ('holiday', 'compensatory_day_off')
        ) INTO v_is_holiday;
        IF v_is_holiday OR v_dow = 6 THEN
          v_tier := 'weekend';
        ELSIF v_dow = 5 OR v_dow = 0 THEN
          v_tier := 'friday_sunday';
        ELSE
          v_tier := 'weekday';
        END IF;
        v_tier_sale := NULLIF(v_pkg_tiers -> v_tier ->> 'sale', '')::NUMERIC;
        v_day_price := COALESCE(v_tier_sale, v_pkg_sale)::INT;
      ELSIF NOT v_inv_found THEN
        v_day_price := v_room_type.base_price;
      ELSE
        v_day_price := COALESCE(v_inv_price, v_room_type.base_price)::INT;
      END IF;

      v_room_only_total := v_room_only_total + v_day_price;
      v_current_date := v_current_date + 1;
    END LOOP;
    v_calculated_total := (v_room_only_total * v_qty) + v_addons;
  ELSE
    v_calculated_total := COALESCE(NEW.total_price, 0);
  END IF;

  IF NEW.discount_code IS NOT NULL AND LENGTH(TRIM(NEW.discount_code)) > 0 THEN
    SELECT * INTO v_discount_result FROM public.validate_discount_code(
      p_code => NEW.discount_code,
      p_accommodation_id => NEW.accommodation_id,
      p_order_amount => v_calculated_total,
      p_room_type_id => NEW.room_type_id,
      p_check_in_date => NEW.check_in_date
    );
    IF v_discount_result.is_valid THEN
      IF v_discount_result.discount_type = 'percentage' THEN
        v_calculated_discount := ROUND((v_calculated_total * v_discount_result.discount_value / 100.0)::numeric);
      ELSE
        v_calculated_discount := v_discount_result.discount_value;
      END IF;
      v_calculated_discount := GREATEST(0, LEAST(v_calculated_discount, v_calculated_total));
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