-- 上架精靈 2b＋2c 本機權限＋流程測試（在 cycle.sh 建好的 wz 庫執行；交易內，最後 ROLLBACK）
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO authenticated;
GRANT ALL ON SEQUENCE t_result_no_seq TO authenticated;
CREATE TEMP TABLE t_ctx (k text PRIMARY KEY, v text);
GRANT ALL ON t_ctx TO authenticated;

-- 以使用者身分執行；成功保留結果並回傳 'OK <第一欄>'，失敗回傳 'ERR [SQLSTATE] 訊息'
CREATE FUNCTION pg_temp.try(p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r text;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', 'authenticated')::text END, true);
  IF p_uid IS NOT NULL THEN SET LOCAL ROLE authenticated; END IF;
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
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(p_actual, 160), p_actual LIKE p_expect || '%'); $$;
CREATE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql AS $$ SELECT v FROM t_ctx WHERE k = p_k $$;

-- 種子：T＝正式測試館（未開賣，精靈對象）、C＝停用舊館、A＝開賣中、M＝套用後新建的多房型館
SET LOCAL session_replication_role = replica;
INSERT INTO accommodation_info (id, name, is_active, short_url_alias) VALUES ('d0000000-0000-0000-0000-00000000000d', '新館M（多房型）', false, 'wz-m');
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('11111111-0000-0000-0000-000000000001', 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5', 'hotel_admin'),
  ('22222222-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'hotel_admin'),
  ('33333333-0000-0000-0000-000000000003', 'ea55e271-15f8-4e63-9c4f-69fbd2022bc5', 'staff'),
  ('44444444-0000-0000-0000-000000000004', NULL, 'super_admin'),
  ('55555555-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000000a', 'hotel_admin'),
  ('66666666-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-00000000000d', 'hotel_admin');
INSERT INTO accommodation_info_flags (accommodation_id, new_price_ui_enabled, auto_template_enabled, price_sync_mode) VALUES
  ('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', true, true, 'package_original'),
  ('d0000000-0000-0000-0000-00000000000d', true, true, 'package_original'),
  ('a0000000-0000-0000-0000-00000000000a', true, true, 'package_original');
INSERT INTO auth.users (id) SELECT DISTINCT user_id FROM user_roles WHERE user_id::text LIKE '%0000-0000-0000-00000000000_' AND user_id::text ~ '^(1111|2222|3333|4444|5555|6666)' ON CONFLICT DO NOTHING;
SET LOCAL session_replication_role = origin;
UPDATE accommodation_info SET first_activated_at = NULL WHERE id = 'd0000000-0000-0000-0000-00000000000d';

\set T '''ea55e271-15f8-4e63-9c4f-69fbd2022bc5'''
\set hT '''11111111-0000-0000-0000-000000000001'''
\set hC '''22222222-0000-0000-0000-000000000002'''
\set sT '''33333333-0000-0000-0000-000000000003'''
\set su '''44444444-0000-0000-0000-000000000004'''
\set hA '''55555555-0000-0000-0000-000000000005'''
\set hM '''66666666-0000-0000-0000-000000000006'''
\set P3 '''{"weekday":{"sale":8000,"original":9000},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":11000,"original":12000}}'''

-- ===== 單棟包棟流程（T 館 hotel_admin）=====
INSERT INTO t_ctx SELECT 'rt1', substr(pg_temp.try(:hT, $$SELECT public.wizard_save_room_type('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', NULL, '森林包棟', 8, 12000, 1)::text$$), 4);
SELECT pg_temp.chk('F01 單棟：建立房型（房間數 1）', 'OK', 'OK ' || pg_temp.ctx('rt1'));
SELECT pg_temp.chk('F02 三日型：平日售價 0 被擋', 'ERR [22023]', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, NULL, '包棟森林包棟', %L, 8, '{"weekday":{"sale":0,"original":9000},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":11000,"original":12000}}')::text$$, :T, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F03 三日型：假日原價 0 被擋', 'ERR [22023]', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, NULL, '包棟森林包棟', %L, 8, '{"weekday":{"sale":8000,"original":9000},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":11000,"original":0}}')::text$$, :T, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F04 三日型：缺旺日被擋', 'ERR [22023]', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, NULL, '包棟森林包棟', %L, 8, '{"weekday":{"sale":8000,"original":9000},"weekend":{"sale":11000,"original":12000}}')::text$$, :T, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F05 原價低於售價被擋', 'ERR [22023]', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, NULL, '包棟森林包棟', %L, 8, '{"weekday":{"sale":9500,"original":9000},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":11000,"original":12000}}')::text$$, :T, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F06 失敗時沒有建立任何方案／專案', 'OK 0', pg_temp.try(NULL, $$SELECT ((SELECT count(*) FROM accommodation_packages WHERE accommodation_id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5') + (SELECT count(*) FROM pricing_templates WHERE accommodation_id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5'))::text$$));
INSERT INTO t_ctx SELECT 'pkg1res', substr(pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, NULL, '包棟森林包棟', %L, 8, %L)::text$$, :T, pg_temp.ctx('rt1'), :P3)), 4);
INSERT INTO t_ctx SELECT 'pkg1', pg_temp.ctx('pkg1res')::jsonb ->> 'package_id';
SELECT pg_temp.chk('F07 儲存方案：自動建立專案且專案房型 = 方案主房型', 'OK true|包棟森林包棟|森林包棟', 'OK ' || (pg_temp.ctx('pkg1res')::jsonb ->> 'room_type_matches') || '|' || (pg_temp.ctx('pkg1res')::jsonb ->> 'template_name') || '|' || (pg_temp.ctx('pkg1res')::jsonb ->> 'room_type_name'));
SELECT pg_temp.chk('F08 專案價格 = 三日型原價（package_original）', 'OK 9000/10000/12000', pg_temp.try(NULL, format($$SELECT weekday_price||'/'||peak_price||'/'||weekend_price FROM pricing_templates WHERE default_package_id=%L$$, pg_temp.ctx('pkg1'))));
SELECT pg_temp.chk('F09 未建立庫存與基本資料：precheck 紅色未過', 'OK false', pg_temp.try(:hT, $$SELECT public.wizard_precheck('ea55e271-15f8-4e63-9c4f-69fbd2022bc5') ->> 'red_ok'$$));
SELECT pg_temp.chk('F10 紅色未通過不能送審', 'ERR [P0001]', pg_temp.try(:hT, $$SELECT public.wizard_submit('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', true)::text$$));
-- 庫存：先放一筆既有資料（第 3 天、價格 5555、0 間），確認不被覆蓋
INSERT INTO room_inventory_pricing (room_type_id, date, price, available_rooms, is_available)
  VALUES (pg_temp.ctx('rt1')::uuid, (now() AT TIME ZONE 'Asia/Taipei')::date + 3, 5555, 0, true);
