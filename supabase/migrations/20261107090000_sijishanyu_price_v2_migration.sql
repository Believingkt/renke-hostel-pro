-- 四季山宿（a4bacadc-9b7a-4110-ac04-a1cc6248c822）移轉到新價格頁
--   1) accommodation_info_flags：new_price_ui_enabled = true、price_sync_mode = 'package_original'（比照雲岫）、
--      new_order_dialog_enabled = false、auto_template_enabled = false
--   2) 方案：24人包棟沿用 90df31ce 改新價；新增 15 個方案（包棟 8～22、26～30 人；單間 4 個）
--      包棟 12 個 enabled = true；單間 4 個 enabled = false（先建好不開賣：四季包棟與單間同晚可能重複售出）
--   3) 專案：13 個既有專案接上各自方案；複製 24人包棟專案新增 26、28、30人包棟專案
--   4) 專案價格依 package_original 規則同步成方案原價（與 save_package_tier_prices 相同）
--   5) 網紅碼 AMILE77、KWYTMIO、MIE20 的適用專案加入 26、28、30人包棟新專案
-- 備份：public.sijishanyu_price_v2_backup_20261107（rollback 用）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE sj_plan (
  plan_key text PRIMARY KEY, name text NOT NULL, max_guests int NOT NULL,
  room_ids uuid[] NOT NULL, primary_room uuid NOT NULL,
  wk_s int, wk_o int, fs_s int, fs_o int, we_s int, we_o int,
  template_id uuid, package_id uuid, display_order int NOT NULL, is_whole boolean NOT NULL
) ON COMMIT DROP;

INSERT INTO sj_plan VALUES
  ('d2m', '雙人房(山景)', 2, '{6c72fc3e-9183-4788-a03d-bc043a2823e8,beffbc83-3ab1-460e-8a61-6f86c71602c7}', '6c72fc3e-9183-4788-a03d-bc043a2823e8', 5000, 7200, 5400, 7700, 6400, 9200, 'a247bcaf-74df-49e6-a1e1-d12b1d681263', NULL, 1, false),
  ('d2t', '雙人房(樹景)', 2, '{6c72fc3e-9183-4788-a03d-bc043a2823e8,beffbc83-3ab1-460e-8a61-6f86c71602c7}', '6c72fc3e-9183-4788-a03d-bc043a2823e8', 4000, 5800, 4400, 6300, 5400, 7800, '7a6e0125-8fd4-4f03-aa6c-37cf75b94bc0', NULL, 2, false),
  ('q4m', '四人房(山景)', 4, '{c4c80422-f4c2-47f0-9aef-dc1a663046a9,4074200a-43f9-4d0f-b996-3d1b4d539cff}', 'c4c80422-f4c2-47f0-9aef-dc1a663046a9', 9200, 13200, 10000, 14300, 12000, 17200, 'a32485b3-57a4-4c24-9c7e-12576ab508ce', NULL, 3, false),
  ('q4t', '四人房(樹景)', 4, '{c4c80422-f4c2-47f0-9aef-dc1a663046a9,4074200a-43f9-4d0f-b996-3d1b4d539cff}', 'c4c80422-f4c2-47f0-9aef-dc1a663046a9', 8000, 12000, 8800, 12600, 10800, 15500, '7195c9b1-0a11-4148-a510-467af8fdecbf', NULL, 4, false),
  ('w08', '8人包棟', 8, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 17250, 22857, 18900, 25143, 23200, 30857, '6f9a4ce1-dbab-4fae-91de-61b81e9957bd', NULL, 11, true),
  ('w10', '10人包棟', 10, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 21450, 28571, 23600, 31428, 28900, 38571, '4c9ec03d-262c-4afc-97b9-bb75e3d373f9', NULL, 12, true),
  ('w12', '12人包棟', 12, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 25700, 34286, 28300, 37714, 34700, 46286, 'edc56e89-c1ed-4b46-8427-ff16b56e2ea7', NULL, 13, true),
  ('w14', '14人包棟', 14, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 27000, 36000, 30000, 40000, 37500, 50000, '77ba5b4e-ebd2-48c9-85f8-ad8e1b34ba7b', NULL, 14, true),
  ('w16', '16人包棟', 16, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 30600, 41200, 34000, 45800, 42500, 57200, '6dd4685a-3e2e-4485-bae8-1a5a5afea232', NULL, 15, true),
  ('w18', '18人包棟', 18, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 34200, 46300, 38000, 51500, 47500, 64300, '329ddcfa-bcca-4279-a40b-f283f44fa0ad', NULL, 16, true),
  ('w20', '20人包棟', 20, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 37800, 51500, 42000, 57200, 52500, 71500, 'cd0731d2-ef07-4d80-a479-feada2bac996', NULL, 17, true),
  ('w22', '22人包棟', 22, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 41400, 56600, 46000, 62900, 57500, 78600, '94175b8f-a64f-4e6a-9a1b-c5facd7adabe', NULL, 18, true),
  ('w24', '24人包棟', 24, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 45000, 61800, 50000, 68600, 62500, 85800, 'd2d13d7e-8729-421a-9002-61c7a3e71717', '90df31ce-c89a-4f73-b5e1-62db8276f2f2', 19, true),
  ('w26', '26人包棟', 26, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 48600, 66900, 54000, 74300, 67500, 92800, NULL, NULL, 20, true),
  ('w28', '28人包棟', 28, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 52200, 72000, 58000, 80000, 72500, 100000, NULL, NULL, 21, true),
  ('w30', '30人包棟', 30, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 55800, 77200, 62000, 85800, 77500, 107000, NULL, NULL, 22, true);

