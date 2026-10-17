-- ============================================================
-- 上架引導第一批 ②：新館開關 auto_template_enabled ＋ 方案自動建立／綁定專案
--   accommodation_info_flags.auto_template_enabled（預設 false；只有明確開啟的館才生效）
--   accommodation_packages 三支 trigger（皆只在 auto_template_enabled = true 的館生效）：
--   1. AFTER INSERT：自動建立一筆 pricing_templates，default_package_id = 方案 id（一對一，已有綁定則不建）
--        房型：room_type_id = primary_room_type_id；room_type_ids = ARRAY[主房型]，沒有主房型寫 '{}'（NOT NULL，不可寫 NULL）
--        價格：比照 save_package_tier_prices 的 package_original 同步（tier_prices 原價；沒有 tier_prices 用 original_price／sale_price）
--   2. AFTER UPDATE OF primary_room_type_id：綁定專案 room_type_id 等於舊主房型或為 NULL 時，同步 room_type_id／room_type_ids
--   3. BEFORE DELETE：方案已有訂單（orders.package_id），或綁定專案被 orders.pricing_template_id、
--        order_rooms.template_id、owlting_room_type_group_members.rate_plan_template_id 引用 → 拒絕刪除
--        （ERRCODE 23503「此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用」）；
--        都沒有被引用 → 連同綁定專案一起刪除
--   default_package_id 不加唯一索引（正式庫為非唯一 idx），一對一由 trigger 判斷
-- precheck：docs/onboarding-1/precheck_20261018090001.sql
-- postcheck：docs/onboarding-1/postcheck_20261018090001.sql
-- rollback：docs/onboarding-1/rollback_20261018090001.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regclass('public.accommodation_info_flags') IS NULL
     OR to_regclass('public.accommodation_packages') IS NULL
     OR to_regclass('public.pricing_templates') IS NULL
     OR to_regclass('public.orders') IS NULL
     OR to_regclass('public.order_rooms') IS NULL
     OR to_regclass('public.owlting_room_type_group_members') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：必要資料表不完整';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'package_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pricing_template_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_rooms' AND column_name = 'template_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'owlting_room_type_group_members' AND column_name = 'rate_plan_template_id'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：刪除檢查所需的引用欄位不完整';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
      AND column_name = 'auto_template_enabled'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：auto_template_enabled 已存在，疑似已套用過本 migration';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_packages'
        AND column_name IN ('id', 'accommodation_id', 'name', 'primary_room_type_id', 'tier_prices',
                            'sale_price', 'original_price', 'display_order')) <> 8 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_packages 欄位不完整';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pricing_templates'
        AND column_name IN ('accommodation_id', 'template_name', 'room_type_id', 'room_type_ids', 'default_package_id',
                            'weekday_price', 'weekday_enabled', 'peak_price', 'peak_enabled',
                            'weekend_price', 'weekend_enabled', 'price', 'display_order', 'updated_at')) <> 14 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：pricing_templates 欄位不完整';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pricing_templates'
      AND column_name = 'room_type_ids' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：pricing_templates.room_type_ids 不是 NOT NULL（與正式庫查證結果不符）';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pricing_templates'::regclass AND contype = 'f'
      AND confrelid = 'public.accommodation_packages'::regclass AND confdeltype = 'n'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：pricing_templates.default_package_id 的 FK 不是 ON DELETE SET NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
    WHERE i.indrelid = 'public.pricing_templates'::regclass AND i.indisunique
      AND a.attname = 'default_package_id'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：default_package_id 已有唯一索引（與正式庫查證結果不符）';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.accommodation_packages'::regclass
      AND tgname IN ('trg_packages_auto_template_ins', 'trg_packages_auto_template_room', 'trg_packages_auto_template_del')
  ) OR to_regprocedure('public.packages_auto_template_on_insert()') IS NOT NULL
    OR to_regprocedure('public.packages_auto_template_on_primary_room()') IS NOT NULL
    OR to_regprocedure('public.packages_auto_template_on_delete()') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：自動建專案 trigger／函式已存在';
  END IF;
