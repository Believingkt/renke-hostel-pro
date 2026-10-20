-- update_order_fields_v1 加入 pricing_template_id 的功能測試（seed_pre.sql＋migration 之後執行；交易最後 ROLLBACK）
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
CREATE FUNCTION pg_temp.try(p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE p_sql INTO v;
    r := 'OK ' || COALESCE(v, '');
  EXCEPTION WHEN OTHERS THEN r := 'ERR [' || SQLSTATE || '] ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(p_actual, 200), p_actual LIKE p_expect || '%'); $$;

SET session_replication_role = replica;
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, final_price, order_status, payment_status, order_source, package_id, pricing_template_id)
VALUES ('0a000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'PT3TEST1', '測試', '0900000000', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 10000, 'confirmed', 'unpaid', 'manual', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001');
SET session_replication_role = origin;

\set HA '''a2000000-0000-0000-0000-000000000002'''
\set OID '''0a000000-0000-0000-0000-000000000001'''

SELECT pg_temp.chk('T1 本館專案＋方案一起改', 'OK 1', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"package_id":"c2000000-0000-0000-0000-000000000002","pricing_template_id":"d2000000-0000-0000-0000-000000000002"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T1b 訂單欄位確實寫入', 'OK c2000000-0000-0000-0000-000000000002|d2000000-0000-0000-0000-000000000002', 'OK ' || (SELECT package_id || '|' || pricing_template_id FROM public.orders WHERE id = :OID));
SELECT pg_temp.chk('T2 他館專案被拒', 'ERR [P0001] PRICING_TEMPLATE_ACCOMMODATION_MISMATCH', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"pricing_template_id":"d9000000-0000-0000-0000-000000000009"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T2b 被拒後專案未變', 'OK d2000000-0000-0000-0000-000000000002', 'OK ' || (SELECT pricing_template_id::text FROM public.orders WHERE id = :OID));
SELECT pg_temp.chk('T3 不存在的專案被拒', 'ERR [P0001] PRICING_TEMPLATE_ACCOMMODATION_MISMATCH', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"pricing_template_id":"dddddddd-0000-0000-0000-000000000000"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T4 傳 JSON null → 清空專案（不檢查）', 'OK 1', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"pricing_template_id":null}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T4b 專案已清空', 'OK (null)', 'OK ' || COALESCE((SELECT pricing_template_id::text FROM public.orders WHERE id = :OID), '(null)'));
SELECT pg_temp.chk('T5 空字串被型別轉換拒絕', 'ERR [22P02]', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"pricing_template_id":""}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T6 異動紀錄來源仍為 admin_order_inline_edit 且記到專案變更', 'OK t', 'OK ' || (SELECT bool_or(l.source = 'admin_order_inline_edit' AND l.changed_fields @> '[{"field":"pricing_template_id"}]') FROM public.order_change_log l WHERE l.order_id = :OID)::text);
SELECT pg_temp.chk('T7 既有欄位照舊可改（只改備註）', 'OK 1', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"notes":"只改備註"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T8 白名單外欄位照舊拒絕', 'ERR [P0001] update_order_fields_v1: 欄位不在白名單內', pg_temp.try(:HA, format($f$SELECT public.update_order_fields_v1(%L, '{"accommodation_id":"f2000000-0000-0000-0000-000000000002"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));
SELECT pg_temp.chk('T9 他館管理者照舊不能改本館訂單', 'ERR', pg_temp.try('a7000000-0000-0000-0000-000000000007', format($f$SELECT public.update_order_fields_v1(%L, '{"notes":"x"}'::jsonb, 'admin_order_inline_edit', NULL)::text$f$, :OID)));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' | ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
