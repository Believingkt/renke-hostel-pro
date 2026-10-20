-- 20261102090000 身分矩陣＋流程測試（:POST = 'true' 表示已套用；交易最後 ROLLBACK）
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

-- 種子：會員 c9..04（行程擁有者）、c9..05（其他會員）；f2 為 hotelnabe 館；a7＝f2 hotel_admin（館員）
INSERT INTO auth.users (id, email) VALUES ('c9000000-0000-0000-0000-000000000004', 'owner@test.local'), ('c9000000-0000-0000-0000-000000000005', 'other@test.local');
SET session_replication_role = replica;
INSERT INTO public.trips (id, title, owner_id, status, share_slug) VALUES
  ('e9000000-0000-0000-0000-000000000001', '{"zh":"擁有者草稿"}', 'c9000000-0000-0000-0000-000000000004', 'draft', NULL),
  ('e9000000-0000-0000-0000-000000000002', '{"zh":"他人已發布"}', 'c9000000-0000-0000-0000-000000000005', 'published', NULL),
  ('e9000000-0000-0000-0000-000000000003', '{"zh":"擁有者已有 slug"}', 'c9000000-0000-0000-0000-000000000004', 'draft', 'keepslug01');
UPDATE public.accommodation_info SET channel_manager = 'hotelnabe' WHERE id = 'f2000000-0000-0000-0000-000000000002';
INSERT INTO public.room_types (id, accommodation_id, name, capacity, base_price) VALUES ('b2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'HN房', 4, 3000);
INSERT INTO public.room_inventory_pricing (id, room_type_id, date, price, available_rooms, is_available) VALUES ('e7000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 50, 3000, 2, true),
  ('e7000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 60, 3000, 5, true), ('e7000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 61, 3000, 5, true);
INSERT INTO public.orders (id, accommodation_id, order_number, guest_name, guest_phone, check_in_date, check_out_date, room_type_id, guest_count, total_price, discount_amount, final_price, paid_amount, order_status, payment_status, order_source)
VALUES ('0e000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-000000000002', 'GDA1', '測試', '0900000000', CURRENT_DATE + 60, CURRENT_DATE + 62, 'b2000000-0000-0000-0000-000000000002', 2, 6000, 0, 6000, 0, 'confirmed', 'unpaid', 'website');
SET session_replication_role = origin;
DELETE FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002';

\set P '(:''POST'' = ''true'')'
-- S：ensure_trip_share_slug（先跑會被拒的身分，再驗證草稿 slug 是否仍為空）
SELECT pg_temp.chk_gate('S01 anon 對他人草稿產生 slug', :P, pg_temp.as_role('anon', NULL, 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000001'')'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S02 其他會員對他人草稿產生 slug → 42501' ELSE 'S02 其他會員對他人草稿產生 slug（套用前漏洞：成功）' END, CASE WHEN :P THEN 'DENIED 只有行程擁有者' ELSE 'OK' END, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000005', 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000001'')'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S03 草稿 slug 仍為空（未被他人公開）' ELSE 'S03 草稿 slug 已被他人產生（套用前漏洞）' END, CASE WHEN :P THEN 'null' ELSE 'set' END, (SELECT CASE WHEN share_slug IS NULL THEN 'null' ELSE 'set' END FROM public.trips WHERE id = 'e9000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S04 anon 讀不到他人草稿（0 筆）' ELSE 'S04 anon 讀得到他人草稿（1 筆，私人行程外洩）' END, 'OK', pg_temp.as_role('anon', NULL, format('DO $x$ BEGIN IF (SELECT count(*) FROM public.trips WHERE id = %L) <> %s THEN RAISE EXCEPTION %L; END IF; END $x$', 'e9000000-0000-0000-0000-000000000001', CASE WHEN :P THEN 0 ELSE 1 END, '筆數不符')));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S05 館員（f2 hotel_admin）對會員草稿 → 42501' ELSE 'S05 館員對會員草稿（套用前：成功）' END, CASE WHEN :P THEN 'DENIED 只有行程擁有者' ELSE 'OK' END, pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000003'')'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S06 service_role（auth.uid() 為 null）→ 42501' ELSE 'S06 service_role（套用前：成功）' END, CASE WHEN :P THEN 'DENIED 只有行程擁有者' ELSE 'OK' END, pg_temp.as_role('service_role', NULL, 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000003'')'));
SELECT pg_temp.chk('S07 擁有者對自己的草稿產生 slug', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000001'')'));
SELECT pg_temp.chk('S08 擁有者草稿現在有 10 碼 slug', '10', (SELECT length(share_slug)::text FROM public.trips WHERE id = 'e9000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('S09 擁有者對已有 slug 的行程 → 回傳原 slug、不變', 'keepslug01', (SELECT share_slug FROM public.trips WHERE id = 'e9000000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('S10 擁有者呼叫（已有 slug）', 'OK', pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'DO $x$ BEGIN IF public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000003'') <> ''keepslug01'' THEN RAISE EXCEPTION ''slug 變了''; END IF; END $x$'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S11 其他會員對已發布他人行程 → 42501（前端改用行程 id 連結）' ELSE 'S11 其他會員對已發布他人行程（套用前：成功）' END, CASE WHEN :P THEN 'DENIED 只有行程擁有者' ELSE 'OK' END, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.ensure_trip_share_slug(''e9000000-0000-0000-0000-000000000002'')'));
SELECT pg_temp.chk('S12 前端備援：anon 以行程 id 讀已發布行程（TripShare 頁 UUID 查詢）', 'OK', pg_temp.as_role('anon', NULL, 'DO $x$ BEGIN IF (SELECT count(*) FROM public.trips WHERE id = ''e9000000-0000-0000-0000-000000000002'') <> 1 THEN RAISE EXCEPTION ''讀不到''; END IF; END $x$'));
SELECT pg_temp.chk('S13 擁有者產生 slug 後，anon 以 slug 讀得到（分享連結有效）', 'OK', pg_temp.as_role('anon', NULL, 'DO $x$ BEGIN IF (SELECT count(*) FROM public.trips WHERE id = ''e9000000-0000-0000-0000-000000000001'' AND share_slug IS NOT NULL) <> 1 THEN RAISE EXCEPTION ''讀不到''; END IF; END $x$'));
SELECT pg_temp.chk(CASE WHEN :P THEN 'S14 擁有者對不存在的行程 → 42501' ELSE 'S14 擁有者對不存在的行程（套用前：回 null）' END, CASE WHEN :P THEN 'DENIED 只有行程擁有者' ELSE 'OK' END, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000004', 'SELECT public.ensure_trip_share_slug(gen_random_uuid())'));
-- H：hotelnabe 觸發器（館員以 authenticated 身分存房價／訂單／order_rooms）
SELECT pg_temp.chk('H01 館員（f2 hotel_admin）更新房價列', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'UPDATE public.room_inventory_pricing SET available_rooms = 1 WHERE id = ''e7000000-0000-0000-0000-000000000001'''));
SELECT pg_temp.chk('H02 房價更新後佇列有該日 1 筆', '1', (SELECT count(*)::text FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002' AND from_date = CURRENT_DATE + 50));
SELECT pg_temp.chk('H03 館員更新訂單備註', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'UPDATE public.orders SET notes = ''hn-test'' WHERE id = ''0e000000-0000-0000-0000-0000000000a1'''));
SELECT pg_temp.chk('H04 訂單更新後佇列有入住 2 晚', '2', (SELECT count(*)::text FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002' AND from_date IN (CURRENT_DATE + 60, CURRENT_DATE + 61)));
DELETE FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('H05 館員新增 order_rooms', 'OK', pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'INSERT INTO public.order_rooms (order_id, room_type_id, quantity, room_price) VALUES (''0e000000-0000-0000-0000-0000000000a1'', ''b2000000-0000-0000-0000-000000000002'', 1, 3000)'));
SELECT pg_temp.chk('H06 order_rooms 新增後佇列有入住 2 晚（fn_hotelnabe_enqueue_from_order_rooms）', '2', (SELECT count(*)::text FROM public.hotelnabe_ari_push_queue WHERE room_type_id = 'b2000000-0000-0000-0000-000000000002' AND from_date IN (CURRENT_DATE + 60, CURRENT_DATE + 61)));
SELECT pg_temp.chk_gate('H07 會員直接呼叫 _hotelnabe_enqueue_days', :P, pg_temp.as_role('authenticated', 'c9000000-0000-0000-0000-000000000005', 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
SELECT pg_temp.chk_gate('H08 館員直接呼叫 _hotelnabe_enqueue_days', :P, pg_temp.as_role('authenticated', 'a7000000-0000-0000-0000-000000000007', 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
SELECT pg_temp.chk('H09 anon 直接呼叫 _hotelnabe_enqueue_days（上一批已收回）', 'DENIED permission denied', pg_temp.as_role('anon', NULL, 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
SELECT pg_temp.chk('H10 service_role 直接呼叫 _hotelnabe_enqueue_days', 'OK', pg_temp.as_role('service_role', NULL, 'SELECT public._hotelnabe_enqueue_days(''f2000000-0000-0000-0000-000000000002'', ''b2000000-0000-0000-0000-000000000002'', CURRENT_DATE + 70, CURRENT_DATE + 71, ''manual'')'));
SELECT pg_temp.chk('H11 postgres（排程／擁有者）直接呼叫 _hotelnabe_enqueue_days', '', (SELECT public._hotelnabe_enqueue_days('f2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', CURRENT_DATE + 72, CURRENT_DATE + 73, 'manual')::text || ''));
-- M：授權
SELECT pg_temp.chk('M01 ensure_trip_share_slug anon／authenticated／service_role／sandbox 可執行', CASE WHEN :P THEN 'false true true true' ELSE 'true true true true' END, (SELECT has_function_privilege('anon', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')::text || ' ' || has_function_privilege('authenticated', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')::text || ' ' || has_function_privilege('service_role', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')::text || ' ' || has_function_privilege('sandbox_exec_dmafqwfynatdvnaeovhz', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')::text));
SELECT pg_temp.chk('M02 _hotelnabe_enqueue_days anon／authenticated／service_role／sandbox 可執行', CASE WHEN :P THEN 'false false true true' ELSE 'false true true true' END, (SELECT has_function_privilege('anon', p.oid, 'EXECUTE')::text || ' ' || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ' ' || has_function_privilege('service_role', p.oid, 'EXECUTE')::text || ' ' || has_function_privilege('sandbox_exec_dmafqwfynatdvnaeovhz', p.oid, 'EXECUTE')::text FROM pg_proc p WHERE p.proname = '_hotelnabe_enqueue_days'));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || :'POST' || ' ' || case_no || ' → ' || actual || CASE WHEN pass THEN '' ELSE ' | 預期 ' || expect END FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
