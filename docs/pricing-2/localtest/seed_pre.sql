-- 價格頁整合第 1 批：套用 migration 之前的種子（觸發器關閉）；含一筆既有方案單日價，用來驗證「既有資料視為手動」
SET session_replication_role = replica;
INSERT INTO auth.users (id, email) SELECT ('a' || n || '000000-0000-0000-0000-00000000000' || n)::uuid, 'pv2-' || n || '@test.local' FROM generate_series(1, 8) n;
INSERT INTO accommodation_info (id, name, is_active, short_url_alias) VALUES
  ('f1000000-0000-0000-0000-000000000001', '價測雲岫', true, 'pv2-yx'),
  ('f2000000-0000-0000-0000-000000000002', '價測他館', true, 'pv2-v2'),
  ('f3000000-0000-0000-0000-000000000003', '價測未開新版', true, 'pv2-off');
INSERT INTO accommodation_info_flags (accommodation_id, new_price_ui_enabled, price_sync_mode) VALUES
  ('f1000000-0000-0000-0000-000000000001', true, 'package_original'),
  ('f2000000-0000-0000-0000-000000000002', true, 'package_original'),
  ('f3000000-0000-0000-0000-000000000003', false, 'no_sync');
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('a1000000-0000-0000-0000-000000000001', NULL, 'super_admin'),
  ('a2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'hotel_admin'),
  ('a3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'staff'),
  ('a4000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'staff'),
  ('a5000000-0000-0000-0000-000000000005', NULL, 'admin'),
  ('a6000000-0000-0000-0000-000000000006', 'f1000000-0000-0000-0000-000000000001', 'admin'),
  ('a7000000-0000-0000-0000-000000000007', 'f2000000-0000-0000-0000-000000000002', 'hotel_admin'),
  ('a8000000-0000-0000-0000-000000000008', 'f3000000-0000-0000-0000-000000000003', 'hotel_admin');
INSERT INTO staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES
  ('a3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'room_price', 'editable'),
  ('a3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'discount_codes', 'editable'),
  ('a4000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'room_price', 'readonly'),
  ('a4000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'discount_codes', 'readonly');
INSERT INTO room_types (id, accommodation_id, name, capacity, base_price) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', '價測房', 8, 5000),
  ('b3000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003', '價測房OFF', 8, 5000);
INSERT INTO accommodation_packages (id, accommodation_id, name, sale_price, original_price, included_guest_count, room_type_ids, tier_prices, enabled) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', '8人包棟', 10000, 12000, 8, '{b1000000-0000-0000-0000-000000000001}',
   '{"weekday":{"sale":10000,"original":12000},"friday_sunday":{"sale":11000,"original":13000},"weekend":{"sale":14000,"original":16000}}', true),
  ('c2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', '4人平日', 8000, NULL, 4, '{b1000000-0000-0000-0000-000000000001}',
   '{"weekday":{"sale":8000}}', true),
  ('c3000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000003', 'OFF方案', 9000, 10000, 4, '{b3000000-0000-0000-0000-000000000003}',
   '{"weekday":{"sale":9000,"original":10000}}', true);
INSERT INTO pricing_templates (id, accommodation_id, template_name, room_type_id, room_type_ids, default_package_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', '專案一', 'b1000000-0000-0000-0000-000000000001', '{b1000000-0000-0000-0000-000000000001}', 'c1000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', '專案二', 'b1000000-0000-0000-0000-000000000001', '{b1000000-0000-0000-0000-000000000001}', 'c2000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', '專案三', 'b1000000-0000-0000-0000-000000000001', '{b1000000-0000-0000-0000-000000000001}', NULL),
  ('d9000000-0000-0000-0000-000000000009', 'f2000000-0000-0000-0000-000000000002', '他館專案', NULL, '{}', NULL);
INSERT INTO discount_codes (id, accommodation_id, name, code, discount_type, discount_value, usage_limit, is_active, applicable_pricing_template_ids) VALUES
  ('e1000000-0000-0000-0000-0000000000c1', 'f1000000-0000-0000-0000-000000000001', 'KOL一', 'PV2KOL1', 'percentage', 10, 100, true, '["d3000000-0000-0000-0000-000000000003"]'),
  ('e2000000-0000-0000-0000-0000000000c2', 'f1000000-0000-0000-0000-000000000001', 'KOL二', 'PV2KOL2', 'percentage', 10, 100, true, '[]'),
  ('e9000000-0000-0000-0000-0000000000c9', 'f2000000-0000-0000-0000-000000000002', '他館碼', 'PV2KOL9', 'percentage', 10, 100, true, '[]');
INSERT INTO accommodation_owlting_config (accommodation_id, owlting_hotel_code, sync_enabled) VALUES ('f1000000-0000-0000-0000-000000000001', 'OWL-YX', true);
INSERT INTO accommodation_hotelnabe_config (accommodation_id, hotelnabe_hotel_code, sync_enabled) VALUES ('f2000000-0000-0000-0000-000000000002', 'HN-V2', true);
-- 既有手動單日價：下下週三（見 tests.sql 的 pg_temp.mon）
INSERT INTO package_date_prices (accommodation_id, package_id, date, sale_price, original_price)
VALUES ('f1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        (CURRENT_DATE + 14 + ((8 - extract(isodow FROM CURRENT_DATE + 14)::int) % 7)) + 2, 9000, 12000);
SET session_replication_role = origin;
