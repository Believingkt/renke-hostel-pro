-- =====================================================================
-- v5.7 逐字程式碼（設計稿，未施工）
-- 1) orders.pricing_template_id 欄位
-- 2) public.resolve_template_night_price()（全文）
-- 3) public.validate_order_before_insert() 的三段逐字置換（old → new）
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 新欄位（可空、加 FK、不改任何既有欄位／RLS）
-- ---------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pricing_template_id uuid
  REFERENCES public.pricing_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.pricing_template_id IS
  '建單時選擇的「專案」(pricing_templates)。僅供房價 guard 重算使用；NULL = 未選專案，行為與 v5.6 相同。';


-- ---------------------------------------------------------------------
-- (2) resolve_template_night_price()：單晚專案房價（全文）
--     語意 1:1 對應前端 src/utils/templatePriceResolverPure.ts
--     + src/utils/pricingTemplateHelpers.ts（getTierForDate / isTierSellable /
--       findSegmentForDate / getRoomOverride / getMealPriceColumn）
--     回傳 NULL = 「此專案在這一晚沒有有效價格」，由呼叫端往下 fallback。
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_template_night_price(
  p_template_id uuid,
  p_room_type_id uuid,
  p_date date,
  p_accommodation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tpl RECORD;
  v_date_str TEXT := to_char(p_date, 'YYYY-MM-DD');
  v_override_price INT;
  v_dow INT;
  v_is_holiday BOOLEAN;
  v_tier TEXT;                 -- 'weekday' | 'peak' | 'weekend'
  v_price_key TEXT;
  v_en_key TEXT;
  v_seg JSONB := NULL;
  v_seg_ov JSONB := NULL;
  v_ov JSONB := NULL;
  v_has_segments BOOLEAN := FALSE;
  v_enabled BOOLEAN;
  v_price NUMERIC;
  v_ov_weekday NUMERIC; v_ov_peak NUMERIC; v_ov_weekend NUMERIC;
  v_weekday NUMERIC; v_peak NUMERIC; v_weekend NUMERIC;
  v_has_tier_prices BOOLEAN;
  v_meal_col TEXT;
  v_base RECORD;
  v_selected NUMERIC;
  v_name TEXT;
BEGIN
  IF p_template_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_tpl FROM public.pricing_templates
   WHERE id = p_template_id AND accommodation_id = p_accommodation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- (a) 專案專屬的當日覆寫價：room_inventory_pricing.pricing_template_id = 本專案
  SELECT rip.price INTO v_override_price
    FROM public.room_inventory_pricing rip
   WHERE rip.room_type_id = p_room_type_id
     AND rip.date = p_date
     AND rip.pricing_template_id = p_template_id
   LIMIT 1;
  IF v_override_price IS NOT NULL THEN
    RETURN v_override_price;             -- 對應 TS overrideMap（含 0 元）
  END IF;

  -- (b) 日型判斷（與 TS classifyDayTier 完全一致：
  --     國定假日 或 週六 → weekend；週五／週日 → peak；其餘 → weekday）
  v_dow := EXTRACT(DOW FROM p_date)::INT;
  SELECT EXISTS (
    SELECT 1 FROM public.public_holidays
     WHERE accommodation_id = p_accommodation_id
       AND holiday_date = p_date
       AND holiday_type IN ('holiday', 'compensatory_day_off')
  ) INTO v_is_holiday;
  IF v_is_holiday OR v_dow = 6 THEN v_tier := 'weekend';
  ELSIF v_dow = 5 OR v_dow = 0 THEN v_tier := 'peak';
  ELSE v_tier := 'weekday';
  END IF;
  v_price_key := v_tier || '_price';
  v_en_key    := v_tier || '_enabled';

  -- (c) segments 模式（對應 hasSegments / findSegmentForDate / getTierForDate）
  v_has_segments := jsonb_typeof(v_tpl.season_segments) = 'array'
                    AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(v_tpl.season_segments) s
                       WHERE jsonb_typeof(s.value -> 'valid_from') = 'string'
                         AND jsonb_typeof(s.value -> 'valid_until') = 'string'
                    );

  IF v_has_segments THEN
    SELECT s.value INTO v_seg
      FROM jsonb_array_elements(v_tpl.season_segments) WITH ORDINALITY AS s(value, ord)
     WHERE jsonb_typeof(s.value -> 'valid_from') = 'string'
       AND jsonb_typeof(s.value -> 'valid_until') = 'string'
       AND NOT (COALESCE(s.value -> 'excluded_dates', '[]'::jsonb) ? v_date_str)
       AND (
            (COALESCE(s.value -> 'extra_dates', '[]'::jsonb) ? v_date_str)
         OR (v_date_str >= (s.value ->> 'valid_from') AND v_date_str <= (s.value ->> 'valid_until'))
       )
     ORDER BY s.ord
     LIMIT 1;

    IF v_seg IS NULL THEN
      RETURN NULL;                        -- TS: { enabled:false, price:null } → unresolved
    END IF;

    SELECT r.value INTO v_seg_ov
      FROM jsonb_array_elements(COALESCE(v_seg -> 'room_overrides', '[]'::jsonb)) r
     WHERE r.value ->> 'room_type_id' = p_room_type_id::text
     LIMIT 1;

    v_enabled := COALESCE((v_seg ->> v_en_key)::BOOLEAN, TRUE) IS NOT FALSE;
    IF v_seg_ov IS NOT NULL AND (v_seg_ov ? v_en_key) THEN
      v_enabled := COALESCE((v_seg_ov ->> v_en_key)::BOOLEAN, TRUE) IS NOT FALSE;
    END IF;

    v_price := COALESCE(
      NULLIF(v_seg_ov ->> v_price_key, '')::NUMERIC,
      NULLIF(v_seg    ->> v_price_key, '')::NUMERIC
    );

    IF NOT v_enabled OR v_price IS NULL OR v_price <= 0 THEN
      RETURN NULL;                        -- TS segments 分支：不可售或 <=0 → unresolved
    END IF;
    RETURN v_price::INT;
  END IF;

  -- (d) legacy（無 segments）：room_overrides > 範本頂層 tier 價 > price
  SELECT r.value INTO v_ov
    FROM jsonb_array_elements(COALESCE(v_tpl.room_overrides, '[]'::jsonb)) r
   WHERE r.value ->> 'room_type_id' = p_room_type_id::text
   LIMIT 1;

  v_ov_weekday := NULLIF(v_ov ->> 'weekday_price', '')::NUMERIC;
  v_ov_peak    := NULLIF(v_ov ->> 'peak_price', '')::NUMERIC;
  v_ov_weekend := NULLIF(v_ov ->> 'weekend_price', '')::NUMERIC;

  v_has_tier_prices :=
       COALESCE(v_tpl.weekday_price, 0) > 0
    OR COALESCE(v_tpl.peak_price, 0) > 0
    OR COALESCE(v_tpl.weekend_price, 0) > 0
    OR v_ov_weekday IS NOT NULL
    OR v_ov_peak IS NOT NULL
    OR v_ov_weekend IS NOT NULL;

  IF v_has_tier_prices THEN
    -- isTierSellable：override 有 enabled 欄位以它為準，否則看範本層級
    v_enabled := COALESCE(v_tpl_enabled(v_tpl, v_en_key), TRUE);
    IF v_ov IS NOT NULL AND (v_ov ? v_en_key) THEN
      v_enabled := COALESCE((v_ov ->> v_en_key)::BOOLEAN, TRUE) IS NOT FALSE;
    END IF;
    IF NOT v_enabled THEN
      RETURN NULL;
    END IF;

    v_weekday := COALESCE(v_ov_weekday, v_tpl.weekday_price::NUMERIC, v_tpl.price::NUMERIC, 0);
    v_weekend := COALESCE(v_ov_weekend, v_tpl.weekend_price::NUMERIC, v_tpl.price::NUMERIC, v_weekday);
    v_peak    := COALESCE(
                   v_ov_peak,
                   v_tpl.peak_price::NUMERIC,
                   CASE WHEN v_tpl.weekday_price IS NOT NULL THEN v_tpl.weekday_price::NUMERIC ELSE v_weekend END
                 );

    RETURN (CASE v_tier WHEN 'weekend' THEN v_weekend WHEN 'peak' THEN v_peak ELSE v_weekday END)::INT;

  ELSIF COALESCE(v_tpl.price, 0) > 0 THEN
    RETURN v_tpl.price;
  END IF;

  -- (e) TS 的最後一層：base row（pricing_template_id IS NULL）依範本名稱選餐型欄位
  --     此處僅接受「真登記」來源，與範圍二同一份白名單。
  v_name := COALESCE(v_tpl.template_name, v_tpl.project_name, '');
  v_meal_col := CASE
    WHEN v_name LIKE '%三食%' OR v_name LIKE '%3食%' THEN 'price_3_meals'
    WHEN v_name LIKE '%二食%' OR v_name LIKE '%2食%' OR v_name LIKE '%兩食%' THEN 'price_2_meals'
    ELSE 'price' END;

  SELECT rip.price, rip.price_2_meals, rip.price_3_meals, rip.last_change_source
    INTO v_base
    FROM public.room_inventory_pricing rip
   WHERE rip.room_type_id = p_room_type_id
     AND rip.date = p_date
     AND rip.pricing_template_id IS NULL
   LIMIT 1;

  IF NOT FOUND OR COALESCE(v_base.last_change_source, 'legacy_null') = 'bulk_open' THEN
    RETURN NULL;
  END IF;

  v_selected := CASE v_meal_col
    WHEN 'price_3_meals' THEN v_base.price_3_meals::NUMERIC
    WHEN 'price_2_meals' THEN v_base.price_2_meals::NUMERIC
    ELSE v_base.price::NUMERIC END;

  IF v_selected IS NOT NULL AND v_selected > 0 THEN
    RETURN v_selected::INT;
  END IF;
  RETURN v_base.price::INT;               -- price 為 NOT NULL，含明確 0 元
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_template_night_price(uuid, uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_template_night_price(uuid, uuid, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_template_night_price(uuid, uuid, date, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_template_night_price(uuid, uuid, date, uuid) TO service_role;

DO $check$
DECLARE v_acl TEXT;
BEGIN
  SELECT COALESCE(array_to_string(proacl, ','), '(default)') INTO v_acl
    FROM pg_proc WHERE proname = 'resolve_template_night_price';
  IF v_acl ILIKE '%anon=%' OR v_acl ILIKE '%authenticated=%' OR v_acl LIKE '%=X/%' OR v_acl = '(default)' THEN
    RAISE EXCEPTION 'ACL postcheck failed: %', v_acl;
  END IF;
END
$check$;


-- ---------------------------------------------------------------------
-- (3) validate_order_before_insert() 的三段逐字置換
--     其餘約 300 行（加購重算、庫存/人數/間數檢查、折扣、收尾）一字不動。
-- ---------------------------------------------------------------------

-- ===== HUNK A：宣告區新增變數 =====
-- OLD:
--   -- v5.6：無法取得有效房價的晚數
--   v_unpriced_nights INT := 0;
-- NEW:
--   -- v5.6：無法取得有效房價的晚數
--   v_unpriced_nights INT := 0;
--   -- v5.7：專案（pricing_templates）取價
--   v_tpl_price INT;
--   v_inv_source TEXT;
--   v_inv_trusted BOOLEAN := FALSE;

-- ===== HUNK B：庫存查詢多取 last_change_source，並判斷來源可信 =====
-- OLD:
--       SELECT rip.price, rip.available_rooms, rip.is_available
--         INTO v_inv_price, v_inv_rooms, v_inv_available
--       FROM public.room_inventory_pricing rip
--       WHERE rip.room_type_id = NEW.room_type_id
--         AND rip.date = v_current_date
--         AND rip.pricing_template_id IS NULL
--       LIMIT 1;
--       v_inv_found := FOUND;
-- NEW:
--       v_inv_source := NULL;
--       SELECT rip.price, rip.available_rooms, rip.is_available, rip.last_change_source
--         INTO v_inv_price, v_inv_rooms, v_inv_available, v_inv_source
--       FROM public.room_inventory_pricing rip
--       WHERE rip.room_type_id = NEW.room_type_id
--         AND rip.date = v_current_date
--         AND rip.pricing_template_id IS NULL
--       LIMIT 1;
--       v_inv_found := FOUND;
--       -- v5.7 範圍二：bulk_open 只是「開放房量」的佔位價，不視為有效房價；
--       -- last_change_source IS NULL 為欄位上線前的舊資料，維持信任。
--       v_inv_trusted := v_inv_found AND COALESCE(v_inv_source, 'legacy_null') <> 'bulk_open';

-- ===== HUNK C：每晚取價分支（package → 專案 → 真登記庫存 → base_price → 擋下）=====
-- OLD（第 274 行 IF v_has_pkg THEN … 到第 309 行 END IF; 之間的整段）
-- NEW:
--       IF v_has_pkg THEN
--         SELECT EXTRACT(DOW FROM v_current_date)::INT INTO v_dow;
--         SELECT EXISTS (
--           SELECT 1 FROM public.public_holidays
--           WHERE accommodation_id = NEW.accommodation_id
--             AND holiday_date = v_current_date
--             AND holiday_type IN ('holiday', 'compensatory_day_off')
--         ) INTO v_is_holiday;
--         IF v_is_holiday OR v_dow = 6 THEN
--           v_tier := 'weekend';
--         ELSIF v_dow = 5 OR v_dow = 0 THEN
--           v_tier := 'friday_sunday';
--         ELSE
--           v_tier := 'weekday';
--         END IF;
--         v_tier_sale := NULLIF(v_pkg_tiers -> v_tier ->> 'sale', '')::NUMERIC;
--         IF v_tier_sale IS NULL AND v_pkg_sale IS NULL THEN
--           RAISE EXCEPTION '入住方案未設定售價：請先於方案設定中填寫售價；若此訂單不需要指定方案，請改為不選方案、並於庫存日曆登記當日房價後再建立訂單'
--             USING ERRCODE = 'P0001';
--         END IF;
--         v_day_price := COALESCE(v_tier_sale, v_pkg_sale)::INT;
--
--       ELSIF NEW.pricing_template_id IS NOT NULL THEN
--         v_tpl_price := public.resolve_template_night_price(
--           NEW.pricing_template_id, NEW.room_type_id, v_current_date, NEW.accommodation_id
--         );
--         IF v_tpl_price IS NOT NULL THEN
--           v_day_price := v_tpl_price;
--         ELSIF v_inv_trusted AND v_inv_price IS NOT NULL THEN
--           v_day_price := v_inv_price::INT;
--         ELSIF COALESCE(v_room_type.is_exclusive_package, FALSE) THEN
--           RAISE EXCEPTION '找不到有效房價：房型「%」屬於包棟／方案定價房型，% 這一晚所選專案沒有設定價格，庫存日曆也沒有登記當日房價，請先於專案設定填寫該日型價格，或於庫存日曆登記該日房價後再建立訂單',
--             v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
--         ELSIF v_room_type.base_price IS NULL THEN
--           RAISE EXCEPTION '找不到有效房價：房型「%」尚未設定基本房價，% 這一晚所選專案與庫存日曆也都沒有價格，請先設定房價後再建立訂單',
--             v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
--         ELSE
--           v_day_price := v_room_type.base_price::INT;
--         END IF;
--
--       ELSIF v_inv_trusted AND v_inv_price IS NOT NULL THEN
--         v_day_price := v_inv_price::INT;
--
--       ELSIF COALESCE(v_room_type.is_exclusive_package, FALSE) THEN
--         RAISE EXCEPTION '找不到有效房價：房型「%」屬於包棟／方案定價房型，% 這一晚既沒有選擇入住方案或專案，庫存日曆也沒有登記當日房價（僅有開放房量時自動帶入的佔位價，不予採用），請先選擇方案／專案，或於庫存日曆登記該日房價後再建立訂單',
--           v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
--
--       ELSIF v_room_type.base_price IS NULL THEN
--         RAISE EXCEPTION '找不到有效房價：房型「%」尚未設定基本房價，% 這一晚也沒有可採用的庫存日曆登記價格，請先設定房價後再建立訂單',
--           v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
--
--       ELSE
--         v_day_price := v_room_type.base_price::INT;
--       END IF;
