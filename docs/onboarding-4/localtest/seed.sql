-- 館 A：未開賣、資料齊全、OwlTing 已開同步但房型未對應；館 B：已開賣；館 C：其他館
-- 使用者：owner = 館 A hotel_admin、other = 館 C hotel_admin、su = super_admin
INSERT INTO accommodation_info (id, name, address, phone, short_url_alias, description, is_active, first_activated_at) VALUES
 ('00000000-0000-0000-0000-00000000000a', '測試館A', '宜蘭縣礁溪鄉溫泉路 1 號', '03-987-6543', 'testa', repeat('介紹', 20), false, NULL),
 ('00000000-0000-0000-0000-00000000000b', '測試館B', '台北市', '02-2345-6789', 'testb', repeat('介紹', 20), true, now()),
 ('00000000-0000-0000-0000-00000000000c', '測試館C', '台中市西區', '04-2345-6789', 'testc', repeat('介紹', 20), false, NULL);
INSERT INTO accommodation_info_flags VALUES ('00000000-0000-0000-0000-00000000000a', true, true, 'package_original');
INSERT INTO user_roles VALUES
 ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'hotel_admin'),
 ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'hotel_admin'),
 ('00000000-0000-0000-0000-0000000000f1', NULL, 'super_admin');
INSERT INTO room_types (id, accommodation_id, name, capacity, base_price, room_count) VALUES
 ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', '整棟包棟', 8, 8000, 1);
INSERT INTO accommodation_packages (id, accommodation_id, name, tier_prices, primary_room_type_id, guest_count) VALUES
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000000a', '包棟・含早餐',
  '{"weekday":{"sale":8000,"original":9000},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":10000,"original":11000}}',
  '00000000-0000-0000-0000-0000000000e1', 8);
INSERT INTO pricing_templates (accommodation_id, template_name, room_type_id, default_package_id) VALUES
 ('00000000-0000-0000-0000-00000000000a', '包棟・含早餐', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1');
INSERT INTO room_inventory_pricing (room_type_id, date, price, available_rooms, is_available)
SELECT '00000000-0000-0000-0000-0000000000e1', (now() AT TIME ZONE 'Asia/Taipei')::date + 3, 8000, 1, true;
INSERT INTO accommodation_owlting_config VALUES ('00000000-0000-0000-0000-00000000000a', true);