INSERT INTO t_ctx SELECT 'inv1', substr(pg_temp.try(:hT, $$SELECT public.wizard_open_inventory('ea55e271-15f8-4e63-9c4f-69fbd2022bc5')::text$$), 4);
SELECT pg_temp.chk('F11 開庫存：預設 6 個月，既有 1 天略過', 'OK skipped=1 inserted=' || (((now() AT TIME ZONE 'Asia/Taipei')::date + interval '6 months')::date - (now() AT TIME ZONE 'Asia/Taipei')::date - 1),
  'OK skipped=' || (pg_temp.ctx('inv1')::jsonb #>> '{room_types,0,skipped}') || ' inserted=' || (pg_temp.ctx('inv1')::jsonb #>> '{room_types,0,inserted}'));
SELECT pg_temp.chk('F12 既有庫存未被覆蓋（5555 元、0 間）', 'OK 5555/0', pg_temp.try(NULL, format($$SELECT price||'/'||available_rooms FROM room_inventory_pricing WHERE room_type_id=%L AND date=(now() AT TIME ZONE 'Asia/Taipei')::date + 3$$, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F13 新庫存：間數 = 房間數 1、價格 = base_price 12000', 'OK 1/12000', pg_temp.try(NULL, format($$SELECT DISTINCT available_rooms||'/'||price FROM room_inventory_pricing WHERE room_type_id=%L AND date <> (now() AT TIME ZONE 'Asia/Taipei')::date + 3$$, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F14 再開一次庫存：全部略過、不新增', 'OK 0', pg_temp.try(:hT, $$SELECT public.wizard_open_inventory('ea55e271-15f8-4e63-9c4f-69fbd2022bc5') #>> '{room_types,0,inserted}'$$));
-- 季節價：先放 2 天既有價格
INSERT INTO package_date_prices (accommodation_id, package_id, date, sale_price, original_price)
  SELECT :T, pg_temp.ctx('pkg1')::uuid, (now() AT TIME ZONE 'Asia/Taipei')::date + d, 7000, 7500 FROM unnest(ARRAY[12, 15]) d;
INSERT INTO t_ctx SELECT 'sp', substr(pg_temp.try(:hT, format($$SELECT public.wizard_preview_season_prices(%L, (now() AT TIME ZONE 'Asia/Taipei')::date + 10, (now() AT TIME ZONE 'Asia/Taipei')::date + 19, 9900, 11000)::text$$, pg_temp.ctx('pkg1'))), 4);
SELECT pg_temp.chk('F15 季節價預覽：新增 8、覆蓋 2，列出日期與舊價', 'OK 8/2/' || ((now() AT TIME ZONE 'Asia/Taipei')::date + 12) || '/7000/7500',
  'OK ' || (pg_temp.ctx('sp')::jsonb ->> 'insert_count') || '/' || (pg_temp.ctx('sp')::jsonb ->> 'overwrite_count') || '/' || (pg_temp.ctx('sp')::jsonb #>> '{overwrites,0,date}') || '/' || round((pg_temp.ctx('sp')::jsonb #>> '{overwrites,0,old_sale}')::numeric) || '/' || round((pg_temp.ctx('sp')::jsonb #>> '{overwrites,0,old_original}')::numeric));
SELECT pg_temp.chk('F16 預覽不寫入', 'OK 2', pg_temp.try(NULL, format($$SELECT count(*)::text FROM package_date_prices WHERE package_id=%L$$, pg_temp.ctx('pkg1'))));
SELECT pg_temp.chk('F17 季節價 0 被擋', 'ERR [22023]', pg_temp.try(:hT, format($$SELECT public.wizard_apply_season_prices(%L, (now() AT TIME ZONE 'Asia/Taipei')::date + 10, (now() AT TIME ZONE 'Asia/Taipei')::date + 19, 0, 11000)::text$$, pg_temp.ctx('pkg1'))));
INSERT INTO t_ctx SELECT 'sa', substr(pg_temp.try(:hT, format($$SELECT public.wizard_apply_season_prices(%L, (now() AT TIME ZONE 'Asia/Taipei')::date + 10, (now() AT TIME ZONE 'Asia/Taipei')::date + 19, 9900, 11000)::text$$, pg_temp.ctx('pkg1'))), 4);
SELECT pg_temp.chk('F18 套用回傳筆數 = 預覽筆數', 'OK 8/2', 'OK ' || (pg_temp.ctx('sa')::jsonb ->> 'insert_count') || '/' || (pg_temp.ctx('sa')::jsonb ->> 'overwrite_count'));
SELECT pg_temp.chk('F19 實際寫入：共 10 天、全部 9900/11000', 'OK 10|9900/11000', pg_temp.try(NULL, format($$SELECT count(*)||'|'||string_agg(DISTINCT round(sale_price)||'/'||round(original_price), ',') FROM package_date_prices WHERE package_id=%L$$, pg_temp.ctx('pkg1'))));
UPDATE accommodation_info SET address = '南投縣測試路 1 號', phone = '049-0000000', description = '測試介紹：這是一段超過三十個字的民宿介紹文字，用來符合上架精靈第 2d 批的新規則。' WHERE id = :T;
SELECT pg_temp.chk('F20 資料齊全後 precheck 紅色全過', 'OK true', pg_temp.try(:hT, $$SELECT public.wizard_precheck('ea55e271-15f8-4e63-9c4f-69fbd2022bc5') ->> 'red_ok'$$));
SELECT pg_temp.chk('F21 未勾選 OTA 確認不能送審', 'ERR [22023]', pg_temp.try(:hT, $$SELECT public.wizard_submit('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', false)::text$$));
SELECT pg_temp.chk('F22 直接改 final_check 為 submitted 被擋', 'ERR [42501]', pg_temp.try(:hT, $$INSERT INTO accommodation_onboarding_steps (accommodation_id, step_key, status) VALUES ('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', 'final_check', 'submitted') RETURNING status$$));
SELECT pg_temp.chk('F23 M3：未送審時總部核准被擋', 'ERR [42501]', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' RETURNING id::text$$));
SELECT pg_temp.chk('F24 送審成功', 'OK', pg_temp.try(:hT, $$SELECT (public.wizard_submit('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', true) ->> 'red_ok')$$));
SELECT pg_temp.chk('F25 送審後精靈唯讀', 'ERR [P0001]', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, %L, '改名', %L, 8, %L)::text$$, :T, pg_temp.ctx('pkg1'), pg_temp.ctx('rt1'), :P3)));
SELECT pg_temp.chk('F26 送審後一般 PMS 仍可改房型', 'OK 1', pg_temp.try(:hT, format($$WITH u AS (UPDATE room_types SET description='一般頁面修改' WHERE id=%L RETURNING 1) SELECT count(*)::text FROM u$$, pg_temp.ctx('rt1'))));
SELECT pg_temp.chk('F27 送審後業主不能把狀態改回', 'ERR [42501]', pg_temp.try(:hT, $$UPDATE accommodation_onboarding_steps SET status='confirmed' WHERE accommodation_id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key='final_check' RETURNING status$$));
SELECT pg_temp.chk('F28 業主不能退回', 'ERR [42501]', pg_temp.try(:hT, $$SELECT public.wizard_return('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', 'x')::text$$));
SELECT pg_temp.chk('F29 退回原因必填', 'ERR [22023]', pg_temp.try(:su, $$SELECT public.wizard_return('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', '  ')::text$$));
SELECT pg_temp.chk('F30 總部退回', 'OK', pg_temp.try(:su, $$SELECT public.wizard_return('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', '照片不足，請補上')::text$$));
SELECT pg_temp.chk('F31 PMS 端看得到退回原因', 'OK returned|照片不足，請補上', pg_temp.try(:hT, $$SELECT status||'|'||return_reason FROM accommodation_onboarding_steps WHERE accommodation_id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key='final_check'$$));
SELECT pg_temp.chk('F32 退回後可再編輯', 'OK true', pg_temp.try(:hT, format($$SELECT public.wizard_save_package(%L, %L, '包棟森林包棟（新）', %L, 8, %L) ->> 'room_type_matches'$$, :T, pg_temp.ctx('pkg1'), pg_temp.ctx('rt1'), '{"weekday":{"sale":8500,"original":9500},"friday_sunday":{"sale":9000,"original":10000},"weekend":{"sale":11000,"original":12000}}')));
SELECT pg_temp.chk('F33 修改後專案平日價同步為 9500', 'OK 9500', pg_temp.try(NULL, format($$SELECT weekday_price::text FROM pricing_templates WHERE default_package_id=%L$$, pg_temp.ctx('pkg1'))));
SELECT pg_temp.chk('F34 M3：退回狀態時核准被擋', 'ERR [42501]', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' RETURNING id::text$$));
SELECT pg_temp.chk('F35 再次送審成功', 'OK true', pg_temp.try(:hT, $$SELECT public.wizard_submit('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', true) ->> 'red_ok'$$));
SELECT pg_temp.chk('F35b 退回原因已清空', 'OK submitted|-', pg_temp.try(:hT, $$SELECT status||'|'||COALESCE(return_reason,'-') FROM accommodation_onboarding_steps WHERE accommodation_id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' AND step_key='final_check'$$));
-- 前台：匯出 T 館專案供 resolveOrderPricingTemplateId 驗證
\o /tmp/wz_templates.json
SELECT json_build_object('packageId', pg_temp.ctx('pkg1'), 'accommodationId', :T, 'primaryRoomTypeId', pg_temp.ctx('rt1'),
  'templates', (SELECT json_agg(json_build_object('id', id, 'accommodation_id', accommodation_id, 'default_package_id', default_package_id, 'room_type_id', room_type_id, 'display_order', display_order, 'created_at', created_at)) FROM pricing_templates WHERE accommodation_id = :T));
\o
SELECT pg_temp.chk('F36 M3：送審且紅色全過，總部核准成功', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' RETURNING id::text$$));
SELECT pg_temp.chk('F37 核准後寫入 first_activated_at', 'OK true', pg_temp.try(NULL, $$SELECT (first_activated_at IS NOT NULL)::text FROM accommodation_info WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5'$$));
SELECT pg_temp.chk('F38 已開賣館不能用精靈', 'ERR [42501]', pg_temp.try(:hT, $$SELECT public.wizard_precheck('ea55e271-15f8-4e63-9c4f-69fbd2022bc5')::text$$));
SELECT pg_temp.chk('F39 已開賣過的館：暫停開賣', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = false WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' RETURNING id::text$$));
SELECT pg_temp.chk('F40 已開賣過的館：重新開賣不被擋', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='ea55e271-15f8-4e63-9c4f-69fbd2022bc5' RETURNING id::text$$));

-- ===== 多房型流程（新館 M）=====
INSERT INTO t_ctx SELECT 'm1', substr(pg_temp.try(:hM, $$SELECT public.wizard_save_room_type('d0000000-0000-0000-0000-00000000000d', NULL, '雙人房', 2, 3000, 3)::text$$), 4);
INSERT INTO t_ctx SELECT 'm2', substr(pg_temp.try(:hM, $$SELECT public.wizard_save_room_type('d0000000-0000-0000-0000-00000000000d', NULL, '四人房', 4, 5000, 2)::text$$), 4);
SELECT pg_temp.chk('M01 多房型：建立 2 個房型', 'OK 2', pg_temp.try(NULL, $$SELECT count(*)::text FROM room_types WHERE accommodation_id='d0000000-0000-0000-0000-00000000000d'$$));
SELECT pg_temp.chk('M02 方案一（雙人房）專案房型正確', 'OK true|雙人房', pg_temp.try(:hM, format($$SELECT (r ->> 'room_type_matches')||'|'||(r ->> 'room_type_name') FROM public.wizard_save_package('d0000000-0000-0000-0000-00000000000d', NULL, '雙人房一泊一食', %L, 2, %L) r$$, pg_temp.ctx('m1'), :P3)));
SELECT pg_temp.chk('M03 方案二（四人房）專案房型正確', 'OK true|四人房', pg_temp.try(:hM, format($$SELECT (r ->> 'room_type_matches')||'|'||(r ->> 'room_type_name') FROM public.wizard_save_package('d0000000-0000-0000-0000-00000000000d', NULL, '四人房一泊一食', %L, 4, %L) r$$, pg_temp.ctx('m2'), :P3)));
SELECT pg_temp.chk('M04a 多房型開庫存', 'OK', pg_temp.try(:hM, $$SELECT public.wizard_open_inventory('d0000000-0000-0000-0000-00000000000d')::text$$));
SELECT pg_temp.chk('M04b 兩房型間數各自 = 房間數、價格 = base_price', 'OK 2:5000,3:3000', pg_temp.try(NULL, $$SELECT string_agg(DISTINCT r.available_rooms||':'||r.price, ',') FROM room_inventory_pricing r JOIN room_types t ON t.id=r.room_type_id WHERE t.accommodation_id='d0000000-0000-0000-0000-00000000000d'$$));
UPDATE accommodation_info SET address = '台中市測試路 2 號', phone = '04-0000000', description = '多房型測試：這是一段超過三十個字的民宿介紹文字，用來符合上架精靈第 2d 批的新規則。' WHERE id = 'd0000000-0000-0000-0000-00000000000d';
INSERT INTO accommodation_owlting_config (accommodation_id, owlting_hotel_code, sync_enabled) VALUES ('d0000000-0000-0000-0000-00000000000d', 'WZOWL', true);
SELECT pg_temp.chk('M05 館別開了 OwlTing 同步但房型未對應 → 紅色', 'OK false|false', pg_temp.try(:hM, $$SELECT (p ->> 'red_ok')||'|'||(SELECT e ->> 'ok' FROM jsonb_array_elements(p -> 'red') e WHERE e ->> 'key'='ota_mapping') FROM public.wizard_precheck('d0000000-0000-0000-0000-00000000000d') p$$));
SELECT pg_temp.chk('M06 OTA 紅色時不能送審', 'ERR [P0001]', pg_temp.try(:hM, $$SELECT public.wizard_submit('d0000000-0000-0000-0000-00000000000d', true)::text$$));
UPDATE accommodation_owlting_config SET sync_enabled = false WHERE accommodation_id = 'd0000000-0000-0000-0000-00000000000d';
INSERT INTO accommodation_hotelnabe_config (accommodation_id, hotelnabe_hotel_code, sync_enabled) VALUES ('d0000000-0000-0000-0000-00000000000d', 'WZTEST', true);
SELECT pg_temp.chk('M07 Hotelnabe 已開同步列在黃色', 'OK true', pg_temp.try(:hM, $$SELECT (position('Hotelnabe：已開同步' IN public.wizard_precheck('d0000000-0000-0000-0000-00000000000d') #>> '{yellow,0,detail}') > 0)::text$$));
SELECT pg_temp.chk('M08 多房型送審成功', 'OK true', pg_temp.try(:hM, $$SELECT public.wizard_submit('d0000000-0000-0000-0000-00000000000d', true) ->> 'red_ok'$$));
SELECT pg_temp.chk('M09 多房型總部核准成功', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='d0000000-0000-0000-0000-00000000000d' RETURNING id::text$$));

-- ===== 權限 =====
INSERT INTO accommodation_info (id, name, is_active, short_url_alias) VALUES ('f0000000-0000-0000-0000-00000000000f', '新館N', false, 'wz-n');
INSERT INTO t_ctx VALUES ('npkg', NULL);
SELECT pg_temp.chk('P01 他館業主 save_room_type → 42501', 'ERR [42501]', pg_temp.try(:hC, $$SELECT public.wizard_save_room_type('f0000000-0000-0000-0000-00000000000f', NULL, 'x', 1, 1, 1)::text$$));
SELECT pg_temp.chk('P02 他館業主 save_package → 42501', 'ERR [42501]', pg_temp.try(:hC, format($$SELECT public.wizard_save_package('f0000000-0000-0000-0000-00000000000f', NULL, 'x', NULL, 1, %L)::text$$, :P3)));
SELECT pg_temp.chk('P03 他館業主 preview_season_prices → 42501', 'ERR [42501]', pg_temp.try(:hC, format($$SELECT public.wizard_preview_season_prices(%L, current_date + 1, current_date + 2, 1, 1)::text$$, pg_temp.ctx('pkg1'))));
SELECT pg_temp.chk('P04 他館業主 apply_season_prices → 42501', 'ERR [42501]', pg_temp.try(:hC, format($$SELECT public.wizard_apply_season_prices(%L, current_date + 1, current_date + 2, 1, 1)::text$$, pg_temp.ctx('pkg1'))));
SELECT pg_temp.chk('P05 他館業主 open_inventory → 42501', 'ERR [42501]', pg_temp.try(:hC, $$SELECT public.wizard_open_inventory('f0000000-0000-0000-0000-00000000000f')::text$$));
SELECT pg_temp.chk('P06 他館業主 precheck → 42501', 'ERR [42501]', pg_temp.try(:hC, $$SELECT public.wizard_precheck('f0000000-0000-0000-0000-00000000000f')::text$$));
SELECT pg_temp.chk('P07 他館業主 submit → 42501', 'ERR [42501]', pg_temp.try(:hC, $$SELECT public.wizard_submit('f0000000-0000-0000-0000-00000000000f', true)::text$$));
SELECT pg_temp.chk('P08 他館業主 return → 42501', 'ERR [42501]', pg_temp.try(:hC, $$SELECT public.wizard_return('f0000000-0000-0000-0000-00000000000f', 'x')::text$$));
SELECT pg_temp.chk('P09 本館 staff save_room_type → 42501', 'ERR [42501]', pg_temp.try(:sT, $$SELECT public.wizard_save_room_type('ea55e271-15f8-4e63-9c4f-69fbd2022bc5', NULL, 'x', 1, 1, 1)::text$$));
SELECT pg_temp.chk('P10 本館 staff precheck → 42501', 'ERR [42501]', pg_temp.try(:sT, $$SELECT public.wizard_precheck('d0000000-0000-0000-0000-00000000000d')::text$$));
SELECT pg_temp.chk('P11 已開賣館業主 save_room_type → 42501', 'ERR [42501]', pg_temp.try(:hA, $$SELECT public.wizard_save_room_type('a0000000-0000-0000-0000-00000000000a', NULL, 'x', 1, 1, 1)::text$$));
SELECT pg_temp.chk('P12 已開賣館業主 open_inventory → 42501', 'ERR [42501]', pg_temp.try(:hA, $$SELECT public.wizard_open_inventory('a0000000-0000-0000-0000-00000000000a')::text$$));
SELECT pg_temp.chk('P13 super_admin 可用（新館 N 建房型）', 'OK', pg_temp.try(:su, $$SELECT public.wizard_save_room_type('f0000000-0000-0000-0000-00000000000f', NULL, 'N房', 2, 2000, 1)::text$$));
SELECT pg_temp.chk('P14 super_admin 可跑 precheck', 'OK false', pg_temp.try(:su, $$SELECT public.wizard_precheck('f0000000-0000-0000-0000-00000000000f') ->> 'red_ok'$$));
SELECT pg_temp.chk('P15 後端系統呼叫（auth.uid() 為空）不能用精靈', 'ERR [42501]', pg_temp.try(NULL, $$SELECT public.wizard_precheck('f0000000-0000-0000-0000-00000000000f')::text$$));
SELECT pg_temp.chk('P16 authenticated 不能直接呼叫內部函式', 'ERR [42501]', pg_temp.try(:su, $$SELECT public.wizard_precheck_core('f0000000-0000-0000-0000-00000000000f')::text$$));

-- ===== M3 既有館 =====
SELECT pg_temp.chk('X01 新館 N 未送審，總部核准被擋', 'ERR [42501]', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='f0000000-0000-0000-0000-00000000000f' RETURNING id::text$$));
SELECT pg_temp.chk('X02 停用、無訂單的既有館 C：重新開賣不被擋', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='c0000000-0000-0000-0000-00000000000c' RETURNING id::text$$));
SELECT pg_temp.chk('X03 曾開賣後停用的 B：重新開賣不被擋', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='b0000000-0000-0000-0000-00000000000b' RETURNING id::text$$));
SELECT pg_temp.chk('X04 開賣中的 A：暫停開賣', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = false WHERE id='a0000000-0000-0000-0000-00000000000a' RETURNING id::text$$));
SELECT pg_temp.chk('X05 A：重新開賣', 'OK', pg_temp.try(:su, $$UPDATE accommodation_info SET is_active = true WHERE id='a0000000-0000-0000-0000-00000000000a' RETURNING id::text$$));
SELECT pg_temp.chk('X06 業主改 is_active 照舊被擋', 'ERR [42501]', pg_temp.try(:hA, $$UPDATE accommodation_info SET is_active = false WHERE id='a0000000-0000-0000-0000-00000000000a' RETURNING id::text$$));
SELECT pg_temp.chk('X07 後端系統呼叫開賣新館 N 照舊放行', 'OK', pg_temp.try(NULL, $$UPDATE accommodation_info SET is_active = true WHERE id='f0000000-0000-0000-0000-00000000000f' RETURNING id::text$$));
SELECT pg_temp.chk('X08 系統開賣後也寫入 first_activated_at', 'OK true', pg_temp.try(NULL, $$SELECT (first_activated_at IS NOT NULL)::text FROM accommodation_info WHERE id='f0000000-0000-0000-0000-00000000000f'$$));
SELECT pg_temp.chk('X09 super_admin 直接新增 is_active=true 的新館被擋', 'ERR [42501]', pg_temp.try(:su, $$INSERT INTO accommodation_info (name, is_active, short_url_alias) VALUES ('直接開賣', true, 'wz-x') RETURNING id::text$$));

SELECT no, case_no, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS result, expect, actual FROM t_result ORDER BY no;
SELECT count(*) FILTER (WHERE pass) || '/' || count(*) AS total FROM t_result;
ROLLBACK;
