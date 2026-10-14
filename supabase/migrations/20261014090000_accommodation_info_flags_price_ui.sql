-- ============================================================
-- 階段 1a ①：館別開關欄位（accommodation_info_flags）
--   new_price_ui_enabled     ：是否啟用「房型與方案」新價格頁（預設 false）
--   new_order_dialog_enabled ：新建單視窗（1a 不使用，預設 false）
--   price_sync_mode          ：方案原價 → 專案同步模式（預設 no_sync＝不同步）
--   另新增讀取 policy：館別成員（hotel_admin／staff）可讀自己館的列；既有 select / write policy 不動
-- rollback：docs/pricing-1a/rollback_20261014090000.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regclass('public.accommodation_info_flags') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.accommodation_info_flags 不存在';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
      AND column_name IN ('new_price_ui_enabled', 'new_order_dialog_enabled', 'price_sync_mode')
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：開關欄位已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accommodation_info_flags'
      AND policyname = 'accommodation_flags_select_own_accommodation'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：policy accommodation_flags_select_own_accommodation 已存在';
  END IF;
  IF to_regprocedure('public.user_has_access_to_accommodation(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.user_has_access_to_accommodation(uuid, uuid) 不存在';
  END IF;
END $$;

CREATE TEMP TABLE _flags_1a_before AS
SELECT count(*)::bigint AS n FROM public.accommodation_info_flags;

-- ============================= CHANGE =============================
ALTER TABLE public.accommodation_info_flags
  ADD COLUMN new_price_ui_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN new_order_dialog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN price_sync_mode text NOT NULL DEFAULT 'no_sync';

ALTER TABLE public.accommodation_info_flags
  ADD CONSTRAINT accommodation_info_flags_price_sync_mode_chk
  CHECK (price_sync_mode IN ('package_original', 'template_backfill', 'no_sync'));

COMMENT ON COLUMN public.accommodation_info_flags.new_price_ui_enabled IS
  '是否啟用「房型與方案」新價格頁；true 時舊頁面方案／專案價格欄位唯讀';
COMMENT ON COLUMN public.accommodation_info_flags.new_order_dialog_enabled IS
  '新建單視窗開關（階段 1a 不使用）';
COMMENT ON COLUMN public.accommodation_info_flags.price_sync_mode IS
  'package_original＝方案原價同步到 default_package_id 專案；template_backfill（保留）；no_sync＝不同步（預設）';

CREATE POLICY "accommodation_flags_select_own_accommodation" ON public.accommodation_info_flags
  FOR SELECT TO authenticated
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_before bigint;
  v_after bigint;
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
    AND (
      (column_name = 'new_price_ui_enabled' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false')
      OR (column_name = 'new_order_dialog_enabled' AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false')
      OR (column_name = 'price_sync_mode' AND data_type = 'text' AND is_nullable = 'NO' AND column_default = '''no_sync''::text')
    );
  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：欄位型別／NOT NULL／預設值不符（符合 % / 3）', v_cnt;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.accommodation_info_flags'::regclass
      AND conname = 'accommodation_info_flags_price_sync_mode_chk'
      AND pg_get_constraintdef(oid) LIKE '%package_original%template_backfill%no_sync%'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：price_sync_mode CHECK 不存在或內容不符';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accommodation_info_flags'
      AND policyname = 'accommodation_flags_select_own_accommodation' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：新讀取 policy 不存在';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'accommodation_info_flags'
      AND policyname IN ('accommodation_flags_select', 'accommodation_flags_write')
    GROUP BY schemaname HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：既有 select / write policy 不完整';
  END IF;

  SELECT n INTO v_before FROM _flags_1a_before;
  SELECT count(*) INTO v_after FROM public.accommodation_info_flags;
  IF v_before <> v_after THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：列數改變（% → %）', v_before, v_after;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.accommodation_info_flags
    WHERE new_price_ui_enabled OR new_order_dialog_enabled OR price_sync_mode <> 'no_sync'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：既有列預設值不是 false / false / no_sync';
  END IF;
END $$;

DROP TABLE _flags_1a_before;
