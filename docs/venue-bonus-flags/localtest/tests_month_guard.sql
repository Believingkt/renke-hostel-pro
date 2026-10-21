-- 20261104090000 單館來源覆蓋生效日防呆測試（兩支 migration 皆已套用；交易最後 ROLLBACK）
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

INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-0000000000a1', 'am@t'), ('c9000000-0000-0000-0000-0000000000a2', 'amm@t');
INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES ('c9000000-0000-0000-0000-0000000000a1', NULL, 'am'), ('c9000000-0000-0000-0000-0000000000a2', NULL, 'am_manager');
INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES ('f1000000-0000-0000-0000-000000000001', 'shared', ARRAY['website'], (date_trunc('month', now() AT TIME ZONE 'Asia/Taipei') - interval '1 month')::date);
SELECT pg_temp.chk('G01 AM 總管新增本月 1 日版本', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date)'));
SELECT pg_temp.chk('G02 super_admin 新增上個月 1 日（補登）→ RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], (date_trunc(''month'', (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1)))::date)'));
SELECT pg_temp.chk('G03 AM 總管新增下個月 15 日 → CHECK 擋', 'RAN new row for relation "teamcommission_venue_revenue_source_overrides" violates check constraint', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''1 month 14 days'')::date)'));
SELECT pg_temp.chk('G04 AM 總管新增下個月 1 日', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''1 month'')::date)'));
SELECT pg_temp.chk('G05 AM 總管修改本月版本 → 1 筆', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN UPDATE public.teamcommission_venue_revenue_source_overrides SET included_order_sources = NULL WHERE track = ''kol'' AND effective_from = date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('G06 AM 總管修改上個月版本 → 0 筆（不可改歷史）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN UPDATE public.teamcommission_venue_revenue_source_overrides SET included_order_sources = NULL WHERE effective_from < date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('G07 AM 總管把本月版本生效日改到過去 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'UPDATE public.teamcommission_venue_revenue_source_overrides SET effective_from = (date_trunc(''month'', (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1)))::date WHERE track = ''kol'' AND effective_from = date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date'));
SELECT pg_temp.chk('G08 AM 總管刪除本月版本 → 0 筆（已開始的月份不可取消）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN DELETE FROM public.teamcommission_venue_revenue_source_overrides WHERE track = ''kol'' AND effective_from = date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('G09 AM 總管刪除下個月版本（取消排定）→ 1 筆', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN DELETE FROM public.teamcommission_venue_revenue_source_overrides WHERE track = ''kol'' AND effective_from = (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''1 month'')::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('G10 AM 新增下個月 1 日 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''shared'', ARRAY[''website''], (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''1 month'')::date)'));
SELECT pg_temp.chk('G11 service_role 新增 15 日 → CHECK 仍擋', 'RAN new row for relation "teamcommission_venue_revenue_source_overrides" violates check constraint', pg_temp.as_role('service_role', NULL, 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''shared'', ARRAY[''website''], (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''2 month 14 days'')::date)'));
SELECT pg_temp.chk('G12 super_admin 新增本月 1 日（upsert 覆蓋同月）', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''shared'', ARRAY[''website''], date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date) ON CONFLICT (accommodation_id, track, effective_from) DO UPDATE SET included_order_sources = NULL'));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