END $$;

CREATE TEMP TABLE _onb1_tpl_before AS
SELECT (SELECT count(*) FROM public.accommodation_info_flags)::bigint AS n_flags,
       (SELECT count(*) FROM public.pricing_templates)::bigint AS n_tpl,
       (SELECT count(*) FROM public.accommodation_packages)::bigint AS n_pkg;

-- ============================= CHANGE =============================
ALTER TABLE public.accommodation_info_flags
  ADD COLUMN auto_template_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.accommodation_info_flags.auto_template_enabled IS
  '上架引導第一批：true 時新增方案會自動建立一對一的專案（pricing_templates.default_package_id）';

CREATE FUNCTION public.packages_auto_template_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tiers jsonb := COALESCE(NEW.tier_prices, '{}'::jsonb);
  v_base integer := round(COALESCE(NEW.original_price, NEW.sale_price))::integer;
  v_wd integer;
  v_fs integer;
  v_we integer;
  v_has_tiers boolean;
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

  v_has_tiers := jsonb_typeof(v_tiers) = 'object' AND v_tiers ? 'weekday';
  IF v_has_tiers THEN
    v_wd := round(COALESCE((v_tiers #>> '{weekday,original}')::numeric, (v_tiers #>> '{weekday,sale}')::numeric))::integer;
    v_fs := round(COALESCE((v_tiers #>> '{friday_sunday,original}')::numeric, (v_tiers #>> '{friday_sunday,sale}')::numeric))::integer;
    v_we := round(COALESCE((v_tiers #>> '{weekend,original}')::numeric, (v_tiers #>> '{weekend,sale}')::numeric))::integer;
  ELSE
    v_wd := v_base;
    v_fs := v_base;
    v_we := v_base;
  END IF;

  INSERT INTO public.pricing_templates (
    accommodation_id, template_name, room_type_id, room_type_ids, default_package_id,
    weekday_price, weekday_enabled, peak_price, peak_enabled, weekend_price, weekend_enabled,
    price, display_order
  ) VALUES (
    NEW.accommodation_id, NEW.name, NEW.primary_room_type_id,
    CASE WHEN NEW.primary_room_type_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.primary_room_type_id] END,
    NEW.id,
    v_wd, true,
    v_fs, CASE WHEN v_has_tiers THEN v_tiers ? 'friday_sunday' ELSE true END,
    v_we, CASE WHEN v_has_tiers THEN v_tiers ? 'weekend' ELSE true END,
    v_wd, NEW.display_order
  );
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.packages_auto_template_on_primary_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info_flags f
    WHERE f.accommodation_id = NEW.accommodation_id AND f.auto_template_enabled
  ) THEN
    RETURN NULL;
  END IF;

  UPDATE public.pricing_templates t
  SET room_type_id = NEW.primary_room_type_id,
      room_type_ids = CASE WHEN NEW.primary_room_type_id IS NULL THEN '{}'::uuid[]
                           ELSE ARRAY[NEW.primary_room_type_id] END,
      updated_at = now()
  WHERE t.default_package_id = NEW.id
    AND t.accommodation_id = NEW.accommodation_id
    AND (t.room_type_id IS NULL OR t.room_type_id = OLD.primary_room_type_id);
  RETURN NULL;
END;
$$;

CREATE FUNCTION public.packages_auto_template_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info_flags f
    WHERE f.accommodation_id = OLD.accommodation_id AND f.auto_template_enabled
  ) THEN
    RETURN OLD;
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.package_id = OLD.id)
     OR EXISTS (
       SELECT 1 FROM public.pricing_templates t
       WHERE t.default_package_id = OLD.id
         AND (EXISTS (SELECT 1 FROM public.orders o WHERE o.pricing_template_id = t.id)
              OR EXISTS (SELECT 1 FROM public.order_rooms r WHERE r.template_id = t.id)
              OR EXISTS (SELECT 1 FROM public.owlting_room_type_group_members m WHERE m.rate_plan_template_id = t.id))
     ) THEN
    RAISE EXCEPTION '此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.pricing_templates t
  WHERE t.default_package_id = OLD.id
    AND t.accommodation_id = OLD.accommodation_id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.packages_auto_template_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.packages_auto_template_on_primary_room() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.packages_auto_template_on_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_packages_auto_template_ins
  AFTER INSERT ON public.accommodation_packages
  FOR EACH ROW EXECUTE FUNCTION public.packages_auto_template_on_insert();

CREATE TRIGGER trg_packages_auto_template_room
  AFTER UPDATE OF primary_room_type_id ON public.accommodation_packages
  FOR EACH ROW
  WHEN (OLD.primary_room_type_id IS DISTINCT FROM NEW.primary_room_type_id)
  EXECUTE FUNCTION public.packages_auto_template_on_primary_room();

CREATE TRIGGER trg_packages_auto_template_del
  BEFORE DELETE ON public.accommodation_packages
  FOR EACH ROW EXECUTE FUNCTION public.packages_auto_template_on_delete();

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_before RECORD;
  v_cnt int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
      AND column_name = 'auto_template_enabled' AND data_type = 'boolean'
      AND is_nullable = 'NO' AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：auto_template_enabled 欄位型別／NOT NULL／預設值不符';
  END IF;

  SELECT count(*) INTO v_cnt FROM pg_trigger t
  WHERE t.tgrelid = 'public.accommodation_packages'::regclass AND t.tgenabled = 'O'
    AND (
      (t.tgname = 'trg_packages_auto_template_ins'
        AND t.tgfoid = 'public.packages_auto_template_on_insert()'::regprocedure
        AND pg_get_triggerdef(t.oid) LIKE '%AFTER INSERT ON public.accommodation_packages FOR EACH ROW%')
      OR (t.tgname = 'trg_packages_auto_template_room'
        AND t.tgfoid = 'public.packages_auto_template_on_primary_room()'::regprocedure
        AND pg_get_triggerdef(t.oid) LIKE '%AFTER UPDATE OF primary_room_type_id ON public.accommodation_packages FOR EACH ROW WHEN%')
      OR (t.tgname = 'trg_packages_auto_template_del'
        AND t.tgfoid = 'public.packages_auto_template_on_delete()'::regprocedure
        AND pg_get_triggerdef(t.oid) LIKE '%BEFORE DELETE ON public.accommodation_packages FOR EACH ROW%')
    );
  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：自動建專案 trigger 不完整（符合 % / 3）', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt FROM pg_proc
  WHERE oid IN ('public.packages_auto_template_on_insert()'::regprocedure,
                'public.packages_auto_template_on_primary_room()'::regprocedure,
                'public.packages_auto_template_on_delete()'::regprocedure)
    AND prosecdef;
  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：函式不是全部 SECURITY DEFINER（% / 3）', v_cnt;
  END IF;
  IF pg_get_functiondef('public.packages_auto_template_on_delete()'::regprocedure) NOT LIKE '%o.package_id = OLD.id%'
     OR pg_get_functiondef('public.packages_auto_template_on_delete()'::regprocedure) NOT LIKE '%23503%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：刪除檢查函式內容不符（缺 orders.package_id 檢查或 ERRCODE 23503）';
  END IF;

  SELECT * INTO v_before FROM _onb1_tpl_before;
  IF v_before.n_flags <> (SELECT count(*) FROM public.accommodation_info_flags)
     OR v_before.n_tpl <> (SELECT count(*) FROM public.pricing_templates)
     OR v_before.n_pkg <> (SELECT count(*) FROM public.accommodation_packages) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：flags／專案／方案列數改變';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_info_flags WHERE auto_template_enabled) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：既有館別 auto_template_enabled 不是 false';
  END IF;
END $$;

DROP TABLE _onb1_tpl_before;
