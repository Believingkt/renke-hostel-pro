-- ============================================================
-- 階段 1a ③：雲岫海景渡假會館資料轉換與開啟新價格頁
--   館別：7690a606-6bac-4cd5-a3e7-2fa754b318e8
--   1) 7 個方案 tier_prices 補 weekday 層 = {sale: sale_price, original: original_price}（其他欄位不動）
--   2) 專案 16人包棟：weekday_price、price 39000 → 41000
--   3) 專案 8人包棟：peak_price NULL → 23600、peak_enabled false → true
--   4) 專案 10人包棟：peak_price NULL → 29000、peak_enabled false → true
--   5) 雲岫 flags：new_price_ui_enabled = true、price_sync_mode = 'package_original'、new_order_dialog_enabled = false
--   基準值＝2026-10-14 anon 讀取（P3）
-- rollback：docs/pricing-1a/rollback_20261014090002.sql
-- ============================================================

DO $$
DECLARE
  c_acc constant uuid := '7690a606-6bac-4cd5-a3e7-2fa754b318e8';
  v_n int;
  v_bad text;
  -- 轉換前 md5
  b_pkg_yx text; b_tpl_yx text; b_pkg_other text; b_tpl_other text;
  b_pdp text; b_rip text; b_flags_other text;
  -- 轉換後 md5
  a_pkg_yx text; a_tpl_yx text; a_pkg_other text; a_tpl_other text;
  a_pdp text; a_rip text; a_flags_other text;
  v_role text;
  v_priv text;
