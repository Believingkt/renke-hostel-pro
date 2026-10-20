-- 20261102100000 身分矩陣測試（:POST = 'true' 表示已套用；交易最後 ROLLBACK）
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO PUBLIC;
GRANT ALL ON SEQUENCE t_result_no_seq TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 160), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
-- p_post=true 時預期被授權擋下；false 時預期「沒有被授權擋下」（函式有執行到，回傳 OK 或業務錯誤）
CREATE FUNCTION pg_temp.chk_gate(p_case text, p_denied boolean, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, CASE WHEN p_denied THEN 'DENIED permission denied' ELSE '未被授權擋（OK／RAN）' END, left(COALESCE(p_actual, '(null)'), 160),
    CASE WHEN p_denied THEN COALESCE(p_actual, '') LIKE 'DENIED permission denied%' ELSE COALESCE(p_actual, '') NOT LIKE 'DENIED permission denied%' END); $$;
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

INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-000000000004', 'member@test.local');
\set P '(:''POST'' = ''true'')'
SELECT pg_temp.chk_gate('V01 anon gbp_vault_get', :P, pg_temp.as_role('anon', NULL, 'SELECT public.gbp_vault_get(''email_queue_service_role_key'')'));
SELECT pg_temp.chk_gate('V02 一般會員 gbp_vault_get', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.gbp_vault_get(''email_queue_service_role_key'')'));
SELECT pg_temp.chk_gate('V03 館員／super_admin gbp_vault_get', :P, pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'SELECT public.gbp_vault_get(''email_queue_service_role_key'')'));
SELECT pg_temp.chk('V04 service_role gbp_vault_get', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.gbp_vault_get(''email_queue_service_role_key'')'));
SELECT pg_temp.chk_gate('V05 anon gbp_vault_set', :P, pg_temp.as_role('anon', NULL, 'SELECT public.gbp_vault_set(''attacker_test_secret'', ''x'')'));
SELECT pg_temp.chk_gate('V06 一般會員 gbp_vault_set', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.gbp_vault_set(''attacker_test_secret'', ''x'')'));
SELECT pg_temp.chk_gate('V07 館員／super_admin gbp_vault_set', :P, pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'SELECT public.gbp_vault_set(''attacker_test_secret'', ''x'')'));
SELECT pg_temp.chk('V08 service_role gbp_vault_set', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.gbp_vault_set(''svc_only_secret'', ''x'')'));
SELECT pg_temp.chk_gate('V09 anon get_rpc_contract', :P, pg_temp.as_role('anon', NULL, 'SELECT * FROM public.get_rpc_contract(ARRAY[''gbp_vault_get''])'));
SELECT pg_temp.chk_gate('V10 一般會員 get_rpc_contract', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT * FROM public.get_rpc_contract(ARRAY[''gbp_vault_get''])'));
SELECT pg_temp.chk_gate('V11 館員／super_admin get_rpc_contract', :P, pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'SELECT * FROM public.get_rpc_contract(ARRAY[''gbp_vault_get''])'));
SELECT pg_temp.chk('V12 service_role get_rpc_contract', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT * FROM public.get_rpc_contract(ARRAY[''gbp_vault_get''])'));
SELECT pg_temp.chk_gate('V13 anon claim_hotelnabe_ari_push_batch', :P, pg_temp.as_role('anon', NULL, 'SELECT * FROM public.claim_hotelnabe_ari_push_batch(1)'));
SELECT pg_temp.chk_gate('V14 一般會員 claim_hotelnabe_ari_push_batch', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT * FROM public.claim_hotelnabe_ari_push_batch(1)'));
SELECT pg_temp.chk_gate('V15 館員／super_admin claim_hotelnabe_ari_push_batch', :P, pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'SELECT * FROM public.claim_hotelnabe_ari_push_batch(1)'));
SELECT pg_temp.chk('V16 service_role claim_hotelnabe_ari_push_batch', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT * FROM public.claim_hotelnabe_ari_push_batch(1)'));
SELECT pg_temp.chk('V17 service_role 寫入後讀回 vault（edge function 正常路徑）', 'OK', pg_temp.as_role('service_role', NULL, 'DO $x$ BEGIN PERFORM public.gbp_vault_set(''svc_roundtrip'', ''v1''); IF public.gbp_vault_get(''svc_roundtrip'') IS DISTINCT FROM ''v1'' THEN RAISE EXCEPTION ''讀回不符''; END IF; END $x$'));
SELECT pg_temp.chk_gate('O01 anon get_ai_ops_metrics（套用前：DEFINER 下 current_user 恆為 postgres，anon 可讀營運數據）', :P, pg_temp.as_role('anon', NULL, 'SELECT * FROM public.get_ai_ops_metrics(NULL, 7)'));
SELECT pg_temp.chk('O02 super_admin（後台登入）get_ai_ops_metrics', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'SELECT * FROM public.get_ai_ops_metrics(NULL, 7)'));
SELECT pg_temp.chk('O03 一般會員 get_ai_ops_metrics → 函式內 not authorized', 'RAN not authorized', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT * FROM public.get_ai_ops_metrics(NULL, 7)'));
SELECT pg_temp.chk('O04 service_role get_ai_ops_metrics（ai-ops-insights）', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT * FROM public.get_ai_ops_metrics(NULL, 7)'));
SELECT pg_temp.chk('M01 前 4 支 anon／authenticated／service_role 可執行數', CASE WHEN :P THEN '0 0 4' ELSE '4 4 4' END, (SELECT count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) || ' ' || count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) || ' ' || count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.proname IN ('gbp_vault_get', 'gbp_vault_set', 'get_rpc_contract', 'claim_hotelnabe_ari_push_batch')));
SELECT pg_temp.chk('M02 get_ai_ops_metrics anon／authenticated／service_role', CASE WHEN :P THEN 'false true true' ELSE 'true true true' END, (SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ' ' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text FROM pg_proc p WHERE p.proname = 'get_ai_ops_metrics'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || :'POST' || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
