-- ============================================================
-- 價格頁整合 第 1 批：資料庫結構＋RPC（前端 0）
--   1) package_date_prices 加 source（manual／season／day_tier）、season_id、applied_tier；既有資料一律 manual
--      非展開程式寫入（舊頁、精靈）一律標 manual → 手動優先、重新展開不覆蓋
--   2) package_seasons（方案版季節區段）、accommodation_day_tier_overrides（日型例外：整欄或單一方案）
--      展開寫入方案單日價：售價、原價都寫；只動今天以後、非 manual 的列
--   3) pricing_template_groups／members＋折扣碼群組連結；成員或連結變動時由資料庫自動同步折扣碼適用專案
--   4) 同館奧丁丁與旭海 sync_enabled 互斥
--   權限：staff_can_edit_module（房價 room_price；折扣碼連結 discount_codes）＋ new_price_ui_enabled
-- rollback：docs/pricing-2/rollback_20261026090000.sql
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ============================= PRECHECK =============================
DO $$
BEGIN
  IF to_regclass('public.package_seasons') IS NOT NULL
     OR to_regclass('public.pricing_template_groups') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'package_date_prices' AND column_name = 'source') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：疑似已套用過 20261026090000';
  END IF;
  IF to_regclass('public.package_date_prices') IS NULL OR to_regclass('public.accommodation_packages') IS NULL
     OR to_regclass('public.pricing_templates') IS NULL OR to_regclass('public.discount_codes') IS NULL
     OR to_regclass('public.accommodation_info_flags') IS NULL OR to_regclass('public.public_holidays') IS NULL
     OR to_regclass('public.accommodation_owlting_config') IS NULL OR to_regclass('public.accommodation_hotelnabe_config') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：依賴的表不存在';
  END IF;
  IF to_regprocedure('public.staff_can_edit_module(uuid, text)') IS NULL
     OR to_regprocedure('public.classify_day_tier(date, uuid)') IS NULL
     OR to_regprocedure('public.user_has_role(uuid, uuid, public.app_role)') IS NULL
     OR to_regprocedure('public.staff_can_view_module(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：依賴的函式不存在';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
        AND ((table_name = 'accommodation_info_flags' AND column_name = 'new_price_ui_enabled')
          OR (table_name = 'accommodation_owlting_config' AND column_name = 'sync_enabled')
          OR (table_name = 'accommodation_hotelnabe_config' AND column_name = 'sync_enabled')
          OR (table_name = 'discount_codes' AND column_name = 'applicable_pricing_template_ids')
          OR (table_name = 'accommodation_packages' AND column_name = 'tier_prices'))) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：依賴欄位不完整';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_owlting_config o
             JOIN public.accommodation_hotelnabe_config h ON h.accommodation_id = o.accommodation_id
             WHERE o.sync_enabled AND h.sync_enabled) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：已有館同時開啟奧丁丁與旭海同步';
  END IF;
END $$;

-- ============================= 1) 方案單日價來源 =============================
CREATE TABLE public.package_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.accommodation_packages(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  date_from date NOT NULL,
  date_to date NOT NULL,
  tier_prices jsonb NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from AND date_to - date_from <= 365)
);
CREATE INDEX idx_package_seasons_pkg_dates ON public.package_seasons (package_id, date_from, date_to);