-- ============================= PRECHECK =============================
DO $pre$
DECLARE
  c_acc CONSTANT uuid := 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
  c_pkg CONSTANT uuid := '90df31ce-c89a-4f73-b5e1-62db8276f2f2';
  c_whole CONSTANT uuid := '69e8fa0f-27b4-4259-b3dd-8525d61e014c';
  c_nine CONSTANT text[] := ARRAY['329ddcfa-bcca-4279-a40b-f283f44fa0ad','4c9ec03d-262c-4afc-97b9-bb75e3d373f9','6dd4685a-3e2e-4485-bae8-1a5a5afea232','6f9a4ce1-dbab-4fae-91de-61b81e9957bd','77ba5b4e-ebd2-48c9-85f8-ad8e1b34ba7b','94175b8f-a64f-4e6a-9a1b-c5facd7adabe','cd0731d2-ef07-4d80-a479-feada2bac996','d2d13d7e-8729-421a-9002-61c7a3e71717','edc56e89-c1ed-4b46-8427-ff16b56e2ea7'];
  v_n int;
  v_txt text;
BEGIN
  IF to_regclass('public.sijishanyu_price_v2_backup_20261107') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：備份表已存在，疑似已套用過本 migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_info_flags f WHERE f.accommodation_id = c_acc) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季已有 accommodation_info_flags 列';
  END IF;

  SELECT string_agg(r.id::text, ',' ORDER BY r.id) INTO v_txt FROM public.room_types r WHERE r.accommodation_id = c_acc;
  IF v_txt IS DISTINCT FROM '4074200a-43f9-4d0f-b996-3d1b4d539cff,69e8fa0f-27b4-4259-b3dd-8525d61e014c,6c72fc3e-9183-4788-a03d-bc043a2823e8,beffbc83-3ab1-460e-8a61-6f86c71602c7,c4c80422-f4c2-47f0-9aef-dc1a663046a9' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季房型與查證不符（%）', v_txt;
  END IF;

  SELECT count(*) INTO v_n FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc;
  IF v_n <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.accommodation_packages p
    WHERE p.id = c_pkg AND p.accommodation_id = c_acc AND p.numeric_code = 1001 AND p.enabled
      AND p.sale_price = 46300 AND p.original_price = 61800
      AND p.tier_prices = '{"weekend":{"sale":64300,"original":85800},"friday_sunday":{"sale":51400,"original":68600}}'::jsonb
      AND p.room_type_ids = ARRAY[c_whole]
  ) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季方案與查證不符（應只有 24人包棟 90df31ce，舊價）';
  END IF;

  SELECT count(*) INTO v_n FROM public.pricing_templates t WHERE t.accommodation_id = c_acc;
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季專案數 % ≠ 13', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM public.pricing_templates t JOIN sj_plan s ON s.template_id = t.id
  WHERE t.accommodation_id = c_acc AND t.default_package_id IS NULL
    AND t.numeric_code = 1100 + s.display_order - CASE WHEN s.is_whole THEN 6 ELSE 0 END
    AND (SELECT array_agg(x ORDER BY x) FROM unnest(t.room_type_ids) x) = (SELECT array_agg(y ORDER BY y) FROM unnest(s.room_ids) y);
  IF v_n <> 13 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：13 個專案的 id／代碼／房型／default_package_id 與查證相符的只有 % 個', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.discount_codes d
  WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20') AND d.is_active
    AND d.discount_type = 'percentage' AND d.discount_value = 30
    AND (SELECT array_agg(e ORDER BY e) FROM jsonb_array_elements_text(d.applicable_pricing_template_ids) e) = c_nine;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：網紅碼 3 個皆須啟用、percentage、30（七折）、適用 9 個包棟專案，相符的只有 % 個', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.package_date_prices d JOIN public.accommodation_packages p ON p.id = d.package_id WHERE p.accommodation_id = c_acc AND d.date >= CURRENT_DATE) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季已有未來 package_date_prices';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_day_tier_overrides o WHERE o.accommodation_id = c_acc AND o.date >= CURRENT_DATE) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季有未來日型例外，改價會觸發展開，請先確認';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc AND p.name IN (SELECT s.name FROM sj_plan s WHERE s.package_id IS NULL)) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：已有同名方案';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_owlting_config c WHERE c.accommodation_id = c_acc)
     OR EXISTS (SELECT 1 FROM public.accommodation_hotelnabe_config h WHERE h.accommodation_id = c_acc) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：四季已有奧丁丁／旭海設定，新方案會出現在 OTA 方案清單，請先確認';
  END IF;
