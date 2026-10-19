-- ============================================================
-- rollback：20261022090000_onboarding_wizard_2d.sql
--   還原 120001 版本的 wizard_precheck_core／wizard_precheck／wizard_submit，刪除 2d 新增的函式
--   基本資料已寫入 accommodation_info 的內容不還原（與一般設定頁寫入相同欄位）
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.wizard_precheck_core(p_accommodation_id uuid)
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

CREATE OR REPLACE FUNCTION public.wizard_precheck(p_accommodation_id uuid)
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

CREATE OR REPLACE FUNCTION public.wizard_submit(p_accommodation_id uuid, p_ota_ack boolean)
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

COMMENT ON FUNCTION public.wizard_submit(uuid, boolean) IS NULL;
DROP FUNCTION IF EXISTS public.wizard_save_basic_info(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.wizard_precheck_redact(jsonb);
DROP FUNCTION IF EXISTS public.wizard_basic_info_errors(text, text, text, text);

COMMIT;
