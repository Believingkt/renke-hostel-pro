-- ============================================================
-- 上架精靈 2d（試用回饋修改）
--   1. wizard_basic_info_errors：基本資料檢查規則（精靈存檔與開賣前檢查共用）
--        名稱 2～50 字；地址 5～200 字；
--        電話：只能有數字、空白、-、+、()，可用 # 接分機（1～6 位數字），# 前的數字 8～15 位；
--        介紹 30～3000 字（皆先去頭尾空白；字數以字元計）
--   2. wizard_save_basic_info：寫入 accommodation_info.name／address／phone／description
--        權限同 wizard_assert_access(write)：本館 hotel_admin 或 super_admin、is_active=false、未送審
--        short_url_alias（PMS 代號）不在參數中、不可修改
--   3. wizard_precheck_core（取代 120001 版本）
--        basic_info 改用上面同一套規則（另需 PMS 代號已設定）
--        flags：label 改為「系統設定（總部）」、detail 不含技術名稱；技術名稱放 hq_detail
--        OTA：移除紅色 ota_mapping 與黃色 ota（needs_ack），改回傳 ota_status（只顯示、不擋送審與核准）
--        M3（accommodation_info_guard_is_active）沿用本函式的 red_ok，故總部核准也不再被 OTA 擋
--   4. wizard_precheck_redact：非 super_admin 時移除 hq_detail 與 ota_status
--   5. wizard_precheck、wizard_submit（取代 120001 版本）：回傳經過 redact；
--        wizard_submit 簽名不變 (uuid, boolean)，p_ota_ack 改為忽略
-- 鎖與逾時：只建立／取代函式，不鎖任何資料表；BEGIN/COMMIT＋lock_timeout 3s／statement_timeout 120s
-- rollback：docs/onboarding-4/rollback_20261022090000.sql（還原 120001 的三個函式、刪除新函式）
-- 本機測試：docs/onboarding-4/localtest/run.sh
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regprocedure('public.wizard_save_basic_info(uuid, text, text, text, text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：wizard_save_basic_info 已存在，疑似已套用過本 migration';
  END IF;
  IF to_regprocedure('public.wizard_precheck_core(uuid)') IS NULL
     OR to_regprocedure('public.wizard_precheck(uuid)') IS NULL
     OR to_regprocedure('public.wizard_submit(uuid, boolean)') IS NULL
     OR to_regprocedure('public.wizard_assert_access(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：請先套用 20261018120001';
  END IF;
  IF position('wizard_precheck_core' IN pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：請先套用 20261018120002';
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE FUNCTION public.wizard_basic_info_errors(p_name text, p_address text, p_phone text, p_description text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_err text[] := ARRAY[]::text[];
  v_name text := btrim(COALESCE(p_name, ''));
  v_address text := btrim(COALESCE(p_address, ''));
  v_phone text := btrim(COALESCE(p_phone, ''));
  v_desc text := btrim(COALESCE(p_description, ''));
  v_digits integer;
BEGIN
  IF v_name = '' THEN v_err := v_err || '名稱必填'::text;
  ELSIF char_length(v_name) NOT BETWEEN 2 AND 50 THEN v_err := v_err || '名稱需 2～50 字'::text; END IF;

  IF v_address = '' THEN v_err := v_err || '地址必填'::text;
  ELSIF char_length(v_address) NOT BETWEEN 5 AND 200 THEN v_err := v_err || '地址需 5～200 字'::text; END IF;

  IF v_phone = '' THEN v_err := v_err || '電話必填'::text;
  ELSE
    v_digits := char_length(regexp_replace(split_part(v_phone, '#', 1), '[^0-9]', '', 'g'));
    IF v_phone !~ '^[0-9+() -]+(#[0-9]{1,6})?$' OR v_digits NOT BETWEEN 8 AND 15 THEN
      v_err := v_err || '電話格式不正確（例：02-2345-6789、0912-345-678、+886-2-2345-6789）'::text;
    END IF;
  END IF;

  IF v_desc = '' THEN v_err := v_err || '介紹必填'::text;
  ELSIF char_length(v_desc) < 30 THEN v_err := v_err || ('介紹至少 30 字（目前 ' || char_length(v_desc) || ' 字）');
  ELSIF char_length(v_desc) > 3000 THEN v_err := v_err || '介紹最多 3000 字'::text; END IF;

  RETURN v_err;
END;
$$;

CREATE FUNCTION public.wizard_save_basic_info(
  p_accommodation_id uuid, p_name text, p_address text, p_phone text, p_description text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_err text[];
  v_row record;
BEGIN
  PERFORM public.wizard_assert_access(p_accommodation_id, true);
  v_err := public.wizard_basic_info_errors(p_name, p_address, p_phone, p_description);
  IF cardinality(v_err) > 0 THEN
    RAISE EXCEPTION '基本資料有誤' USING ERRCODE = '22023', DETAIL = array_to_string(v_err, '；');
  END IF;
  UPDATE public.accommodation_info
     SET name = btrim(p_name), address = btrim(p_address), phone = btrim(p_phone), description = btrim(p_description)
   WHERE id = p_accommodation_id
  RETURNING name, address, phone, description, short_url_alias INTO v_row;
  RETURN jsonb_build_object('name', v_row.name, 'address', v_row.address, 'phone', v_row.phone,
                            'description', v_row.description, 'short_url_alias', v_row.short_url_alias);
END;
$$;

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
  v_ota jsonb;
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

  -- 5. 基本資料（與 wizard_save_basic_info 同一套規則）
  v_missing := public.wizard_basic_info_errors(v_info.name, v_info.address, v_info.phone, v_info.description);
  IF btrim(COALESCE(v_info.short_url_alias, '')) = '' THEN v_missing := array_append(v_missing, 'PMS 代號未設定（請聯絡總部）'); END IF;
  v_red := v_red || jsonb_build_object('key', 'basic_info', 'label', '基本資料（名稱、地址、電話、介紹、PMS 代號）',
    'ok', cardinality(v_missing) = 0, 'detail', CASE WHEN cardinality(v_missing) = 0 THEN '齊全' ELSE array_to_string(v_missing, '；') END);

  -- 6. 館別開關：業主只看到「系統設定」；技術名稱放 hq_detail（wizard_precheck_redact 只留給 super_admin）
  v_missing := ARRAY[]::text[];
  IF v_flags.new_price_ui_enabled IS DISTINCT FROM true THEN v_missing := array_append(v_missing, '新版價格頁（new_price_ui_enabled）未開'); END IF;
  IF v_flags.auto_template_enabled IS DISTINCT FROM true THEN v_missing := array_append(v_missing, '自動建立專案（auto_template_enabled）未開'); END IF;
  IF v_flags.price_sync_mode IS DISTINCT FROM 'package_original' THEN
    v_missing := array_append(v_missing, '價格同步方式（price_sync_mode）應為 package_original，目前為 ' || COALESCE(v_flags.price_sync_mode, '未設定'));
  END IF;
  v_red := v_red || jsonb_build_object('key', 'flags', 'label', '系統設定（總部）',
    'ok', cardinality(v_missing) = 0,
    'detail', CASE WHEN cardinality(v_missing) = 0 THEN '已完成' ELSE '系統設定尚未完成，請聯絡總部' END,
    'hq_detail', CASE WHEN cardinality(v_missing) = 0
      THEN '新版價格頁、自動建立專案已開啟；價格同步方式 = package_original'
      ELSE array_to_string(v_missing, '；') END);

  -- 7. OTA：不屬於初始上架，不列入紅／黃檢查、不擋送審與核准；只回傳 ota_status 供總部核准對話框顯示
  v_owl := EXISTS (SELECT 1 FROM public.accommodation_owlting_config WHERE accommodation_id = p_accommodation_id AND sync_enabled);
  v_hn := EXISTS (SELECT 1 FROM public.accommodation_hotelnabe_config WHERE accommodation_id = p_accommodation_id AND sync_enabled);
  v_bad := NULL;
  IF v_owl THEN
    SELECT string_agg(rt.name, '、') INTO v_bad
    FROM public.room_types rt
    WHERE rt.accommodation_id = p_accommodation_id AND rt.owlting_sync_active
      AND NOT EXISTS (SELECT 1 FROM public.owlting_room_type_group_members m
                      JOIN public.owlting_room_type_groups g ON g.id = m.group_id
                      WHERE g.accommodation_id = p_accommodation_id AND m.room_type_id = rt.id AND m.rate_plan_template_id IS NOT NULL);
  END IF;
  v_ota := jsonb_build_object(
    'owlting', v_owl, 'hotelnabe', v_hn,
    'detail', 'OwlTing：' || CASE WHEN v_owl THEN '已開同步' || COALESCE('（未完成對應：' || v_bad || '）', '（對應完整）') ELSE '未串接' END
           || '；Hotelnabe：' || CASE WHEN v_hn THEN '已開同步（本系統沒有 Hotelnabe 房型對應表，無法自動檢查對應）' ELSE '未串接' END);

  RETURN jsonb_build_object(
    'red', v_red, 'yellow', v_yellow, 'ota_status', v_ota,
    'red_ok', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_red) e WHERE (e ->> 'ok')::boolean IS NOT TRUE),
    'window_start', v_start, 'window_end', v_end
  );
END;
$$;

CREATE FUNCTION public.wizard_precheck_redact(p_check jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.is_super_admin(auth.uid()), false) THEN
    RETURN p_check;
  END IF;
  RETURN (p_check - 'ota_status') || jsonb_build_object('red', COALESCE(
    (SELECT jsonb_agg(e - 'hq_detail' ORDER BY i) FROM jsonb_array_elements(p_check -> 'red') WITH ORDINALITY AS t(e, i)),
    '[]'::jsonb));
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
  RETURN public.wizard_precheck_redact(public.wizard_precheck_core(p_accommodation_id));
END;
$$;

-- 簽名不變以相容既有前端；p_ota_ack 不再使用
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
  PERFORM set_config('lakeze.wizard_write', 'on', true);
  INSERT INTO public.accommodation_onboarding_steps (accommodation_id, step_key, status, submitted_at, submitted_by)
  VALUES (p_accommodation_id, 'final_check', 'submitted', now(), auth.uid())
  ON CONFLICT (accommodation_id, step_key) DO UPDATE
    SET status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
        returned_at = NULL, returned_by = NULL, return_reason = NULL, updated_at = now();
  PERFORM set_config('lakeze.wizard_write', '', true);
  RETURN public.wizard_precheck_redact(v_check);
END;
$$;

COMMENT ON FUNCTION public.wizard_submit(uuid, boolean) IS
  '上架精靈送審：紅色全過才可送審；第二個參數 p_ota_ack 自 20261022090000 起忽略（OTA 不屬於初始上架）';

REVOKE ALL ON FUNCTION public.wizard_basic_info_errors(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wizard_basic_info_errors(text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.wizard_precheck_redact(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wizard_save_basic_info(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wizard_save_basic_info(uuid, text, text, text, text) TO authenticated;

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.wizard_precheck_core(uuid)'::regprocedure);
BEGIN
  IF position('needs_ack' IN v_def) > 0 OR position('ota_mapping' IN v_def) > 0 OR position('ota_status' IN v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：wizard_precheck_core 仍含 OTA 檢查';
  END IF;
  IF position('p_ota_ack IS NOT TRUE' IN pg_get_functiondef('public.wizard_submit(uuid, boolean)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：wizard_submit 仍檢查 OTA 勾選';
  END IF;
  IF has_function_privilege('anon', 'public.wizard_save_basic_info(uuid, text, text, text, text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.wizard_save_basic_info(uuid, text, text, text, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.wizard_precheck_redact(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式權限不正確';
  END IF;
  RAISE NOTICE 'POSTCHECK 通過';
END $$;

COMMIT;
