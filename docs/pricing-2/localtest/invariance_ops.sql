-- 補件 2：未開新版、沒有季節區段／日型例外的館（價測未開新版 f3…），以及開新版但沒有區段／例外的館（價測雲岫 f1…）
-- 在 R0（未套用本批）與 R1（已套用本批）執行同一組舊寫法操作，之後用 fingerprint.sql 比對
\set ON_ERROR_STOP 1
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a8000000-0000-0000-0000-000000000008', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
-- 舊頁（訂房入住方案）改方案價格：未開新版的館由本館 hotel_admin 改
UPDATE public.accommodation_packages
SET tier_prices = '{"weekday":{"sale":9500,"original":11000},"weekend":{"sale":12000,"original":14000}}', sale_price = 9500, original_price = 11000
WHERE id = 'c3000000-0000-0000-0000-000000000003';
-- 國定假日：新增（單筆、多筆）、修改、刪除
INSERT INTO public.public_holidays (accommodation_id, holiday_date, holiday_name, holiday_type, is_custom)
VALUES ('f3000000-0000-0000-0000-000000000003', CURRENT_DATE + 20, '測試一', 'holiday', true);
INSERT INTO public.public_holidays (accommodation_id, holiday_date, holiday_name, holiday_type, is_custom)
SELECT 'f3000000-0000-0000-0000-000000000003', CURRENT_DATE + 30 + g, '測試批次' || g, 'holiday', false FROM generate_series(0, 9) g;
UPDATE public.public_holidays SET holiday_type = 'compensatory_day_off', holiday_name = '測試一改'
WHERE accommodation_id = 'f3000000-0000-0000-0000-000000000003' AND holiday_date = CURRENT_DATE + 20;
DELETE FROM public.public_holidays WHERE accommodation_id = 'f3000000-0000-0000-0000-000000000003' AND holiday_date BETWEEN CURRENT_DATE + 33 AND CURRENT_DATE + 35;
-- 舊頁（前台訂房價格）寫方案單日價：新增、upsert、修改、只設適用狀態、刪除
INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, original_price, note, created_by)
SELECT 'f3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003', CURRENT_DATE + 40 + g, 9900, 11000, '舊頁', auth.uid()
FROM generate_series(0, 4) g;
INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, original_price, created_by)
VALUES ('f3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003', CURRENT_DATE + 41, 9800, 11000, auth.uid())
ON CONFLICT (package_id, date) DO UPDATE SET sale_price = EXCLUDED.sale_price, original_price = EXCLUDED.original_price, updated_at = now();
UPDATE public.package_date_prices SET sale_price = 9700 WHERE package_id = 'c3000000-0000-0000-0000-000000000003' AND date = CURRENT_DATE + 42;
INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, is_available, created_by)
VALUES ('f3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000003', CURRENT_DATE + 50, NULL, false, auth.uid());
DELETE FROM public.package_date_prices WHERE package_id = 'c3000000-0000-0000-0000-000000000003' AND date = CURRENT_DATE + 44;
RESET ROLE;
-- 開新版但沒有區段／例外的館：本館 hotel_admin 用既有 RPC 改方案價、改國定假日、舊頁寫單日價
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT public.save_package_tier_prices('c1000000-0000-0000-0000-000000000001',
  '{"weekday":{"sale":10500,"original":12500},"friday_sunday":{"sale":11500,"original":13500},"weekend":{"sale":14500,"original":16500}}') IS NOT NULL AS saved;
INSERT INTO public.public_holidays (accommodation_id, holiday_date, holiday_name, holiday_type, is_custom)
VALUES ('f1000000-0000-0000-0000-000000000001', CURRENT_DATE + 25, '雲岫測試', 'holiday', true);
DELETE FROM public.public_holidays WHERE accommodation_id = 'f1000000-0000-0000-0000-000000000001' AND holiday_date = CURRENT_DATE + 25;
INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, original_price, created_by)
VALUES ('f1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', CURRENT_DATE + 60, 15000, 17000, auth.uid());
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
