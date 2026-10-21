-- 20261103090000 館別獎金旗標／單館來源覆蓋 RLS 測試（migration 已套用）（:POST = 'true' 表示已套用；交易最後 ROLLBACK）
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

INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-0000000000a1', 'am@t'), ('c9000000-0000-0000-0000-0000000000a2', 'amm@t'), ('c9000000-0000-0000-0000-0000000000a3', 'fin@t'), ('c9000000-0000-0000-0000-0000000000a4', 'mem@t'), ('c9000000-0000-0000-0000-0000000000a5', 'adm@t');
INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES ('c9000000-0000-0000-0000-0000000000a1', NULL, 'am'), ('c9000000-0000-0000-0000-0000000000a2', NULL, 'am_manager'), ('c9000000-0000-0000-0000-0000000000a3', NULL, 'finance'), ('c9000000-0000-0000-0000-0000000000a5', NULL, 'admin');
SELECT pg_temp.chk('R01 anon 讀旗標表', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT count(*) FROM public.teamcommission_venue_bonus_flags'));
SELECT pg_temp.chk('R02 一般會員讀旗標表 → 0 筆（RLS）', 'RAN empty', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a4', 'DO $x$ BEGIN IF (SELECT count(*) FROM public.teamcommission_venue_bonus_flags) < 1 THEN RAISE EXCEPTION ''empty''; END IF; END $x$'));
SELECT pg_temp.chk('R03 AM 讀旗標表', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'DO $x$ BEGIN IF (SELECT count(*) FROM public.teamcommission_venue_bonus_flags) < 1 THEN RAISE EXCEPTION ''empty''; END IF; END $x$'));
SELECT pg_temp.chk('R04 財務讀旗標表', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a3', 'DO $x$ BEGIN IF (SELECT count(*) FROM public.teamcommission_venue_bonus_flags) < 1 THEN RAISE EXCEPTION ''empty''; END IF; END $x$'));
SELECT pg_temp.chk('W01 super_admin 寫旗標', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group) VALUES (''f1000000-0000-0000-0000-000000000001'', true, ''G1'') ON CONFLICT (accommodation_id) DO UPDATE SET fixed_merge_group = ''G1'''));
SELECT pg_temp.chk('W02 AM 總管寫旗標', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group) VALUES (''f1000000-0000-0000-0000-000000000001'', true, ''G1'') ON CONFLICT (accommodation_id) DO UPDATE SET fixed_merge_group = ''G1'''));
SELECT pg_temp.chk('W03 AM 寫旗標 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group) VALUES (''f1000000-0000-0000-0000-000000000001'', true, ''G1'') ON CONFLICT (accommodation_id) DO UPDATE SET fixed_merge_group = ''G1'''));
SELECT pg_temp.chk('W04 總部 admin 寫旗標 → RLS 擋（照決定只開 super_admin、AM 總管）', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a5', 'INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group) VALUES (''f1000000-0000-0000-0000-000000000001'', true, ''G1'') ON CONFLICT (accommodation_id) DO UPDATE SET fixed_merge_group = ''G1'''));
SELECT pg_temp.chk('W05 財務寫旗標 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a3', 'INSERT INTO public.teamcommission_venue_bonus_flags (accommodation_id, exclude_from_commission, fixed_merge_group) VALUES (''f1000000-0000-0000-0000-000000000001'', true, ''G1'') ON CONFLICT (accommodation_id) DO UPDATE SET fixed_merge_group = ''G1'''));
SELECT pg_temp.chk('O01 AM 總管新增本月 KOL 來源覆蓋', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], date_trunc(''month'', CURRENT_DATE)::date)'));
SELECT pg_temp.chk('O02 super_admin 新增過去月份版本（補登）', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], date_trunc(''month'', CURRENT_DATE)::date - 31)'));
SELECT pg_temp.chk('O03 AM 新增覆蓋 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'INSERT INTO public.teamcommission_venue_revenue_source_overrides (accommodation_id, track, included_order_sources, effective_from) VALUES (''f1000000-0000-0000-0000-000000000001'', ''kol'', ARRAY[''website''], CURRENT_DATE + 40)'));
SELECT pg_temp.chk('O04 AM 總管修改過去月份版本 → 0 筆受影響（不可改歷史）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN UPDATE public.teamcommission_venue_revenue_source_overrides SET included_order_sources = NULL WHERE effective_from < date_trunc(''month'', CURRENT_DATE)::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION ''改到了''; END IF; END $x$'));
SELECT pg_temp.chk('O05 AM 總管修改本月版本（改回全站）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN UPDATE public.teamcommission_venue_revenue_source_overrides SET included_order_sources = NULL WHERE effective_from = date_trunc(''month'', CURRENT_DATE)::date; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION ''沒改到''; END IF; END $x$'));
SELECT pg_temp.chk('O06 anon 讀覆蓋表', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT count(*) FROM public.teamcommission_venue_revenue_source_overrides'));
SELECT pg_temp.chk('S01 service_role 讀兩張表（edge function）', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT count(*) FROM public.teamcommission_venue_bonus_flags, public.teamcommission_venue_revenue_source_overrides'));
SELECT pg_temp.chk('M01 旅行日館別帶入（seed 2 館）', '2', (SELECT count(*)::text FROM public.teamcommission_venue_bonus_flags f JOIN public.accommodation_info a ON a.id = f.accommodation_id WHERE a.name LIKE '旅行日%' AND f.exclude_from_commission AND f.fixed_merge_group = '旅行日系列'));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