END
$pre$;

-- ============================= 備份 =============================
CREATE TABLE public.sijishanyu_price_v2_backup_20261107 (
  kind text NOT NULL,
  ref_id uuid NOT NULL,
  data jsonb,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id)
);
ALTER TABLE public.sijishanyu_price_v2_backup_20261107 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sijishanyu_price_v2_backup_20261107 FROM PUBLIC, anon, authenticated;

INSERT INTO public.sijishanyu_price_v2_backup_20261107 (kind, ref_id, data)
SELECT 'package', p.id, to_jsonb(p) FROM public.accommodation_packages p WHERE p.id = '90df31ce-c89a-4f73-b5e1-62db8276f2f2'
UNION ALL
SELECT 'template', t.id, to_jsonb(t) FROM public.pricing_templates t WHERE t.accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822'
UNION ALL
SELECT 'discount_code', d.id, jsonb_build_object('code', d.code, 'applicable_pricing_template_ids', d.applicable_pricing_template_ids) FROM public.discount_codes d WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20')
UNION ALL
SELECT 'kol_order', o.id, to_jsonb(o) FROM public.orders o WHERE o.order_number IN ('DM3A89R8', 'QW9M94K4', 'NE6Y99A5');

-- ============================= 1) flags =============================
INSERT INTO public.accommodation_info_flags (accommodation_id, new_price_ui_enabled, new_order_dialog_enabled, price_sync_mode, auto_template_enabled)
VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', true, false, 'package_original', false);

-- ============================= 2) 方案 =============================
UPDATE sj_plan SET package_id = gen_random_uuid() WHERE package_id IS NULL;

-- 包棟：以 24人包棟方案為範本（保留加購／內含／房間分配／排除日期等），改名稱、人數、價格
INSERT INTO public.accommodation_packages
SELECT (jsonb_populate_record(NULL::public.accommodation_packages,
  to_jsonb(src) || jsonb_build_object(
    'id', s.package_id, 'name', s.name, 'numeric_code', NULL,
    'guest_count', s.max_guests, 'included_guest_count', s.max_guests, 'guest_count_max', s.max_guests,
    'display_order', s.display_order, 'created_at', now(), 'updated_at', now()))).*
