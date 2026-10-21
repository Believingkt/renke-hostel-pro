-- 四季山宿正式庫現況（依已查證值）
INSERT INTO public.accommodation_info VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季山宿'), ('7690a606-6bac-4cd5-a3e7-2fa754b318e8', '雲岫');
INSERT INTO public.accommodation_info_flags (accommodation_id, new_price_ui_enabled, price_sync_mode) VALUES ('7690a606-6bac-4cd5-a3e7-2fa754b318e8', true, 'package_original');
INSERT INTO public.room_types (id, accommodation_id, name) VALUES
  ('6c72fc3e-9183-4788-a03d-bc043a2823e8', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'A棟雙人'),
  ('beffbc83-3ab1-460e-8a61-6f86c71602c7', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'B棟雙人'),
  ('c4c80422-f4c2-47f0-9aef-dc1a663046a9', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'A棟四人'),
  ('4074200a-43f9-4d0f-b996-3d1b4d539cff', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'B棟四人'),
  ('69e8fa0f-27b4-4259-b3dd-8525d61e014c', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '全區包棟');
INSERT INTO public.accommodation_packages (id, accommodation_id, name, numeric_code, enabled, sale_price, original_price, tier_prices, room_type_ids, primary_room_type_id, guest_count, included_guest_count, includes, room_allocation, room_type_allocation, display_order)
VALUES ('90df31ce-c89a-4f73-b5e1-62db8276f2f2', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '24人包棟', 1001, true, 46300, 61800,
  '{"weekend":{"sale":64300,"original":85800},"friday_sunday":{"sale":51400,"original":68600}}', '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c',
  24, 24, '["早餐","烤肉"]', '全區 6 棟', '[{"room_type_id":"69e8fa0f-27b4-4259-b3dd-8525d61e014c","qty":1}]', 5);
INSERT INTO public.pricing_templates (id, accommodation_id, template_name, project_name, numeric_code, room_type_ids, room_type_id, weekday_price, peak_price, weekend_price, price, display_order, meal_plans, excluded_dates) VALUES
  ('a247bcaf-74df-49e6-a1e1-d12b1d681263', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '雙人房(山景)', NULL, 1101, '{6c72fc3e-9183-4788-a03d-bc043a2823e8,beffbc83-3ab1-460e-8a61-6f86c71602c7}', NULL, 4800, 5200, 6000, 4800, 1, NULL, '[]'),
  ('7a6e0125-8fd4-4f03-aa6c-37cf75b94bc0', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '雙人房(樹景)', NULL, 1102, '{6c72fc3e-9183-4788-a03d-bc043a2823e8,beffbc83-3ab1-460e-8a61-6f86c71602c7}', NULL, 3800, 4200, 5000, 3800, 2, NULL, '[]'),
  ('a32485b3-57a4-4c24-9c7e-12576ab508ce', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四人房(山景)', NULL, 1103, '{c4c80422-f4c2-47f0-9aef-dc1a663046a9,4074200a-43f9-4d0f-b996-3d1b4d539cff}', NULL, 9000, 9800, 11000, 9000, 3, NULL, '[]'),
  ('7195c9b1-0a11-4148-a510-467af8fdecbf', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四人房(樹景)', NULL, 1104, '{c4c80422-f4c2-47f0-9aef-dc1a663046a9,4074200a-43f9-4d0f-b996-3d1b4d539cff}', NULL, 7800, 8600, 10000, 7800, 4, NULL, '[]'),
  ('6f9a4ce1-dbab-4fae-91de-61b81e9957bd', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '8人包棟', NULL, 1105, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 17000, 18000, 22000, 17000, 5, NULL, '[]'),
  ('4c9ec03d-262c-4afc-97b9-bb75e3d373f9', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '10人包棟', NULL, 1106, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 21000, 23000, 28000, 21000, 6, NULL, '[]'),
  ('edc56e89-c1ed-4b46-8427-ff16b56e2ea7', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '12人包棟', NULL, 1107, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 25000, 28000, 34000, 25000, 7, NULL, '[]'),
  ('77ba5b4e-ebd2-48c9-85f8-ad8e1b34ba7b', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '14人包棟', NULL, 1108, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 26000, 29000, 36000, 26000, 8, NULL, '[]'),
  ('6dd4685a-3e2e-4485-bae8-1a5a5afea232', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '16人包棟', NULL, 1109, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 30000, 33000, 41000, 30000, 9, NULL, '[]'),
  ('329ddcfa-bcca-4279-a40b-f283f44fa0ad', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '18人包棟', NULL, 1110, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 34000, 37000, 46000, 34000, 10, NULL, '[]'),
  ('cd0731d2-ef07-4d80-a479-feada2bac996', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '20人包棟', NULL, 1111, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 37000, 41000, 51000, 37000, 11, NULL, '[]'),
  ('94175b8f-a64f-4e6a-9a1b-c5facd7adabe', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '22人包棟', NULL, 1112, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', NULL, 41000, 45000, 56000, 41000, 12, NULL, '[]'),
  ('d2d13d7e-8729-421a-9002-61c7a3e71717', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '24人包棟', '24人包棟專案', 1113, '{69e8fa0f-27b4-4259-b3dd-8525d61e014c}', '69e8fa0f-27b4-4259-b3dd-8525d61e014c', 46300, 51400, 64300, 46300, 13, '[{"name":"烤肉","price":300}]', '["2026-12-31"]');
INSERT INTO public.discount_codes (accommodation_id, code, is_active, discount_type, discount_value, applicable_pricing_template_ids)
SELECT 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', c, true, 'percentage', 30,
  '["6f9a4ce1-dbab-4fae-91de-61b81e9957bd","4c9ec03d-262c-4afc-97b9-bb75e3d373f9","edc56e89-c1ed-4b46-8427-ff16b56e2ea7","77ba5b4e-ebd2-48c9-85f8-ad8e1b34ba7b","6dd4685a-3e2e-4485-bae8-1a5a5afea232","329ddcfa-bcca-4279-a40b-f283f44fa0ad","cd0731d2-ef07-4d80-a479-feada2bac996","94175b8f-a64f-4e6a-9a1b-c5facd7adabe","d2d13d7e-8729-421a-9002-61c7a3e71717"]'
FROM unnest(ARRAY['AMILE77', 'KWYTMIO', 'MIE20']) c;
INSERT INTO public.orders (order_number, accommodation_id, order_source, final_price, pricing_template_id, package_id, check_in_date, order_status, updated_at)
SELECT n, 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', 'kol', 0, '77ba5b4e-ebd2-48c9-85f8-ad8e1b34ba7b', NULL, CURRENT_DATE + 30, 'confirmed', '2026-05-01T00:00:00Z'
FROM unnest(ARRAY['DM3A89R8', 'QW9M94K4', 'NE6Y99A5']) n;
