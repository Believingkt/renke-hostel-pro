-- 2a-2（P0 7 張表）本機權限測試（交易內，最後 ROLLBACK）
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
    RAISE EXCEPTION USING ERRCODE = 'P0099';  -- 每個案例寫入後立即撤銷，案例之間互不影響
  EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL;
            WHEN OTHERS THEN v_res := 'ERR [' || SQLSTATE || ']';
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

-- 種子資料：A 館業主 hA、super_admin su、全域 admin ad、sales（scout）sc、am、會員 mb
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-0000-0000-00000000000a', '測試A館', false), ('b0000000-0000-0000-0000-00000000000b', '測試B館', false);
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('30000000-0000-0000-0000-000000000003', NULL, 'super_admin'),
  ('60000000-0000-0000-0000-000000000006', NULL, 'admin'),
  ('80000000-0000-0000-0000-000000000008', NULL, 'scout'),
  ('90000000-0000-0000-0000-000000000009', NULL, 'am');
INSERT INTO team_member_profiles (id, user_id, display_name) VALUES
  ('f9000000-0000-0000-0000-000000000009', '90000000-0000-0000-0000-000000000009', 'AM 本人'),
  ('f6000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000006', '其他成員');
INSERT INTO platform_members (id, user_id) VALUES ('fa000000-0000-0000-0000-00000000000a', 'aa000000-0000-0000-0000-0000000000aa');
INSERT INTO trip_products (id, accommodation_id, is_active) VALUES
  ('c1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', false),
  ('c1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b', false),
  ('c1000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-00000000000b', true),
  ('c1000000-0000-0000-0000-000000000000', NULL, false);
INSERT INTO order_attributions (accommodation_id, order_id) VALUES
  ('a0000000-0000-0000-0000-00000000000a', gen_random_uuid()), ('b0000000-0000-0000-0000-00000000000b', gen_random_uuid());
INSERT INTO owlting_fillup_tokens (staging_id, token_hash, expires_at) VALUES (gen_random_uuid(), 'h', now() + interval '1 day');
INSERT INTO line_sessions (line_user_id) VALUES ('U1');
INSERT INTO referral_records (campaign_id, invite_code, inviter_id) VALUES (gen_random_uuid(), 'r1', 'fa000000-0000-0000-0000-00000000000a');
INSERT INTO kol_referrals (id, inviter_kol_id, invite_code) VALUES ('c2000000-0000-0000-0000-000000000001', gen_random_uuid(), 'k1');
INSERT INTO line_binding_tokens (team_member_id, token, expires_at) VALUES
  ('f9000000-0000-0000-0000-000000000009', 't-am', now() + interval '1 day'),
  ('f6000000-0000-0000-0000-000000000006', 't-other', now() + interval '1 day');
-- 外鍵檢查全程關閉（只測 RLS；RLS 不受 session_replication_role 影響）

DO $$
DECLARE
  hA uuid := '10000000-0000-0000-0000-000000000001';
  su uuid := '30000000-0000-0000-0000-000000000003';
  ad uuid := '60000000-0000-0000-0000-000000000006';
  sc uuid := '80000000-0000-0000-0000-000000000008';
  am uuid := '90000000-0000-0000-0000-000000000009';
  mb uuid := 'aa000000-0000-0000-0000-0000000000aa';
  A text := '''a0000000-0000-0000-0000-00000000000a''';
  B text := '''b0000000-0000-0000-0000-00000000000b''';
