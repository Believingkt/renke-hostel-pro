-- E2：save_package_tier_prices 案例（scratch 資料庫 s1a，需先跑 run_e1.sh 使 ①②③ 已套用）
\set ON_ERROR_STOP 0
\pset footer off
\set YX '''7690a606-6bac-4cd5-a3e7-2fa754b318e8'''
\set P1005 '''0681ce82-28e8-4f56-894f-9d8931c10280'''
\set PB '''00000000-0000-4000-8000-0000000000b2'''
\set PC '''00000000-0000-4000-8000-0000000000c2'''
\set U_SUPER '''11111111-1111-4111-8111-111111111111'''
\set U_HA '''22222222-2222-4222-8222-222222222222'''
\set U_STAFF_RO '''33333333-3333-4333-8333-333333333333'''
\set U_OTHER '''44444444-4444-4444-8444-444444444444'''

\echo '== E2-0 anon 呼叫 → 拒絕（無 EXECUTE）'
BEGIN; SET LOCAL ROLE anon;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000,"original":30900}}');
ROLLBACK;

\echo '== E2-1 無權限（雲岫 staff，room_price=readonly）→ 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_STAFF_RO, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000,"original":30900}}');
ROLLBACK;

\echo '== E2-1b 他館 hotel_admin 改雲岫方案 → 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_OTHER, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000,"original":30900}}');
ROLLBACK;

\echo '== E2-2 new_price_ui_enabled = false 的館（測試館B，flags 列存在且為預設）→ 拒絕'
SELECT accommodation_id, new_price_ui_enabled, price_sync_mode FROM accommodation_info_flags WHERE accommodation_id = '00000000-0000-4000-8000-0000000000b1';
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_OTHER, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:PB, '{"weekday":{"sale":5000,"original":8000}}');
ROLLBACK;

\echo '== E2-2b 館別沒有 flags 列（測試館C，尚未建立）→ 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_SUPER, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:PC, '{"weekday":{"sale":6000,"original":9000}}');
ROLLBACK;

\echo '== E2-3 平日售價缺漏 → 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"friday_sunday":{"sale":19000,"original":34300}}');
ROLLBACK;
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":0,"original":30900}}');
ROLLBACK;

\echo '== E2-4 原價低於售價 → 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000,"original":16000}}');
ROLLBACK;

\echo '== E2-4b 其他輸入檢查：未知 key／有原價沒售價／非整數 → 拒絕'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000},"holiday":{"sale":1}}');
ROLLBACK;
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000},"weekend":{"original":41200}}');
ROLLBACK;
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000.5}}');
ROLLBACK;

\echo '== E2-5 原價留空 → 自動等於售價（雲岫 package_original，交易結束後 ROLLBACK）'
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17000},"weekend":{"sale":23000,"original":null}}');
RESET ROLE;
SELECT numeric_code, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :P1005;
SELECT template_name, price, weekday_price, peak_price, peak_enabled, weekend_price, weekend_enabled FROM pricing_templates WHERE default_package_id = :P1005;
ROLLBACK;

\echo '== E2-6 no_sync 館（測試館B 開 new_price_ui_enabled、維持 no_sync）→ 只改方案、不改專案'
UPDATE accommodation_info_flags SET new_price_ui_enabled = true WHERE accommodation_id = '00000000-0000-4000-8000-0000000000b1';
SELECT template_name, price, weekday_price, peak_price, weekend_price, updated_at FROM pricing_templates WHERE default_package_id = :PB;
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_OTHER, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:PB, '{"weekday":{"sale":5500,"original":8800},"weekend":{"sale":6600}}');
COMMIT;
SELECT numeric_code, enabled, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :PB;
SELECT template_name, price, weekday_price, peak_price, weekend_price, updated_at FROM pricing_templates WHERE default_package_id = :PB;

\echo '== E2-7 package_original 館（雲岫 12人包棟 1005）→ 方案與對應專案同步'
SELECT id, numeric_code, enabled, guest_count, room_type_ids IS NOT NULL AS has_rooms FROM accommodation_packages WHERE id = :P1005;
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_HA, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1005, '{"weekday":{"sale":17500,"original":31500},"friday_sunday":{"sale":19500,"original":35000}}');
COMMIT;
SELECT id, numeric_code, enabled, guest_count, room_type_ids IS NOT NULL AS has_rooms, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :P1005;
SELECT template_name, price, weekday_price, weekday_enabled, peak_price, peak_enabled, weekend_price, weekend_enabled FROM pricing_templates WHERE default_package_id = :P1005;

\echo '== E2-8 一個方案對應兩個專案（測試館C package_original；方案 enabled=false 必須維持）→ 兩個都同步、無關專案不動'
INSERT INTO accommodation_info_flags (accommodation_id, new_price_ui_enabled, price_sync_mode) VALUES ('00000000-0000-4000-8000-0000000000c1', true, 'package_original');
BEGIN; SELECT set_config('request.jwt.claim.sub', :U_SUPER, true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:PC, '{"weekday":{"sale":6200,"original":9500},"friday_sunday":{"sale":7000},"weekend":{"sale":8000,"original":12000}}');
COMMIT;
SELECT id, numeric_code, enabled, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :PC;
SELECT template_name, price, weekday_price, peak_price, peak_enabled, weekend_price, weekend_enabled, default_package_id IS NOT NULL AS linked FROM pricing_templates WHERE accommodation_id = '00000000-0000-4000-8000-0000000000c1' ORDER BY template_name;
