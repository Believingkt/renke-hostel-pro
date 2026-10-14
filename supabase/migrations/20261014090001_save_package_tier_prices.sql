-- ============================================================
-- 階段 1a ②：方案存檔 RPC
--   public.save_package_tier_prices(p_package_id uuid, p_tier_prices jsonb) RETURNS jsonb
--   - 權限：staff_can_edit_module(館, 'room_price') 且該館 new_price_ui_enabled = true
--   - 只寫方案的 tier_prices / sale_price / original_price / applicable_tiers / updated_at
--   - price_sync_mode = 'package_original' 時，同步同館所有 default_package_id = 該方案的專案
-- rollback：docs/pricing-1a/rollback_20261014090001.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  -- 防重複套用（最前面）
  IF to_regprocedure('public.save_package_tier_prices(uuid, jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.save_package_tier_prices(uuid, jsonb) 已存在，疑似已套用過本 migration';
  END IF;
  -- 依賴物件
  IF to_regclass('public.accommodation_packages') IS NULL
     OR to_regclass('public.pricing_templates') IS NULL
     OR to_regclass('public.accommodation_info_flags') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_packages / pricing_templates / accommodation_info_flags 不完整';
  END IF;
  IF to_regprocedure('public.staff_can_edit_module(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.staff_can_edit_module(uuid, text) 不存在';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
        AND column_name IN ('new_price_ui_enabled', 'price_sync_mode')) <> 2 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info_flags 缺少開關欄位（請先套用 20261014090000）';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_packages'
        AND column_name IN ('tier_prices', 'sale_price', 'original_price', 'applicable_tiers', 'updated_at')) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_packages 欄位不完整';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pricing_templates'
        AND column_name IN ('default_package_id', 'price', 'weekday_price', 'peak_price', 'weekend_price',
                            'weekday_enabled', 'peak_enabled', 'weekend_enabled', 'updated_at')) <> 9 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：pricing_templates 欄位不完整';
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE FUNCTION public.save_package_tier_prices(p_package_id uuid, p_tier_prices jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
  v_ui_enabled boolean;
  v_mode text;
  v_key text;
  v_tier jsonb;
  v_sale numeric;
  v_orig numeric;
  v_clean jsonb := '{}'::jsonb;
  v_tiers text[] := ARRAY[]::text[];
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_package_id IS NULL THEN
    RAISE EXCEPTION '方案不存在' USING ERRCODE = 'P0002';
  END IF;

  -- 1) 方案所屬館
  SELECT accommodation_id INTO v_acc
  FROM public.accommodation_packages
  WHERE id = p_package_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '方案不存在' USING ERRCODE = 'P0002';
  END IF;

  -- 2) 權限與館別開關
  IF NOT COALESCE(public.staff_can_edit_module(v_acc, 'room_price'), false) THEN
    RAISE EXCEPTION '沒有房價編輯權限' USING ERRCODE = '42501';
  END IF;
  SELECT f.new_price_ui_enabled, f.price_sync_mode
    INTO v_ui_enabled, v_mode
  FROM public.accommodation_info_flags f
  WHERE f.accommodation_id = v_acc;
  IF v_ui_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION '此館尚未啟用「房型與方案」新價格頁' USING ERRCODE = '42501';
  END IF;
  v_mode := COALESCE(v_mode, 'no_sync');

  -- 3) 驗證
  IF p_tier_prices IS NULL OR jsonb_typeof(p_tier_prices) <> 'object' THEN
    RAISE EXCEPTION '價格格式錯誤' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_tier_prices) k
    WHERE k NOT IN ('weekday', 'friday_sunday', 'weekend')
  ) THEN
    RAISE EXCEPTION '只允許 weekday / friday_sunday / weekend 三個日型' USING ERRCODE = '22023';
  END IF;

  FOREACH v_key IN ARRAY ARRAY['weekday', 'friday_sunday', 'weekend'] LOOP
    v_tier := p_tier_prices -> v_key;
    IF v_tier IS NULL OR jsonb_typeof(v_tier) = 'null' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_tier) <> 'object' THEN
      RAISE EXCEPTION '% 價格格式錯誤', v_key USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_tier) k WHERE k NOT IN ('sale', 'original')) THEN
      RAISE EXCEPTION '% 只允許 sale / original', v_key USING ERRCODE = '22023';
    END IF;
    IF COALESCE(jsonb_typeof(v_tier -> 'sale'), 'null') NOT IN ('number', 'null')
       OR COALESCE(jsonb_typeof(v_tier -> 'original'), 'null') NOT IN ('number', 'null') THEN
      RAISE EXCEPTION '% 金額必須為正整數', v_key USING ERRCODE = '22023';
    END IF;

    v_sale := CASE WHEN jsonb_typeof(v_tier -> 'sale') = 'number' THEN (v_tier ->> 'sale')::numeric END;
    v_orig := CASE WHEN jsonb_typeof(v_tier -> 'original') = 'number' THEN (v_tier ->> 'original')::numeric END;

    IF v_sale IS NULL AND v_orig IS NULL THEN
      CONTINUE;
    END IF;
    IF v_sale IS NULL THEN
      RAISE EXCEPTION '% 有原價但沒有售價', v_key USING ERRCODE = '22023';
    END IF;
    IF v_sale <= 0 OR v_sale <> trunc(v_sale) THEN
      RAISE EXCEPTION '% 售價必須為正整數', v_key USING ERRCODE = '22023';
    END IF;
    IF v_orig IS NULL THEN
      v_orig := v_sale;
    END IF;
    IF v_orig <= 0 OR v_orig <> trunc(v_orig) THEN
      RAISE EXCEPTION '% 原價必須為正整數', v_key USING ERRCODE = '22023';
    END IF;
    IF v_orig < v_sale THEN
      RAISE EXCEPTION '% 原價不得低於售價', v_key USING ERRCODE = '22023';
    END IF;

    v_clean := v_clean || jsonb_build_object(
      v_key, jsonb_build_object('sale', v_sale::bigint, 'original', v_orig::bigint)
    );
    v_tiers := v_tiers || v_key;
  END LOOP;

  IF NOT (v_clean ? 'weekday') THEN
    RAISE EXCEPTION '平日售價必填且需大於 0' USING ERRCODE = '22023';
  END IF;

  -- 4) 更新方案（只寫價格相關欄位）
  UPDATE public.accommodation_packages
  SET tier_prices = v_clean,
      sale_price = (v_clean #>> '{weekday,sale}')::numeric,
      original_price = (v_clean #>> '{weekday,original}')::numeric,
      applicable_tiers = v_tiers,
      updated_at = now()
  WHERE id = p_package_id;

  -- 5) 專案同步（僅 package_original）
  IF v_mode = 'package_original' THEN
    WITH u AS (
      UPDATE public.pricing_templates t
      SET weekday_price = (v_clean #>> '{weekday,original}')::integer,
          weekday_enabled = true,
          peak_price = (v_clean #>> '{friday_sunday,original}')::integer,
          peak_enabled = (v_clean ? 'friday_sunday'),
          weekend_price = (v_clean #>> '{weekend,original}')::integer,
          weekend_enabled = (v_clean ? 'weekend'),
          price = (v_clean #>> '{weekday,original}')::integer,
          updated_at = now()
      WHERE t.accommodation_id = v_acc
        AND t.default_package_id = p_package_id
      RETURNING t.id
    )
    SELECT COALESCE(array_agg(u.id ORDER BY u.id), ARRAY[]::uuid[]) INTO v_ids FROM u;
  END IF;

  -- 6) 回傳
  RETURN jsonb_build_object(
    'package_id', p_package_id,
    'synced_template_ids', to_jsonb(v_ids),
    'sync_mode', v_mode
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_package_tier_prices(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_package_tier_prices(uuid, jsonb) TO authenticated, service_role;

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_oid oid := to_regprocedure('public.save_package_tier_prices(uuid, jsonb)');
  v_def boolean;
  v_cfg text[];
  v_acl text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式未建立';
  END IF;
  SELECT prosecdef, proconfig, COALESCE(array_to_string(proacl, ','), '')
    INTO v_def, v_cfg, v_acl
  FROM pg_proc WHERE oid = v_oid;
  IF NOT v_def THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：不是 SECURITY DEFINER';
  END IF;
  IF v_cfg IS DISTINCT FROM ARRAY['search_path=public'] THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：search_path 設定不符（%）', COALESCE(array_to_string(v_cfg, ','), '(null)');
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：anon 仍有 EXECUTE';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：authenticated 沒有 EXECUTE';
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：service_role 沒有 EXECUTE';
  END IF;
  IF v_acl ~ '(^|,)=X' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：PUBLIC 仍有 EXECUTE（%）', v_acl;
  END IF;
END $$;
