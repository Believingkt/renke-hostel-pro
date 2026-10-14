-- E2 補測：5 種身分對雲岫 room_price 的權限，與「允許存檔」案例（scratch s1a；需先跑 run_e1.sh、e2_rpc_cases.sql）
\set ON_ERROR_STOP 0
\pset footer off
\set YX '''7690a606-6bac-4cd5-a3e7-2fa754b318e8'''
\set P1003 '''a1950bd7-9f57-4552-b236-69b872a0cfaa'''
\set P1004 '''b2c17a5f-a9ad-4163-b21a-bcf8131a264e'''
\set P1006 '''620e7294-4a5d-418c-be11-aa29a9720102'''

-- 補兩個身分：總部 admin（accommodation_id NULL）、雲岫 staff（room_price=editable）
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('55555555-5555-4555-8555-555555555555', NULL, 'admin'),
  ('66666666-6666-4666-8666-666666666666', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'staff');
INSERT INTO staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES
  ('66666666-6666-4666-8666-666666666666', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'room_price', 'editable');

\echo '== E2-9 五種身分：get_staff_module_permission／staff_can_edit_module（雲岫、room_price）'
CREATE TEMP TABLE _ids(label text, uid uuid);
INSERT INTO _ids VALUES
  ('super_admin（總部，accommodation_id NULL）', '11111111-1111-4111-8111-111111111111'),
  ('總部 admin（accommodation_id NULL）',        '55555555-5555-4555-8555-555555555555'),
  ('雲岫 hotel_admin',                           '22222222-2222-4222-8222-222222222222'),
  ('雲岫 staff（room_price=editable）',          '66666666-6666-4666-8666-666666666666'),
  ('雲岫 staff（room_price=readonly）',          '33333333-3333-4333-8333-333333333333');
SELECT i.label,
       public.get_staff_module_permission(i.uid, :YX, 'room_price') AS module_level,
       (SELECT set_config('request.jwt.claim.sub', i.uid::text, true) IS NOT NULL
               AND public.staff_can_edit_module(:YX, 'room_price')) AS staff_can_edit_module
FROM _ids i;

\echo '== E2-10 雲岫 hotel_admin 存檔（8人包棟 1003）→ 允許'
BEGIN; SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1003, '{"weekday":{"sale":11000,"original":20600},"friday_sunday":{"sale":13500,"original":24000}}');
COMMIT;
SELECT numeric_code, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :P1003;
SELECT template_name, price, weekday_price, peak_price, peak_enabled, weekend_price, weekend_enabled FROM pricing_templates WHERE default_package_id = :P1003;

\echo '== E2-11 super_admin（總部，accommodation_id NULL）存檔（10人包棟 1004）→ 允許'
BEGIN; SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1004, '{"weekday":{"sale":14400,"original":25800},"friday_sunday":{"sale":16000,"original":29000},"weekend":{"sale":18000}}');
COMMIT;
SELECT numeric_code, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :P1004;
SELECT template_name, price, weekday_price, peak_price, peak_enabled, weekend_price, weekend_enabled FROM pricing_templates WHERE default_package_id = :P1004;

\echo '== E2-12 雲岫 staff（room_price=editable）存檔（14人包棟 1006）→ 允許'
BEGIN; SELECT set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1006, '{"weekday":{"sale":20000,"original":36000},"friday_sunday":{"sale":22000,"original":40000},"weekend":{"sale":26500,"original":48000}}');
COMMIT;
SELECT numeric_code, tier_prices, sale_price, original_price, applicable_tiers FROM accommodation_packages WHERE id = :P1006;
SELECT template_name, price, weekday_price, peak_price, peak_enabled, weekend_price, weekend_enabled FROM pricing_templates WHERE default_package_id = :P1006;

\echo '== E2-13 總部 admin（非 super_admin）存檔 → 拒絕（記錄現況）'
BEGIN; SELECT set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true); SET LOCAL ROLE authenticated;
SELECT public.save_package_tier_prices(:P1006, '{"weekday":{"sale":20000,"original":36000}}');
ROLLBACK;