FROM sj_plan s CROSS JOIN public.accommodation_packages src
WHERE s.is_whole AND src.id = '90df31ce-c89a-4f73-b5e1-62db8276f2f2' AND s.package_id <> src.id;

-- 單間：一般方案（不帶包棟的房間分配／內含）
INSERT INTO public.accommodation_packages
  (id, accommodation_id, name, sale_price, original_price, tier_prices, applicable_tiers, guest_count, included_guest_count,
   guest_count_max, room_type_ids, primary_room_type_id, enabled, display_order, includes, tags, room_type_allocation, excluded_date_ranges)
SELECT s.package_id, 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', s.name, s.wk_s, s.wk_o, '{}'::jsonb, ARRAY['weekday', 'friday_sunday', 'weekend'],
       s.max_guests, s.max_guests, s.max_guests, s.room_ids, s.primary_room, false, s.display_order, '[]'::jsonb, ARRAY[]::text[], '[]'::jsonb, '[]'::jsonb
FROM sj_plan s WHERE NOT s.is_whole;

-- 價格（含 24人包棟）：三層都寫；sale_price／original_price 為平日
UPDATE public.accommodation_packages p
SET tier_prices = jsonb_build_object(
      'weekday', jsonb_build_object('sale', s.wk_s, 'original', s.wk_o),
      'friday_sunday', jsonb_build_object('sale', s.fs_s, 'original', s.fs_o),
      'weekend', jsonb_build_object('sale', s.we_s, 'original', s.we_o)),
    sale_price = s.wk_s,
    original_price = s.wk_o,
    applicable_tiers = ARRAY['weekday', 'friday_sunday', 'weekend'],
    guest_count = s.max_guests,
    included_guest_count = s.max_guests,
    guest_count_max = s.max_guests,
    display_order = s.display_order,
    enabled = s.is_whole,
    updated_at = now()
FROM sj_plan s
WHERE p.id = s.package_id;

-- ============================= 3) 專案 =============================
UPDATE sj_plan SET template_id = gen_random_uuid() WHERE template_id IS NULL;

INSERT INTO public.pricing_templates
SELECT (jsonb_populate_record(NULL::public.pricing_templates,
  to_jsonb(src) || jsonb_build_object(
    'id', s.template_id, 'template_name', s.name, 'numeric_code', NULL,
    'project_name', CASE WHEN src.project_name IS NULL THEN NULL ELSE replace(src.project_name, '24人', s.max_guests || '人') END,
    'display_order', COALESCE(src.display_order, 0) + (s.max_guests - 24) / 2,
    'created_at', now(), 'updated_at', now()))).*
FROM sj_plan s CROSS JOIN public.pricing_templates src
WHERE s.max_guests IN (26, 28, 30) AND src.id = 'd2d13d7e-8729-421a-9002-61c7a3e71717';

INSERT INTO public.sijishanyu_price_v2_backup_20261107 (kind, ref_id, data)
SELECT 'new_package', s.package_id, NULL::jsonb FROM sj_plan s WHERE s.package_id <> '90df31ce-c89a-4f73-b5e1-62db8276f2f2'
UNION ALL
SELECT 'new_template', s.template_id, NULL::jsonb FROM sj_plan s WHERE s.max_guests IN (26, 28, 30);

-- 一個專案對一個方案；專案價格比照 package_original 同步成方案原價
UPDATE public.pricing_templates t
SET default_package_id = s.package_id,
    weekday_price = s.wk_o, weekday_enabled = true,
    peak_price = s.fs_o, peak_enabled = true,
    weekend_price = s.we_o, weekend_enabled = true,
    price = s.wk_o,
    updated_at = now()
FROM sj_plan s
WHERE t.id = s.template_id;

-- ============================= 4) 網紅碼 =============================
UPDATE public.discount_codes d
SET applicable_pricing_template_ids = d.applicable_pricing_template_ids
      || (SELECT jsonb_agg(s.template_id::text ORDER BY s.max_guests) FROM sj_plan s WHERE s.max_guests IN (26, 28, 30))
WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20');

