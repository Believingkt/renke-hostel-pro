-- evaluate_discount_code 與使用次數觸發器本機測試（seed_pre.sql＋migration 之後執行；交易最後 ROLLBACK）
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 200), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
CREATE FUNCTION pg_temp.ev(p_code text, p_acc uuid, p_amt int DEFAULT 10000, p_rt uuid DEFAULT 'b1000000-0000-0000-0000-000000000001', p_ci date DEFAULT CURRENT_DATE + 10, p_tpl uuid DEFAULT 'd1000000-0000-0000-0000-000000000001') RETURNS text LANGUAGE sql AS $$
  SELECT status || '|' || COALESCE(discount_value::text, '-') || '|' || COALESCE(array_to_string(applicable_names, ','), '-') || '|' || scope_empty::text || '|' || COALESCE(message, '') || '§'
  FROM public.evaluate_discount_code(p_code, p_acc, p_amt, p_rt, p_ci, p_tpl); $$;

\set F1 '''f1000000-0000-0000-0000-000000000001'''
\set F2 '''f2000000-0000-0000-0000-000000000002'''
INSERT INTO public.discount_codes (accommodation_id, name, code, discount_type, discount_value, usage_limit, is_active, applicable_pricing_template_ids, valid_from, valid_until, min_order_amount, applicable_date_from, applicable_date_to, used_count) VALUES
  (:F1, '適用', 'KA', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, NULL, NULL, 0),
  (:F1, '停用', 'KOFF', 'percentage', 10, 100, false, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, NULL, NULL, 0),
  (:F1, '過期', 'KEXP', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '10 day', now() - interval '1 day', 0, NULL, NULL, 0),
  (:F1, '未生效', 'KFUT', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() + interval '1 day', NULL, 0, NULL, NULL, 0),
  (:F1, '次數滿', 'KFULL', 'percentage', 10, 1, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, NULL, NULL, 1),
  (:F1, '低消', 'KMIN', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 50000, NULL, NULL, 0),
  (:F1, '日期', 'KDATE', 'percentage', 10, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, CURRENT_DATE + 100, CURRENT_DATE + 110, 0),
  (:F1, '群組', 'KGRP', 'amount', 500, 100, true, '[]', now() - interval '1 day', NULL, 0, NULL, NULL, 0),
  (:F1, '同碼', 'KSAME', 'amount', 500, 100, true, '["d1000000-0000-0000-0000-000000000001"]', now() - interval '1 day', NULL, 0, NULL, NULL, 0),
  (:F2, '同碼他館', 'KSAME', 'amount', 500, 100, true, '[]', now() - interval '1 day', NULL, 0, NULL, NULL, 0);

