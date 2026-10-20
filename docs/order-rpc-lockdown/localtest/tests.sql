-- 授權測試（seed_pre.sql 之後執行；交易最後 ROLLBACK）
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO PUBLIC;
GRANT ALL ON SEQUENCE t_result_no_seq TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 200), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
-- 以指定角色執行 SQL，回傳 OK 或錯誤訊息
CREATE FUNCTION pg_temp.as_role(p_role text, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-0000-0000-000000000002', 'role', p_role)::text, true);
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
SET session_replication_role = replica;
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, discount_amount, final_price, paid_amount, order_status, payment_status, order_source)
VALUES ('0d000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'LK1', '測試', '0900000000', CURRENT_DATE + 40, CURRENT_DATE + 41, 'b1000000-0000-0000-0000-000000000001', 2, 10000, 0, 10000, 0, 'confirmed', 'unpaid', 'website');
SET session_replication_role = origin;
-- 以 postgres 擁有的 SECURITY DEFINER 包裝函式模擬「資料庫內部呼叫」（如 apply_ota_modification_v1）
CREATE FUNCTION public.zz_test_definer_wrapper(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.update_order_with_context(p_id, '{"notes":"definer"}'::jsonb, 'localtest_definer'); END $$;
GRANT EXECUTE ON FUNCTION public.zz_test_definer_wrapper(uuid) TO authenticated;

\set UOWC '''SELECT public.update_order_with_context(''''0d000000-0000-0000-0000-000000000001''''::uuid, ''''{"notes":"x"}''''::jsonb, ''''localtest'''')'''
\set COD '''SELECT public.change_order_dates(''''0d000000-0000-0000-0000-000000000001''''::uuid, CURRENT_DATE + 50, CURRENT_DATE + 51, ''''localtest'''')'''
SELECT pg_temp.chk(:'PHASE' || ' U1 anon 呼叫 update_order_with_context', :'EXP_U_ANON', pg_temp.as_role('anon', :UOWC));
SELECT pg_temp.chk(:'PHASE' || ' U2 authenticated 呼叫 update_order_with_context', :'EXP_U_AUTH', pg_temp.as_role('authenticated', :UOWC));
SELECT pg_temp.chk(:'PHASE' || ' U3 service_role 呼叫 update_order_with_context', 'OK', pg_temp.as_role('service_role', :UOWC));
SELECT pg_temp.chk(:'PHASE' || ' U3a service_role 寫入確實落地', 'x', (SELECT notes FROM public.orders WHERE id = '0d000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk(:'PHASE' || ' U4 authenticated 經 SECURITY DEFINER 函式內部呼叫', 'OK', pg_temp.as_role('authenticated', 'SELECT public.zz_test_definer_wrapper(''0d000000-0000-0000-0000-000000000001'')'));
SELECT pg_temp.chk(:'PHASE' || ' U4a 內部呼叫寫入確實落地', 'definer', (SELECT notes FROM public.orders WHERE id = '0d000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk(:'PHASE' || ' C1 anon 呼叫 change_order_dates', :'EXP_C_ANON', pg_temp.as_role('anon', 'SELECT public.change_order_dates(''0d000000-0000-0000-0000-000000000001''::uuid, CURRENT_DATE + 45, CURRENT_DATE + 46, ''localtest'')'));
SELECT pg_temp.chk(:'PHASE' || ' C2 authenticated 呼叫 change_order_dates（不被權限擋）', 'OK', pg_temp.as_role('authenticated', :COD));
SELECT pg_temp.chk(:'PHASE' || ' C3 service_role 呼叫 change_order_dates', 'OK', pg_temp.as_role('service_role', 'SELECT public.change_order_dates(''0d000000-0000-0000-0000-000000000001''::uuid, CURRENT_DATE + 60, CURRENT_DATE + 61, ''localtest'')'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
