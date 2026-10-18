-- 2a 第三部分 本機權限測試（交易內，最後 ROLLBACK）
BEGIN;
CREATE TEMP TABLE t_result (case_no text, expect text, actual text, pass boolean);

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
  EXCEPTION WHEN OTHERS THEN
    v_res := 'ERR [' || SQLSTATE || ']';
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_res;
END $$;

-- 讀取筆數（以呼叫者身分）
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
LANGUAGE sql AS $$ INSERT INTO t_result VALUES (p_case, p_expect, p_actual, p_actual LIKE p_expect || '%'); $$;

-- 種子資料
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '測試A館', false), ('b0000000-0000-0000-0000-00000000000b', '測試B館', false);
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('50000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('30000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-00000000000b', 'super_admin'),
  ('60000000-0000-0000-0000-000000000006', NULL, 'admin'),
  ('70000000-0000-0000-0000-000000000007', NULL, 'finance');
INSERT INTO traveler_profiles (id, customer_key) VALUES ('d0000000-0000-0000-0000-000000000001', 'k1');
INSERT INTO remarketing_campaigns (id, name) VALUES ('e0000000-0000-0000-0000-000000000001', 'c1');
INSERT INTO remarketing_sends (campaign_id, traveler_profile_id) VALUES ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
INSERT INTO accommodation_partnership_periods (accommodation_id, start_date, end_date) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '2026-01-01', '2026-12-31'), ('b0000000-0000-0000-0000-00000000000b', '2026-01-01', '2026-12-31');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  hA uuid := '10000000-0000-0000-0000-000000000001';
  ow uuid := '50000000-0000-0000-0000-000000000005';
  su uuid := '30000000-0000-0000-0000-000000000003';
  ad uuid := '60000000-0000-0000-0000-000000000006';
  fi uuid := '70000000-0000-0000-0000-000000000007';
  t text; u uuid; who text;
BEGIN
  FOREACH t IN ARRAY ARRAY['traveler_profiles', 'remarketing_campaigns', 'remarketing_sends'] LOOP
    PERFORM pg_temp.chk(t || ' 01 hotel_admin 讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM ' || t));
    PERFORM pg_temp.chk(t || ' 02 owner 讀', 'count=0', pg_temp.cnt(ow, 'SELECT 1 FROM ' || t));
    PERFORM pg_temp.chk(t || ' 03 hotel_admin 改', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE ' || t || ' SET created_at = created_at'));
    PERFORM pg_temp.chk(t || ' 04 hotel_admin 刪', 'OK rows=0', pg_temp.run_as(hA, 'DELETE FROM ' || t));
    PERFORM pg_temp.chk(t || ' 05 super_admin 讀', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM ' || t));
    PERFORM pg_temp.chk(t || ' 06 全域 admin 讀', 'count=1', pg_temp.cnt(ad, 'SELECT 1 FROM ' || t));
    PERFORM pg_temp.chk(t || ' 07 全域 admin 改', 'OK rows=1', pg_temp.run_as(ad, 'UPDATE ' || t || ' SET created_at = created_at'));
  END LOOP;
  PERFORM pg_temp.chk('traveler_profiles 08 hotel_admin 新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO traveler_profiles (customer_key) VALUES (''x'')'));
  PERFORM pg_temp.chk('remarketing_campaigns 09 hotel_admin 新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO remarketing_campaigns (name) VALUES (''x'')'));

  PERFORM pg_temp.chk('partnership 10 hotel_admin 讀本館', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM accommodation_partnership_periods WHERE accommodation_id = ''a0000000-0000-0000-0000-00000000000a'''));
  PERFORM pg_temp.chk('partnership 11 hotel_admin 讀別館', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM accommodation_partnership_periods WHERE accommodation_id = ''b0000000-0000-0000-0000-00000000000b'''));
  PERFORM pg_temp.chk('partnership 12 owner 讀本館', 'count=1', pg_temp.cnt(ow, 'SELECT 1 FROM accommodation_partnership_periods WHERE accommodation_id = ''a0000000-0000-0000-0000-00000000000a'''));
  PERFORM pg_temp.chk('partnership 13 hotel_admin 改本館', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE accommodation_partnership_periods SET note = ''x'''));
  PERFORM pg_temp.chk('partnership 14 hotel_admin 新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO accommodation_partnership_periods (accommodation_id, start_date) VALUES (''a0000000-0000-0000-0000-00000000000a'', ''2030-01-01'')'));
  PERFORM pg_temp.chk('partnership 15 finance 讀全部', 'count=2', pg_temp.cnt(fi, 'SELECT 1 FROM accommodation_partnership_periods'));
  PERFORM pg_temp.chk('partnership 16 super_admin 改', 'OK rows=2', pg_temp.run_as(su, 'UPDATE accommodation_partnership_periods SET note = ''x'''));
END $$;

SELECT case_no, expect, actual, pass FROM t_result ORDER BY pass, case_no;
SELECT count(*) FILTER (WHERE pass) AS passed, count(*) FILTER (WHERE NOT pass) AS failed FROM t_result;
ROLLBACK;
