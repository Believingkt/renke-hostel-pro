-- 模擬正式庫已查證的 4 筆殘留（房型 e5eff54d…、7f066d8a… 已不存在）
INSERT INTO public.accommodation_info (id, name) VALUES
  ('74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '館74'),
  ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季山宿'),
  ('11111111-0000-0000-0000-000000000099', '整館刪除測試館');
INSERT INTO public.accommodation_info_flags VALUES ('74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', true);
INSERT INTO public.room_types (id, accommodation_id, name) VALUES
  ('aaaa0000-0000-0000-0000-000000000001', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '海景雙人'),
  ('aaaa0000-0000-0000-0000-000000000002', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '山景四人'),
  ('aaaa0000-0000-0000-0000-000000000003', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '獨棟'),
  ('bbbb0000-0000-0000-0000-000000000001', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季雙人'),
  ('cccc0000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000099', '整館刪除房');
INSERT INTO public.room_photos (room_type_id) VALUES ('aaaa0000-0000-0000-0000-000000000002'), ('aaaa0000-0000-0000-0000-000000000003');
INSERT INTO public.accommodation_packages (id, accommodation_id, name, primary_room_type_id, room_type_ids) VALUES
  ('9a74a709-f83b-4a53-a39a-efda917d4802', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '海景方案', 'aaaa0000-0000-0000-0000-000000000001', ARRAY['e5eff54d-2fa6-4ff6-bfc3-2cf76343dff6', 'aaaa0000-0000-0000-0000-000000000001']::uuid[]),
  ('9a000000-0000-0000-0000-000000000002', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '獨棟方案', 'aaaa0000-0000-0000-0000-000000000003', ARRAY['aaaa0000-0000-0000-0000-000000000003']::uuid[]),
  ('9a000000-0000-0000-0000-000000000003', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '雙房方案', 'aaaa0000-0000-0000-0000-000000000002', ARRAY['aaaa0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001']::uuid[]),
  ('9a000000-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000099', '整館方案', 'cccc0000-0000-0000-0000-000000000001', ARRAY['cccc0000-0000-0000-0000-000000000001']::uuid[]);
INSERT INTO public.pricing_templates (id, accommodation_id, template_name, room_type_id, room_type_ids, default_package_id) VALUES
  ('4c9ec03d-262c-4afc-97b9-bb75e3d373f9', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季一泊一食', NULL, ARRAY['7f066d8a-5035-4061-8db4-4cf170deda4f']::uuid[], NULL),
  ('edc56e89-c1ed-4b46-8427-ff16b56e2ea7', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季一泊二食', NULL, ARRAY['7f066d8a-5035-4061-8db4-4cf170deda4f']::uuid[], NULL),
  ('6f9a4ce1-dbab-4fae-91de-61b81e9957bd', 'a4bacadc-9b7a-4110-ac04-a1cc6248c822', '四季包棟', NULL, ARRAY['7f066d8a-5035-4061-8db4-4cf170deda4f']::uuid[], NULL),
  ('7e000000-0000-0000-0000-000000000001', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '雙房專案', 'aaaa0000-0000-0000-0000-000000000002', ARRAY['aaaa0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001']::uuid[], '9a000000-0000-0000-0000-000000000003'),
  ('7e000000-0000-0000-0000-000000000002', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '不指定房型專案', NULL, '{}'::uuid[], NULL);