-- ============================= POSTCHECK =============================
DO $post$
DECLARE
  c_acc CONSTANT uuid := 'a4bacadc-9b7a-4110-ac04-a1cc6248c822';
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc;
  IF v_n <> 16 THEN RAISE EXCEPTION 'POSTCHECK 失敗：四季方案 % ≠ 16', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.accommodation_packages p JOIN sj_plan s ON s.package_id = p.id
  WHERE p.accommodation_id = c_acc AND p.enabled = s.is_whole;
  IF v_n <> 16 THEN RAISE EXCEPTION 'POSTCHECK 失敗：啟用狀態不符（應包棟 12 個 true、單間 4 個 false），相符 %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.accommodation_packages p WHERE p.accommodation_id = c_acc AND p.enabled;
  IF v_n <> 12 THEN RAISE EXCEPTION 'POSTCHECK 失敗：四季啟用方案 % ≠ 12', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.accommodation_packages p JOIN sj_plan s ON s.package_id = p.id
  WHERE p.numeric_code IS NOT NULL AND p.sale_price = s.wk_s AND p.original_price = s.wk_o
    AND p.tier_prices #>> '{weekday,sale}' = s.wk_s::text AND p.tier_prices #>> '{weekday,original}' = s.wk_o::text
    AND p.tier_prices #>> '{friday_sunday,sale}' = s.fs_s::text AND p.tier_prices #>> '{friday_sunday,original}' = s.fs_o::text
    AND p.tier_prices #>> '{weekend,sale}' = s.we_s::text AND p.tier_prices #>> '{weekend,original}' = s.we_o::text
    AND p.applicable_tiers @> ARRAY['weekday', 'friday_sunday', 'weekend'] AND p.room_type_ids = s.room_ids
    AND p.primary_room_type_id = s.primary_room AND p.guest_count_max = s.max_guests;
  IF v_n <> 16 THEN RAISE EXCEPTION 'POSTCHECK 失敗：價格／房型／人數相符的方案只有 %', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.pricing_templates t JOIN sj_plan s ON s.template_id = t.id
  WHERE t.default_package_id = s.package_id AND t.numeric_code IS NOT NULL AND t.weekday_price = s.wk_o AND t.peak_price = s.fs_o AND t.weekend_price = s.we_o;
  IF v_n <> 16 THEN RAISE EXCEPTION 'POSTCHECK 失敗：專案對應方案相符的只有 %', v_n; END IF;
  IF (SELECT count(*) FROM public.pricing_templates t WHERE t.accommodation_id = c_acc) <> 16 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：四季專案數不是 16（可能有觸發器自動多建專案）';
  END IF;
  IF (SELECT count(DISTINCT t.default_package_id) FROM public.pricing_templates t WHERE t.accommodation_id = c_acc) <> 16 THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：有專案共用同一方案';
  END IF;

  SELECT count(*) INTO v_n FROM public.discount_codes d
  WHERE d.code IN ('AMILE77', 'KWYTMIO', 'MIE20') AND jsonb_array_length(d.applicable_pricing_template_ids) = 12;
  IF v_n <> 3 THEN RAISE EXCEPTION 'POSTCHECK 失敗：網紅碼適用專案不是 12 個（相符 %）', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.orders o JOIN public.sijishanyu_price_v2_backup_20261107 b ON b.kind = 'kol_order' AND b.ref_id = o.id
  WHERE to_jsonb(o) = b.data;
  IF v_n <> 3 THEN RAISE EXCEPTION 'POSTCHECK 失敗：KOL 訂單有變動（未變動 % 張）', v_n; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info_flags f WHERE f.accommodation_id = c_acc AND f.new_price_ui_enabled AND NOT f.new_order_dialog_enabled AND f.price_sync_mode = 'package_original' AND NOT f.auto_template_enabled) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：flags 不符';
  END IF;
  IF EXISTS (SELECT 1 FROM public.package_date_prices d JOIN public.accommodation_packages p ON p.id = d.package_id WHERE p.accommodation_id = c_acc AND d.date >= CURRENT_DATE) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：產生了 package_date_prices';
  END IF;
END
$post$;

COMMIT;
