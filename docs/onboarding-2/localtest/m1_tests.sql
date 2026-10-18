-- 2a M1 本機權限測試（整段在交易內，最後 ROLLBACK，不留資料）
-- 用法：psql -X -U postgres -d <本機庫> -f docs/onboarding-2/localtest/m1_tests.sql
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

-- 種子資料（略過 trigger／外鍵，只為建立測試列）
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '測試A館', false),
  ('b0000000-0000-0000-0000-00000000000b', '測試B館', false),
  ('c0000000-0000-0000-0000-00000000000c', '測試C館', false);
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('20000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'hotel_admin'),
  ('30000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-00000000000c', 'super_admin'),
  ('40000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'staff');
INSERT INTO group_buy_campaigns (id, accommodation_id, slug, title, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 't-a', 'A', 'draft'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 't-b', 'B', 'draft'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 't-c', 'C', 'draft');
INSERT INTO group_buy_campaign_packages (campaign_id, display_name, group_buy_price, package_id) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'A', 1, gen_random_uuid()), ('b1000000-0000-0000-0000-000000000001', 'B', 1, gen_random_uuid());
INSERT INTO group_buy_campaign_notification_settings (campaign_id) VALUES
  ('a1000000-0000-0000-0000-000000000001'), ('b1000000-0000-0000-0000-000000000001');
INSERT INTO group_buy_venue_intros (accommodation_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a'), ('b0000000-0000-0000-0000-00000000000b');
INSERT INTO orders (id, accommodation_id, order_number, check_in_date, check_out_date, guest_name, guest_phone, total_price, final_price) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'T2A-A', '2027-01-01', '2027-01-02', 't', '0', 1, 1),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'T2A-B', '2027-01-01', '2027-01-02', 't', '0', 1, 1);
INSERT INTO order_manual_review_tasks (order_id, accommodation_id) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b');
INSERT INTO room_types (id, accommodation_id, name, capacity, base_price) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'rA', 2, 1000),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'rB', 2, 1000);
INSERT INTO accommodation_packages (id, accommodation_id, name, sale_price, included_guest_count) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'pA', 1000, 2),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'pB', 1000, 2);
INSERT INTO owlting_room_type_rate_plans (accommodation_id, room_type_id, package_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'a3000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-00000000000b', 'b3000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001');
INSERT INTO owlting_email_property_alias (owlting_property_name, accommodation_id) VALUES
  ('prop-A', 'a0000000-0000-0000-0000-00000000000a'), ('prop-B', 'b0000000-0000-0000-0000-00000000000b'), ('prop-null', NULL);
INSERT INTO owlting_email_room_alias (accommodation_id, owlting_room_name) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'room-A'), ('b0000000-0000-0000-0000-00000000000b', 'room-B');
INSERT INTO referral_campaigns (name, accommodation_id, is_active) VALUES
  ('ref-A', 'a0000000-0000-0000-0000-00000000000a', false), ('ref-B', 'b0000000-0000-0000-0000-00000000000b', false);
SET LOCAL session_replication_role = origin;