BEGIN
  -- trip_products
  PERFORM pg_temp.chk('trip 01 業主讀別館（未上架）', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM trip_products WHERE NOT is_active AND accommodation_id = ' || B));
  PERFORM pg_temp.chk('trip 02 業主改別館', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE trip_products SET is_active = is_active WHERE accommodation_id = ' || B));
  PERFORM pg_temp.chk('trip 03 業主刪別館', 'OK rows=0', pg_temp.run_as(hA, 'DELETE FROM trip_products WHERE accommodation_id = ' || B));
  PERFORM pg_temp.chk('trip 04 業主新增別館', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO trip_products (accommodation_id) VALUES (' || B || ')'));
  PERFORM pg_temp.chk('trip 05 業主改平台商品（無館別）', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE trip_products SET is_active = is_active WHERE accommodation_id IS NULL'));
  PERFORM pg_temp.chk('trip 06 業主讀本館（未上架）', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM trip_products WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('trip 07 業主改本館', 'OK rows=1', pg_temp.run_as(hA, 'UPDATE trip_products SET is_active = is_active WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('trip 08 業主新增本館', 'OK rows=1', pg_temp.run_as(hA, 'INSERT INTO trip_products (accommodation_id) VALUES (' || A || ')'));
  PERFORM pg_temp.chk('trip 09 super_admin 改全部', 'OK rows=4', pg_temp.run_as(su, 'UPDATE trip_products SET is_active = is_active'));
  PERFORM pg_temp.chk('trip 10 公開讀取上架商品（不動）', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM trip_products WHERE is_active AND accommodation_id = ' || B));
  -- order_attributions
  PERFORM pg_temp.chk('attr 11 業主讀別館', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM order_attributions WHERE accommodation_id = ' || B));
  PERFORM pg_temp.chk('attr 12 業主改別館', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE order_attributions SET accommodation_id = accommodation_id WHERE accommodation_id = ' || B));
  PERFORM pg_temp.chk('attr 13 業主讀本館', 'count=1', pg_temp.cnt(hA, 'SELECT 1 FROM order_attributions WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('attr 14 業主改本館', 'OK rows=1', pg_temp.run_as(hA, 'UPDATE order_attributions SET accommodation_id = accommodation_id WHERE accommodation_id = ' || A));
  PERFORM pg_temp.chk('attr 15 super_admin 讀全部', 'count=2', pg_temp.cnt(su, 'SELECT 1 FROM order_attributions'));
  PERFORM pg_temp.chk('attr 16 公開新增（不動）', 'OK rows=1', pg_temp.run_as(mb, 'INSERT INTO order_attributions (order_id) VALUES (gen_random_uuid())'));
  -- owlting_fillup_tokens
  PERFORM pg_temp.chk('fillup 17 業主讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM owlting_fillup_tokens'));
  PERFORM pg_temp.chk('fillup 18 業主改', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE owlting_fillup_tokens SET token_hash = token_hash'));
  PERFORM pg_temp.chk('fillup 19 業主新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO owlting_fillup_tokens (staging_id, token_hash, expires_at) VALUES (gen_random_uuid(), ''x'', now())'));
  PERFORM pg_temp.chk('fillup 20 super_admin 讀', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM owlting_fillup_tokens'));
  -- line_sessions
  PERFORM pg_temp.chk('session 21 業主讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM line_sessions'));
  PERFORM pg_temp.chk('session 22 super_admin 讀', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM line_sessions'));
  -- referral_records
  PERFORM pg_temp.chk('referral 23 業主讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM referral_records'));
  PERFORM pg_temp.chk('referral 24 業主改', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE referral_records SET invite_code = invite_code'));
  PERFORM pg_temp.chk('referral 25 super_admin 讀', 'count=1', pg_temp.cnt(su, 'SELECT 1 FROM referral_records'));
  PERFORM pg_temp.chk('referral 26 會員讀自己的（不動）', 'count=1', pg_temp.cnt(mb, 'SELECT 1 FROM referral_records'));
  -- kol_referrals
  PERFORM pg_temp.chk('kolref 27 業主讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM kol_referrals'));
  PERFORM pg_temp.chk('kolref 28 業主改', 'OK rows=0', pg_temp.run_as(hA, 'UPDATE kol_referrals SET invite_code = invite_code'));
  PERFORM pg_temp.chk('kolref 29 業主刪', 'OK rows=0', pg_temp.run_as(hA, 'DELETE FROM kol_referrals'));
  PERFORM pg_temp.chk('kolref 30 業主新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO kol_referrals (inviter_kol_id, invite_code) VALUES (gen_random_uuid(), ''x'')'));
  PERFORM pg_temp.chk('kolref 31 團隊 admin 讀', 'count=1', pg_temp.cnt(ad, 'SELECT 1 FROM kol_referrals'));
  PERFORM pg_temp.chk('kolref 32 團隊 admin 改', 'OK rows=1', pg_temp.run_as(ad, 'UPDATE kol_referrals SET invite_code = invite_code'));
  PERFORM pg_temp.chk('kolref 33 sales 讀', 'count=1', pg_temp.cnt(sc, 'SELECT 1 FROM kol_referrals'));
  PERFORM pg_temp.chk('kolref 34 sales 新增', 'OK rows=1', pg_temp.run_as(sc, 'INSERT INTO kol_referrals (inviter_kol_id, invite_code) VALUES (gen_random_uuid(), ''s1'')'));
  PERFORM pg_temp.chk('kolref 35 super_admin 改', 'OK rows=1', pg_temp.run_as(su, 'UPDATE kol_referrals SET invite_code = invite_code'));
  -- line_binding_tokens
  PERFORM pg_temp.chk('lbt 36 業主讀', 'count=0', pg_temp.cnt(hA, 'SELECT 1 FROM line_binding_tokens'));
  PERFORM pg_temp.chk('lbt 37 業主新增', 'ERR [42501]', pg_temp.run_as(hA, 'INSERT INTO line_binding_tokens (team_member_id, token, expires_at) VALUES (''f6000000-0000-0000-0000-000000000006'', ''x1'', now())'));
  PERFORM pg_temp.chk('lbt 38 團隊 admin 讀', 'count=2', pg_temp.cnt(ad, 'SELECT 1 FROM line_binding_tokens'));
  PERFORM pg_temp.chk('lbt 39 團隊 admin 新增', 'OK rows=1', pg_temp.run_as(ad, 'INSERT INTO line_binding_tokens (team_member_id, token, expires_at) VALUES (''f6000000-0000-0000-0000-000000000006'', ''x2'', now())'));
  PERFORM pg_temp.chk('lbt 40 super_admin 讀', 'count=2', pg_temp.cnt(su, 'SELECT 1 FROM line_binding_tokens'));
  PERFORM pg_temp.chk('lbt 41 am 讀（只看到自己的）', 'count=1', pg_temp.cnt(am, 'SELECT 1 FROM line_binding_tokens'));
  PERFORM pg_temp.chk('lbt 42 am 為自己產生綁定連結', 'OK rows=1', pg_temp.run_as(am, 'INSERT INTO line_binding_tokens (team_member_id, token, expires_at) VALUES (''f9000000-0000-0000-0000-000000000009'', ''x3'', now())'));
  PERFORM pg_temp.chk('lbt 43 am 為別人產生綁定連結', 'ERR [42501]', pg_temp.run_as(am, 'INSERT INTO line_binding_tokens (team_member_id, token, expires_at) VALUES (''f6000000-0000-0000-0000-000000000006'', ''x4'', now())'));
END $$;

SELECT case_no, expect, actual, pass FROM t_result ORDER BY pass, case_no;
SELECT count(*) FILTER (WHERE pass) AS passed, count(*) FILTER (WHERE NOT pass) AS failed FROM t_result;
ROLLBACK;