CREATE TABLE public.accommodation_day_tier_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE CASCADE,
  date date NOT NULL,
  tier text NOT NULL CHECK (tier IN ('weekday', 'friday_sunday', 'weekend')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_day_tier_overrides_venue ON public.accommodation_day_tier_overrides (accommodation_id, date) WHERE package_id IS NULL;
CREATE UNIQUE INDEX uq_day_tier_overrides_pkg ON public.accommodation_day_tier_overrides (package_id, date) WHERE package_id IS NOT NULL;

ALTER TABLE public.package_date_prices
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN season_id uuid REFERENCES public.package_seasons(id) ON DELETE SET NULL,
  ADD COLUMN applied_tier text;
ALTER TABLE public.package_date_prices
  ADD CONSTRAINT package_date_prices_source_check CHECK (source IN ('manual', 'season', 'day_tier')),
  ADD CONSTRAINT package_date_prices_applied_tier_check CHECK (applied_tier IS NULL OR applied_tier IN ('weekday', 'friday_sunday', 'weekend'));
COMMENT ON COLUMN public.package_date_prices.source IS 'manual＝手動（舊頁、精靈、既有資料）；season／day_tier＝由季節區段或日型例外展開，手動優先、重新展開不覆蓋 manual';

-- 非展開程式寫入一律視為手動
CREATE FUNCTION public.pdp_mark_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.pdp_materialize', true), '') <> 'on' THEN
    -- 價格與適用狀態都沒變（例如刪除季節區段時 season_id 被設為 NULL）就保留原來源
    IF TG_OP = 'UPDATE' AND (NEW.sale_price, NEW.original_price, NEW.is_available, NEW.package_id, NEW.date)
         IS NOT DISTINCT FROM (OLD.sale_price, OLD.original_price, OLD.is_available, OLD.package_id, OLD.date) THEN
      NEW.source := OLD.source;
      NEW.applied_tier := OLD.applied_tier;
      RETURN NEW;
    END IF;
    NEW.source := 'manual';
    NEW.season_id := NULL;
    NEW.applied_tier := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_pdp_mark_manual
BEFORE INSERT OR UPDATE ON public.package_date_prices
FOR EACH ROW EXECUTE FUNCTION public.pdp_mark_manual();

-- 權限＋館別開關
CREATE FUNCTION public.pricing_v2_assert_can_edit(p_accommodation_id uuid, p_module text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_accommodation_id IS NULL OR NOT COALESCE(public.staff_can_edit_module(p_accommodation_id, p_module), false) THEN
    RAISE EXCEPTION '沒有編輯權限' USING ERRCODE = '42501';
  END IF;
  IF (SELECT f.new_price_ui_enabled FROM public.accommodation_info_flags f WHERE f.accommodation_id = p_accommodation_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '此館尚未啟用新價格頁' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 季節價驗證：key 必須與方案目前販售的日型完全相同；售價、原價都必填、正整數、原價不低於售價
CREATE FUNCTION public.pricing_v2_clean_season_tiers(p_package_id uuid, p_tiers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg_keys text[];
  v_keys text[];
  v_key text;
  v_sale numeric;
  v_orig numeric;
  v_clean jsonb := '{}'::jsonb;
BEGIN
  IF p_tiers IS NULL OR jsonb_typeof(p_tiers) <> 'object' THEN
    RAISE EXCEPTION '價格格式錯誤' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_pkg_keys
  FROM public.accommodation_packages p, jsonb_object_keys(CASE WHEN jsonb_typeof(p.tier_prices) = 'object' THEN p.tier_prices ELSE '{}'::jsonb END) k
  WHERE p.id = p_package_id;
  IF cardinality(v_pkg_keys) = 0 THEN
    RAISE EXCEPTION '方案尚未設定平日／旺日／假日價，請先在「房型與方案」存檔' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(k ORDER BY k), ARRAY[]::text[]) INTO v_keys FROM jsonb_object_keys(p_tiers) k;
  IF v_keys <> v_pkg_keys THEN
    RAISE EXCEPTION '季節價的日型必須與方案相同：%', array_to_string(v_pkg_keys, '、') USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY v_keys LOOP
    IF jsonb_typeof(p_tiers -> v_key) <> 'object' THEN
      RAISE EXCEPTION '價格格式錯誤' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_sale := (p_tiers -> v_key ->> 'sale')::numeric;
      v_orig := (p_tiers -> v_key ->> 'original')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '價格必須是數字' USING ERRCODE = '22023';
    END;
    IF COALESCE(v_sale, 0) <= 0 OR COALESCE(v_orig, 0) <= 0 OR v_sale <> trunc(v_sale) OR v_orig <> trunc(v_orig) THEN
      RAISE EXCEPTION '售價與原價都必須是大於 0 的整數' USING ERRCODE = '22023';
    END IF;
    IF v_orig < v_sale THEN
      RAISE EXCEPTION '原價不得低於售價' USING ERRCODE = '22023';
    END IF;
    v_clean := v_clean || jsonb_build_object(v_key, jsonb_build_object('sale', v_sale::integer, 'original', v_orig::integer));
  END LOOP;
  RETURN v_clean;
END;
$$;

-- 展開寫入（內部）：p_strict = true 時價格缺漏直接報錯；false（觸發器用）時該日改回一般價格（刪掉非手動列）
CREATE FUNCTION public.pricing_v2_rebuild_pdp(
  p_accommodation_id uuid, p_package_ids uuid[], p_from date, p_to date, p_strict boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := GREATEST(p_from, CURRENT_DATE);
  v_to date := p_to;
  v_bad record;
  v_written integer := 0;
  v_deleted integer := 0;
  v_manual integer := 0;
  v_dropped integer := 0;
BEGIN
  IF p_accommodation_id IS NULL OR v_to IS NULL OR v_from > v_to THEN
    RETURN jsonb_build_object('written', 0, 'deleted', 0, 'kept_manual', 0, 'dropped_missing_price', 0);
  END IF;
  IF v_to - v_from > 400 THEN
    RAISE EXCEPTION '展開範圍過大' USING ERRCODE = '22023';
  END IF;

  IF to_regclass('pg_temp.pv2_desired') IS NULL THEN
    CREATE TEMP TABLE pv2_desired (
    package_id uuid, date date, source text, season_id uuid, tier text, sale numeric, original numeric
  ) ON COMMIT DROP;
  END IF;
  TRUNCATE pg_temp.pv2_desired;

  INSERT INTO pg_temp.pv2_desired
  SELECT x.package_id, x.date,
         CASE WHEN x.ov_tier IS NOT NULL THEN 'day_tier' ELSE 'season' END,
         x.season_id, x.tier,
         NULLIF(x.prices ->> 'sale', '')::numeric,
         COALESCE(NULLIF(NULLIF(x.prices ->> 'original', '')::numeric, 0),
                  CASE WHEN x.season_id IS NULL THEN NULLIF(x.pkg_original, 0) END)
  FROM (
    SELECT p.id AS package_id, d.date, ov.tier AS ov_tier, s.id AS season_id, p.original_price AS pkg_original,
           COALESCE(ov.tier, CASE public.classify_day_tier(d.date, p.accommodation_id)
                               WHEN 'peak' THEN 'friday_sunday' ELSE public.classify_day_tier(d.date, p.accommodation_id) END) AS tier,
           CASE WHEN s.id IS NOT NULL THEN s.tier_prices ELSE p.tier_prices END
             -> COALESCE(ov.tier, CASE public.classify_day_tier(d.date, p.accommodation_id)
                                    WHEN 'peak' THEN 'friday_sunday' ELSE public.classify_day_tier(d.date, p.accommodation_id) END) AS prices
    FROM public.accommodation_packages p
    CROSS JOIN LATERAL (SELECT g::date AS date FROM generate_series(v_from, v_to, interval '1 day') g) d
    LEFT JOIN LATERAL (
      SELECT o.tier FROM public.accommodation_day_tier_overrides o
      WHERE o.accommodation_id = p.accommodation_id AND o.date = d.date
        AND (o.package_id = p.id OR o.package_id IS NULL)
      ORDER BY (o.package_id IS NULL) LIMIT 1
    ) ov ON true
    LEFT JOIN LATERAL (
      SELECT ps.id, ps.tier_prices FROM public.package_seasons ps
      WHERE ps.package_id = p.id AND d.date BETWEEN ps.date_from AND ps.date_to
      ORDER BY ps.date_from DESC LIMIT 1
    ) s ON true
    WHERE p.accommodation_id = p_accommodation_id
      AND (p_package_ids IS NULL OR p.id = ANY (p_package_ids))
      AND (ov.tier IS NOT NULL OR s.id IS NOT NULL)
  ) x;

  SELECT d.*, p.name AS package_name INTO v_bad
  FROM pg_temp.pv2_desired d JOIN public.accommodation_packages p ON p.id = d.package_id
  WHERE COALESCE(d.sale, 0) <= 0 OR COALESCE(d.original, 0) <= 0
  ORDER BY d.date LIMIT 1;
  IF FOUND THEN
    IF p_strict THEN
      RAISE EXCEPTION '方案「%」% 的%價格缺少售價或原價，請先補齊', v_bad.package_name, v_bad.date,
        CASE v_bad.tier WHEN 'weekday' THEN '平日' WHEN 'friday_sunday' THEN '旺日' ELSE '假日' END
        USING ERRCODE = '22023';
    END IF;
    DELETE FROM pg_temp.pv2_desired WHERE COALESCE(sale, 0) <= 0 OR COALESCE(original, 0) <= 0;
    GET DIAGNOSTICS v_dropped = ROW_COUNT;
  END IF;

  PERFORM set_config('app.pdp_materialize', 'on', true);

  DELETE FROM public.package_date_prices t
  WHERE t.accommodation_id = p_accommodation_id
    AND (p_package_ids IS NULL OR t.package_id = ANY (p_package_ids))
    AND t.date BETWEEN v_from AND v_to
    AND t.source <> 'manual'
    AND NOT EXISTS (SELECT 1 FROM pg_temp.pv2_desired d WHERE d.package_id = t.package_id AND d.date = t.date);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_manual
  FROM pg_temp.pv2_desired d
  JOIN public.package_date_prices t ON t.package_id = d.package_id AND t.date = d.date AND t.source = 'manual';

  INSERT INTO public.package_date_prices AS t
    (accommodation_id, package_id, date, sale_price, original_price, is_available, source, season_id, applied_tier, created_by)
  SELECT p_accommodation_id, d.package_id, d.date, d.sale, d.original, NULL, d.source, d.season_id, d.tier, auth.uid()
  FROM pg_temp.pv2_desired d
  ON CONFLICT (package_id, date) DO UPDATE
    SET sale_price = EXCLUDED.sale_price,
        original_price = EXCLUDED.original_price,
        is_available = NULL,
        source = EXCLUDED.source,
        season_id = EXCLUDED.season_id,
        applied_tier = EXCLUDED.applied_tier,
        updated_at = now()
    WHERE t.source <> 'manual'
      AND (t.sale_price, t.original_price, t.is_available, t.source, t.season_id, t.applied_tier)
          IS DISTINCT FROM (EXCLUDED.sale_price, EXCLUDED.original_price, NULL::boolean, EXCLUDED.source, EXCLUDED.season_id, EXCLUDED.applied_tier);
  GET DIAGNOSTICS v_written = ROW_COUNT;

  PERFORM set_config('app.pdp_materialize', 'off', true);
  RETURN jsonb_build_object('written', v_written, 'deleted', v_deleted, 'kept_manual', v_manual, 'dropped_missing_price', v_dropped);
END;
$$;

-- ============================= RPC：季節區段、日型例外、重新展開 =============================
CREATE FUNCTION public.save_package_season(
  p_package_id uuid, p_season_id uuid, p_name text, p_date_from date, p_date_to date, p_tier_prices jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
  v_old_from date;
  v_old_to date;
  v_clean jsonb;
  v_id uuid;
  v_res jsonb;
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.accommodation_packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '方案不存在' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.pricing_v2_assert_can_edit(v_acc, 'room_price');
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION '區段名稱需 1～50 字' USING ERRCODE = '22023';
  END IF;
  IF p_date_from IS NULL OR p_date_to IS NULL OR p_date_to < p_date_from OR p_date_to - p_date_from > 365 THEN
    RAISE EXCEPTION '日期區間錯誤：結束日不得早於開始日，最長 366 天' USING ERRCODE = '22023';
  END IF;
  IF p_date_to < CURRENT_DATE THEN
    RAISE EXCEPTION '區段已全部過去，不能設定' USING ERRCODE = '22023';
  END IF;
  v_clean := public.pricing_v2_clean_season_tiers(p_package_id, p_tier_prices);

  IF p_season_id IS NOT NULL THEN
    SELECT date_from, date_to INTO v_old_from, v_old_to FROM public.package_seasons WHERE id = p_season_id AND package_id = p_package_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '季節區段不存在' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.package_seasons s
             WHERE s.package_id = p_package_id AND s.id IS DISTINCT FROM p_season_id
               AND s.date_from <= p_date_to AND s.date_to >= p_date_from) THEN
    RAISE EXCEPTION '與同方案其他季節區段的日期重疊' USING ERRCODE = '22023';
  END IF;

  IF p_season_id IS NULL THEN
    INSERT INTO public.package_seasons (accommodation_id, package_id, name, date_from, date_to, tier_prices, created_by)
    VALUES (v_acc, p_package_id, btrim(p_name), p_date_from, p_date_to, v_clean, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.package_seasons
    SET name = btrim(p_name), date_from = p_date_from, date_to = p_date_to, tier_prices = v_clean, updated_at = now()
    WHERE id = p_season_id;
    v_id := p_season_id;
  END IF;

  v_res := public.pricing_v2_rebuild_pdp(v_acc, ARRAY[p_package_id],
             LEAST(p_date_from, COALESCE(v_old_from, p_date_from)),
             GREATEST(p_date_to, COALESCE(v_old_to, p_date_to)), true);
  RETURN v_res || jsonb_build_object('season_id', v_id);
END;
$$;

CREATE FUNCTION public.delete_package_season(p_season_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s record;
BEGIN
  SELECT * INTO v_s FROM public.package_seasons WHERE id = p_season_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '季節區段不存在' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.pricing_v2_assert_can_edit(v_s.accommodation_id, 'room_price');
  DELETE FROM public.package_seasons WHERE id = p_season_id;
  RETURN public.pricing_v2_rebuild_pdp(v_s.accommodation_id, ARRAY[v_s.package_id], v_s.date_from, v_s.date_to, true);
END;
$$;

-- p_tier = NULL 代表清除；p_package_id = NULL 代表整欄（全館方案）
CREATE FUNCTION public.set_day_tier_overrides(
  p_accommodation_id uuid, p_dates date[], p_tier text, p_package_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dates date[];
BEGIN
  PERFORM public.pricing_v2_assert_can_edit(p_accommodation_id, 'room_price');
  IF p_tier IS NOT NULL AND p_tier NOT IN ('weekday', 'friday_sunday', 'weekend') THEN
    RAISE EXCEPTION '日型只能是平日、旺日或假日' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT d ORDER BY d) INTO v_dates FROM unnest(p_dates) d WHERE d IS NOT NULL;
  IF v_dates IS NULL OR cardinality(v_dates) > 366 THEN
    RAISE EXCEPTION '請選擇 1～366 天' USING ERRCODE = '22023';
  END IF;
  IF v_dates[1] < CURRENT_DATE THEN
    RAISE EXCEPTION '不能設定今天以前的日期' USING ERRCODE = '22023';
  END IF;
  IF v_dates[cardinality(v_dates)] - v_dates[1] > 400 THEN
    RAISE EXCEPTION '日期範圍過大' USING ERRCODE = '22023';
  END IF;
  IF p_package_id IS NOT NULL THEN
    PERFORM 1 FROM public.accommodation_packages WHERE id = p_package_id AND accommodation_id = p_accommodation_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION '方案不存在' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    PERFORM 1 FROM public.accommodation_packages WHERE accommodation_id = p_accommodation_id FOR UPDATE;
  END IF;

  DELETE FROM public.accommodation_day_tier_overrides
  WHERE accommodation_id = p_accommodation_id AND date = ANY (v_dates)
    AND package_id IS NOT DISTINCT FROM p_package_id;
  IF p_tier IS NOT NULL THEN
    INSERT INTO public.accommodation_day_tier_overrides (accommodation_id, package_id, date, tier, created_by)
    SELECT p_accommodation_id, p_package_id, d, p_tier, auth.uid() FROM unnest(v_dates) d;
  END IF;

  RETURN public.pricing_v2_rebuild_pdp(p_accommodation_id,
           CASE WHEN p_package_id IS NULL THEN NULL ELSE ARRAY[p_package_id] END,
           v_dates[1], v_dates[cardinality(v_dates)], true);
END;
$$;

CREATE FUNCTION public.rebuild_package_date_prices(p_accommodation_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.pricing_v2_assert_can_edit(p_accommodation_id, 'room_price');
  PERFORM 1 FROM public.accommodation_packages WHERE accommodation_id = p_accommodation_id FOR UPDATE;
  RETURN public.pricing_v2_rebuild_pdp(p_accommodation_id, NULL, p_from, p_to, true);
END;
$$;

-- 方案三層價或國定假日變動時，自動重新展開今天以後受影響的列（價格缺漏的日子改回一般價格，不擋原本的存檔）
CREATE FUNCTION public.pricing_v2_on_package_price_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to date;
BEGIN
  SELECT max(o.date) INTO v_to FROM public.accommodation_day_tier_overrides o
  WHERE o.accommodation_id = NEW.accommodation_id AND (o.package_id = NEW.id OR o.package_id IS NULL) AND o.date >= CURRENT_DATE;
  IF v_to IS NOT NULL THEN
    PERFORM public.pricing_v2_rebuild_pdp(NEW.accommodation_id, ARRAY[NEW.id], CURRENT_DATE, v_to, false);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_pricing_v2_package_price_change
AFTER UPDATE OF tier_prices, original_price ON public.accommodation_packages
FOR EACH ROW
WHEN (OLD.tier_prices IS DISTINCT FROM NEW.tier_prices OR OLD.original_price IS DISTINCT FROM NEW.original_price)
EXECUTE FUNCTION public.pricing_v2_on_package_price_change();

CREATE FUNCTION public.pricing_v2_on_holiday_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.accommodation_id, min(c.holiday_date) AS d_from, max(c.holiday_date) AS d_to
    FROM (
      SELECT accommodation_id, holiday_date FROM pg_temp.pv2_new_rows
      UNION ALL
      SELECT accommodation_id, holiday_date FROM pg_temp.pv2_old_rows
    ) c
    WHERE c.accommodation_id IS NOT NULL AND c.holiday_date >= CURRENT_DATE
      AND (EXISTS (SELECT 1 FROM public.package_seasons s WHERE s.accommodation_id = c.accommodation_id AND s.date_to >= CURRENT_DATE)
        OR EXISTS (SELECT 1 FROM public.accommodation_day_tier_overrides o WHERE o.accommodation_id = c.accommodation_id AND o.date >= CURRENT_DATE))
    GROUP BY c.accommodation_id
  LOOP
    PERFORM public.pricing_v2_rebuild_pdp(r.accommodation_id, NULL, r.d_from, r.d_to, false);
  END LOOP;
END;
$$;
CREATE FUNCTION public.pricing_v2_on_holiday_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_regclass('pg_temp.pv2_new_rows') IS NULL THEN
    CREATE TEMP TABLE pv2_new_rows (accommodation_id uuid, holiday_date date) ON COMMIT DROP;
  END IF;
  IF to_regclass('pg_temp.pv2_old_rows') IS NULL THEN
    CREATE TEMP TABLE pv2_old_rows (accommodation_id uuid, holiday_date date) ON COMMIT DROP;
  END IF;
  TRUNCATE pg_temp.pv2_new_rows; TRUNCATE pg_temp.pv2_old_rows;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO pg_temp.pv2_new_rows SELECT accommodation_id, holiday_date FROM pv2_new;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO pg_temp.pv2_old_rows SELECT accommodation_id, holiday_date FROM pv2_old;
  END IF;
  PERFORM public.pricing_v2_on_holiday_change();
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_pricing_v2_holiday_ins AFTER INSERT ON public.public_holidays
  REFERENCING NEW TABLE AS pv2_new FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_holiday_insert();
CREATE TRIGGER trg_pricing_v2_holiday_upd AFTER UPDATE ON public.public_holidays
  REFERENCING NEW TABLE AS pv2_new OLD TABLE AS pv2_old FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_holiday_insert();
CREATE TRIGGER trg_pricing_v2_holiday_del AFTER DELETE ON public.public_holidays
  REFERENCING OLD TABLE AS pv2_old FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_holiday_insert();

-- ============================= 3) 專案群組＋折扣碼自動同步 =============================
CREATE TABLE public.pricing_template_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (accommodation_id, name)
);
CREATE TABLE public.pricing_template_group_members (
  template_id uuid PRIMARY KEY REFERENCES public.pricing_templates(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.pricing_template_groups(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ptg_members_group ON public.pricing_template_group_members (group_id);
CREATE TABLE public.discount_code_template_groups (
  discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.pricing_template_groups(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (discount_code_id, group_id)
);
CREATE INDEX idx_dctg_group ON public.discount_code_template_groups (group_id);
-- 由群組同步加進折扣碼的專案（原本就手動勾選的不記，移出群組時才不會誤刪手動勾選）
CREATE TABLE public.discount_code_group_synced_templates (
  discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.pricing_templates(id) ON DELETE CASCADE,
  PRIMARY KEY (discount_code_id, template_id)
);

CREATE FUNCTION public.pricing_v2_recompute_code_scope(p_discount_code_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text[];
  v_desired text[];
  v_prev text[];
  v_added text[];
  v_new text[];
BEGIN
  SELECT COALESCE(ARRAY(SELECT jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(dc.applicable_pricing_template_ids) = 'array' THEN dc.applicable_pricing_template_ids ELSE '[]'::jsonb END)), ARRAY[]::text[])
    INTO v_current
  FROM public.discount_codes dc WHERE dc.id = p_discount_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT m.template_id::text), ARRAY[]::text[]) INTO v_desired
  FROM public.discount_code_template_groups l
  JOIN public.pricing_template_group_members m ON m.group_id = l.group_id
  WHERE l.discount_code_id = p_discount_code_id;
  SELECT COALESCE(array_agg(s.template_id::text), ARRAY[]::text[]) INTO v_prev
  FROM public.discount_code_group_synced_templates s WHERE s.discount_code_id = p_discount_code_id;

  v_added := ARRAY(SELECT x FROM unnest(v_desired) x WHERE NOT x = ANY (v_current) ORDER BY x);
  v_new := ARRAY(
    SELECT x FROM (
      SELECT x, min(o) AS o FROM (
        SELECT x, ord AS o FROM unnest(v_current) WITH ORDINALITY u(x, ord)
        WHERE NOT (x = ANY (v_prev) AND NOT x = ANY (v_desired))
        UNION ALL
        SELECT x, 1000000 + ord FROM unnest(v_added) WITH ORDINALITY u(x, ord)
      ) q GROUP BY x
    ) r ORDER BY o);

  DELETE FROM public.discount_code_group_synced_templates s
  WHERE s.discount_code_id = p_discount_code_id AND NOT s.template_id::text = ANY (v_desired);
  INSERT INTO public.discount_code_group_synced_templates (discount_code_id, template_id)
  SELECT p_discount_code_id, x::uuid FROM unnest(v_added) x
  ON CONFLICT DO NOTHING;

  IF v_new IS DISTINCT FROM v_current THEN
    UPDATE public.discount_codes
    SET applicable_pricing_template_ids = to_jsonb(v_new), updated_at = now()
    WHERE id = p_discount_code_id;
  END IF;
END;
$$;

CREATE FUNCTION public.pricing_v2_on_group_member_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT l.discount_code_id
    FROM public.discount_code_template_groups l
    WHERE l.group_id IN (SELECT group_id FROM pg_temp.pv2_m_rows)
       OR l.discount_code_id IN (SELECT s.discount_code_id FROM public.discount_code_group_synced_templates s
                                 WHERE s.template_id IN (SELECT template_id FROM pg_temp.pv2_m_rows))
    ORDER BY 1
  LOOP
    PERFORM public.pricing_v2_recompute_code_scope(r.discount_code_id);
  END LOOP;
END;
$$;
CREATE FUNCTION public.pricing_v2_on_group_member_stmt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF to_regclass('pg_temp.pv2_m_rows') IS NULL THEN
    CREATE TEMP TABLE pv2_m_rows (template_id uuid, group_id uuid) ON COMMIT DROP;
  END IF;
  TRUNCATE pg_temp.pv2_m_rows;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO pg_temp.pv2_m_rows SELECT template_id, group_id FROM pv2_mnew;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    INSERT INTO pg_temp.pv2_m_rows SELECT template_id, group_id FROM pv2_mold;
  END IF;
  PERFORM public.pricing_v2_on_group_member_change();
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_ptg_members_ins AFTER INSERT ON public.pricing_template_group_members
  REFERENCING NEW TABLE AS pv2_mnew FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_group_member_stmt();
CREATE TRIGGER trg_ptg_members_upd AFTER UPDATE ON public.pricing_template_group_members
  REFERENCING NEW TABLE AS pv2_mnew OLD TABLE AS pv2_mold FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_group_member_stmt();
CREATE TRIGGER trg_ptg_members_del AFTER DELETE ON public.pricing_template_group_members
  REFERENCING OLD TABLE AS pv2_mold FOR EACH STATEMENT EXECUTE FUNCTION public.pricing_v2_on_group_member_stmt();

CREATE FUNCTION public.pricing_v2_on_code_link_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pricing_v2_recompute_code_scope(COALESCE(NEW.discount_code_id, OLD.discount_code_id));
  RETURN NULL;
END;
$$;
CREATE TRIGGER trg_dctg_change AFTER INSERT OR DELETE ON public.discount_code_template_groups
  FOR EACH ROW EXECUTE FUNCTION public.pricing_v2_on_code_link_change();

CREATE FUNCTION public.save_pricing_template_group(p_accommodation_id uuid, p_group_id uuid, p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM public.pricing_v2_assert_can_edit(p_accommodation_id, 'room_price');
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION '群組名稱需 1～50 字' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pricing_template_groups g
             WHERE g.accommodation_id = p_accommodation_id AND g.name = btrim(p_name) AND g.id IS DISTINCT FROM p_group_id) THEN
    RAISE EXCEPTION '群組名稱重複' USING ERRCODE = '23505';
  END IF;
  IF p_group_id IS NULL THEN
    INSERT INTO public.pricing_template_groups (accommodation_id, name, created_by)
    VALUES (p_accommodation_id, btrim(p_name), auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.pricing_template_groups SET name = btrim(p_name), updated_at = now()
    WHERE id = p_group_id AND accommodation_id = p_accommodation_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION '群組不存在' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.delete_pricing_template_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.pricing_template_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '群組不存在' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.pricing_v2_assert_can_edit(v_acc, 'room_price');
  DELETE FROM public.pricing_template_groups WHERE id = p_group_id;
END;
$$;

CREATE FUNCTION public.set_pricing_template_group_members(p_group_id uuid, p_template_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
  v_ids uuid[];
  v_n integer;
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.pricing_template_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '群組不存在' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.pricing_v2_assert_can_edit(v_acc, 'room_price');
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids FROM unnest(p_template_ids) x WHERE x IS NOT NULL;
  SELECT count(*) INTO v_n FROM public.pricing_templates t WHERE t.id = ANY (v_ids) AND t.accommodation_id = v_acc;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION '專案不存在或不屬於本館' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pricing_template_group_members m WHERE m.template_id = ANY (v_ids) AND m.group_id <> p_group_id) THEN
    RAISE EXCEPTION '專案已屬於其他群組，請先從原群組移除' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.pricing_template_group_members WHERE group_id = p_group_id AND NOT template_id = ANY (v_ids);
  INSERT INTO public.pricing_template_group_members (template_id, group_id, accommodation_id)
  SELECT x, p_group_id, v_acc FROM unnest(v_ids) x
  ON CONFLICT (template_id) DO NOTHING;
  RETURN cardinality(v_ids);
END;
$$;

CREATE FUNCTION public.set_discount_code_template_groups(p_discount_code_id uuid, p_group_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc uuid;
  v_ids uuid[];
  v_n integer;
BEGIN
  SELECT accommodation_id INTO v_acc FROM public.discount_codes WHERE id = p_discount_code_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '折扣碼不存在' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.pricing_v2_assert_can_edit(v_acc, 'discount_codes');
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids FROM unnest(p_group_ids) x WHERE x IS NOT NULL;
  SELECT count(*) INTO v_n FROM public.pricing_template_groups g WHERE g.id = ANY (v_ids) AND g.accommodation_id = v_acc;
  IF v_n <> cardinality(v_ids) THEN
    RAISE EXCEPTION '群組不存在或不屬於本館' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.discount_code_template_groups WHERE discount_code_id = p_discount_code_id AND NOT group_id = ANY (v_ids);
  INSERT INTO public.discount_code_template_groups (discount_code_id, group_id, accommodation_id)
  SELECT p_discount_code_id, x, v_acc FROM unnest(v_ids) x
  ON CONFLICT DO NOTHING;
  PERFORM public.pricing_v2_recompute_code_scope(p_discount_code_id);
  RETURN (SELECT applicable_pricing_template_ids FROM public.discount_codes WHERE id = p_discount_code_id);
END;
$$;

-- ============================= 4) 奧丁丁／旭海互斥 =============================
CREATE FUNCTION public.assert_single_inventory_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sync_enabled IS TRUE THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('inventory_channel:' || NEW.accommodation_id::text, 0));
    IF TG_TABLE_NAME = 'accommodation_owlting_config' AND EXISTS (
         SELECT 1 FROM public.accommodation_hotelnabe_config h WHERE h.accommodation_id = NEW.accommodation_id AND h.sync_enabled) THEN
      RAISE EXCEPTION '此館已開啟旭海同步，不能同時開啟奧丁丁同步' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'accommodation_hotelnabe_config' AND EXISTS (
         SELECT 1 FROM public.accommodation_owlting_config o WHERE o.accommodation_id = NEW.accommodation_id AND o.sync_enabled) THEN
      RAISE EXCEPTION '此館已開啟奧丁丁同步，不能同時開啟旭海同步' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_single_inventory_channel
BEFORE INSERT OR UPDATE OF sync_enabled, accommodation_id ON public.accommodation_owlting_config
FOR EACH ROW EXECUTE FUNCTION public.assert_single_inventory_channel();
CREATE TRIGGER trg_single_inventory_channel
BEFORE INSERT OR UPDATE OF sync_enabled, accommodation_id ON public.accommodation_hotelnabe_config
FOR EACH ROW EXECUTE FUNCTION public.assert_single_inventory_channel();

-- ============================= RLS／權限 =============================
ALTER TABLE public.package_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_day_tier_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_template_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_code_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_code_group_synced_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_price viewers read package seasons" ON public.package_seasons
  FOR SELECT TO authenticated USING (public.staff_can_view_module(accommodation_id, 'room_price'));
CREATE POLICY "room_price viewers read day tier overrides" ON public.accommodation_day_tier_overrides
  FOR SELECT TO authenticated USING (public.staff_can_view_module(accommodation_id, 'room_price'));
CREATE POLICY "room_price viewers read template groups" ON public.pricing_template_groups
  FOR SELECT TO authenticated USING (public.staff_can_view_module(accommodation_id, 'room_price')
                                     OR public.staff_can_view_module(accommodation_id, 'discount_codes'));
CREATE POLICY "room_price viewers read template group members" ON public.pricing_template_group_members
  FOR SELECT TO authenticated USING (public.staff_can_view_module(accommodation_id, 'room_price')
                                     OR public.staff_can_view_module(accommodation_id, 'discount_codes'));
CREATE POLICY "discount viewers read code groups" ON public.discount_code_template_groups
  FOR SELECT TO authenticated USING (public.staff_can_view_module(accommodation_id, 'discount_codes'));

REVOKE ALL ON public.package_seasons, public.accommodation_day_tier_overrides, public.pricing_template_groups,
  public.pricing_template_group_members, public.discount_code_template_groups, public.discount_code_group_synced_templates
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.package_seasons, public.accommodation_day_tier_overrides, public.pricing_template_groups,
  public.pricing_template_group_members, public.discount_code_template_groups TO authenticated;
GRANT ALL ON public.package_seasons, public.accommodation_day_tier_overrides, public.pricing_template_groups,
  public.pricing_template_group_members, public.discount_code_template_groups, public.discount_code_group_synced_templates
  TO service_role;

REVOKE ALL ON FUNCTION public.pdp_mark_manual() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_assert_can_edit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_clean_season_tiers(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_rebuild_pdp(uuid, uuid[], date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_package_price_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_holiday_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_holiday_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_recompute_code_scope(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_group_member_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_group_member_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pricing_v2_on_code_link_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_single_inventory_channel() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.save_package_season(uuid, uuid, text, date, date, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_package_season(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_day_tier_overrides(uuid, date[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rebuild_package_date_prices(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_pricing_template_group(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_pricing_template_group(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_pricing_template_group_members(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_discount_code_template_groups(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_package_season(uuid, uuid, text, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_package_season(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_day_tier_overrides(uuid, date[], text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_package_date_prices(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_pricing_template_group(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_pricing_template_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_pricing_template_group_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_discount_code_template_groups(uuid, uuid[]) TO authenticated;

COMMIT;
