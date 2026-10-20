-- 身分矩陣測試（seed_pre.sql 之後；:POST = 'true' 表示已套用 20261031090000；交易最後 ROLLBACK）
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO PUBLIC;
GRANT ALL ON SEQUENCE t_result_no_seq TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 160), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
CREATE FUNCTION pg_temp.as_role(p_role text, p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN json_build_object('role', p_role)::text ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN
    EXECUTE p_sql;
    r := 'OK';
  EXCEPTION WHEN insufficient_privilege THEN r := 'DENIED ' || SQLERRM;
            WHEN OTHERS THEN r := 'RAN ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
-- 每次呼叫用不同日期，避免「新舊日期相同」
CREATE TEMP SEQUENCE d_seq START 100;
GRANT ALL ON SEQUENCE d_seq TO PUBLIC;
CREATE FUNCTION pg_temp.cod(p_role text, p_uid uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int := nextval('d_seq');
BEGIN
  RETURN pg_temp.as_role(p_role, p_uid, format('SELECT public.change_order_dates(%L::uuid, CURRENT_DATE + %s, CURRENT_DATE + %s, %L)', '0e000000-0000-0000-0000-000000000001', n, n + 1, 'localtest'));
END $$;

INSERT INTO auth.users (id, email) VALUES
  ('c9000000-0000-0000-0000-000000000001', 'hidden@test.local'), ('c9000000-0000-0000-0000-000000000002', 'otherhall@test.local'),
  ('c9000000-0000-0000-0000-000000000003', 'kol@test.local'), ('c9000000-0000-0000-0000-000000000004', 'member@test.local');
INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES
  ('c9000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'staff'),
  ('c9000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'staff'),
  ('c9000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'kol');
INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES
  ('a4000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'orders', 'readonly'),
  ('c9000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'orders', 'hidden');
SET session_replication_role = replica;
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, discount_amount, final_price, paid_amount, order_status, payment_status, order_source)
VALUES ('0e000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'GD1', '測試', '0900000000', CURRENT_DATE + 40, CURRENT_DATE + 41, 'b1000000-0000-0000-0000-000000000001', 2, 10000, 0, 10000, 0, 'confirmed', 'unpaid', 'website');
SET session_replication_role = origin;

\set P '(:''POST'' = ''true'')'
-- change_order_dates 身分矩陣
SELECT pg_temp.chk('C01 anon', 'DENIED permission denied', pg_temp.cod('anon', NULL));
SELECT pg_temp.chk('C02 會員（無館別角色）', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'c9000000-0000-0000-0000-000000000004'));
SELECT pg_temp.chk('C03 kol（該館 kol 角色）', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'c9000000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('C04 staff 訂單 editable（未設定＝預設）', 'OK', pg_temp.cod('authenticated', 'a3000000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('C05 staff 訂單 readonly', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'a4000000-0000-0000-0000-000000000004'));
SELECT pg_temp.chk('C06 staff 訂單 hidden', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'c9000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('C07 他館 staff', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'c9000000-0000-0000-0000-000000000002'));
SELECT pg_temp.chk('C08 他館 hotel_admin', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'OK' END, pg_temp.cod('authenticated', 'a7000000-0000-0000-0000-000000000007'));
SELECT pg_temp.chk('C09 該館 hotel_admin', 'OK', pg_temp.cod('authenticated', 'a2000000-0000-0000-0000-000000000002'));
SELECT pg_temp.chk('C10 super_admin', 'OK', pg_temp.cod('authenticated', 'a1000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('C11 service role（auth.uid() 為 null）', 'OK', pg_temp.cod('service_role', NULL));
SELECT pg_temp.chk('C12 不存在的訂單＋已登入 staff → 權限不足（不洩漏是否存在）', CASE WHEN :P THEN 'DENIED 權限不足' ELSE 'RAN 訂單不存在' END,
  pg_temp.as_role('authenticated', 'a3000000-0000-0000-0000-000000000003', 'SELECT public.change_order_dates(''0e000000-0000-0000-0000-0000000000ff''::uuid, CURRENT_DATE + 5, CURRENT_DATE + 6, ''localtest'')'));
SELECT pg_temp.chk('C13 改期確實落地（最後一次 service role）', '1', (SELECT count(*)::text FROM public.orders WHERE id = '0e000000-0000-0000-0000-000000000001' AND check_in_date = CURRENT_DATE + (SELECT last_value FROM d_seq)::int));
-- 其他 7 支：anon 呼叫
SELECT pg_temp.chk('A01 anon sync_order_rooms_v1', CASE WHEN :P THEN 'DENIED permission denied' ELSE 'RAN NOT_AUTHORIZED' END, pg_temp.as_role('anon', NULL, 'SELECT public.sync_order_rooms_v1(''0e000000-0000-0000-0000-000000000001''::uuid, NULL, ''[]''::jsonb)'));
SELECT pg_temp.chk('A02 anon clear_order_room_pricing_template', CASE WHEN :P THEN 'DENIED permission denied' ELSE 'DENIED not authorized' END, pg_temp.as_role('anon', NULL, 'SELECT public.clear_order_room_pricing_template(''d1000000-0000-0000-0000-000000000001''::uuid)'));
SELECT pg_temp.chk('A03 anon update_order_fields_v1（函式內第 22 行擋）', 'RAN update_order_fields_v1: 需要登入', pg_temp.as_role('anon', NULL, 'SELECT public.update_order_fields_v1(''0e000000-0000-0000-0000-000000000001''::uuid, ''{}''::jsonb, ''x'', NULL)'));
SELECT pg_temp.chk('A04 anon admin_delete_order（函式內第 6 行擋）', 'RAN 請先登入', pg_temp.as_role('anon', NULL, 'SELECT public.admin_delete_order(''0e000000-0000-0000-0000-000000000001''::uuid, ''x'')'));
SELECT pg_temp.chk('A05 anon attach_trip_products_to_recent_order（函式內擋）', 'RAN AUTH_REQUIRED', pg_temp.as_role('anon', NULL, 'SELECT public.attach_trip_products_to_recent_order(''[]''::jsonb, NULL)'));
SELECT pg_temp.chk('A06 anon update_paid_order_discount_v2（函式內擋）', 'DENIED authentication required', pg_temp.as_role('anon', NULL, 'SELECT public.update_paid_order_discount_v2(''0e000000-0000-0000-0000-000000000001''::uuid, now(), ''x'', ''none'', 0, NULL, true, ''data_only'', NULL, false)'));
SELECT pg_temp.chk('A07 anon update_paid_order_addons_v3（函式內擋）', 'DENIED authentication required', pg_temp.as_role('anon', NULL, 'SELECT public.update_paid_order_addons_v3(''0e000000-0000-0000-0000-000000000001''::uuid, now(), ''x'', ''data_only'', true, ''[]''::jsonb, 0, NULL, 0, false, false, false)'));
SELECT pg_temp.chk('A08 已登入 hotel_admin 仍可呼叫 sync_order_rooms_v1（不被授權擋）', 'OK', pg_temp.as_role('authenticated', 'a2000000-0000-0000-0000-000000000002', 'SELECT public.sync_order_rooms_v1(''0e000000-0000-0000-0000-000000000001''::uuid, NULL, ''[]''::jsonb)') || '');
SELECT pg_temp.chk('A09 已登入 hotel_admin 可呼叫 clear_order_room_pricing_template', 'OK', pg_temp.as_role('authenticated', 'a2000000-0000-0000-0000-000000000002', 'SELECT public.clear_order_room_pricing_template(''d1000000-0000-0000-0000-000000000001''::uuid)'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || :'POST' || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
