-- 2b-1 整合測試案例 2～10（以 postgres 身分建資料；呼叫 RPC 前設定 request.jwt.claims）
\pset pager off
SET client_min_messages = notice;

-- ---------- 測試資料 ----------
INSERT INTO accommodation_info (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', '測試館');
INSERT INTO room_types (id, accommodation_id, name) VALUES
  ('b0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-000000000001', 'A7-獨棟別墅'),
  ('b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'B1-四人房'),
  ('b0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', 'C1-雙人房');
INSERT INTO room_units (id, room_type_id, accommodation_id, unit_number, display_order)
SELECT ('c0000000-0000-0000-0000-0000000000a7')::uuid, 'b0000000-0000-0000-0000-0000000000a7'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid, 'A7'::text, 1
UNION ALL
SELECT ('c0000000-0000-0000-0000-00000000080' || n)::uuid, 'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', '80' || n, n
FROM generate_series(1, 8) n
UNION ALL
SELECT ('c0000000-0000-0000-0000-00000000090' || n)::uuid, 'b0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001', '90' || n, n
FROM generate_series(1, 4) n;
INSERT INTO pricing_templates (id, accommodation_id, template_name, room_type_ids, available_rooms) VALUES
  ('d0000000-0000-0000-0000-0000000000a7', 'a0000000-0000-0000-0000-000000000001', 'A7 官網價', '{b0000000-0000-0000-0000-0000000000a7}', 1),
  ('d0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'B1 官網價', '{b0000000-0000-0000-0000-0000000000b1}', 8);
INSERT INTO room_inventory_pricing (room_type_id, date, available_rooms, is_available)
SELECT t.id, d::date, t.n, true
FROM (VALUES ('b0000000-0000-0000-0000-0000000000a7'::uuid, 1),
             ('b0000000-0000-0000-0000-0000000000b1'::uuid, 8),
             ('b0000000-0000-0000-0000-0000000000c1'::uuid, 4)) t(id, n)
CROSS JOIN generate_series('2026-12-01'::date, '2026-12-31'::date, interval '1 day') d;

-- 訂單：O1 A7 別墅（佔唯一一間）；O4 A7 另一張（12/25）；O2、O3 B1 各 4 間；O5 B1 1 間（佔 801，12/18）；O6 B1 1 間、room_type_id NULL
INSERT INTO orders (id, order_number, accommodation_id, room_type_id, check_in_date, check_out_date, order_status, payment_status, total_price, final_price, paid_amount) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'EWO1', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a7', '2026-12-10', '2026-12-12', 'confirmed', 'paid', 48000, 48000, 48000),
  ('e0000000-0000-0000-0000-000000000002', 'EWO2', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b1', '2026-12-10', '2026-12-11', 'confirmed', 'unpaid', 16000, 16000, 0),
  ('e0000000-0000-0000-0000-000000000003', 'EWO3', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b1', '2026-12-10', '2026-12-11', 'confirmed', 'unpaid', 16000, 16000, 0),
  ('e0000000-0000-0000-0000-000000000004', 'EWO4', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a7', '2026-12-25', '2026-12-26', 'confirmed', 'unpaid', 24000, 24000, 0),
  ('e0000000-0000-0000-0000-000000000005', 'EWO5', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000b1', '2026-12-18', '2026-12-19', 'confirmed', 'unpaid', 4000, 4000, 0),
  ('e0000000-0000-0000-0000-000000000006', 'EWO6', 'a0000000-0000-0000-0000-000000000001', NULL, '2026-12-05', '2026-12-06', 'confirmed', 'unpaid', 4000, 4000, 0);
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, template_id, template_name, room_unit_id) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-0000000000a7', 1, 48000, 'd0000000-0000-0000-0000-0000000000a7', 'A7 官網價', 'c0000000-0000-0000-0000-0000000000a7');
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, template_id, template_name, room_unit_id)
SELECT ('f0000000-0000-0000-0000-00000000020' || n)::uuid, 'e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-0000000000b1', 1, 4000, 'd0000000-0000-0000-0000-0000000000b1', 'B1 官網價', ('c0000000-0000-0000-0000-00000000080' || n)::uuid
FROM generate_series(1, 4) n;
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, template_id, template_name, room_unit_id)
SELECT ('f0000000-0000-0000-0000-00000000030' || n)::uuid, 'e0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-0000000000b1', 1, 4000, NULL, NULL, ('c0000000-0000-0000-0000-00000000080' || (n + 4))::uuid
FROM generate_series(1, 4) n;
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, room_unit_id) VALUES
  ('f0000000-0000-0000-0000-000000000401', 'e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-0000000000a7', 1, 24000, 'c0000000-0000-0000-0000-0000000000a7');
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, room_unit_id) VALUES
  ('f0000000-0000-0000-0000-000000000501', 'e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-0000000000b1', 1, 4000, 'c0000000-0000-0000-0000-000000000801');
INSERT INTO order_rooms (id, order_id, room_type_id, quantity, room_price, room_unit_id) VALUES
  ('f0000000-0000-0000-0000-000000000601', 'e0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-0000000000b1', 1, 4000, NULL);

-- ---------- 輔助函式（測試用） ----------
CREATE FUNCTION t_rows(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(id || '|' || room_type_id || '|' || coalesce(room_unit_id::text, 'null') || '|' || room_price || '|' || coalesce(template_id::text, 'null') || '|' || coalesce(template_name, 'null'), E'\n' ORDER BY id), '(none)')
  FROM order_rooms WHERE order_id = p $$;
CREATE FUNCTION t_rows_md5(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT md5(t_rows(p)) $$;
CREATE FUNCTION t_order_md5(p uuid) RETURNS text LANGUAGE sql AS $$ SELECT md5(o::text) FROM orders o WHERE id = p $$;
CREATE FUNCTION t_log_count(p uuid) RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM order_change_log WHERE order_id = p $$;
CREATE FUNCTION t_expect(p uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('check_in_date', check_in_date, 'check_out_date', check_out_date,
    'room_type_id', room_type_id, 'total_price', total_price, 'order_status', order_status)
  FROM orders WHERE id = p $$;
CREATE FUNCTION t_same_rooms(p uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('id', id, 'room_type_id', room_type_id, 'quantity', quantity,
    'room_price', room_price, 'template_id', template_id, 'template_name', template_name, 'room_unit_id', room_unit_id) ORDER BY id)
  FROM order_rooms WHERE order_id = p $$;
CREATE FUNCTION t_call(p uuid, patch jsonb, expect jsonb, sync boolean, rooms jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'OK ' || public.apply_ota_modification_v1(p, patch, expect, 'owlting_email_modify', '2b-1 本機測試', 'OwlTing 修改通知', sync, rooms)::text;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERR [' || SQLSTATE || '] ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION t_call(uuid, jsonb, jsonb, boolean, jsonb) TO anon, authenticated, service_role;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

\echo '=== 案例 2：A7 別墅（1 間可售），訂單佔唯一一間，只改日期到空日期 12/20～12/22 → 應成功，明細不變'
SELECT t_rows('e0000000-0000-0000-0000-000000000001') AS "改期前明細";
SELECT t_call('e0000000-0000-0000-0000-000000000001',
  '{"check_in_date":"2026-12-20","check_out_date":"2026-12-22"}',
  t_expect('e0000000-0000-0000-0000-000000000001'), true, t_same_rooms('e0000000-0000-0000-0000-000000000001')) AS result;
SELECT check_in_date, check_out_date FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000001';
SELECT t_rows('e0000000-0000-0000-0000-000000000001') AS "改期後明細";

\echo '=== 案例 3：B1 四人房 8 間，訂單佔 4 間（另一張佔其餘 4 間，12/10 全滿），只改日期到 12/15 → 應成功'
SELECT t_rows('e0000000-0000-0000-0000-000000000002') AS "改期前明細";
SELECT t_call('e0000000-0000-0000-0000-000000000002',
  '{"check_in_date":"2026-12-15","check_out_date":"2026-12-16"}',
  t_expect('e0000000-0000-0000-0000-000000000002'), true, t_same_rooms('e0000000-0000-0000-0000-000000000002')) AS result;
SELECT check_in_date, check_out_date FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000002';
SELECT t_rows('e0000000-0000-0000-0000-000000000002') AS "改期後明細";

\echo '=== 案例 4：A7 改到已滿的 12/25（EWO4 佔用）→ 整筆回滾'
SELECT t_order_md5('e0000000-0000-0000-0000-000000000001') AS order_md5_before,
       t_rows_md5('e0000000-0000-0000-0000-000000000001') AS rooms_md5_before,
       t_log_count('e0000000-0000-0000-0000-000000000001') AS log_count_before;
SELECT t_call('e0000000-0000-0000-0000-000000000001',
  '{"check_in_date":"2026-12-25","check_out_date":"2026-12-26"}',
  t_expect('e0000000-0000-0000-0000-000000000001'), true, t_same_rooms('e0000000-0000-0000-0000-000000000001')) AS result;
SELECT t_order_md5('e0000000-0000-0000-0000-000000000001') AS order_md5_after,
       t_rows_md5('e0000000-0000-0000-0000-000000000001') AS rooms_md5_after,
       t_log_count('e0000000-0000-0000-0000-000000000001') AS log_count_after;

\echo '=== 案例 5：EWO2 改到 12/18（EWO5 佔 801），庫存足夠 → 訂單照改、801 那列房號變 null、回傳 conflicts'
SELECT t_call('e0000000-0000-0000-0000-000000000002',
  '{"check_in_date":"2026-12-18","check_out_date":"2026-12-19"}',
  t_expect('e0000000-0000-0000-0000-000000000002'), true, t_same_rooms('e0000000-0000-0000-0000-000000000002')) AS result;
SELECT check_in_date, check_out_date FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000002';
SELECT t_rows('e0000000-0000-0000-0000-000000000002') AS "改期後明細";

\echo '=== 案例 6：p_expect 不符（check_in_date 給錯）→ ORDER_CHANGED、整筆不變'
SELECT t_order_md5('e0000000-0000-0000-0000-000000000002') AS order_md5_before, t_rows_md5('e0000000-0000-0000-0000-000000000002') AS rooms_md5_before, t_log_count('e0000000-0000-0000-0000-000000000002') AS log_before;
SELECT t_call('e0000000-0000-0000-0000-000000000002',
  '{"check_in_date":"2026-12-20","check_out_date":"2026-12-21"}',
  t_expect('e0000000-0000-0000-0000-000000000002') || '{"check_in_date":"2026-12-01"}', true, t_same_rooms('e0000000-0000-0000-0000-000000000002')) AS result;
SELECT t_order_md5('e0000000-0000-0000-0000-000000000002') AS order_md5_after, t_rows_md5('e0000000-0000-0000-0000-000000000002') AS rooms_md5_after, t_log_count('e0000000-0000-0000-0000-000000000002') AS log_after;

\echo '=== 案例 7：orders.total_price 型別與 p_expect.total_price 48000／48000.00'
SELECT format_type(atttypid, atttypmod) AS total_price_type FROM pg_attribute WHERE attrelid = 'public.orders'::regclass AND attname = 'total_price';
SELECT t_call('e0000000-0000-0000-0000-000000000001', '{"guest_count":3}',
  t_expect('e0000000-0000-0000-0000-000000000001') || '{"total_price":48000}', false, NULL) AS "expect 48000";
SELECT t_call('e0000000-0000-0000-0000-000000000001', '{"guest_count":4}',
  t_expect('e0000000-0000-0000-0000-000000000001') || '{"total_price":48000.00}', false, NULL) AS "expect 48000.00";
SELECT guest_count FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000001';

\echo '=== 案例 8：p_expect.room_type_id 為 null'
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":3}',
  t_expect('e0000000-0000-0000-0000-000000000006'), false, NULL) AS "訂單 NULL、expect NULL";
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":4}',
  t_expect('e0000000-0000-0000-0000-000000000006') || '{"room_type_id":"b0000000-0000-0000-0000-0000000000b1"}', false, NULL) AS "訂單 NULL、expect uuid";
SELECT room_type_id, guest_count FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000006';

\echo '=== 案例 9a：間數增加（EWO2 4 → 5 間，新列房號 806）'
SELECT t_call('e0000000-0000-0000-0000-000000000002', '{"notes":"2b-1 間數增加"}',
  t_expect('e0000000-0000-0000-0000-000000000002'), true,
  t_same_rooms('e0000000-0000-0000-0000-000000000002') || jsonb_build_array(jsonb_build_object(
    'id', NULL, 'room_type_id', 'b0000000-0000-0000-0000-0000000000b1', 'quantity', 1, 'room_price', 4000,
    'template_id', 'd0000000-0000-0000-0000-0000000000b1', 'template_name', 'B1 官網價', 'room_unit_id', 'c0000000-0000-0000-0000-000000000806'))) AS result;
SELECT t_rows('e0000000-0000-0000-0000-000000000002') AS "增加後明細";

\echo '=== 案例 9b：間數減少（EWO2 5 → 4 間，刪除房號 null 那列）'
SELECT t_call('e0000000-0000-0000-0000-000000000002', '{"notes":"2b-1 間數減少"}',
  t_expect('e0000000-0000-0000-0000-000000000002'), true,
  (SELECT jsonb_agg(e) FROM jsonb_array_elements(t_same_rooms('e0000000-0000-0000-0000-000000000002')) e WHERE e ->> 'room_unit_id' IS NOT NULL)) AS result;
SELECT t_rows('e0000000-0000-0000-0000-000000000002') AS "減少後明細";

\echo '=== 案例 9c：房型變更（EWO6 B1 1 間 → C1 2 間，舊列全部移除）'
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"room_type_id":"b0000000-0000-0000-0000-0000000000c1"}',
  t_expect('e0000000-0000-0000-0000-000000000006'), true,
  '[{"id":null,"room_type_id":"b0000000-0000-0000-0000-0000000000c1","quantity":1,"room_price":2000,"room_unit_id":"c0000000-0000-0000-0000-000000000901"},
    {"id":null,"room_type_id":"b0000000-0000-0000-0000-0000000000c1","quantity":1,"room_price":2000,"room_unit_id":"c0000000-0000-0000-0000-000000000902"}]') AS result;
SELECT room_type_id FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000006';
SELECT t_rows('e0000000-0000-0000-0000-000000000006') AS "換房型後明細";

\echo '=== 案例 10：權限'
SET ROLE anon;
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":5}', NULL, false, NULL) AS "anon";
RESET ROLE;
SET ROLE authenticated;
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":5}', NULL, false, NULL) AS "authenticated";
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":5}', NULL, false, NULL) AS "postgres、claims=authenticated";
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
SET ROLE service_role;
SELECT t_call('e0000000-0000-0000-0000-000000000006', '{"guest_count":5}', NULL, false, NULL) AS "service_role";
RESET ROLE;
SELECT guest_count FROM orders WHERE id = 'e0000000-0000-0000-0000-000000000006';
