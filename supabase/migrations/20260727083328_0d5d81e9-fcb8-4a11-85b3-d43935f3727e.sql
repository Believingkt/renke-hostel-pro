-- 1) 主驗證函式：訊息中文化（邏輯不變）
CREATE OR REPLACE FUNCTION public.validate_order_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_pkg RECORD;
  v_has_pkg BOOLEAN := FALSE;
  v_pkg_required BOOLEAN := FALSE;
  v_channel TEXT := NULL;
  v_dow INT;
  v_tier TEXT;
  v_is_holiday BOOLEAN;
  v_tier_sale NUMERIC;
  v_addons INT := 0;
  v_item JSONB;
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

  v_is_past_order := NEW.check_in_date < CURRENT_DATE;

  IF NEW.order_source IN ('manual', 'owlting', 'hotelnabe') THEN
    IF NEW.room_type_id IS NOT NULL THEN
      SELECT * INTO v_room_type FROM public.room_types
      WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id;
      IF v_room_type.id IS NULL THEN
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
    SELECT sale_price, tier_prices INTO v_pkg
    FROM public.accommodation_packages
    WHERE id = NEW.package_id AND accommodation_id = NEW.accommodation_id;
    v_has_pkg := FOUND;
    IF NOT v_has_pkg THEN
      RAISE EXCEPTION '入住方案無效，請重新選擇入住方案' USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.room_type_id IS NOT NULL THEN
    -- 僅在該民宿有啟用「奧丁丁」同步時，才要求必填對應方案。
    SELECT CASE
      WHEN EXISTS (
        SELECT 1 FROM public.accommodation_owlting_config c
        WHERE c.accommodation_id = NEW.accommodation_id AND c.sync_enabled = TRUE
      ) THEN '奧丁丁'
      ELSE NULL
    END INTO v_channel;

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
    IF v_room_type.id IS NULL THEN
      RAISE EXCEPTION '房型無效，請重新選擇房型' USING ERRCODE = 'P0001';
    END IF;
    v_nights := NEW.check_out_date - NEW.check_in_date;
    v_current_date := NEW.check_in_date;
    WHILE v_current_date < NEW.check_out_date LOOP
      SELECT price, available_rooms, is_available INTO v_inventory
      FROM public.room_inventory_pricing
      WHERE room_type_id = NEW.room_type_id AND date = v_current_date;

      IF v_inventory IS NOT NULL AND NOT v_is_past_order THEN
        IF v_inventory.is_available = FALSE THEN
          RAISE EXCEPTION '% 該日房型已關閉銷售，無法建立訂單', to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        ELSIF v_inventory.available_rooms <= 0 THEN
          RAISE EXCEPTION '% 該日已無可售房間', to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        END IF;
      END IF;

      IF v_has_pkg AND v_pkg.sale_price IS NOT NULL THEN
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

        v_tier_sale := NULLIF(v_pkg.tier_prices -> v_tier ->> 'sale', '')::NUMERIC;
        v_day_price := COALESCE(v_tier_sale, v_pkg.sale_price)::INT;
      ELSIF v_inventory IS NULL THEN
        v_day_price := v_room_type.base_price;
      ELSE
        v_day_price := COALESCE(v_inventory.price, v_room_type.base_price);
      END IF;

      v_room_only_total := v_room_only_total + v_day_price;
      v_current_date := v_current_date + 1;
    END LOOP;
    v_calculated_total := v_room_only_total + v_addons;
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

-- 2) 舊版基本檢查函式：訊息中文化（邏輯不變）
CREATE OR REPLACE FUNCTION public.validate_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info
    WHERE id = NEW.accommodation_id AND is_active = true
  ) THEN
    RAISE EXCEPTION '此民宿不存在或已停用，無法建立訂單' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.room_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.room_types
    WHERE id = NEW.room_type_id AND accommodation_id = NEW.accommodation_id
  ) THEN
    RAISE EXCEPTION '房型無效，請重新選擇房型' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.guest_name IS NULL OR NEW.guest_name = '' THEN
    RAISE EXCEPTION '請填寫訂購人姓名' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.guest_phone IS NULL OR NEW.guest_phone = '' THEN
    RAISE EXCEPTION '請填寫聯絡電話' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION '退房日期必須晚於入住日期' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.total_price < 0 OR NEW.final_price < 0 THEN
    RAISE EXCEPTION '訂單金額不可為負數' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) 付款欄位同步：訊息中文化（邏輯不變）
CREATE OR REPLACE FUNCTION public.sync_order_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  canonical_method text;
BEGIN
  IF current_setting('app.bypass_inventory_check', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN (
    'unpaid','paid','deposit_paid','refunded','partial_refunded','pending_payment'
  ) THEN
    RAISE EXCEPTION '付款狀態「%」無效，請重新選擇付款狀態', NEW.payment_status USING ERRCODE = 'P0001';
  END IF;

  canonical_method := COALESCE(
    NULLIF(NEW.payment_method, ''),
    NULLIF(NEW.balance_payment_method, ''),
    NULLIF(NEW.deposit_payment_method, '')
  );

  IF canonical_method IS NOT NULL THEN
    NEW.payment_method := canonical_method;
    NEW.balance_payment_method := canonical_method;
    NEW.deposit_payment_method := canonical_method;
  END IF;

  IF NEW.payment_status = 'paid' AND (NEW.deposit_status IS NULL OR NEW.deposit_status = 'unpaid') THEN
    NEW.deposit_status := 'paid';
  END IF;

  RETURN NEW;
END;
$function$;