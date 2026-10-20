-- 20261101090000 身分矩陣＋流程測試（:POST = 'true' 表示已套用；交易最後 ROLLBACK）
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

-- 種子：f2 為 hotelnabe 館（sync_enabled 已在 seed_pre），補房型、房價列、訂單、行程商品、會員
INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-000000000004', 'member@test.local');
SET session_replication_role = replica;
UPDATE public.accommodation_info SET channel_manager = 'hotelnabe' WHERE id = 'f2000000-0000-0000-0000-000000000002';
INSERT INTO public.room_types (id, accommodation_id, name, capacity, base_price) VALUES ('b2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'HN房', 4, 3000);
INSERT INTO public.room_inventory_pricing (id, room_type_id, date, price, available_rooms, is_available) VALUES ('e7000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 50, 3000, 2, true),
  ('e7000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 60, 3000, 5, true), ('e7000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 61, 3000, 5, true);
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, discount_amount, final_price, paid_amount, order_status, payment_status, order_source)
VALUES ('0e000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-000000000002', 'GDA1', '測試', '0900000000', CURRENT_DATE + 60, CURRENT_DATE + 62, 'b2000000-0000-0000-0000-000000000002', 2, 6000, 0, 6000, 0, 'confirmed', 'unpaid', 'website');
INSERT INTO public.trip_products (id, name, price, stock, is_active) VALUES ('e8000000-0000-0000-0000-000000000001', '{"zh":"測試票"}', 100, 5, true);
SET session_replication_role = origin;
DELETE FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002';

\set P '(:''POST'' = ''true'')'
-- H：hotelnabe 觸發器（館員以 authenticated 身分存房價／訂單）
SELECT pg_temp.chk('H01 他館 hotel_admin（f2）更新房價列 available_rooms', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'UPDATE public.room_inventory_pricing SET available_rooms = 1 WHERE id = ''e7000000-0000-0000-0000-000000000001'''));
SELECT pg_temp.chk('H02 房價列更新後 hotelnabe 佇列有該日 1 筆', '1', (SELECT count(*)::text FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002' AND from_date = CURRENT_DATE + 50));
SELECT pg_temp.chk('H03 f2 hotel_admin 更新訂單備註', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'UPDATE public.orders SET notes = ''hn-test'' WHERE id = ''0e000000-0000-0000-0000-0000000000a1'''));
SELECT pg_temp.chk('H04 訂單更新後 hotelnabe 佇列有入住 2 晚', '2', (SELECT count(*)::text FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002' AND from_date IN (CURRENT_DATE + 60, CURRENT_DATE + 61)));
SELECT pg_temp.chk('H05 f2 hotel_admin 新增 order_rooms（觸發 fn_hotelnabe_enqueue_from_order_rooms）', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'INSERT INTO public.order_rooms (order_id, room_type_id, quantity, room_price) VALUES (''0e000000-0000-0000-0000-0000000000a1'', ''b2000000-0000-0000-0000-000000000002'', 1, 3000)'));
SELECT pg_temp.chk_gate('H06 anon 直接呼叫 _hotelnabe_enqueue_days', :P, pg_temp.as_role('anon', NULL, 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
SELECT pg_temp.chk_gate('H07 會員（authenticated）直接呼叫 _hotelnabe_enqueue_days（本批保留，列 B 類）', false, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
-- O：owlting-cm 以 service role 寫房價
SELECT pg_temp.chk('O01 service_role bulk_upsert_room_inventory_pricing(jsonb,text) owlting_rate', 'OK', pg_temp.as_role('service_role', NULL, format('SELECT public.bulk_upsert_room_inventory_pricing(%L::jsonb, %L)', json_build_array(json_build_object('room_type_id', 'b1000000-0000-0000-0000-000000000001', 'date', CURRENT_DATE + 80, 'price', 4321)), 'owlting_rate')));
SELECT pg_temp.chk('O02 房價落地 4321、來源 owlting_rate', '4321 owlting_rate', (SELECT price || ' ' || last_change_source FROM public.room_inventory_pricing WHERE room_type_id = 'b1000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE + 80 AND pricing_template_id IS NULL));
SELECT pg_temp.chk('O03 service_role bulk_upsert owlting_inbound 只改庫存', 'OK', pg_temp.as_role('service_role', NULL, format('SELECT public.bulk_upsert_room_inventory_pricing(%L::jsonb, %L)', json_build_array(json_build_object('room_type_id', 'b1000000-0000-0000-0000-000000000001', 'date', CURRENT_DATE + 80, 'available_rooms', 3)), 'owlting_inbound')));
SELECT pg_temp.chk('O04 庫存 3、價格仍 4321', '3 4321', (SELECT available_rooms || ' ' || price FROM public.room_inventory_pricing WHERE room_type_id = 'b1000000-0000-0000-0000-000000000001' AND date = CURRENT_DATE + 80 AND pricing_template_id IS NULL));
SELECT pg_temp.chk_gate('O05 anon bulk_upsert 把房價改 1 元', :P, pg_temp.as_role('anon', NULL, format('SELECT public.bulk_upsert_room_inventory_pricing(%L::jsonb, %L)', json_build_array(json_build_object('room_type_id', 'b1000000-0000-0000-0000-000000000001', 'date', CURRENT_DATE + 81, 'price', 1)), 'x')));
SELECT pg_temp.chk_gate('O06 會員 bulk_upsert 把房價改 1 元', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', format('SELECT public.bulk_upsert_room_inventory_pricing(%L::jsonb, %L)', json_build_array(json_build_object('room_type_id', 'b1000000-0000-0000-0000-000000000001', 'date', CURRENT_DATE + 81, 'price', 1)), 'x')));
SELECT pg_temp.chk('O07 單參數多載 bulk_upsert(jsonb)：anon／authenticated 可執行＝' || CASE WHEN :P THEN 'f' ELSE 't' END, CASE WHEN :P THEN 'false false true' ELSE 'true true true' END, (SELECT has_function_privilege('anon', 'public.bulk_upsert_room_inventory_pricing(jsonb)'::regprocedure, 'EXECUTE')::text || ' ' || has_function_privilege('authenticated', 'public.bulk_upsert_room_inventory_pricing(jsonb)'::regprocedure, 'EXECUTE')::text || ' ' || has_function_privilege('service_role', 'public.bulk_upsert_room_inventory_pricing(jsonb)'::regprocedure, 'EXECUTE')::text));
-- J：排程（pg_cron 以 job 擁有者 postgres 執行）與課程分潤觸發器
SELECT pg_temp.chk('J01 排程身分 postgres 執行 scan_stuck_group_buy_paid_drafts(15)', '0', (SELECT public.scan_stuck_group_buy_paid_drafts(15)::text));
SELECT pg_temp.chk('J02 排程身分 postgres 執行 cleanup_old_error_logs()', '', (SELECT public.cleanup_old_error_logs()::text || ''));
SELECT pg_temp.chk('J03 排程身分 postgres 執行 cleanup_old_monitoring_logs()', '', (SELECT public.cleanup_old_monitoring_logs()::text || ''));
SELECT pg_temp.chk('J04 super_admin 新增課程盈餘月份（DEFINER 觸發器內呼叫 recalc_course_profit_payouts）', 'OK', pg_temp.as_role('authenticated', 'a1000000-0000-0000-0000-000000000001', 'INSERT INTO public.course_profit_months (month, surplus_amount, payout_month) VALUES (date_trunc(''month'', CURRENT_DATE + 400)::date, 1000, date_trunc(''month'', CURRENT_DATE + 430)::date)'));
SELECT pg_temp.chk_gate('J05 anon scan_stuck_group_buy_paid_drafts', :P, pg_temp.as_role('anon', NULL, 'SELECT public.scan_stuck_group_buy_paid_drafts(15)'));
SELECT pg_temp.chk_gate('J06 會員 cleanup_old_error_logs', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.cleanup_old_error_logs()'));
SELECT pg_temp.chk_gate('J07 anon cleanup_old_monitoring_logs', :P, pg_temp.as_role('anon', NULL, 'SELECT public.cleanup_old_monitoring_logs()'));
SELECT pg_temp.chk_gate('J08 anon recalc_course_profit_payouts', :P, pg_temp.as_role('anon', NULL, 'SELECT public.recalc_course_profit_payouts(CURRENT_DATE)'));
-- G：前台訪客團購／行程商品（訪客→edge function→service role）
SELECT pg_temp.chk('G01 service_role consume_trip_product_stock 扣 2 張', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.consume_trip_product_stock(''[{"product_id":"e8000000-0000-0000-0000-000000000001","count":2}]''::jsonb)'));
SELECT pg_temp.chk('G02 行程商品庫存 5→3', '3', (SELECT stock::text FROM public.trip_products WHERE id = 'e8000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('G03 service_role acquire_group_buy_payment_hold（資料不完整→業務回應）', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.acquire_group_buy_payment_hold(''{}''::jsonb)'));
SELECT pg_temp.chk_gate('G04 service_role convert_group_buy_payment_draft（不存在的 draft→業務錯誤）', false, pg_temp.as_role('service_role', NULL, 'SELECT public.convert_group_buy_payment_draft(gen_random_uuid(), ''{}''::jsonb, ''{}''::jsonb, ''[]''::jsonb)'));
SELECT pg_temp.chk('G05 service_role delete_group_buy_campaign（不存在→CAMPAIGN_NOT_FOUND）', 'RAN CAMPAIGN_NOT_FOUND', pg_temp.as_role('service_role', NULL, 'SELECT public.delete_group_buy_campaign(gen_random_uuid())'));
SELECT pg_temp.chk_gate('G06 anon consume_trip_product_stock', :P, pg_temp.as_role('anon', NULL, 'SELECT public.consume_trip_product_stock(''[{"product_id":"e8000000-0000-0000-0000-000000000001","count":1}]''::jsonb)'));
SELECT pg_temp.chk_gate('G07 會員 consume_trip_product_stock', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.consume_trip_product_stock(''[{"product_id":"e8000000-0000-0000-0000-000000000001","count":1}]''::jsonb)'));
SELECT pg_temp.chk_gate('G08 anon acquire_group_buy_payment_hold', :P, pg_temp.as_role('anon', NULL, 'SELECT public.acquire_group_buy_payment_hold(''{}''::jsonb)'));
SELECT pg_temp.chk_gate('G09 anon convert_group_buy_payment_draft', :P, pg_temp.as_role('anon', NULL, 'SELECT public.convert_group_buy_payment_draft(gen_random_uuid(), ''{}''::jsonb, ''{}''::jsonb, ''[]''::jsonb)'));
SELECT pg_temp.chk_gate('G10 會員 convert_group_buy_payment_draft', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.convert_group_buy_payment_draft(gen_random_uuid(), ''{}''::jsonb, ''{}''::jsonb, ''[]''::jsonb)'));
SELECT pg_temp.chk_gate('G11 anon delete_group_buy_campaign', :P, pg_temp.as_role('anon', NULL, 'SELECT public.delete_group_buy_campaign(gen_random_uuid())'));
SELECT pg_temp.chk_gate('G12 會員 delete_group_buy_campaign', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.delete_group_buy_campaign(gen_random_uuid())'));
-- V：最優先其餘 4 支＋其他 A 類
SELECT pg_temp.chk_gate('V01 anon gbp_vault_delete', :P, pg_temp.as_role('anon', NULL, 'SELECT public.gbp_vault_delete(''x-not-exist'')'));
SELECT pg_temp.chk_gate('V02 會員 gbp_vault_delete', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.gbp_vault_delete(''x-not-exist'')'));
SELECT pg_temp.chk('V03 service_role gbp_vault_delete', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.gbp_vault_delete(''x-not-exist'')'));
SELECT pg_temp.chk_gate('V04 anon gbp_save_accommodation_oauth_client_secret', :P, pg_temp.as_role('anon', NULL, 'SELECT public.gbp_save_accommodation_oauth_client_secret(''f1000000-0000-0000-0000-000000000001'', ''s'')'));
SELECT pg_temp.chk_gate('V05 會員 gbp_save_accommodation_oauth_client_secret', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.gbp_save_accommodation_oauth_client_secret(''f1000000-0000-0000-0000-000000000001'', ''s'')'));
SELECT pg_temp.chk('V06 service_role gbp_save_accommodation_oauth_client_secret（無設定列→業務錯誤）', 'RAN GBP_SETTINGS_ROW_NOT_FOUND', pg_temp.as_role('service_role', NULL, 'SELECT public.gbp_save_accommodation_oauth_client_secret(''f1000000-0000-0000-0000-000000000001'', ''s'')'));
SELECT pg_temp.chk_gate('V07 anon import_ryoan_order_bypass', :P, pg_temp.as_role('anon', NULL, 'SELECT public.import_ryoan_order_bypass(''{}''::jsonb, ''[]''::jsonb, ''{}''::jsonb)'));
SELECT pg_temp.chk_gate('V08 會員 import_ryoan_order_bypass', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.import_ryoan_order_bypass(''{}''::jsonb, ''[]''::jsonb, ''{}''::jsonb)'));
SELECT pg_temp.chk_gate('V09 service_role import_ryoan_order_bypass', false, pg_temp.as_role('service_role', NULL, 'SELECT public.import_ryoan_order_bypass(''{}''::jsonb, ''[]''::jsonb, ''{}''::jsonb)'));
SELECT pg_temp.chk_gate('V10 anon seed_app_review_account', :P, pg_temp.as_role('anon', NULL, 'SELECT public.seed_app_review_account(''c9000000-0000-0000-0000-000000000004'', ''x@test.local'')'));
SELECT pg_temp.chk_gate('V11 會員 seed_app_review_account（替自己發 500 點）', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.seed_app_review_account(''c9000000-0000-0000-0000-000000000004'', ''x@test.local'')'));
SELECT pg_temp.chk_gate('V12 service_role seed_app_review_account', false, pg_temp.as_role('service_role', NULL, 'SELECT public.seed_app_review_account(''c9000000-0000-0000-0000-000000000004'', ''x@test.local'')'));
SELECT pg_temp.chk_gate('V13 anon increment_member_push_badge', :P, pg_temp.as_role('anon', NULL, 'SELECT public.increment_member_push_badge(''c9000000-0000-0000-0000-000000000004'', 99)'));
SELECT pg_temp.chk('V14 service_role increment_member_push_badge（send-push）', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.increment_member_push_badge(''c9000000-0000-0000-0000-000000000004'', 1)'));
SELECT pg_temp.chk_gate('V15 anon verify_accommodation_api_key', :P, pg_temp.as_role('anon', NULL, 'SELECT * FROM public.verify_accommodation_api_key(''x'')'));
SELECT pg_temp.chk('V16 service_role verify_accommodation_api_key', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT * FROM public.verify_accommodation_api_key(''x'')'));
SELECT pg_temp.chk_gate('V17 會員 verify_accommodation_ai_api_key', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT * FROM public.verify_accommodation_ai_api_key(''x'')'));
SELECT pg_temp.chk('V18 service_role verify_accommodation_ai_api_key', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT * FROM public.verify_accommodation_ai_api_key(''x'')'));
SELECT pg_temp.chk_gate('V19 anon verify_owlting_service_account', :P, pg_temp.as_role('anon', NULL, 'SELECT public.verify_owlting_service_account(''u'', ''p'')'));
SELECT pg_temp.chk('V20 service_role verify_owlting_service_account（owlting-cm）', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public.verify_owlting_service_account(''u'', ''p'')'));
-- M：A 類 18 支授權總表
SELECT pg_temp.chk('M01 A 類 18 支 anon 可執行數', CASE WHEN :P THEN '0' ELSE '18' END, (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('acquire_group_buy_payment_hold', 'bulk_upsert_room_inventory_pricing', 'cleanup_old_error_logs', 'cleanup_old_monitoring_logs', 'consume_trip_product_stock', 'convert_group_buy_payment_draft', 'delete_group_buy_campaign', 'gbp_save_accommodation_oauth_client_secret', 'gbp_vault_delete', 'import_ryoan_order_bypass', 'increment_member_push_badge', 'recalc_course_profit_payouts', 'scan_stuck_group_buy_paid_drafts', 'seed_app_review_account', 'verify_accommodation_ai_api_key', 'verify_accommodation_api_key', 'verify_owlting_service_account') AND has_function_privilege('anon', p.oid, 'EXECUTE')));
SELECT pg_temp.chk('M02 A 類 18 支 authenticated 可執行數', CASE WHEN :P THEN '0' ELSE '18' END, (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('acquire_group_buy_payment_hold', 'bulk_upsert_room_inventory_pricing', 'cleanup_old_error_logs', 'cleanup_old_monitoring_logs', 'consume_trip_product_stock', 'convert_group_buy_payment_draft', 'delete_group_buy_campaign', 'gbp_save_accommodation_oauth_client_secret', 'gbp_vault_delete', 'import_ryoan_order_bypass', 'increment_member_push_badge', 'recalc_course_profit_payouts', 'scan_stuck_group_buy_paid_drafts', 'seed_app_review_account', 'verify_accommodation_ai_api_key', 'verify_accommodation_api_key', 'verify_owlting_service_account') AND has_function_privilege('authenticated', p.oid, 'EXECUTE')));
SELECT pg_temp.chk('M03 A 類 19 支（含 hotelnabe）service_role 全可執行', '19', (SELECT count(*)::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('_hotelnabe_enqueue_days', 'acquire_group_buy_payment_hold', 'bulk_upsert_room_inventory_pricing', 'cleanup_old_error_logs', 'cleanup_old_monitoring_logs', 'consume_trip_product_stock', 'convert_group_buy_payment_draft', 'delete_group_buy_campaign', 'gbp_save_accommodation_oauth_client_secret', 'gbp_vault_delete', 'import_ryoan_order_bypass', 'increment_member_push_badge', 'recalc_course_profit_payouts', 'scan_stuck_group_buy_paid_drafts', 'seed_app_review_account', 'verify_accommodation_ai_api_key', 'verify_accommodation_api_key', 'verify_owlting_service_account') AND has_function_privilege('service_role', p.oid, 'EXECUTE')));
-- B／C：不施工，行為不變
SELECT pg_temp.chk_gate('B01 anon ensure_trip_share_slug（B 類，本批不動）', false, pg_temp.as_role('anon', NULL, 'SELECT public.ensure_trip_share_slug(gen_random_uuid())'));
SELECT pg_temp.chk('C01 anon wizard_save_room_type（原本就不可執行）', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT public.wizard_save_room_type(''f1000000-0000-0000-0000-000000000001'', NULL, ''x'', 1, 1, 1)'));
SELECT pg_temp.chk('C02 會員 wizard_save_room_type → wizard_assert_access 擋', 'DENIED 只有本館管理員', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.wizard_save_room_type(''f1000000-0000-0000-0000-000000000001'', NULL, ''x'', 1, 1, 1)'));
SELECT pg_temp.chk('C03 唯讀 staff set_pricing_template_group_members（不存在的群組；函式照常執行、未被授權擋）', 'RAN', pg_temp.as_role('authenticated', 'a4000000-0000-0000-0000-000000000004', 'SELECT public.set_pricing_template_group_members(gen_random_uuid(), ARRAY[]::uuid[])'));
SELECT pg_temp.chk('C04 anon delete_package_season（原本就不可執行）', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT public.delete_package_season(gen_random_uuid())'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || :'POST' || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
