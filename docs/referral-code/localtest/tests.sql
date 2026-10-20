-- 只補記推薦碼 update_order_referral_code_v1 本機測試（seed_pre.sql＋20261028090000＋本 migration 之後執行；交易最後 ROLLBACK）
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO PUBLIC;
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 220), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
-- 以指定使用者身分（authenticated）呼叫；p_stale = true 時故意帶錯的 updated_at
CREATE FUNCTION pg_temp.ref(p_uid uuid, p_order uuid, p_code text, p_reason text DEFAULT '補記網紅業績', p_ack boolean DEFAULT false, p_stale boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_ts timestamptz; v_sql text; v text; r text;
BEGIN
  SELECT updated_at INTO v_ts FROM public.orders WHERE id = p_order;
  IF p_stale THEN v_ts := v_ts - interval '1 minute'; END IF;
  v_sql := format('SELECT (public.update_order_referral_code_v1(%L::uuid, %L::timestamptz, %L, %L, true, %L::boolean) ->> %L)', p_order, v_ts, p_reason, p_code, p_ack, 'action');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'email', 'rc@test.local')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE v_sql INTO v;
    r := 'OK ' || COALESCE(v, '');
  EXCEPTION WHEN OTHERS THEN r := 'ERR ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
CREATE FUNCTION pg_temp.money(p_order uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(discount_code, '(null)') || '|' || total_price || '|' || discount_amount || '|' || final_price || '|' || paid_amount || '|' || COALESCE(deposit_amount, 0) || '|' || payment_status
  FROM public.orders WHERE id = p_order; $$;
CREATE FUNCTION pg_temp.comm(p_order uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE((SELECT dc.code || '|' || cr.commission_rate::int || '|' || cr.commission_amount::int || '|' || cr.settlement_status
                   FROM public.commission_records cr JOIN public.discount_codes dc ON dc.id = cr.discount_code_id WHERE cr.order_id = p_order), '(none)'); $$;
CREATE FUNCTION pg_temp.used(p_code text) RETURNS text LANGUAGE sql AS $$
  SELECT used_count::text FROM public.discount_codes WHERE accommodation_id = 'f1000000-0000-0000-0000-000000000001' AND code = p_code; $$;

\set F1 '''f1000000-0000-0000-0000-000000000001'''
\set HA '''a2000000-0000-0000-0000-000000000002'''
\set ST '''a4000000-0000-0000-0000-000000000004'''

SET session_replication_role = replica;
INSERT INTO public.discount_codes (accommodation_id, name, code, discount_type, discount_value, usage_limit, is_active, applicable_pricing_template_ids, valid_from, valid_until, used_count, commission_rate) VALUES
  (:F1, '適用', 'RA', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, 10),
  (:F1, '不適用', 'RNA', 'percentage', 10, 100, true, '["d2000000-0000-0000-0000-000000000002"]', now() - interval '1 day', NULL, 0, 5),
  (:F1, '過期', 'REXP', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '10 day', now() - interval '1 day', 0, 10),
  (:F1, '停用', 'ROFF', 'percentage', 10, 100, false, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, 10),
  ('f2000000-0000-0000-0000-000000000002', '他館同碼', 'RA', 'percentage', 10, 100, true, '[]', now() - interval '1 day', NULL, 0, 20);
-- O1 已付全額＋手動折扣 2000、無碼；O2 已付訂金；O3 未付款；O4 已付但已取消；O5 已付有碼且佣金已撥付；O6 已付有碼（佣金 pending）
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, discount_amount, final_price, paid_amount, deposit_amount, order_status, payment_status, order_source, pricing_template_id, discount_code, notes) VALUES
  ('0c000000-0000-0000-0000-000000000001', :F1, 'RC1', '甲', '0900000001', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 12000, 2000, 10000, 10000, 3000, 'confirmed', 'paid', 'website', 'd1000000-0000-0000-0000-000000000001', NULL, '【額外現場加購金額】0【額外現場加購金額END】'),
  ('0c000000-0000-0000-0000-000000000002', :F1, 'RC2', '乙', '0900000002', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 0, 10000, 3000, 3000, 'confirmed', 'deposit_paid', 'website', 'd1000000-0000-0000-0000-000000000001', NULL, NULL),
  ('0c000000-0000-0000-0000-000000000003', :F1, 'RC3', '丙', '0900000003', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 0, 10000, 0, 3000, 'confirmed', 'unpaid', 'website', 'd1000000-0000-0000-0000-000000000001', NULL, NULL),
  ('0c000000-0000-0000-0000-000000000004', :F1, 'RC4', '丁', '0900000004', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 0, 10000, 10000, 3000, 'cancelled', 'paid', 'website', 'd1000000-0000-0000-0000-000000000001', 'RA', NULL),
  ('0c000000-0000-0000-0000-000000000005', :F1, 'RC5', '戊', '0900000005', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 0, 10000, 10000, 3000, 'checked_out', 'paid', 'website', 'd1000000-0000-0000-0000-000000000001', 'RA', NULL),
  ('0c000000-0000-0000-0000-000000000006', :F1, 'RC6', '己', '0900000006', CURRENT_DATE + 30, CURRENT_DATE + 31, 'b1000000-0000-0000-0000-000000000001', 4, 10000, 0, 10000, 10000, 3000, 'confirmed', 'paid', 'website', 'd1000000-0000-0000-0000-000000000001', 'RA', NULL);
INSERT INTO public.commission_records (accommodation_id, discount_code_id, order_id, order_total, discount_amount, commission_rate, commission_amount, settlement_status)
SELECT :F1, dc.id, o.id, 10000, 0, 10, 1000, CASE WHEN o.order_number = 'RC5' THEN 'paid' ELSE 'pending' END
FROM public.orders o JOIN public.discount_codes dc ON dc.accommodation_id = :F1 AND dc.code = 'RA' WHERE o.order_number IN ('RC4', 'RC5', 'RC6');
SET session_replication_role = origin;
-- 以正常寫入路徑補齊 BEFORE 觸發器會填的欄位（owlting_unique_id、cancelled_at），避免種子缺值干擾
SET LOCAL app.bypass_inventory_check = 'on';
UPDATE public.orders SET updated_at = updated_at WHERE order_number LIKE 'RC_';
SET LOCAL app.bypass_inventory_check = 'off';
INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES ('a4000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'orders', 'readonly');

\set O1 '''0c000000-0000-0000-0000-000000000001'''
\set O2 '''0c000000-0000-0000-0000-000000000002'''
\set O3 '''0c000000-0000-0000-0000-000000000003'''
\set O4 '''0c000000-0000-0000-0000-000000000004'''
\set O5 '''0c000000-0000-0000-0000-000000000005'''
\set O6 '''0c000000-0000-0000-0000-000000000006'''

-- 補記（applied）
SELECT pg_temp.chk('R1 已付全額＋手動折扣：補記適用碼 RA', 'OK add', pg_temp.ref(:HA, :O1, 'ra'));
SELECT pg_temp.chk('R1a 只寫碼，金額全不變', 'RA|12000|2000|10000|10000|3000|paid', pg_temp.money(:O1));
SELECT pg_temp.chk('R1b 佣金紀錄建立（pending，10%×實收 10000）', 'RA|10|1000|pending', pg_temp.comm(:O1));
SELECT pg_temp.chk('R1c 使用次數：手動折扣 2000＋補記碼 → 計入', '1', pg_temp.used('RA'));
SELECT pg_temp.chk('R1d 異動紀錄：舊碼、新碼、原因、操作者、data_only', 'add|(null)|RA|補記網紅業績|a2000000-0000-0000-0000-000000000002|rc@test.local|data_only|applied',
  (SELECT (details ->> 'action') || '|' || COALESCE(details ->> 'previous_discount_code', '(null)') || '|' || (details ->> 'new_discount_code') || '|' || (details ->> 'reason') || '|' || user_id || '|' || user_email || '|' || (details ->> 'settlement_handling') || '|' || (details ->> 'evaluation_status')
   FROM public.audit_logs WHERE entity_id = '0c000000-0000-0000-0000-000000000001' AND details ->> 'type' = 'referral_code_edit' ORDER BY created_at DESC LIMIT 1));
-- 替換（not_applicable）
SELECT pg_temp.chk('R2 替換成不適用碼 RNA（not_applicable 也可）', 'OK replace', pg_temp.ref(:HA, :O1, 'RNA'));
SELECT pg_temp.chk('R2a 金額全不變', 'RNA|12000|2000|10000|10000|3000|paid', pg_temp.money(:O1));
SELECT pg_temp.chk('R2b 佣金紀錄改掛新碼（5%）', 'RNA|5|500|pending', pg_temp.comm(:O1));
SELECT pg_temp.chk('R2c 使用次數：舊碼 RA 歸 0、新碼 RNA 計 1', '0|1', pg_temp.used('RA') || '|' || pg_temp.used('RNA'));
SELECT pg_temp.chk('R2d 異動紀錄舊碼→新碼', 'replace|RA|RNA|not_applicable',
  (SELECT (details ->> 'action') || '|' || (details ->> 'previous_discount_code') || '|' || (details ->> 'new_discount_code') || '|' || (details ->> 'evaluation_status')
   FROM public.audit_logs WHERE entity_id = '0c000000-0000-0000-0000-000000000001' AND details ->> 'type' = 'referral_code_edit' AND details ->> 'action' = 'replace'));
-- 無效
SELECT pg_temp.chk('R3 過期碼 → 折扣碼無效', 'ERR 折扣碼無效', pg_temp.ref(:HA, :O1, 'REXP'));
SELECT pg_temp.chk('R3a 停用碼 → 折扣碼無效', 'ERR 折扣碼無效', pg_temp.ref(:HA, :O1, 'ROFF'));
SELECT pg_temp.chk('R3b 不存在 → 折扣碼無效', 'ERR 折扣碼無效', pg_temp.ref(:HA, :O1, 'NOPE'));
SELECT pg_temp.chk('R3c 無效時資料不變', 'RNA|12000|2000|10000|10000|3000|paid', pg_temp.money(:O1));
-- 移除
SELECT pg_temp.chk('R4 移除推薦碼', 'OK remove', pg_temp.ref(:HA, :O1, NULL));
SELECT pg_temp.chk('R4a 金額全不變', '(null)|12000|2000|10000|10000|3000|paid', pg_temp.money(:O1));
SELECT pg_temp.chk('R4b 佣金紀錄刪除', '(none)', pg_temp.comm(:O1));
SELECT pg_temp.chk('R4c RNA 使用次數歸 0', '0', pg_temp.used('RNA'));
-- 已付訂金
SELECT pg_temp.chk('R5 已付訂金也可補記（not_applicable）', 'OK add', pg_temp.ref(:HA, :O2, 'RNA'));
SELECT pg_temp.chk('R5a 金額全不變', 'RNA|10000|0|10000|3000|3000|deposit_paid', pg_temp.money(:O2));
SELECT pg_temp.chk('R5b 佣金紀錄建立', 'RNA|5|500|pending', pg_temp.comm(:O2));
SELECT pg_temp.chk('R5c 折扣 0 → 使用次數不計', '0', pg_temp.used('RNA'));
-- 範圍與防護
SELECT pg_temp.chk('R6 未付款訂單 → 拒絕', 'ERR 此訂單付款狀態為 unpaid', pg_temp.ref(:HA, :O3, 'RA'));
SELECT pg_temp.chk('R7 已取消：未勾高風險 → 拒絕', 'ERR 此訂單已退款／退款處理中或已取消', pg_temp.ref(:HA, :O4, 'RNA'));
SELECT pg_temp.chk('R7a 已取消：勾高風險仍不可替換', 'ERR 已取消的訂單不可補記或替換推薦碼', pg_temp.ref(:HA, :O4, 'RNA', '補記網紅業績', true));
SELECT pg_temp.chk('R7b 已取消：可移除', 'OK remove', pg_temp.ref(:HA, :O4, NULL, '取消單移除推薦碼', true));
SELECT pg_temp.chk('R8 佣金已撥付 → 不可替換', 'ERR 此訂單的推薦碼佣金已撥付', pg_temp.ref(:HA, :O5, 'RNA'));
SELECT pg_temp.chk('R8a 佣金已撥付 → 不可移除', 'ERR 此訂單的推薦碼佣金已撥付', pg_temp.ref(:HA, :O5, NULL));
SELECT pg_temp.chk('R8b 已撥付佣金紀錄不變', 'RA|10|1000|paid', pg_temp.comm(:O5));
SELECT pg_temp.chk('R9 無訂單編輯權限 → 拒絕', 'ERR 權限不足', pg_temp.ref(:ST, :O6, 'RNA'));
SELECT pg_temp.chk('R10 版本過期 → 拒絕', 'ERR 訂單已被其他人修改', pg_temp.ref(:HA, :O6, 'RNA', '補記網紅業績', false, true));
SELECT pg_temp.chk('R11 原因空白 → 拒絕', 'ERR 請填寫修改原因', pg_temp.ref(:HA, :O6, 'RNA', ' '));
SELECT pg_temp.chk('R12 同一碼 → 不變更', 'OK none', pg_temp.ref(:HA, :O6, 'ra'));
SELECT pg_temp.chk('R13 anon 無執行權限', 'false', has_function_privilege('anon', 'public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean)'::regprocedure, 'EXECUTE')::text);

-- R14 資料庫層強制：若有任何東西在同一次 UPDATE 改到金額，整筆回滾
CREATE FUNCTION public.zz_test_tamper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.final_price := NEW.final_price + 1; RETURN NEW; END $$;
CREATE TRIGGER zz_test_tamper BEFORE UPDATE OF discount_code ON public.orders FOR EACH ROW WHEN (NEW.order_number = 'RC6') EXECUTE FUNCTION public.zz_test_tamper();
SELECT pg_temp.chk('R14 同次更新被改金額 → 拒絕', 'ERR 只補記推薦碼模式不得變更任何金額欄位', pg_temp.ref(:HA, :O6, 'RNA'));
SELECT pg_temp.chk('R14a 回滾後碼與金額都沒變', 'RA|10000|0|10000|10000|3000|paid', pg_temp.money(:O6));
DROP TRIGGER zz_test_tamper ON public.orders;
DROP FUNCTION public.zz_test_tamper();

-- R15 不經專用函式、直接改已結清訂單的碼，仍被既有守門觸發器擋下
CREATE FUNCTION pg_temp.direct(p_uid uuid, p_order uuid, p_code text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.orders SET discount_code = p_code WHERE id = p_order;
    r := 'OK';
  EXCEPTION WHEN OTHERS THEN r := 'ERR ' || SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
SELECT pg_temp.chk('R15 已結清直接 UPDATE discount_code → 拒絕', 'ERR discount changes on settled orders must go through', pg_temp.direct(:HA, :O6, 'RNA'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect || ' | 實際 ' || actual END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