-- 身分：hA=A館 hotel_admin、multi=A+C 館 hotel_admin、su=super_admin、st=A館 staff（orders 預設可編輯）
DO $$
DECLARE
  hA uuid := '10000000-0000-0000-0000-000000000001';
  multi uuid := '20000000-0000-0000-0000-000000000002';
  su uuid := '30000000-0000-0000-0000-000000000003';
  st uuid := '40000000-0000-0000-0000-000000000004';
  A text := '''a0000000-0000-0000-0000-00000000000a''';
  B text := '''b0000000-0000-0000-0000-00000000000b''';
  Cc text := '''c0000000-0000-0000-0000-00000000000c''';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['group_buy_campaigns', 'group_buy_venue_intros', 'order_manual_review_tasks',
                           'owlting_room_type_rate_plans', 'owlting_email_property_alias', 'owlting_email_room_alias', 'referral_campaigns'] LOOP
    PERFORM pg_temp.chk(t || ' 01 hA 讀 A', 'count=1', pg_temp.cnt(hA, format('SELECT 1 FROM %I WHERE accommodation_id = %s', t, A)));
    -- group_buy_venue_intros 另有「Anyone can view」公開讀取（qual = true，非本批範圍），讀取預期為 1
    PERFORM pg_temp.chk(t || ' 02 hA 讀 B', CASE WHEN t = 'group_buy_venue_intros' THEN 'count=1' ELSE 'count=0' END, pg_temp.cnt(hA, format('SELECT 1 FROM %I WHERE accommodation_id = %s', t, B)));
    PERFORM pg_temp.chk(t || ' 03 hA 改 A', 'OK rows=1', pg_temp.run_as(hA, format('UPDATE %I SET updated_at = now() WHERE accommodation_id = %s', t, A)));
    PERFORM pg_temp.chk(t || ' 04 hA 改 B', 'OK rows=0', pg_temp.run_as(hA, format('UPDATE %I SET updated_at = now() WHERE accommodation_id = %s', t, B)));
    PERFORM pg_temp.chk(t || ' 05 hA 刪 B', 'OK rows=0', pg_temp.run_as(hA, format('DELETE FROM %I WHERE accommodation_id = %s', t, B)));
    PERFORM pg_temp.chk(t || ' 06 multi 讀 A', 'count=1', pg_temp.cnt(multi, format('SELECT 1 FROM %I WHERE accommodation_id = %s', t, A)));
    PERFORM pg_temp.chk(t || ' 07 multi 讀 B（未指派）', CASE WHEN t = 'group_buy_venue_intros' THEN 'count=1' ELSE 'count=0' END, pg_temp.cnt(multi, format('SELECT 1 FROM %I WHERE accommodation_id = %s', t, B)));
    PERFORM pg_temp.chk(t || ' 08 su 讀 B', 'count=1', pg_temp.cnt(su, format('SELECT 1 FROM %I WHERE accommodation_id = %s', t, B)));
    PERFORM pg_temp.chk(t || ' 09 su 改 B', 'OK rows=1', pg_temp.run_as(su, format('UPDATE %I SET updated_at = now() WHERE accommodation_id = %s', t, B)));
  END LOOP;

  -- 新增到別館要被擋
  PERFORM pg_temp.chk('group_buy_campaigns 10 hA 新增 B', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO group_buy_campaigns (accommodation_id, slug, title) VALUES (' || B || ', ''x-b'', ''x'')'));
  PERFORM pg_temp.chk('group_buy_campaigns 11 hA 新增 A', 'OK rows=1', pg_temp.run_as(hA, 'INSERT INTO group_buy_campaigns (accommodation_id, slug, title) VALUES (' || A || ', ''x-a'', ''x'')'));
  PERFORM pg_temp.chk('group_buy_campaigns 12 multi 讀 C（已指派）', 'count=1', pg_temp.cnt(multi, 'SELECT 1 FROM group_buy_campaigns WHERE accommodation_id = ' || Cc));
  PERFORM pg_temp.chk('rate_plans 13 hA 新增 B', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO owlting_room_type_rate_plans (accommodation_id, room_type_id, package_id) VALUES (' || B || ', ''b3000000-0000-0000-0000-000000000001'', ''b4000000-0000-0000-0000-000000000001'')'));
  PERFORM pg_temp.chk('property_alias 14 hA 讀未對應館', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM owlting_email_property_alias WHERE accommodation_id IS NULL'));
  PERFORM pg_temp.chk('property_alias 15 su 讀未對應館', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM owlting_email_property_alias WHERE accommodation_id IS NULL'));
  PERFORM pg_temp.chk('room_alias 16 hA 新增 B', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO owlting_email_room_alias (accommodation_id, owlting_room_name) VALUES (' || B || ', ''x'')'));
  PERFORM pg_temp.chk('referral_campaigns 17 hA 新增 B', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO referral_campaigns (name, accommodation_id) VALUES (''x'', ' || B || ')'));

  -- 透過活動對到館別的兩張表
  PERFORM pg_temp.chk('campaign_packages 18 hA 讀 A', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM group_buy_campaign_packages WHERE campaign_id = ''a1000000-0000-0000-0000-000000000001'''));
  PERFORM pg_temp.chk('campaign_packages 19 hA 讀 B', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM group_buy_campaign_packages WHERE campaign_id = ''b1000000-0000-0000-0000-000000000001'''));
  PERFORM pg_temp.chk('campaign_packages 20 hA 新增 B', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO group_buy_campaign_packages (campaign_id, display_name, group_buy_price, package_id) VALUES (''b1000000-0000-0000-0000-000000000001'', ''x'', 1, gen_random_uuid())'));
  PERFORM pg_temp.chk('notif_settings 21 hA 讀 A', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM group_buy_campaign_notification_settings WHERE campaign_id = ''a1000000-0000-0000-0000-000000000001'''));
  PERFORM pg_temp.chk('notif_settings 22 hA 讀 B', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM group_buy_campaign_notification_settings WHERE campaign_id = ''b1000000-0000-0000-0000-000000000001'''));
  PERFORM pg_temp.chk('campaign_packages 23 su 讀 B', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM group_buy_campaign_packages WHERE campaign_id = ''b1000000-0000-0000-0000-000000000001'''));

  -- staff（orders 模組預設可編輯）對人工審核照常可用，且只限本館
  PERFORM pg_temp.chk('manual_review 24 staff 讀 A', 'count=1', pg_temp.cnt(st, 'SELECT 1 FROM order_manual_review_tasks WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('manual_review 25 staff 改 A', 'OK rows=1', pg_temp.run_as(st, 'UPDATE order_manual_review_tasks SET updated_at = now() WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('manual_review 26 staff 讀 B', 'count=0', pg_temp.cnt(st, 'SELECT 1 FROM order_manual_review_tasks WHERE accommodation_id = ' || B));
END $$;

SELECT case_no, expect, actual, pass FROM t_result ORDER BY pass, case_no;
SELECT count(*) FILTER (WHERE pass) AS passed, count(*) FILTER (WHERE NOT pass) AS failed FROM t_result;
ROLLBACK;
