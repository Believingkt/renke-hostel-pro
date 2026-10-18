-- 2a-3 補件：hotel_admin 進月結設定頁會讀寫的資料表，本機 RLS 實測（交易內，最後 ROLLBACK）
BEGIN;
CREATE TEMP TABLE t_result (case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO authenticated;

CREATE FUNCTION pg_temp.run_as(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_n bigint; v_res text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_res := 'OK rows=' || v_n;
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
            WHEN OTHERS THEN v_res := 'ERR [' || SQLSTATE || ']';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_res;
END $$;

CREATE FUNCTION pg_temp.cnt(p_uid uuid, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_n bigint;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO v_n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN 'count=' || v_n;
END $$;

CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void
LANGUAGE sql AS $$ INSERT INTO t_result VALUES (p_case, p_expect, p_actual, p_actual = p_expect OR p_actual LIKE p_expect || ' %'); $$;

-- 種子：A 館 hotel_admin（hA）；A、B 兩館各一份資料
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '測試A館', false), ('b0000000-0000-0000-0000-00000000000b', '測試B館', false);
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'hotel_admin');
INSERT INTO profiles (id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'A業主'), ('20000000-0000-0000-0000-000000000002', 'B業主');
INSERT INTO owner_settlement_pricing_rules (id, accommodation_id, effective_from, commission_rate, created_by) VALUES
  ('d1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', '2026-01-01', 10, '10000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', '2026-01-01', 12, '20000000-0000-0000-0000-000000000002');
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('owner_settlement_config:a0000000-0000-0000-0000-00000000000a', '{}'),
  ('owner_settlement_config:b0000000-0000-0000-0000-00000000000b', '{}'),
  ('zz_other_global_setting', '{}');
INSERT INTO accommodation_order_sources (accommodation_id, name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'A來源'), ('b0000000-0000-0000-0000-00000000000b', 'B來源');
INSERT INTO orders (id, order_number, accommodation_id, check_in_date, check_out_date, guest_name, guest_phone, total_price, final_price, order_source) VALUES
  ('e1000000-0000-0000-0000-00000000000a', 'TA1', 'a0000000-0000-0000-0000-00000000000a', '2026-11-01', '2026-11-02', 'A客', '0900000000', 1, 1, 'A來源'),
  ('e1000000-0000-0000-0000-00000000000b', 'TB1', 'b0000000-0000-0000-0000-00000000000b', '2026-11-01', '2026-11-02', 'B客', '0900000000', 1, 1, 'B來源');
SET LOCAL session_replication_role = origin;

\set hA '''10000000-0000-0000-0000-000000000001'''
\set A '''a0000000-0000-0000-0000-00000000000a'''
\set B '''b0000000-0000-0000-0000-00000000000b'''

-- 讀取（hotel_admin of A）
SELECT pg_temp.chk('R1 月結規則 本館', 'count=1', pg_temp.cnt(:hA, $$SELECT 1 FROM owner_settlement_pricing_rules WHERE accommodation_id='a0000000-0000-0000-0000-00000000000a'$$));
SELECT pg_temp.chk('R2 月結規則 別館', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM owner_settlement_pricing_rules WHERE accommodation_id='b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('R3 月結設定值 本館', 'count=1', pg_temp.cnt(:hA, $$SELECT 1 FROM system_settings WHERE setting_key='owner_settlement_config:a0000000-0000-0000-0000-00000000000a'$$));
SELECT pg_temp.chk('R4 月結設定值 別館', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM system_settings WHERE setting_key='owner_settlement_config:b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('R5 其他系統設定', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM system_settings WHERE setting_key='zz_other_global_setting'$$));
SELECT pg_temp.chk('R6 訂單來源（訂單）本館', 'count=1', pg_temp.cnt(:hA, $$SELECT 1 FROM orders WHERE accommodation_id='a0000000-0000-0000-0000-00000000000a'$$));
SELECT pg_temp.chk('R7 訂單來源（訂單）別館', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM orders WHERE accommodation_id='b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('R8 建立者姓名 本館', 'count=1', pg_temp.cnt(:hA, $$SELECT 1 FROM profiles WHERE id='10000000-0000-0000-0000-000000000001'$$));
SELECT pg_temp.chk('R9 建立者姓名 別館', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM profiles WHERE id='20000000-0000-0000-0000-000000000002'$$));
-- 已知：以下兩表本來就是全館可讀（只回報、不改）
SELECT pg_temp.chk('R10 館別自訂訂單來源名稱 別館（既有：登入者皆可讀）', 'count=1', pg_temp.cnt(:hA, $$SELECT 1 FROM accommodation_order_sources WHERE accommodation_id='b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('R11 館別名稱 別館（未上架館，非公開）', 'count=0', pg_temp.cnt(:hA, $$SELECT 1 FROM accommodation_info WHERE id='b0000000-0000-0000-0000-00000000000b'$$));

-- 寫入（hotel_admin of A）
SELECT pg_temp.chk('W1 新增月結規則 本館（本月起）', 'OK rows=1', pg_temp.run_as(:hA, $$INSERT INTO owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate) VALUES ('a0000000-0000-0000-0000-00000000000a', date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date + interval '1 month', 11)$$));
SELECT pg_temp.chk('W2 新增月結規則 別館', 'ERR [42501]', pg_temp.run_as(:hA, $$INSERT INTO owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate) VALUES ('b0000000-0000-0000-0000-00000000000b', date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date + interval '1 month', 11)$$));
SELECT pg_temp.chk('W3 修改月結規則 別館', 'OK rows=0', pg_temp.run_as(:hA, $$UPDATE owner_settlement_pricing_rules SET commission_rate=1 WHERE accommodation_id='b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('W4 刪除月結規則 別館', 'OK rows=0', pg_temp.run_as(:hA, $$DELETE FROM owner_settlement_pricing_rules WHERE accommodation_id='b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('W5 改月結設定值 別館', 'OK rows=0', pg_temp.run_as(:hA, $$UPDATE system_settings SET setting_value='{"x":1}' WHERE setting_key='owner_settlement_config:b0000000-0000-0000-0000-00000000000b'$$));
SELECT pg_temp.chk('W6 新增月結設定值 別館', 'ERR [42501]', pg_temp.run_as(:hA, $$INSERT INTO system_settings (setting_key, setting_value) VALUES ('owner_settlement_config:b0000000-0000-0000-0000-00000000000b-x', '{}')$$));
SELECT pg_temp.chk('W7 改月結設定值 本館（既有：hotel_admin 不可寫，僅 super/AM）', 'OK rows=0', pg_temp.run_as(:hA, $$UPDATE system_settings SET setting_value='{"x":1}' WHERE setting_key='owner_settlement_config:a0000000-0000-0000-0000-00000000000a'$$));

SELECT case_no, expect, actual, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END FROM t_result ORDER BY case_no;
SELECT count(*) FILTER (WHERE pass) || '/' || count(*) AS total FROM t_result;
ROLLBACK;
