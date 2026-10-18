-- ============================================================
-- 上架精靈 2b＋2c ②：精靈後端函式（全部 SECURITY DEFINER，只開放 authenticated）
--   共同權限（wizard_assert_access）：本館 hotel_admin 或 super_admin，且館別 is_active = false，否則 42501
--   寫入類函式另檢查：final_check 已送審（submitted）→ P0001「已送審，精靈為唯讀」
--   wizard_save_room_type      新增／修改房型（人數、房價、房間數皆 > 0）
--   wizard_save_package        新增／修改方案；三日型售價、原價 > 0 且原價 ≥ 售價；不呼叫、不修改 save_package_tier_prices
--                              新增時由既有 trigger 自動建立專案；回傳專案名稱、專案房型與是否等於方案主房型
--   wizard_preview_season_prices / wizard_apply_season_prices  package_date_prices 逐日售價／原價
--   wizard_open_inventory      room_inventory_pricing 只新增沒有的日期（預設今天起 6 個月）
--   wizard_precheck            開賣前檢查（送審與總部核准共用 wizard_precheck_core）
--   wizard_submit / wizard_return  送審／退回（退回只限 super_admin）
-- precheck：docs/onboarding-3/precheck_20261018120001.sql
-- postcheck：docs/onboarding-3/postcheck_20261018120001.sql
-- rollback：docs/onboarding-3/rollback_20261018120001.sql
-- 鎖與逾時：整支包在 BEGIN/COMMIT（CLI 2.117.0 不保證自動包交易，比照 110003～110005 寫法），
--   SET LOCAL lock_timeout = '3s'：拿不到鎖 3 秒內放棄，整支 ROLLBACK、不套用；SET LOCAL statement_timeout = '120s'
--   本支只建立／授權函式，不鎖 accommodation_info、orders、room_types、accommodation_packages、room_inventory_pricing
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regprocedure('public.wizard_assert_access(uuid, boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.wizard_assert_access 已存在，疑似已套用過本 migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'accommodation_onboarding_steps' AND column_name = 'return_reason') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：請先套用 20261018120000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags' AND column_name = 'auto_template_enabled') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info_flags.auto_template_enabled 不存在（請先套用 20261018090001）';
  END IF;
  IF to_regprocedure('public.packages_auto_template_on_insert()') IS NULL
     OR to_regprocedure('public.is_hotel_admin_of(uuid)') IS NULL
     OR to_regprocedure('public.is_super_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：依賴函式不完整';
  END IF;
  IF to_regclass('public.accommodation_owlting_config') IS NULL
     OR to_regclass('public.accommodation_hotelnabe_config') IS NULL
     OR to_regclass('public.owlting_room_type_group_members') IS NULL
     OR to_regclass('public.package_date_prices') IS NULL
     OR to_regclass('public.room_inventory_pricing') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：依賴資料表不完整';
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE FUNCTION public.wizard_assert_access(p_accommodation_id uuid, p_write boolean)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
BEGIN
  IF p_accommodation_id IS NULL
     OR NOT (COALESCE(public.is_super_admin(auth.uid()), false) OR COALESCE(public.is_hotel_admin_of(p_accommodation_id), false)) THEN
    RAISE EXCEPTION '只有本館管理員或總部最高管理員可以使用上架精靈' USING ERRCODE = '42501';
  END IF;
  SELECT is_active INTO v_active FROM public.accommodation_info WHERE id = p_accommodation_id;
  IF NOT FOUND OR v_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION '上架精靈只能用於尚未開賣的館' USING ERRCODE = '42501';
  END IF;
  IF p_write AND EXISTS (
    SELECT 1 FROM public.accommodation_onboarding_steps
    WHERE accommodation_id = p_accommodation_id AND step_key = 'final_check' AND status = 'submitted'
  ) THEN
    RAISE EXCEPTION '已送審，精靈為唯讀；如需修改請等總部退回' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION public.wizard_save_room_type(
  p_accommodation_id uuid, p_room_type_id uuid, p_name text, p_capacity integer, p_base_price integer, p_room_count integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, true);
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION '房型名稱必填' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_capacity, 0) <= 0 OR COALESCE(p_base_price, 0) <= 0 OR COALESCE(p_room_count, 0) <= 0 THEN
    RAISE EXCEPTION '人數、房價、房間數都必須大於 0' USING ERRCODE = '22023';
  END IF;
  IF p_room_type_id IS NULL THEN
    INSERT INTO public.room_types (accommodation_id, name, capacity, base_price, room_count)
    VALUES (p_accommodation_id, btrim(p_name), p_capacity, p_base_price, p_room_count)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.room_types
    SET name = btrim(p_name), capacity = p_capacity, base_price = p_base_price, room_count = p_room_count, updated_at = now()
    WHERE id = p_room_type_id AND accommodation_id = p_accommodation_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION '房型不屬於此館' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.wizard_clean_tier_prices(p_tier_prices jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_tier jsonb;
  v_sale numeric;
  v_orig numeric;
  v_label text;
  v_clean jsonb := '{}'::jsonb;
BEGIN
  IF p_tier_prices IS NULL OR jsonb_typeof(p_tier_prices) <> 'object'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_tier_prices) k WHERE k NOT IN ('weekday', 'friday_sunday', 'weekend')) THEN
    RAISE EXCEPTION '價格格式錯誤：只允許 weekday / friday_sunday / weekend' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['weekday', 'friday_sunday', 'weekend'] LOOP
    v_label := CASE v_key WHEN 'weekday' THEN '平日' WHEN 'friday_sunday' THEN '旺日（週五／週日）' ELSE '假日' END;
    v_tier := p_tier_prices -> v_key;
    IF v_tier IS NULL OR jsonb_typeof(v_tier) <> 'object'
       OR jsonb_typeof(v_tier -> 'sale') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_tier -> 'original') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION '%售價與原價都必填', v_label USING ERRCODE = '22023';
    END IF;
    v_sale := (v_tier ->> 'sale')::numeric;
    v_orig := (v_tier ->> 'original')::numeric;
    IF v_sale <= 0 OR v_orig <= 0 OR v_sale <> trunc(v_sale) OR v_orig <> trunc(v_orig) THEN
      RAISE EXCEPTION '%售價與原價都必須是大於 0 的整數', v_label USING ERRCODE = '22023';
    END IF;
    IF v_orig < v_sale THEN
      RAISE EXCEPTION '%原價不得低於售價', v_label USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean || jsonb_build_object(v_key, jsonb_build_object('sale', v_sale::bigint, 'original', v_orig::bigint));
  END LOOP;
  RETURN v_clean;
