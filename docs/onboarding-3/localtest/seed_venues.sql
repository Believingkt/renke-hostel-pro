-- 本機種子：A 館（開賣中、有訂單）、B 館（停用、有訂單＝曾開賣後停用）、C 館（停用、無訂單＝套用前已存在）、測試館 T
SET session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active, short_url_alias) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '測試A館（開賣中）', true, 'wz-a'),
  ('b0000000-0000-0000-0000-00000000000b', '測試B館（曾開賣後停用）', false, 'wz-b'),
  ('c0000000-0000-0000-0000-00000000000c', '測試C館（停用、無訂單）', false, 'wz-c'),
  ('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', '正式測試館', false, 'wz-t');
INSERT INTO orders (id, order_number, accommodation_id, check_in_date, check_out_date, guest_name, guest_phone, total_price, final_price, created_at) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'WA1', 'a0000000-0000-0000-0000-00000000000a', '2025-01-01', '2025-01-02', 'x', '0900000000', 1, 1, '2025-01-01 10:00+08'),
  ('e1000000-0000-0000-0000-00000000000b', 'WB1', 'b0000000-0000-0000-0000-00000000000b', '2024-05-01', '2024-05-02', 'x', '0900000000', 1, 1, '2024-05-01 10:00+08');
SET session_replication_role = origin;
