-- ============================================================
-- 上架引導第一批 ③：自動建專案的取價規則修正
--   CREATE OR REPLACE public.packages_auto_template_on_insert()
--   每個日型（weekday／friday_sunday／weekend）價格依序取第一個 > 0 的值：
--     該日型 original → 該日型 sale → 方案 original_price → 方案 sale_price → 0
--   0 與 NULL 一律視為沒填；三個日型一律開啟（分日價沒填即回退方案價，與官網計價一致）
--   其餘（觸發條件、房型、一對一判斷、display_order）與 20261018090001 相同
-- precheck：docs/onboarding-1/precheck_20261018090002.sql
-- postcheck：docs/onboarding-1/postcheck_20261018090002.sql
-- rollback：docs/onboarding-1/rollback_20261018090002.sql（還原為 20261018090001 版本）
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regprocedure('public.packages_auto_template_on_insert()') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：packages_auto_template_on_insert() 不存在（請先套用 20261018090001）';
  END IF;
  IF md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure)) <> 'abc30714c0f7ffdaf4a4fbd58d2f2f56' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：packages_auto_template_on_insert() 內容與 20261018090001 版本不同（md5 %）',
      md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure));
  END IF;
END $$;

-- ============================= CHANGE =============================
CREATE OR REPLACE FUNCTION public.packages_auto_template_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tiers jsonb := CASE WHEN jsonb_typeof(NEW.tier_prices) = 'object' THEN NEW.tier_prices ELSE '{}'::jsonb END;
  v_pkg_orig numeric := NULLIF(NEW.original_price, 0);
  v_pkg_sale numeric := NULLIF(NEW.sale_price, 0);
  v_price integer[];
  v_key text;
  v_val numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info_flags f
    WHERE f.accommodation_id = NEW.accommodation_id AND f.auto_template_enabled
  ) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pricing_templates WHERE default_package_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  v_price := ARRAY[]::integer[];
  FOREACH v_key IN ARRAY ARRAY['weekday', 'friday_sunday', 'weekend'] LOOP
    v_val := NULL;
    IF jsonb_typeof(v_tiers -> v_key -> 'original') = 'number' AND (v_tiers -> v_key ->> 'original')::numeric > 0 THEN
      v_val := (v_tiers -> v_key ->> 'original')::numeric;
    ELSIF jsonb_typeof(v_tiers -> v_key -> 'sale') = 'number' AND (v_tiers -> v_key ->> 'sale')::numeric > 0 THEN
      v_val := (v_tiers -> v_key ->> 'sale')::numeric;
    END IF;
    v_price := v_price || round(COALESCE(v_val, v_pkg_orig, v_pkg_sale, 0))::integer;
  END LOOP;

  INSERT INTO public.pricing_templates (
    accommodation_id, template_name, room_type_id, room_type_ids, default_package_id,
    weekday_price, weekday_enabled, peak_price, peak_enabled, weekend_price, weekend_enabled,
    price, display_order
  ) VALUES (
    NEW.accommodation_id, NEW.name, NEW.primary_room_type_id,
    CASE WHEN NEW.primary_room_type_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.primary_room_type_id] END,
    NEW.id,
    v_price[1], true,
    v_price[2], true,
    v_price[3], true,
    v_price[1], NEW.display_order
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.packages_auto_template_on_insert() FROM PUBLIC, anon, authenticated;

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure);
BEGIN
  IF v_def NOT LIKE '%NULLIF(NEW.original_price, 0)%'
     OR v_def NOT LIKE '%NULLIF(NEW.sale_price, 0)%'
     OR v_def NOT LIKE '%COALESCE(v_val, v_pkg_orig, v_pkg_sale, 0)%'
     OR v_def NOT LIKE '%v_price[2], true%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：packages_auto_template_on_insert() 內容不是新版取價規則';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.packages_auto_template_on_insert()'::regprocedure) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式不是 SECURITY DEFINER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.accommodation_packages'::regclass AND tgname = 'trg_packages_auto_template_ins'
      AND tgenabled = 'O' AND tgfoid = 'public.packages_auto_template_on_insert()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：trg_packages_auto_template_ins 未指向此函式或未啟用';
  END IF;
END $$;