END;
$$;

CREATE FUNCTION public.wizard_save_package(
  p_accommodation_id uuid, p_package_id uuid, p_name text, p_primary_room_type_id uuid, p_guest_count integer, p_tier_prices jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean jsonb;
  v_id uuid;
  v_mode text;
  v_tpl record;
  v_rt_name text;
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info_flags
                 WHERE accommodation_id = p_accommodation_id AND auto_template_enabled) THEN
    RAISE EXCEPTION '總部尚未開啟此館的「自動建立專案」，請聯絡總部' USING ERRCODE = 'P0001';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION '方案名稱必填' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_guest_count, 0) <= 0 THEN
    RAISE EXCEPTION '入住人數必須大於 0' USING ERRCODE = '22023';
  END IF;
  SELECT name INTO v_rt_name FROM public.room_types
  WHERE id = p_primary_room_type_id AND accommodation_id = p_accommodation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '主房型必填且必須是本館房型' USING ERRCODE = '22023';
  END IF;
  v_clean := public.wizard_clean_tier_prices(p_tier_prices);

  IF p_package_id IS NULL THEN
    INSERT INTO public.accommodation_packages (
      accommodation_id, name, guest_count, included_guest_count, sale_price, original_price,
      tier_prices, applicable_tiers, primary_room_type_id, room_type_ids
    ) VALUES (
      p_accommodation_id, btrim(p_name), p_guest_count, p_guest_count,
      (v_clean #>> '{weekday,sale}')::numeric, (v_clean #>> '{weekday,original}')::numeric,
      v_clean, ARRAY['weekday', 'friday_sunday', 'weekend'], p_primary_room_type_id, ARRAY[p_primary_room_type_id]
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.accommodation_packages
    SET name = btrim(p_name), guest_count = p_guest_count, included_guest_count = p_guest_count,
        sale_price = (v_clean #>> '{weekday,sale}')::numeric, original_price = (v_clean #>> '{weekday,original}')::numeric,
        tier_prices = v_clean, applicable_tiers = ARRAY['weekday', 'friday_sunday', 'weekend'],
        primary_room_type_id = p_primary_room_type_id, room_type_ids = ARRAY[p_primary_room_type_id], updated_at = now()
    WHERE id = p_package_id AND accommodation_id = p_accommodation_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION '方案不屬於此館' USING ERRCODE = '42501';
    END IF;
    SELECT price_sync_mode INTO v_mode FROM public.accommodation_info_flags WHERE accommodation_id = p_accommodation_id;
    IF v_mode = 'package_original' THEN
      UPDATE public.pricing_templates
      SET weekday_price = (v_clean #>> '{weekday,original}')::integer, weekday_enabled = true,
          peak_price = (v_clean #>> '{friday_sunday,original}')::integer, peak_enabled = true,
          weekend_price = (v_clean #>> '{weekend,original}')::integer, weekend_enabled = true,
          price = (v_clean #>> '{weekday,original}')::integer, updated_at = now()
      WHERE accommodation_id = p_accommodation_id AND default_package_id = v_id;
    END IF;
  END IF;

  SELECT t.id, t.template_name, t.room_type_id INTO v_tpl
  FROM public.pricing_templates t
  WHERE t.accommodation_id = p_accommodation_id AND t.default_package_id = v_id
  ORDER BY t.display_order NULLS LAST, t.created_at
  LIMIT 1;

  RETURN jsonb_build_object(
    'package_id', v_id,
    'template_id', v_tpl.id,
    'template_name', v_tpl.template_name,
    'template_room_type_id', v_tpl.room_type_id,
    'room_type_name', (SELECT name FROM public.room_types WHERE id = v_tpl.room_type_id),
    'primary_room_type_id', p_primary_room_type_id,
    'primary_room_type_name', v_rt_name,
    'room_type_matches', v_tpl.id IS NOT NULL AND v_tpl.room_type_id = p_primary_room_type_id
  );
END;
$$;

CREATE FUNCTION public.wizard_season_plan(
  p_package_id uuid, p_start date, p_end date, p_sale numeric, p_original numeric, p_write boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  v_ins integer;
  v_upd integer;
  v_list jsonb;
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.accommodation_packages WHERE id = p_package_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '只有本館管理員或總部最高管理員可以使用上架精靈' USING ERRCODE = '42501';
  END IF;
  PERFORM public.wizard_assert_access(v_acc, p_write);
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_start < v_today OR p_end - p_start > 365 THEN
    RAISE EXCEPTION '日期區間錯誤：需從今天以後開始，結束日不得早於開始日，最長 366 天' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_sale, 0) <= 0 OR COALESCE(p_original, 0) <= 0 OR p_sale <> trunc(p_sale) OR p_original <> trunc(p_original) THEN
    RAISE EXCEPTION '售價與原價都必須是大於 0 的整數' USING ERRCODE = '22023';
  END IF;
  IF p_original < p_sale THEN
    RAISE EXCEPTION '原價不得低於售價' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) FILTER (WHERE p.id IS NULL), count(*) FILTER (WHERE p.id IS NOT NULL),
         COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'old_sale', p.sale_price, 'old_original', p.original_price)
                            ORDER BY d) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb)
    INTO v_ins, v_upd, v_list
  FROM generate_series(p_start, p_end, interval '1 day') d
  LEFT JOIN public.package_date_prices p ON p.package_id = p_package_id AND p.date = d::date;

  IF p_write THEN
    INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, original_price, created_by)
    SELECT v_acc, p_package_id, d::date, p_sale, p_original, auth.uid()
    FROM generate_series(p_start, p_end, interval '1 day') d
    ON CONFLICT (package_id, date) DO UPDATE
      SET sale_price = EXCLUDED.sale_price, original_price = EXCLUDED.original_price, updated_at = now();
  END IF;

  RETURN jsonb_build_object('insert_count', v_ins, 'overwrite_count', v_upd, 'overwrites', v_list);
END;
$$;

CREATE FUNCTION public.wizard_preview_season_prices(p_package_id uuid, p_start date, p_end date, p_sale numeric, p_original numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.wizard_season_plan(p_package_id, p_start, p_end, p_sale, p_original, false) $$;

CREATE FUNCTION public.wizard_apply_season_prices(p_package_id uuid, p_start date, p_end date, p_sale numeric, p_original numeric)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.wizard_season_plan(p_package_id, p_start, p_end, p_sale, p_original, true) $$;

CREATE FUNCTION public.wizard_open_inventory(p_accommodation_id uuid, p_start date DEFAULT NULL, p_end date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_start, (now() AT TIME ZONE 'Asia/Taipei')::date);
  v_end date := COALESCE(p_end, (COALESCE(p_start, (now() AT TIME ZONE 'Asia/Taipei')::date) + interval '6 months' - interval '1 day')::date);
  v_bad text;
  v_result jsonb;
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, true);
  IF v_end < v_start OR v_start < (now() AT TIME ZONE 'Asia/Taipei')::date OR v_end - v_start > 400 THEN
    RAISE EXCEPTION '日期區間錯誤：需從今天以後開始，最長 401 天' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_types WHERE accommodation_id = p_accommodation_id) THEN
    RAISE EXCEPTION '請先建立房型' USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(name, '、') INTO v_bad FROM public.room_types
  WHERE accommodation_id = p_accommodation_id AND (COALESCE(base_price, 0) <= 0 OR COALESCE(room_count, 0) <= 0);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '房型房價與房間數必須大於 0：%', v_bad USING ERRCODE = '22023';
  END IF;

  WITH ins AS (
    INSERT INTO public.room_inventory_pricing (room_type_id, date, price, available_rooms, is_available)
    SELECT rt.id, d::date, rt.base_price, rt.room_count, true
    FROM public.room_types rt
    CROSS JOIN generate_series(v_start, v_end, interval '1 day') d
    WHERE rt.accommodation_id = p_accommodation_id
      AND NOT EXISTS (SELECT 1 FROM public.room_inventory_pricing r
                      WHERE r.room_type_id = rt.id AND r.date = d::date AND r.pricing_template_id IS NULL)
    RETURNING room_type_id
  )
  SELECT jsonb_build_object(
    'start', v_start, 'end', v_end,
    'room_types', COALESCE(jsonb_agg(jsonb_build_object(
      'room_type_id', rt.id, 'name', rt.name,
      'inserted', (SELECT count(*) FROM ins WHERE ins.room_type_id = rt.id),
      'skipped', (v_end - v_start + 1) - (SELECT count(*) FROM ins WHERE ins.room_type_id = rt.id)
    ) ORDER BY rt.display_order NULLS LAST, rt.name), '[]'::jsonb)
  ) INTO v_result
  FROM public.room_types rt WHERE rt.accommodation_id = p_accommodation_id;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.wizard_precheck_core(p_accommodation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := (now() AT TIME ZONE 'Asia/Taipei')::date;
  v_end date := ((now() AT TIME ZONE 'Asia/Taipei')::date + interval '6 months' - interval '1 day')::date;
  v_info record;
  v_flags record;
  v_red jsonb := '[]'::jsonb;
  v_yellow jsonb := '[]'::jsonb;
  v_bad text;
  v_n integer;
  v_missing text[];
  v_owl boolean;
  v_hn boolean;
  v_owl_rt integer;
BEGIN
  SELECT name, address, phone, short_url_alias, description INTO v_info
  FROM public.accommodation_info WHERE id = p_accommodation_id;
  SELECT new_price_ui_enabled, auto_template_enabled, price_sync_mode INTO v_flags
  FROM public.accommodation_info_flags WHERE accommodation_id = p_accommodation_id;

  -- 1. 房型
  SELECT count(*), string_agg(name, '、') FILTER (WHERE COALESCE(capacity, 0) <= 0 OR COALESCE(base_price, 0) <= 0)
    INTO v_n, v_bad
  FROM public.room_types WHERE accommodation_id = p_accommodation_id;
  v_red := v_red || jsonb_build_object('key', 'room_types', 'label', '至少 1 個房型（人數、房價 > 0）',
    'ok', v_n > 0 AND v_bad IS NULL,
    'detail', CASE WHEN v_n = 0 THEN '尚未建立房型' WHEN v_bad IS NOT NULL THEN '人數或房價為 0：' || v_bad ELSE v_n || ' 個房型' END);

  -- 2. 方案三日型價格
  SELECT count(*), string_agg(name, '、') FILTER (WHERE NOT (
           COALESCE((tier_prices #>> '{weekday,sale}')::numeric, 0) > 0 AND COALESCE((tier_prices #>> '{weekday,original}')::numeric, 0) > 0
       AND COALESCE((tier_prices #>> '{friday_sunday,sale}')::numeric, 0) > 0 AND COALESCE((tier_prices #>> '{friday_sunday,original}')::numeric, 0) > 0
       AND COALESCE((tier_prices #>> '{weekend,sale}')::numeric, 0) > 0 AND COALESCE((tier_prices #>> '{weekend,original}')::numeric, 0) > 0))
    INTO v_n, v_bad
  FROM public.accommodation_packages WHERE accommodation_id = p_accommodation_id AND enabled;
  v_red := v_red || jsonb_build_object('key', 'packages', 'label', '至少 1 個啟用方案，三日型價格 > 0',
    'ok', v_n > 0 AND v_bad IS NULL,
    'detail', CASE WHEN v_n = 0 THEN '沒有啟用中的方案' WHEN v_bad IS NOT NULL THEN '三日型價格不完整：' || v_bad ELSE v_n || ' 個啟用方案' END);

  -- 3. 方案綁定專案且專案房型 = 方案主房型
  SELECT string_agg(p.name, '、') INTO v_bad
  FROM public.accommodation_packages p
  WHERE p.accommodation_id = p_accommodation_id AND p.enabled
    AND (p.primary_room_type_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.pricing_templates t
      WHERE t.accommodation_id = p_accommodation_id AND t.default_package_id = p.id AND t.room_type_id = p.primary_room_type_id));
  v_red := v_red || jsonb_build_object('key', 'templates', 'label', '每個方案都有綁定專案，且專案房型 = 方案主房型',
    'ok', v_bad IS NULL, 'detail', COALESCE('未綁定或房型不一致：' || v_bad, '全部一致'));

  -- 4. 庫存
  SELECT string_agg(rt.name, '、') INTO v_bad
  FROM public.room_types rt
  WHERE rt.accommodation_id = p_accommodation_id
    AND NOT EXISTS (SELECT 1 FROM public.room_inventory_pricing r
                    WHERE r.room_type_id = rt.id AND r.date BETWEEN v_start AND v_end
                      AND COALESCE(r.available_rooms, 0) > 0 AND r.is_available IS DISTINCT FROM false);
  SELECT count(*) INTO v_n FROM public.room_types WHERE accommodation_id = p_accommodation_id;
  v_red := v_red || jsonb_build_object('key', 'inventory', 'label', '每個房型在 ' || v_start || '～' || v_end || ' 有庫存且至少 1 天可訂',
    'ok', v_n > 0 AND v_bad IS NULL,
    'detail', CASE WHEN v_n = 0 THEN '尚未建立房型' ELSE COALESCE('沒有可訂庫存：' || v_bad, '全部有庫存') END);

  -- 5. 基本資料
  v_missing := ARRAY[]::text[];
  IF btrim(COALESCE(v_info.name, '')) = '' THEN v_missing := array_append(v_missing, '名稱'); END IF;
  IF btrim(COALESCE(v_info.address, '')) = '' THEN v_missing := array_append(v_missing, '地址'); END IF;
  IF btrim(COALESCE(v_info.phone, '')) = '' THEN v_missing := array_append(v_missing, '電話'); END IF;
  IF btrim(COALESCE(v_info.short_url_alias, '')) = '' THEN v_missing := array_append(v_missing, 'PMS 代號'); END IF;
  IF btrim(COALESCE(v_info.description, '')) = '' THEN v_missing := array_append(v_missing, '介紹'); END IF;
  v_red := v_red || jsonb_build_object('key', 'basic_info', 'label', '基本資料（名稱、地址、電話、PMS 代號、介紹）',
    'ok', cardinality(v_missing) = 0, 'detail', CASE WHEN cardinality(v_missing) = 0 THEN '齊全' ELSE '缺：' || array_to_string(v_missing, '、') END);

  -- 6. 館別開關
  v_missing := ARRAY[]::text[];
  IF v_flags.new_price_ui_enabled IS DISTINCT FROM true THEN v_missing := array_append(v_missing, 'new_price_ui_enabled'); END IF;
  IF v_flags.auto_template_enabled IS DISTINCT FROM true THEN v_missing := array_append(v_missing, 'auto_template_enabled'); END IF;
  IF v_flags.price_sync_mode IS DISTINCT FROM 'package_original' THEN v_missing := array_append(v_missing, 'price_sync_mode=package_original'); END IF;
  v_red := v_red || jsonb_build_object('key', 'flags', 'label', '館別開關（總部設定）',
    'ok', cardinality(v_missing) = 0, 'detail', CASE WHEN cardinality(v_missing) = 0 THEN '已開啟' ELSE '未開啟：' || array_to_string(v_missing, '、') END);

  -- 7. OTA
  -- room_types.owlting_sync_active 預設為 true，不能代表「已串接」；以館別 OwlTing 設定 sync_enabled 為準
  v_owl := EXISTS (SELECT 1 FROM public.accommodation_owlting_config WHERE accommodation_id = p_accommodation_id AND sync_enabled);
  v_hn := EXISTS (SELECT 1 FROM public.accommodation_hotelnabe_config WHERE accommodation_id = p_accommodation_id AND sync_enabled);
  IF v_owl THEN
    SELECT count(*) INTO v_owl_rt FROM public.room_types WHERE accommodation_id = p_accommodation_id AND owlting_sync_active;
    SELECT string_agg(rt.name, '、') INTO v_bad
    FROM public.room_types rt
    WHERE rt.accommodation_id = p_accommodation_id AND rt.owlting_sync_active
      AND NOT EXISTS (SELECT 1 FROM public.owlting_room_type_group_members m
                      JOIN public.owlting_room_type_groups g ON g.id = m.group_id
                      WHERE g.accommodation_id = p_accommodation_id AND m.room_type_id = rt.id AND m.rate_plan_template_id IS NOT NULL);
    v_red := v_red || jsonb_build_object('key', 'ota_mapping', 'label', 'OwlTing 已開同步：開啟同步的房型都必須完成對應',
      'ok', v_owl_rt > 0 AND v_bad IS NULL,
      'detail', CASE WHEN v_owl_rt = 0 THEN '已開同步但沒有任何房型開啟同步' ELSE COALESCE('未完成對應：' || v_bad, '對應完整') END);
  END IF;
  v_yellow := v_yellow || jsonb_build_object('key', 'ota', 'label', 'OTA 串接狀態（請確認）', 'needs_ack', true,
    'detail', 'OwlTing：' || CASE WHEN v_owl THEN '已開同步' ELSE '未串接' END
           || '；Hotelnabe：' || CASE WHEN v_hn THEN '已開同步（本系統沒有 Hotelnabe 房型對應表，無法自動檢查對應）' ELSE '未串接' END);

  RETURN jsonb_build_object(
    'red', v_red, 'yellow', v_yellow,
    'red_ok', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_red) e WHERE (e ->> 'ok')::boolean IS NOT TRUE),
    'window_start', v_start, 'window_end', v_end
  );
END;
$$;

CREATE FUNCTION public.wizard_precheck(p_accommodation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, false);
  RETURN public.wizard_precheck_core(p_accommodation_id);
END;
$$;

CREATE FUNCTION public.wizard_submit(p_accommodation_id uuid, p_ota_ack boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check jsonb;
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, true);
  v_check := public.wizard_precheck_core(p_accommodation_id);
  IF (v_check ->> 'red_ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION '開賣前檢查有紅色項目未通過，不能送審' USING ERRCODE = 'P0001',
      DETAIL = (SELECT string_agg(e ->> 'label', '；') FROM jsonb_array_elements(v_check -> 'red') e WHERE (e ->> 'ok')::boolean IS NOT TRUE);
  END IF;
  IF p_ota_ack IS NOT TRUE THEN
    RAISE EXCEPTION '請先勾選確認 OTA 串接狀態' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('lakeze.wizard_write', 'on', true);
  INSERT INTO public.accommodation_onboarding_steps (accommodation_id, step_key, status, submitted_at, submitted_by)
  VALUES (p_accommodation_id, 'final_check', 'submitted', now(), auth.uid())
  ON CONFLICT (accommodation_id, step_key) DO UPDATE
    SET status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
        returned_at = NULL, returned_by = NULL, return_reason = NULL, updated_at = now();
  PERFORM set_config('lakeze.wizard_write', '', true);
  RETURN v_check;
END;
$$;

CREATE FUNCTION public.wizard_return(p_accommodation_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.is_super_admin(auth.uid()), false) THEN
    RAISE EXCEPTION '只有總部最高管理員可以退回' USING ERRCODE = '42501';
  END IF;
  PERFORM public.wizard_assert_access(p_accommodation_id, false);
  IF btrim(COALESCE(p_reason, '')) = '' OR length(p_reason) > 500 THEN
    RAISE EXCEPTION '退回原因必填（500 字以內）' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_onboarding_steps
                 WHERE accommodation_id = p_accommodation_id AND step_key = 'final_check' AND status = 'submitted') THEN
    RAISE EXCEPTION '此館目前不是待核准狀態' USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('lakeze.wizard_write', 'on', true);
  UPDATE public.accommodation_onboarding_steps
  SET status = 'returned', returned_at = now(), returned_by = auth.uid(), return_reason = btrim(p_reason), updated_at = now()
  WHERE accommodation_id = p_accommodation_id AND step_key = 'final_check';
  PERFORM set_config('lakeze.wizard_write', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.wizard_assert_access(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wizard_clean_tier_prices(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wizard_season_plan(uuid, date, date, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wizard_precheck_core(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wizard_save_room_type(uuid, uuid, text, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_save_package(uuid, uuid, text, uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_preview_season_prices(uuid, date, date, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_apply_season_prices(uuid, date, date, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_open_inventory(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_precheck(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_submit(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wizard_return(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wizard_save_room_type(uuid, uuid, text, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_save_package(uuid, uuid, text, uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_preview_season_prices(uuid, date, date, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_apply_season_prices(uuid, date, date, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_open_inventory(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_precheck(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_submit(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wizard_return(uuid, text) TO authenticated;

COMMIT;
