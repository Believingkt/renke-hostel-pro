-- 20261013210002_fix_package_date_price_and_discount_in_order_trigger.sql
-- 目的：validate_order_before_insert() 的方案取價與折扣計算改為與
--       supabase/functions/validate-order-prices 及 _shared/discountPricing.ts 完全一致
--   (1) 每晚售價：package_date_prices.sale_price > tier_prices[tier].sale > sale_price
--   (2) 每晚原價：ov_original > ov_sale > tier.original > original_price > 可信庫存價 > 當晚售價
--   (3) 折扣：取較便宜（帳列房費 = max(售,原)；實付 = min(售, 原 − 毛折扣)；帳列折扣 = 帳列 − 實付）
--   (4) validate_discount_code 帶 p_pricing_template_id（NEW.pricing_template_id > default_package_id 反查 > NULL）
-- 基準：20260910193704_5bba20ae-ece2-4aad-b86b-d58636ea4d90.sql 第 271~650 行（sha256 2d0cbef8…）
-- 不動：bypass 分支、manual/owlting/hotelnabe/group_buy 提前返回、非方案取價三層、
--       人數與間數檢查、庫存檢查、加購計算、所有錯誤訊息字串、觸發器定義、函式 ACL

-- ============================= PRECHECK =============================
DO $pre$
DECLARE
  v_oid oid := to_regprocedure('public.validate_order_before_insert()');
  v_def text;
  v_secdef boolean;
  v_cfg text[];
  v_trg_def text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.validate_order_before_insert() 不存在';
  END IF;

  SELECT pg_get_functiondef(v_oid), p.prosecdef, p.proconfig
    INTO v_def, v_secdef, v_cfg
  FROM pg_proc p WHERE p.oid = v_oid;

  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'PRECHECK 失敗：函式不是 SECURITY DEFINER';
  END IF;
  IF v_cfg IS NULL OR NOT ('search_path=public' = ANY (v_cfg)) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：proconfig 非預期（現值 %）', COALESCE(array_to_string(v_cfg, ','), '(null)');
  END IF;

  -- 正式庫必須就是 20260910193704 基準
  IF position('v5.7 範圍二' in v_def) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 v5.7 基準註解，正式庫版本與預期不符';
  END IF;
  IF position('public.classify_day_tier(v_current_date, NEW.accommodation_id)' in v_def) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 classify_day_tier 呼叫片段';
  END IF;
  IF position('v_day_price := COALESCE(v_tier_sale, v_pkg_sale)::INT;' in v_def) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：方案取價片段與預期不符（可能已被其他 migration 改過）';
  END IF;
  IF position('v_calculated_discount := ROUND((v_calculated_total * v_discount_result.discount_value / 100.0)::numeric);' in v_def) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：折扣段片段與預期不符（可能已被其他 migration 改過）';
  END IF;
  -- 防重複套用
  IF position('package_date_prices' in v_def) > 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：函式已包含 package_date_prices，疑似已套用過本 migration';
  END IF;

  -- 觸發器必須仍是 BEFORE INSERT ON orders
  SELECT pg_get_triggerdef(t.oid) INTO v_trg_def
  FROM pg_trigger t
  WHERE t.tgname = 'validate_order_before_insert_trigger'
    AND t.tgrelid = 'public.orders'::regclass
    AND NOT t.tgisinternal;
  IF v_trg_def IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 validate_order_before_insert_trigger';
  END IF;
  IF position('BEFORE INSERT ON public.orders' in v_trg_def) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：觸發器定義非 BEFORE INSERT（現值 %）', v_trg_def;
  END IF;

  -- 依賴物件（簽章以 20260817132317 版為準）
  IF to_regclass('public.package_date_prices') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.package_date_prices 不存在';
  END IF;
  IF to_regprocedure('public.classify_day_tier(date,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.classify_day_tier(date,uuid) 不存在';
  END IF;
  IF to_regprocedure('public.validate_discount_code(text,uuid,integer,uuid,date,uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：validate_discount_code(text,uuid,integer,uuid,date,uuid) 不存在';
  END IF;
  IF to_regclass('public.pricing_templates') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.pricing_templates 不存在';
  END IF;

  -- 記錄變更前 ACL，供 POSTCHECK 比對
  CREATE TEMP TABLE _vobi_acl ON COMMIT DROP AS
  SELECT COALESCE(array_to_string(proacl, ','), '(default)') AS acl_before
  FROM pg_proc WHERE oid = v_oid;
END
$pre$;

-- ====================== CREATE OR REPLACE（完整全文） ======================
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
  -- v5.5C.2 新增
  v_stay_nights INT := 1;
  v_custom_addons INT := 0;
  v_new_details JSONB;
  -- v5.6：無法取得有效房價的晚數
  v_unpriced_nights INT := 0;
  -- v5.7：專案（pricing_templates）取價
  v_tpl_price INT;
  v_inv_source TEXT;
  v_inv_trusted BOOLEAN := FALSE;
  -- v5.8：方案單日指定價 / 原價帳列 / 取較便宜折扣
  v_pkg_original NUMERIC := NULL;
  v_tier_original NUMERIC;
  v_ov_sale NUMERIC;
  v_ov_original NUMERIC;
  v_day_original INT;
  v_orig_only_total INT := 0;
  v_sale_total INT := 0;
  v_billed_total INT := 0;
  v_charged_total INT := 0;
  v_raw_discount INT := 0;
  v_disc_tpl UUID := NULL;
  -- （v5.5C.2 修訂：pet 不重算，故不再需要 v_pet_unit / v_pet_mode）
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

  IF NEW.order_source IN ('manual', 'owlting', 'hotelnabe', 'group_buy') THEN
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

  -- ===== v5.5C.2：加購金額一律回查定價設定重算，不採信 payload =====
  v_stay_nights := GREATEST(1, NEW.check_out_date - NEW.check_in_date);

  -- (3) meal_plan_total 已停用
  NEW.meal_plan_total := 0;

  -- (2) pet_plan_price：本次不動，維持 payload 原值

  -- (1) custom_addon_details 逐筆回查
  IF NEW.custom_addon_details IS NOT NULL
     AND jsonb_typeof(NEW.custom_addon_details) = 'array'
     AND jsonb_array_length(NEW.custom_addon_details) > 0 THEN
    SELECT
      COALESCE(jsonb_agg(x.item ORDER BY x.ord), '[]'::jsonb),
      COALESCE(SUM(x.line_total), 0)::INT
    INTO v_new_details, v_custom_addons
    FROM (
      SELECT
        e.ord,
        r.line_total,
        e.value
          || jsonb_build_object(
               'count', r.qty,
               'price_per_unit', r.unit_price,
               'total', r.line_total,
               'price_source', r.price_source
             ) AS item
      FROM jsonb_array_elements(NEW.custom_addon_details) WITH ORDINALITY AS e(value, ord)
      LEFT JOIN LATERAL (
        SELECT a.*
        FROM public.addon_settings a
        WHERE a.accommodation_id = NEW.accommodation_id
          AND a.enabled = TRUE
          AND (
            (
              NULLIF(e.value->>'addon_id', '') IS NOT NULL
              AND a.id = NULLIF(e.value->>'addon_id', '')::uuid
            )
            OR (
              NULLIF(e.value->>'addon_id', '') IS NULL
              AND a.addon_type = e.value->>'addon_type'
              AND (
                SELECT count(*) FROM public.addon_settings a2
                WHERE a2.accommodation_id = NEW.accommodation_id
                  AND a2.enabled = TRUE
                  AND a2.addon_type = e.value->>'addon_type'
              ) = 1
            )
          )
        LIMIT 1
      ) a ON TRUE
      LEFT JOIN LATERAL (
        SELECT tp.*
        FROM public.trip_products tp
        WHERE e.value->>'source' = 'trip_product'
          AND NULLIF(e.value->>'product_id', '') IS NOT NULL
          AND tp.id = NULLIF(e.value->>'product_id', '')::uuid
          AND tp.accommodation_id = NEW.accommodation_id
          AND tp.is_active = TRUE
        LIMIT 1
      ) tp ON TRUE
      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN tp.id IS NOT NULL THEN
              LEAST(
                GREATEST(0, COALESCE((e.value->>'count')::INT, 1)),
                COALESCE(tp.stock, 2147483647)
              )
            WHEN a.id IS NOT NULL THEN
              LEAST(
                GREATEST(0, COALESCE((e.value->>'count')::INT, 1)),
                COALESCE(a.max_quantity, 2147483647)
              )
            ELSE 0
          END AS qty
      ) q
      CROSS JOIN LATERAL (
        SELECT
          q.qty,
          CASE
            WHEN tp.id IS NOT NULL THEN tp.price::NUMERIC
            WHEN a.id IS NOT NULL THEN a.price_per_unit::NUMERIC
            ELSE 0
          END AS unit_price,
          CASE
            WHEN tp.id IS NOT NULL THEN 'trip_product'
            WHEN a.id IS NOT NULL THEN 'addon_settings'
            ELSE 'unmatched'
          END AS price_source
      ) p
      CROSS JOIN LATERAL (
        SELECT
          p.qty,
          p.unit_price,
          p.price_source,
          (
            p.unit_price
            * p.qty
            * CASE
                WHEN tp.id IS NULL AND a.id IS NOT NULL AND a.pricing_mode = 'per_night'
                  THEN v_stay_nights
                ELSE 1
              END
          )::INT AS line_total
      ) r
    ) x;

    NEW.custom_addon_details := v_new_details;
  ELSE
    v_custom_addons := 0;
  END IF;

  v_addons := COALESCE(NEW.pet_plan_price, 0)::INT
            + COALESCE(NEW.meal_plan_total, 0)::INT
            + v_custom_addons;
  -- ===== v5.5C.2 加購重算結束 =====

  IF NEW.package_id IS NOT NULL THEN
    SELECT sale_price, original_price, tier_prices
      INTO v_pkg_sale, v_pkg_original, v_pkg_tiers
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
      v_inv_source := NULL;
      SELECT rip.price, rip.available_rooms, rip.is_available, rip.last_change_source
        INTO v_inv_price, v_inv_rooms, v_inv_available, v_inv_source
      FROM public.room_inventory_pricing rip
      WHERE rip.room_type_id = NEW.room_type_id
        AND rip.date = v_current_date
        AND rip.pricing_template_id IS NULL
      LIMIT 1;
      v_inv_found := FOUND;
      -- v5.7 範圍二：bulk_open 只是「開放房量」的佔位價，不視為有效房價；
      -- last_change_source IS NULL 為欄位上線前的舊資料，維持信任。
      v_inv_trusted := v_inv_found AND COALESCE(v_inv_source, 'legacy_null') <> 'bulk_open';

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

      -- ===== v5.6：每晚取價（依「價格來源是否存在」判斷，不用金額大小判斷） =====
      v_day_price := NULL;

      IF v_has_pkg THEN
        -- v5.7：日型判斷改呼叫共用函式 public.classify_day_tier()，
        -- 與 resolve_template_night_price() 共用同一份規則（不再各自計算）。
        -- 方案 tier_prices 的 JSON key 用 'friday_sunday'，僅此處做名稱映射。
        v_tier := public.classify_day_tier(v_current_date, NEW.accommodation_id);
        IF v_tier = 'peak' THEN v_tier := 'friday_sunday'; END IF;
        v_tier_sale := NULLIF(v_pkg_tiers -> v_tier ->> 'sale', '')::NUMERIC;
        v_tier_original := NULLIF(v_pkg_tiers -> v_tier ->> 'original', '')::NUMERIC;

        -- v5.8：與 validate-order-prices 對齊 → 方案單日指定價（package_date_prices）優先
        v_ov_sale := NULL;
        v_ov_original := NULL;
        SELECT pdp.sale_price, pdp.original_price
          INTO v_ov_sale, v_ov_original
        FROM public.package_date_prices pdp
        WHERE pdp.package_id = NEW.package_id
          AND pdp.date = v_current_date
        LIMIT 1;

        IF v_ov_sale IS NULL AND v_tier_sale IS NULL AND v_pkg_sale IS NULL THEN
          RAISE EXCEPTION '入住方案未設定售價：請先於方案設定中填寫售價；若此訂單不需要指定方案，請改為不選方案、並於庫存日曆登記當日房價後再建立訂單'
            USING ERRCODE = 'P0001';
        END IF;
        v_day_price := COALESCE(v_ov_sale, v_tier_sale, v_pkg_sale)::INT;

        -- 每晚原價（劃掉價）：與 validate-order-prices 的 nightlyOriginal 同序
        v_day_original := (
          CASE
            WHEN v_ov_sale IS NOT NULL AND COALESCE(v_ov_original, 0) > 0 THEN v_ov_original
            WHEN v_ov_sale IS NOT NULL THEN v_ov_sale
            WHEN COALESCE(v_tier_original, 0) > 0 THEN v_tier_original
            WHEN COALESCE(v_pkg_original, 0) > 0 THEN v_pkg_original
            WHEN v_inv_trusted AND COALESCE(v_inv_price, 0) > 0 THEN v_inv_price
            ELSE v_day_price
          END
        )::INT;
        v_orig_only_total := v_orig_only_total + v_day_original;

      ELSIF NEW.pricing_template_id IS NOT NULL THEN
        v_tpl_price := public.resolve_template_night_price(
          NEW.pricing_template_id, NEW.room_type_id, v_current_date, NEW.accommodation_id
        );
        IF v_tpl_price IS NOT NULL THEN
          v_day_price := v_tpl_price;
        ELSIF v_inv_trusted AND v_inv_price IS NOT NULL THEN
          v_day_price := v_inv_price::INT;
        ELSIF COALESCE(v_room_type.is_exclusive_package, FALSE) THEN
          RAISE EXCEPTION '找不到有效房價：房型「%」屬於包棟／方案定價房型，% 這一晚所選專案沒有設定價格，庫存日曆也沒有登記當日房價，請先於專案設定填寫該日型價格，或於庫存日曆登記該日房價後再建立訂單',
            v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        ELSIF v_room_type.base_price IS NULL THEN
          RAISE EXCEPTION '找不到有效房價：房型「%」尚未設定基本房價，% 這一晚所選專案與庫存日曆也都沒有價格，請先設定房價後再建立訂單',
            v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';
        ELSE
          v_day_price := v_room_type.base_price::INT;
        END IF;

      ELSIF v_inv_trusted AND v_inv_price IS NOT NULL THEN
        v_day_price := v_inv_price::INT;

      ELSIF COALESCE(v_room_type.is_exclusive_package, FALSE) THEN
        RAISE EXCEPTION '找不到有效房價：房型「%」屬於包棟／方案定價房型，% 這一晚既沒有選擇入住方案或專案，庫存日曆也沒有登記當日房價（僅有開放房量時自動帶入的佔位價，不予採用），請先選擇方案／專案，或於庫存日曆登記該日房價後再建立訂單',
          v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';

      ELSIF v_room_type.base_price IS NULL THEN
        RAISE EXCEPTION '找不到有效房價：房型「%」尚未設定基本房價，% 這一晚也沒有可採用的庫存日曆登記價格，請先設定房價後再建立訂單',
          v_room_type.name, to_char(v_current_date, 'YYYY-MM-DD') USING ERRCODE = 'P0001';

      ELSE
        v_day_price := v_room_type.base_price::INT;
      END IF;

      IF v_day_price IS NULL THEN
        v_unpriced_nights := v_unpriced_nights + 1;
        v_day_price := 0;
      END IF;
      -- ===== v5.6 每晚取價結束 =====

      v_room_only_total := v_room_only_total + v_day_price;
      IF NOT v_has_pkg THEN
        v_orig_only_total := v_orig_only_total + v_day_price;
      END IF;
      v_current_date := v_current_date + 1;
    END LOOP;

    IF v_unpriced_nights > 0 THEN
      RAISE EXCEPTION '找不到有效房價：房型「%」有 % 晚無法取得有效房價，請確認入住方案或庫存日曆價格設定',
        v_room_type.name, v_unpriced_nights USING ERRCODE = 'P0001';
    END IF;

    v_sale_total := v_room_only_total * v_qty;
    v_orig_only_total := v_orig_only_total * v_qty;
    v_calculated_total := v_sale_total + v_addons;
  ELSE
    v_calculated_total := COALESCE(NEW.total_price, 0);
    v_sale_total := GREATEST(COALESCE(NEW.total_price, 0) - v_addons, 0);
    v_orig_only_total := v_sale_total;
  END IF;

  IF NEW.discount_code IS NOT NULL AND LENGTH(TRIM(NEW.discount_code)) > 0 THEN
    -- v5.8 折扣碼適用範圍以「訂單對應的專案」判斷：
    --   (1) 建單入口已依規則寫入 NEW.pricing_template_id → 直接採用
    --   (2) 為 NULL 時，以 default_package_id = NEW.package_id 反查
    --   (3) 都沒有 → 傳 NULL，validate_discount_code 於 pricing_template 模式會回不適用（不折扣、不擋單）
    v_disc_tpl := NEW.pricing_template_id;
    IF v_disc_tpl IS NULL AND NEW.package_id IS NOT NULL THEN
      SELECT t.id INTO v_disc_tpl
      FROM public.pricing_templates t
      WHERE t.accommodation_id = NEW.accommodation_id
        AND t.default_package_id = NEW.package_id
      ORDER BY t.display_order NULLS LAST, t.created_at
      LIMIT 1;
    END IF;

    -- 帳列房費 = max(售價總額, 原價總額)；與 validate-order-prices 的 chargedRoomTotal 同義
    v_billed_total := GREATEST(v_sale_total, v_orig_only_total);

    SELECT * INTO v_discount_result FROM public.validate_discount_code(
      p_code => NEW.discount_code,
      p_accommodation_id => NEW.accommodation_id,
      p_order_amount => v_billed_total,
      p_room_type_id => NEW.room_type_id,
      p_check_in_date => NEW.check_in_date,
      p_pricing_template_id => v_disc_tpl
    );
    IF v_discount_result.is_valid THEN
      -- 與 supabase/functions/_shared/discountPricing.ts 相同的「取較便宜」公式
      IF v_discount_result.discount_type = 'percentage' THEN
        v_raw_discount := LEAST(
          ROUND((v_orig_only_total * v_discount_result.discount_value / 100.0)::numeric),
          v_orig_only_total
        )::INT;
      ELSE
        v_raw_discount := LEAST(v_discount_result.discount_value, v_orig_only_total)::INT;
      END IF;

      v_charged_total := LEAST(v_sale_total, GREATEST(0, v_orig_only_total - v_raw_discount))::INT;
      v_calculated_total := v_billed_total + v_addons;
      v_calculated_discount := GREATEST(0, LEAST(v_billed_total, v_billed_total - v_charged_total));
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

-- ============================= POSTCHECK =============================
DO $post$
DECLARE
  v_oid oid := to_regprocedure('public.validate_order_before_insert()');
  v_def text;
  v_secdef boolean;
  v_cfg text[];
  v_acl_after text;
  v_acl_before text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式不存在';
  END IF;
  SELECT pg_get_functiondef(v_oid), p.prosecdef, p.proconfig,
         COALESCE(array_to_string(p.proacl, ','), '(default)')
    INTO v_def, v_secdef, v_cfg, v_acl_after
  FROM pg_proc p WHERE p.oid = v_oid;

  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：SECURITY DEFINER 消失';
  END IF;
  IF NOT ('search_path=public' = ANY (v_cfg)) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：proconfig 被改變（現值 %）', array_to_string(v_cfg, ',');
  END IF;

  SELECT acl_before INTO v_acl_before FROM _vobi_acl;
  IF v_acl_after IS DISTINCT FROM v_acl_before THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式 ACL 改變（前 %，後 %）', v_acl_before, v_acl_after;
  END IF;

  IF position('public.package_date_prices pdp' in v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：未包含 package_date_prices 取價';
  END IF;
  IF position('p_pricing_template_id => v_disc_tpl' in v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：validate_discount_code 未帶 p_pricing_template_id';
  END IF;
  IF position('LEAST(v_sale_total, GREATEST(0, v_orig_only_total - v_raw_discount))' in v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：取較便宜公式未就位';
  END IF;
  IF position('v_billed_total := GREATEST(v_sale_total, v_orig_only_total);' in v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：帳列房費公式未就位';
  END IF;

  -- 不動範圍抽樣
  IF position('app.bypass_inventory_check' in v_def) = 0
     OR position('IN (''manual'', ''owlting'', ''hotelnabe'', ''group_buy'')' in v_def) = 0
     OR position('請填寫訂購人姓名' in v_def) = 0
     OR position('該日房型已關閉銷售，無法建立訂單' in v_def) = 0
     OR position('入住方案未設定售價' in v_def) = 0
     OR position('此房型會同步到 %，請先選擇對應方案' in v_def) = 0
     OR position('找不到有效房價：房型「%」有 % 晚無法取得有效房價' in v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：不動範圍遭破壞';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgname = 'validate_order_before_insert_trigger'
      AND t.tgrelid = 'public.orders'::regclass
      AND NOT t.tgisinternal
      AND position('BEFORE INSERT ON public.orders' in pg_get_triggerdef(t.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：觸發器被改變或遺失';
  END IF;
END
$post$;

-- ============================== ROLLBACK ==============================
-- 執行 docs/fix-order-trigger/rollback.sql 全文（= 20260910193704 的函式原文，逐字相同）。
-- CREATE OR REPLACE，不需 DROP；觸發器與 ACL 不受影響。