SELECT pg_temp.chk('E1 碼不存在 → invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('NOPE', :F1));
SELECT pg_temp.chk('E2 停用 → invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('KOFF', :F1));
SELECT pg_temp.chk('E3 非本館（只在他館）→ invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('PV2KOL9', :F1));
SELECT pg_temp.chk('E4 過期 → invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('KEXP', :F1));
SELECT pg_temp.chk('E5 尚未生效 → invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('KFUT', :F1));
SELECT pg_temp.chk('E6 空字串 → invalid', 'invalid|-|-|false|折扣碼無效§', pg_temp.ev('  ', :F1));
SELECT pg_temp.chk('E7 適用專案 → applied', 'applied|10|-|false|', pg_temp.ev('KA', :F1));
SELECT pg_temp.chk('E8 小寫與空白也能比對 → applied', 'applied|10|', pg_temp.ev(' ka ', :F1));
SELECT pg_temp.chk('E9 專案不符 → not_applicable＋適用名稱', 'not_applicable|-|專案一|false|§', pg_temp.ev('KA', :F1, 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, 'd2000000-0000-0000-0000-000000000002'));
SELECT pg_temp.chk('E10 沒設定任何適用專案 → not_applicable、scope_empty', 'not_applicable|-|-|true|§', pg_temp.ev('PV2KOL2', :F1));
SELECT pg_temp.chk('E11 次數已達上限 → not_applicable', 'not_applicable|-|專案一|false|§', pg_temp.ev('KFULL', :F1));
SELECT pg_temp.chk('E12 未達最低消費 → not_applicable', 'not_applicable|-|專案一|false|§', pg_temp.ev('KMIN', :F1));
SELECT pg_temp.chk('E13 入住日不在範圍 → not_applicable', 'not_applicable|-|專案一|false|§', pg_temp.ev('KDATE', :F1));
SELECT pg_temp.chk('E14 未選方案 → not_applicable', 'not_applicable|-|專案一|false|§', pg_temp.ev('KA', :F1, 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, NULL));
INSERT INTO public.pricing_template_groups (id, accommodation_id, name) VALUES ('0b000000-0000-0000-0000-000000000001', :F1, 'KOL 群組');
INSERT INTO public.pricing_template_group_members (group_id, template_id, accommodation_id) VALUES ('0b000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000002', :F1);
INSERT INTO public.discount_code_template_groups (discount_code_id, group_id, accommodation_id) SELECT id, '0b000000-0000-0000-0000-000000000001', :F1 FROM public.discount_codes WHERE code = 'KGRP';
SELECT pg_temp.chk('E15 群組成員專案 → applied', 'applied|500|', pg_temp.ev('KGRP', :F1, 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, 'd2000000-0000-0000-0000-000000000002'));
SELECT pg_temp.chk('E16 群組外專案 → not_applicable＋群組專案名稱', 'not_applicable|-|專案二|false|§', pg_temp.ev('KGRP', :F1));
UPDATE public.accommodation_info SET discount_scope_mode = 'room_type' WHERE id = :F1;
UPDATE public.discount_codes SET applicable_room_types = '["b9999999-0000-0000-0000-000000000000"]' WHERE code = 'KA' AND accommodation_id = :F1;
SELECT pg_temp.chk('E17 房型模式、房型不符 → not_applicable', 'not_applicable|-|-|false|§', pg_temp.ev('KA', :F1));
UPDATE public.accommodation_info SET discount_scope_mode = 'pricing_template' WHERE id = :F1;
SET LOCAL ROLE anon;
SELECT (SELECT status || '|' || discount_value FROM public.evaluate_discount_code('KSAME', :F1, 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, 'd1000000-0000-0000-0000-000000000001')) AS anon_res \gset
RESET ROLE;
SELECT pg_temp.chk('E18 anon（未登入訪客）可執行', 'applied|500', :'anon_res');
SELECT pg_temp.chk('E19 validate_discount_code 行為不變（不適用仍回 false）', 'false|此折扣碼不適用於所選房價方案', (SELECT is_valid::text || '|' || message FROM public.validate_discount_code('KA', :F1, 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, 'd2000000-0000-0000-0000-000000000002')));

-- 使用次數：只啟用使用次數觸發器，略過其他建單驗證
ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.orders ENABLE TRIGGER sync_discount_used_count_trigger;
CREATE FUNCTION pg_temp.uc(p_code text, p_acc uuid) RETURNS text LANGUAGE sql AS $$ SELECT used_count::text FROM public.discount_codes WHERE code = p_code AND accommodation_id = p_acc; $$;
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, guest_count, total_price, final_price, order_status, payment_status, order_source, discount_code, discount_amount) VALUES
  ('0c000000-0000-0000-0000-000000000001', :F1, 'DK1', 'A', '0900', CURRENT_DATE + 5, CURRENT_DATE + 6, 2, 10000, 9000, 'confirmed', 'paid', 'website', 'KSAME', 1000);
SELECT pg_temp.chk('U1 折扣 > 0 的訂單 → 次數 1', '1', pg_temp.uc('KSAME', :F1));
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, guest_count, total_price, final_price, order_status, payment_status, order_source, discount_code, discount_amount) VALUES
  ('0c000000-0000-0000-0000-000000000002', :F1, 'DK2', 'B', '0900', CURRENT_DATE + 5, CURRENT_DATE + 6, 2, 10000, 10000, 'confirmed', 'paid', 'website', 'KSAME', 0);
SELECT pg_temp.chk('U2 折扣 0 的訂單不計次數 → 仍 1', '1', pg_temp.uc('KSAME', :F1));
UPDATE public.orders SET discount_amount = 500 WHERE id = '0c000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('U3 折扣由 0 改為 500 → 2', '2', pg_temp.uc('KSAME', :F1));
UPDATE public.orders SET order_status = 'cancelled' WHERE id = '0c000000-0000-0000-0000-000000000001';
SELECT pg_temp.chk('U4 取消 → 1', '1', pg_temp.uc('KSAME', :F1));
SELECT pg_temp.chk('U5 他館同碼不受影響 → 0', '0', pg_temp.uc('KSAME', :F2));
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, guest_count, total_price, final_price, order_status, payment_status, order_source, discount_code, discount_amount) VALUES
  ('0c000000-0000-0000-0000-000000000003', :F2, 'DK3', 'C', '0900', CURRENT_DATE + 5, CURRENT_DATE + 6, 2, 10000, 9500, 'confirmed', 'paid', 'website', 'KSAME', 500);
SELECT pg_temp.chk('U6 他館同碼下單 → 他館 1', '1', pg_temp.uc('KSAME', :F2));
SELECT pg_temp.chk('U7 他館下單不改本館 → 本館仍 1', '1', pg_temp.uc('KSAME', :F1));
UPDATE public.orders SET discount_code = 'KA' WHERE id = '0c000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('U8 換碼：舊碼 −1 → 0', '0', pg_temp.uc('KSAME', :F1));
SELECT pg_temp.chk('U9 換碼：新碼 +1 → 1', '1', pg_temp.uc('KA', :F1));
UPDATE public.orders SET guest_name = '改名' WHERE id = '0c000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('U10 無關欄位更新不變 → 1', '1', pg_temp.uc('KA', :F1));
DELETE FROM public.orders WHERE id = '0c000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('U11 刪除 → 0', '0', pg_temp.uc('KA', :F1));
ALTER TABLE public.orders ENABLE TRIGGER USER;

-- 建單觸發器 validate_order_before_insert（不修改，只驗證它對三種碼的現行處理）：專案一＝8人包棟 售價 10000／原價 12000
ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.orders ENABLE TRIGGER validate_order_before_insert_trigger;
CREATE FUNCTION pg_temp.ins(p_no text, p_code text) RETURNS text LANGUAGE sql AS $$
  INSERT INTO public.orders (accommodation_id, room_type_id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, guest_count, room_quantity, package_id, pricing_template_id, total_price, final_price, order_status, payment_status, order_source, discount_code, discount_amount)
  VALUES ('f1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', p_no, '測試', '0912345678', 'dk@test.local', CURRENT_DATE + 30, CURRENT_DATE + 31, 8, 1, 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 0, 0, 'pending', 'unpaid', 'website', p_code, 999)
  RETURNING COALESCE(discount_code, '(null)') || '|' || discount_amount || '|' || total_price; $$;
SELECT pg_temp.chk('T1 適用碼寫入 → 保留碼、折扣 2000（原價 12000 打 9 折與售價 10000 取低）', 'KA|2000|12000', pg_temp.ins('DKT1', 'KA'));
SELECT pg_temp.chk('T2 不適用碼寫入 → 保留碼、折扣 0、房費＝售價 10000（不用原價）', 'KGRP|0|10000', pg_temp.ins('DKT2', 'KGRP'));
SELECT pg_temp.chk('T3 無效碼直寫（現行行為；前台與驗價已先擋）→ 折扣 0', 'NOPE|0|10000', pg_temp.ins('DKT3', 'NOPE'));
ALTER TABLE public.orders ENABLE TRIGGER USER;

-- 三種身分實際呼叫的回傳範例（只輸出，不計分）
SET LOCAL ROLE anon;
SELECT 'ROLE anon | ' || c || ' | ' || row_to_json(r)::text FROM (VALUES ('KA', 'd1000000-0000-0000-0000-000000000001'::uuid), ('KA', 'd2000000-0000-0000-0000-000000000002'::uuid), ('PV2KOL2', 'd1000000-0000-0000-0000-000000000001'::uuid), ('KEXP', 'd1000000-0000-0000-0000-000000000001'::uuid), ('NOPE', 'd1000000-0000-0000-0000-000000000001'::uuid)) v(c, t), LATERAL public.evaluate_discount_code(c, 'f1000000-0000-0000-0000-000000000001', 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, t) r;
SELECT 'ROLE anon | 對照現行 validate_discount_code ' || c || ' | ' || row_to_json(r)::text FROM (VALUES ('KA', 'd2000000-0000-0000-0000-000000000002'::uuid), ('KEXP', 'd1000000-0000-0000-0000-000000000001'::uuid), ('NOPE', 'd1000000-0000-0000-0000-000000000001'::uuid)) v(c, t), LATERAL public.validate_discount_code(c, 'f1000000-0000-0000-0000-000000000001', 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, t) r;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT 'ROLE authenticated | ' || c || ' | ' || row_to_json(r)::text FROM (VALUES ('KA', 'd1000000-0000-0000-0000-000000000001'::uuid), ('KA', 'd2000000-0000-0000-0000-000000000002'::uuid), ('NOPE', 'd1000000-0000-0000-0000-000000000001'::uuid)) v(c, t), LATERAL public.evaluate_discount_code(c, 'f1000000-0000-0000-0000-000000000001', 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, t) r;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT 'ROLE service_role | ' || c || ' | ' || row_to_json(r)::text FROM (VALUES ('KA', 'd1000000-0000-0000-0000-000000000001'::uuid), ('KA', 'd2000000-0000-0000-0000-000000000002'::uuid), ('NOPE', 'd1000000-0000-0000-0000-000000000001'::uuid)) v(c, t), LATERAL public.evaluate_discount_code(c, 'f1000000-0000-0000-0000-000000000001', 10000, 'b1000000-0000-0000-0000-000000000001', CURRENT_DATE + 10, t) r;
RESET ROLE;
SELECT pg_temp.chk('E20 回傳欄位只有 6 個且不含佣金／網紅／次數', 'status,discount_type,discount_value,message,applicable_names,scope_empty', (SELECT string_agg(a, ',' ORDER BY o) FROM unnest((SELECT proargnames FROM pg_proc WHERE oid = to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)'))) WITH ORDINALITY x(a, o) WHERE o > 6));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' | ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
