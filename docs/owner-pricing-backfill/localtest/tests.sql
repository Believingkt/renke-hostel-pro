-- 20261105090000 業主月結補登規則／log／回復／刪除測試（migration 已套用；交易最後 ROLLBACK）
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

INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-0000000000a1', 'am@t'), ('c9000000-0000-0000-0000-0000000000a2', 'amm@t'), ('c9000000-0000-0000-0000-0000000000a3', 'fin@t'), ('c9000000-0000-0000-0000-0000000000b1', 'adm@t');
INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES ('c9000000-0000-0000-0000-0000000000a1', NULL, 'am'), ('c9000000-0000-0000-0000-0000000000a2', NULL, 'am_manager'), ('c9000000-0000-0000-0000-0000000000a3', NULL, 'finance'), ('c9000000-0000-0000-0000-0000000000b1', NULL, 'admin');
INSERT INTO public.accommodation_info (id, name, is_active) VALUES ('f9000000-0000-0000-0000-000000000001', '月結測試館', true);
SELECT pg_temp.chk('B01 AM 新增本月版本（不需原因）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date, 0.11, NULL)'));
SELECT pg_temp.chk('B02 AM 補登上個月（有原因）→ RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date, 0.1, ''漏建'')'));
SELECT pg_temp.chk('B03 AM 總管補登上個月但沒填原因', 'RAN 補登過去月份必須填寫原因', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date, 0.1, NULL)'));
SELECT pg_temp.chk('B04 AM 總管補登上個月（有原因）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date, 0.12, ''簽約當月漏建'')'));
SELECT pg_temp.chk('B05 admin 補登兩個月前（有原因）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000b1', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 40))::date, 0.13, ''HQ 補登'')'));
SELECT pg_temp.chk('B06 財務補登上個月 → RLS 擋', 'DENIED new row violates', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a3', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date, 0.1, ''x'')'));
SELECT pg_temp.chk('B07 super_admin 新增下個月 15 日', 'RAN 生效月份必須是該月 1 號', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.owner_settlement_pricing_rules (accommodation_id, effective_from, commission_rate, date_change_reason) VALUES (''f9000000-0000-0000-0000-000000000001'', (date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date + interval ''1 month 14 days'')::date, 0.1, NULL)'));
SELECT pg_temp.chk('B08 AM 修改本月版本的月份 → 0 筆（AM 不能改月份）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'DO $x$ DECLARE n int; BEGIN UPDATE public.owner_settlement_pricing_rules SET effective_from = (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date, date_change_reason = ''x'' WHERE commission_rate = 0.11; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 0 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('B09 AM 總管改月份沒填原因', 'RAN 修正生效月份必須填寫原因', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'UPDATE public.owner_settlement_pricing_rules SET effective_from = (date_trunc(''month'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date - 1))::date, date_change_reason = NULL WHERE commission_rate = 0.12'));
SELECT pg_temp.chk('B10 AM 總管改月份（有原因）→ 1 筆', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'DO $x$ DECLARE n int; BEGIN UPDATE public.owner_settlement_pricing_rules SET effective_from = (date_trunc(''month'', (date_trunc(''month'', date_trunc(''month'', now() AT TIME ZONE ''Asia/Taipei'')::date - 1))::date - 1))::date, date_change_reason = ''其實是更早'' WHERE commission_rate = 0.12; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('B11 AM 總管改費率 → 守門擋', 'RAN 歷史版本僅允許修正生效月份', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'UPDATE public.owner_settlement_pricing_rules SET commission_rate = 0.5 WHERE commission_rate = 0.12'));
SELECT pg_temp.chk('B12 super_admin 標記增值服務已審查 → 1 筆', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'DO $x$ DECLARE n int; BEGIN UPDATE public.owner_settlement_pricing_rules SET commission_exclusion_reviewed_at = now() WHERE commission_rate = 0.11; GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION ''rows=%'', n; END IF; END $x$'));
SELECT pg_temp.chk('B13 AM 呼叫回復 → 無權限', 'RAN 沒有回復生效月份的權限', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'SELECT public.owner_pricing_rule_revert_date((SELECT id FROM public.owner_pricing_rule_date_logs WHERE action = ''fix_date'' LIMIT 1), ''x'')'));
SELECT pg_temp.chk('B14 AM 總管回復最新一筆修正', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_revert_date((SELECT id FROM public.owner_pricing_rule_date_logs WHERE action = ''fix_date'' LIMIT 1), ''改錯了'')'));
SELECT pg_temp.chk('B15 回復後月份改回上個月', 't', (SELECT effective_from = (date_trunc('month', date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date - 1))::date FROM public.owner_settlement_pricing_rules WHERE commission_rate = 0.12)::text);
SELECT pg_temp.chk('B16 再回復舊的那筆修正 → 不是最新', 'RAN 這個版本之後又改過月份', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_revert_date((SELECT id FROM public.owner_pricing_rule_date_logs WHERE action = ''fix_date'' LIMIT 1), ''x'')'));
SELECT pg_temp.chk('B17 刪除非補登版本 → 擋', 'RAN 只能刪除補登的版本', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_delete_backfill((SELECT id FROM public.owner_settlement_pricing_rules WHERE commission_rate = 0.11), ''x'')'));
INSERT INTO public.team_member_profiles (id, display_name) VALUES ('c9000000-0000-0000-0000-0000000000f1', '快照人');
INSERT INTO public.teamcommission_bonus_snapshots (bonus_type, member_id, snapshot_month, payout_month, amount) VALUES ('am_performance', 'c9000000-0000-0000-0000-0000000000f1', to_char((date_trunc('month', date_trunc('month', now() AT TIME ZONE 'Asia/Taipei')::date - 40))::date, 'YYYY-MM'), to_char(now(), 'YYYY-MM'), 1);
SELECT pg_temp.chk('B18 刪除已有獎金快照月份的補登 → 擋', 'RAN 20', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_delete_backfill((SELECT id FROM public.owner_settlement_pricing_rules WHERE commission_rate = 0.13), ''x'')'));
SELECT pg_temp.chk('B19 刪除補登沒填原因', 'RAN 刪除必須填寫原因', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_delete_backfill((SELECT id FROM public.owner_settlement_pricing_rules WHERE commission_rate = 0.12), '''')'));
SELECT pg_temp.chk('B20 AM 總管刪除補登錯的版本', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'SELECT public.owner_pricing_rule_delete_backfill((SELECT id FROM public.owner_settlement_pricing_rules WHERE commission_rate = 0.12), ''不該有這版'')'));
SELECT pg_temp.chk('B21 log：backfill 2、fix_date 1、revert 1、delete 1（含快照）', '2|1|1|1|t', (SELECT count(*) FILTER (WHERE action = 'backfill') || '|' || count(*) FILTER (WHERE action = 'fix_date') || '|' || count(*) FILTER (WHERE action = 'revert') || '|' || count(*) FILTER (WHERE action = 'delete') || '|' || bool_or(action = 'delete' AND rule_snapshot ->> 'commission_rate' = '0.12') FROM public.owner_pricing_rule_date_logs)::text);
SELECT pg_temp.chk('B22 anon 呼叫回復 RPC', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT public.owner_pricing_rule_revert_date(gen_random_uuid(), ''x'')'));
SELECT pg_temp.chk('B23 authenticated 直接寫 log 表', 'DENIED permission denied', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a2', 'INSERT INTO public.owner_pricing_rule_date_logs (rule_id, accommodation_id, action, reason) VALUES (gen_random_uuid(), gen_random_uuid(), ''fix_date'', ''x'')'));
SELECT pg_temp.chk('B24 財務可讀 log', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a3', 'SELECT count(*) FROM public.owner_pricing_rule_date_logs'));
SELECT pg_temp.chk('B25 一般 AM 可讀 log', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-0000000000a1', 'SELECT count(*) FROM public.owner_pricing_rule_date_logs'));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