BEGIN
  -- ============================= PRECHECK =============================
  -- 防重複套用（最前面）
  IF EXISTS (
    SELECT 1 FROM public.accommodation_packages
    WHERE accommodation_id = c_acc AND tier_prices ? 'weekday'
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：雲岫已有方案的 tier_prices 含 weekday，疑似已套用過本 migration';
  END IF;
  IF to_regclass('public.backup_20261014_yunxiu_packages') IS NOT NULL
     OR to_regclass('public.backup_20261014_yunxiu_templates') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：備份表已存在，疑似已套用過本 migration';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
        AND column_name IN ('new_price_ui_enabled', 'new_order_dialog_enabled', 'price_sync_mode')) <> 3 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_info_flags 缺少開關欄位（請先套用 20261014090000）';
  END IF;

  -- 方案逐筆比對（sale_price、original_price、tier_prices、applicable_tiers）
  CREATE TEMP TABLE _yx_pkg_expected (
    id uuid PRIMARY KEY, numeric_code int, sale numeric, original numeric, tiers jsonb, applicable text[]
  );
  INSERT INTO _yx_pkg_expected VALUES
    ('4478c114-63ad-4e2d-92ca-62cdcb664cf4', 1001, 8500, 15500, '{}'::jsonb, ARRAY['weekday']),
    ('c4a76622-8c5a-4f8c-9d27-249f37baeb83', 1002, 3600, 6900,
      '{"friday_sunday":{"sale":4000,"original":8000},"weekend":{"sale":5800,"original":9700}}'::jsonb,
      ARRAY['weekday','friday_sunday','weekend']),
    ('a1950bd7-9f57-4552-b236-69b872a0cfaa', 1003, 11000, 20600,
      '{"friday_sunday":{"sale":13000,"original":23600}}'::jsonb, ARRAY['weekday','friday_sunday']),
    ('b2c17a5f-a9ad-4163-b21a-bcf8131a264e', 1004, 14400, 25800,
      '{"friday_sunday":{"sale":16000,"original":29000}}'::jsonb, ARRAY['weekday','friday_sunday']),
    ('0681ce82-28e8-4f56-894f-9d8931c10280', 1005, 17000, 30900,
      '{"friday_sunday":{"sale":19000,"original":34300},"weekend":{"sale":23000,"original":41200}}'::jsonb,
      ARRAY['weekday','friday_sunday','weekend']),
    ('620e7294-4a5d-418c-be11-aa29a9720102', 1006, 20000, 36000,
      '{"friday_sunday":{"sale":22000,"original":40000},"weekend":{"sale":26000,"original":48000}}'::jsonb,
      ARRAY['weekday','friday_sunday','weekend']),
    ('7579717e-f664-4ef4-9b2d-90aa274c6912', 1007, 23000, 41000,
      '{"friday_sunday":{"sale":25000,"original":45000},"weekend":{"sale":29000,"original":54800}}'::jsonb,
      ARRAY['weekday','friday_sunday','weekend']);

  SELECT count(*) INTO v_n FROM public.accommodation_packages WHERE accommodation_id = c_acc;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：雲岫方案數為 %，預期 7', v_n;
  END IF;
  SELECT string_agg(e.numeric_code::text, ',') INTO v_bad
  FROM _yx_pkg_expected e
  LEFT JOIN public.accommodation_packages p ON p.id = e.id AND p.accommodation_id = c_acc
  WHERE p.id IS NULL
     OR p.numeric_code IS DISTINCT FROM e.numeric_code
     OR p.sale_price IS DISTINCT FROM e.sale
     OR p.original_price IS DISTINCT FROM e.original
     OR p.tier_prices IS DISTINCT FROM e.tiers
     OR p.applicable_tiers IS DISTINCT FROM e.applicable;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：方案現值與 P3 基準不符（numeric_code：%）', v_bad;
  END IF;

  -- 專案逐筆比對（price、weekday_price、peak_price、peak_enabled、weekend_price、weekend_enabled、default_package_id）
  CREATE TEMP TABLE _yx_tpl_expected (
    id uuid PRIMARY KEY, name text, price int, weekday int, peak int, peak_en boolean,
    weekend int, weekend_en boolean, pkg uuid
  );
  INSERT INTO _yx_tpl_expected VALUES
    ('02f134fc-4a12-4b4f-a87e-44f13a7e3aa1', '6人包棟',   15500, 15500, NULL,  false, NULL,  false, '4478c114-63ad-4e2d-92ca-62cdcb664cf4'),
    ('c8b86fa2-9dcc-4f02-9760-c0b85ab3b172', '海景四人房', 6900,  6900,  8000,  true,  9700,  true,  'c4a76622-8c5a-4f8c-9d27-249f37baeb83'),
    ('326fc21c-982c-4511-aacb-21cc6f2d9712', '8人包棟',   20600, 20600, NULL,  false, NULL,  false, 'a1950bd7-9f57-4552-b236-69b872a0cfaa'),
    ('7577b6f2-dc13-401d-8811-fb1f009e3e89', '10人包棟',  25800, 25800, NULL,  false, NULL,  false, 'b2c17a5f-a9ad-4163-b21a-bcf8131a264e'),
    ('64343ffa-709b-46ed-a639-5937a566fae4', '12人包棟',  30900, 30900, 34300, true,  41200, true,  '0681ce82-28e8-4f56-894f-9d8931c10280'),
    ('2945cc9e-a26b-407b-8772-cf79bfd79d62', '14人包棟',  36000, 36000, 40000, true,  48000, true,  '620e7294-4a5d-418c-be11-aa29a9720102'),
    ('7c457061-aca5-48f2-bdcc-eff29f1e6422', '16人包棟',  39000, 39000, 45000, true,  54800, true,  '7579717e-f664-4ef4-9b2d-90aa274c6912');

  SELECT count(*) INTO v_n FROM public.pricing_templates WHERE accommodation_id = c_acc;
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：雲岫專案數為 %，預期 7', v_n;
  END IF;
  SELECT string_agg(e.name, ',') INTO v_bad
  FROM _yx_tpl_expected e
  LEFT JOIN public.pricing_templates t ON t.id = e.id AND t.accommodation_id = c_acc
  WHERE t.id IS NULL
     OR t.price IS DISTINCT FROM e.price
     OR t.weekday_price IS DISTINCT FROM e.weekday
     OR t.peak_price IS DISTINCT FROM e.peak
     OR t.peak_enabled IS DISTINCT FROM e.peak_en
     OR t.weekend_price IS DISTINCT FROM e.weekend
     OR t.weekend_enabled IS DISTINCT FROM e.weekend_en
     OR t.default_package_id IS DISTINCT FROM e.pkg;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：專案現值與 P3 基準不符（%）', v_bad;
  END IF;

  -- 雲岫 flags：若已有列，必須仍為預設（未開啟）
  IF EXISTS (
    SELECT 1 FROM public.accommodation_info_flags
    WHERE accommodation_id = c_acc
      AND (new_price_ui_enabled OR new_order_dialog_enabled OR price_sync_mode <> 'no_sync')
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：雲岫 flags 已非預設值';
  END IF;

  -- ============================= 轉換前 md5 =============================
  SELECT md5(COALESCE(string_agg((to_jsonb(p) - 'tier_prices' - 'updated_at')::text, '|' ORDER BY p.id), ''))
    INTO b_pkg_yx FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc;
  SELECT md5(COALESCE(string_agg((to_jsonb(t) - 'price' - 'weekday_price' - 'peak_price' - 'peak_enabled' - 'updated_at')::text, '|' ORDER BY t.id), ''))
    INTO b_tpl_yx FROM public.pricing_templates t WHERE t.accommodation_id = c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), ''))
    INTO b_pkg_other FROM public.accommodation_packages p WHERE p.accommodation_id <> c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), ''))
    INTO b_tpl_other FROM public.pricing_templates t WHERE t.accommodation_id <> c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))
    INTO b_pdp FROM public.package_date_prices x;
  SELECT md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))
    INTO b_rip FROM public.room_inventory_pricing x;
  SELECT md5(COALESCE(string_agg(to_jsonb(f)::text, '|' ORDER BY f.id), ''))
    INTO b_flags_other FROM public.accommodation_info_flags f WHERE f.accommodation_id <> c_acc;

  -- ============================= 備份 =============================
  CREATE TABLE public.backup_20261014_yunxiu_packages AS
    SELECT * FROM public.accommodation_packages WHERE accommodation_id = c_acc;
  CREATE TABLE public.backup_20261014_yunxiu_templates AS
    SELECT * FROM public.pricing_templates WHERE accommodation_id = c_acc;
  ALTER TABLE public.backup_20261014_yunxiu_packages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.backup_20261014_yunxiu_templates ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.backup_20261014_yunxiu_packages FROM anon, authenticated;
  REVOKE ALL ON public.backup_20261014_yunxiu_templates FROM anon, authenticated;

  -- ============================= 轉換 =============================
  -- 1) 方案補 weekday 層（WHERE 帶舊值）
  UPDATE public.accommodation_packages p
  SET tier_prices = p.tier_prices || jsonb_build_object(
        'weekday', jsonb_build_object('sale', p.sale_price::bigint, 'original', p.original_price::bigint))
  FROM _yx_pkg_expected e
  WHERE p.id = e.id
    AND p.accommodation_id = c_acc
    AND p.sale_price = e.sale
    AND p.original_price = e.original
    AND p.tier_prices = e.tiers
    AND NOT (p.tier_prices ? 'weekday');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 7 THEN RAISE EXCEPTION '轉換失敗：方案更新 % 筆，預期 7', v_n; END IF;

  -- 2) 16人包棟：平日價與 price 39000 → 41000
  UPDATE public.pricing_templates
  SET weekday_price = 41000, price = 41000
  WHERE id = '7c457061-aca5-48f2-bdcc-eff29f1e6422' AND accommodation_id = c_acc
    AND default_package_id = '7579717e-f664-4ef4-9b2d-90aa274c6912'
    AND weekday_price = 39000 AND price = 39000;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '轉換失敗：16人包棟專案更新 % 筆，預期 1', v_n; END IF;

  -- 3) 8人包棟：旺日 NULL/false → 23600/true
  UPDATE public.pricing_templates
  SET peak_price = 23600, peak_enabled = true
  WHERE id = '326fc21c-982c-4511-aacb-21cc6f2d9712' AND accommodation_id = c_acc
    AND default_package_id = 'a1950bd7-9f57-4552-b236-69b872a0cfaa'
    AND peak_price IS NULL AND peak_enabled = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '轉換失敗：8人包棟專案更新 % 筆，預期 1', v_n; END IF;

  -- 4) 10人包棟：旺日 NULL/false → 29000/true
  UPDATE public.pricing_templates
  SET peak_price = 29000, peak_enabled = true
  WHERE id = '7577b6f2-dc13-401d-8811-fb1f009e3e89' AND accommodation_id = c_acc
    AND default_package_id = 'b2c17a5f-a9ad-4163-b21a-bcf8131a264e'
    AND peak_price IS NULL AND peak_enabled = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '轉換失敗：10人包棟專案更新 % 筆，預期 1', v_n; END IF;

  -- 5) 雲岫 flags（沒有列就新增；有列則只在仍為預設值時更新）
  INSERT INTO public.accommodation_info_flags AS f
    (accommodation_id, new_price_ui_enabled, price_sync_mode, new_order_dialog_enabled, updated_at)
  VALUES (c_acc, true, 'package_original', false, now())
  ON CONFLICT (accommodation_id) DO UPDATE
    SET new_price_ui_enabled = true,
        price_sync_mode = 'package_original',
        new_order_dialog_enabled = false,
        updated_at = now()
    WHERE f.new_price_ui_enabled = false
      AND f.price_sync_mode = 'no_sync'
      AND f.new_order_dialog_enabled = false;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '轉換失敗：雲岫 flags 寫入 % 筆，預期 1', v_n; END IF;

  -- ============================= POSTCHECK =============================
  SELECT string_agg(e.numeric_code::text, ',') INTO v_bad
  FROM _yx_pkg_expected e
  JOIN public.accommodation_packages p ON p.id = e.id
  WHERE p.tier_prices IS DISTINCT FROM (e.tiers || jsonb_build_object(
          'weekday', jsonb_build_object('sale', e.sale::bigint, 'original', e.original::bigint)))
     OR p.sale_price IS DISTINCT FROM e.sale
     OR p.original_price IS DISTINCT FROM e.original
     OR p.applicable_tiers IS DISTINCT FROM e.applicable;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：方案轉換結果不符（numeric_code：%）', v_bad;
  END IF;

  SELECT string_agg(e.name, ',') INTO v_bad
  FROM _yx_tpl_expected e
  JOIN public.pricing_templates t ON t.id = e.id
  WHERE t.price IS DISTINCT FROM (CASE WHEN e.name = '16人包棟' THEN 41000 ELSE e.price END)
     OR t.weekday_price IS DISTINCT FROM (CASE WHEN e.name = '16人包棟' THEN 41000 ELSE e.weekday END)
     OR t.peak_price IS DISTINCT FROM (CASE e.name WHEN '8人包棟' THEN 23600 WHEN '10人包棟' THEN 29000 ELSE e.peak END)
     OR t.peak_enabled IS DISTINCT FROM (CASE WHEN e.name IN ('8人包棟', '10人包棟') THEN true ELSE e.peak_en END)
     OR t.weekend_price IS DISTINCT FROM e.weekend
     OR t.weekend_enabled IS DISTINCT FROM e.weekend_en
     OR t.default_package_id IS DISTINCT FROM e.pkg;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：專案轉換結果不符（%）', v_bad;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info_flags
    WHERE accommodation_id = c_acc AND new_price_ui_enabled = true
      AND price_sync_mode = 'package_original' AND new_order_dialog_enabled = false
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：雲岫 flags 不符';
  END IF;

  SELECT md5(COALESCE(string_agg((to_jsonb(p) - 'tier_prices' - 'updated_at')::text, '|' ORDER BY p.id), ''))
    INTO a_pkg_yx FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc;
  SELECT md5(COALESCE(string_agg((to_jsonb(t) - 'price' - 'weekday_price' - 'peak_price' - 'peak_enabled' - 'updated_at')::text, '|' ORDER BY t.id), ''))
    INTO a_tpl_yx FROM public.pricing_templates t WHERE t.accommodation_id = c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), ''))
    INTO a_pkg_other FROM public.accommodation_packages p WHERE p.accommodation_id <> c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id), ''))
    INTO a_tpl_other FROM public.pricing_templates t WHERE t.accommodation_id <> c_acc;
  SELECT md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))
    INTO a_pdp FROM public.package_date_prices x;
  SELECT md5(COALESCE(string_agg(to_jsonb(x)::text, '|' ORDER BY x.id), ''))
    INTO a_rip FROM public.room_inventory_pricing x;
  SELECT md5(COALESCE(string_agg(to_jsonb(f)::text, '|' ORDER BY f.id), ''))
    INTO a_flags_other FROM public.accommodation_info_flags f WHERE f.accommodation_id <> c_acc;

  IF b_pkg_yx <> a_pkg_yx THEN RAISE EXCEPTION 'POSTCHECK 失敗：雲岫方案的其他欄位改變了'; END IF;
  IF b_tpl_yx <> a_tpl_yx THEN RAISE EXCEPTION 'POSTCHECK 失敗：雲岫專案的其他欄位改變了'; END IF;
  IF b_pkg_other <> a_pkg_other THEN RAISE EXCEPTION 'POSTCHECK 失敗：其他館的方案改變了'; END IF;
  IF b_tpl_other <> a_tpl_other THEN RAISE EXCEPTION 'POSTCHECK 失敗：其他館的專案改變了'; END IF;
  IF b_pdp <> a_pdp THEN RAISE EXCEPTION 'POSTCHECK 失敗：package_date_prices 改變了'; END IF;
  IF b_rip <> a_rip THEN RAISE EXCEPTION 'POSTCHECK 失敗：room_inventory_pricing 改變了'; END IF;
  IF b_flags_other <> a_flags_other THEN RAISE EXCEPTION 'POSTCHECK 失敗：其他館的 flags 改變了'; END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_role, 'public.backup_20261014_yunxiu_packages', v_priv)
         OR has_table_privilege(v_role, 'public.backup_20261014_yunxiu_templates', v_priv) THEN
        RAISE EXCEPTION 'POSTCHECK 失敗：% 對備份表仍有 % 權限', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backup_20261014_yunxiu_packages'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backup_20261014_yunxiu_templates'::regclass) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：備份表未啟用 RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND tablename IN ('backup_20261014_yunxiu_packages', 'backup_20261014_yunxiu_templates')) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：備份表不應有 policy';
  END IF;

  RAISE NOTICE 'md5 雲岫方案其他欄位 % / 雲岫專案其他欄位 % / 其他館方案 % / 其他館專案 % / package_date_prices % / room_inventory_pricing % / 其他館 flags %',
    a_pkg_yx, a_tpl_yx, a_pkg_other, a_tpl_other, a_pdp, a_rip, a_flags_other;

  DROP TABLE _yx_pkg_expected;
  DROP TABLE _yx_tpl_expected;
END $$;
