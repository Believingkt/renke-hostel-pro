-- 上架引導第一批：本機 BEGIN…ROLLBACK 測試（需先套用 20261018090000、20261018090001）
-- 每個案例印出「案例｜預期｜實際｜PASS/FAIL」；全部在同一個交易內，最後 ROLLBACK
\set ON_ERROR_STOP 1
\set QUIET 1
\pset pager off
\pset tuples_only off
BEGIN;

CREATE TEMP TABLE t_result (seq serial, case_no text, expect text, actual text, pass boolean);
GRANT ALL ON t_result TO PUBLIC;
GRANT USAGE ON SEQUENCE t_result_seq_seq TO PUBLIC;

-- 以指定身分執行 SQL：p_uid = NULL 代表系統身分（無 auth.uid）；p_role 為 PostgreSQL 角色（owner＝不切換，繞過 RLS）
CREATE FUNCTION pg_temp.run_as(p_uid uuid, p_role text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
  v_res text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL AND p_role = 'service_role' THEN '{"role":"service_role"}'
         WHEN p_uid IS NULL AND p_role = 'anon' THEN '{"role":"anon"}'
         WHEN p_uid IS NULL THEN ''
         ELSE json_build_object('sub', p_uid, 'role', 'authenticated')::text END, true);
  IF p_role <> 'owner' THEN EXECUTE format('SET LOCAL ROLE %I', p_role); END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_res := 'OK rows=' || v_n;
  EXCEPTION WHEN OTHERS THEN
    v_res := 'ERR [' || SQLSTATE || '] ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_res;
END $$;

CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass)
  VALUES (p_case, p_expect, p_actual, p_actual LIKE p_expect);
$$;

-- ============================= 測試資料（系統身分建立） =============================
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'sa@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000a3', 'hotel_admin@test'),
  ('00000000-0000-0000-0000-0000000000a4', 'staff@test');

-- A＝未開賣新館（auto_template_enabled = true）；B＝開賣中舊館（無 flags）；Z＝第二個館的房型來源
INSERT INTO public.accommodation_info (id, name, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '測試新館A', false),
  ('aaaaaaaa-0000-0000-0000-000000000002', '測試舊館B', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', '複製來源館S', true);

INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000002', 'super_admin'),
  ('00000000-0000-0000-0000-0000000000a2', NULL, 'admin'),
  ('00000000-0000-0000-0000-0000000000a3', 'aaaaaaaa-0000-0000-0000-000000000001', 'hotel_admin'),
  ('00000000-0000-0000-0000-0000000000a4', 'aaaaaaaa-0000-0000-0000-000000000001', 'staff');

INSERT INTO public.accommodation_info_flags (accommodation_id, new_price_ui_enabled, price_sync_mode, auto_template_enabled)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', true, 'package_original', true);

INSERT INTO public.room_types (id, accommodation_id, name, capacity, base_price) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-雙人房', 2, 3000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-四人房', 4, 5000),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'B-雙人房', 2, 3000),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000003', 'S-雙人房', 2, 3000),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003', 'S-四人房', 4, 5000);

-- ============================= M2：is_active 只限 super_admin =============================
SELECT pg_temp.chk('M2-01 hotel_admin 把未開賣館改為開賣', 'ERR %only_super_admin_can_change_is_active%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-02 hotel_admin 改館名（不動 is_active）', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$UPDATE public.accommodation_info SET name = '測試新館A（改名）' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-03 hotel_admin 整列更新、is_active 帶相同值 false', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$UPDATE public.accommodation_info SET name = '測試新館A', is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-04 全域 admin 經 RLS 改 is_active（RLS 不允許 admin 更新 → 0 列）', 'OK rows=0',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a2', 'authenticated',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-05 全域 admin 身分直接觸發 trigger（owner 繞過 RLS，只驗 trigger）', 'ERR %only_super_admin_can_change_is_active%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a2', 'owner',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-06 hotel_admin 身分直接觸發 trigger 暫停開賣中的館', 'ERR %only_super_admin_can_change_is_active%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'owner',
    $$UPDATE public.accommodation_info SET is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002'$$));

SELECT pg_temp.chk('M2-07 super_admin 核准開賣', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-08 super_admin 暫停開賣', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated',
    $$UPDATE public.accommodation_info SET is_active = false WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M2-09 系統身分（無 auth.uid，SQL Editor／migration）改 is_active', 'OK rows=1',
  pg_temp.run_as(NULL, 'owner',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003'$$));

SELECT pg_temp.chk('M2-10 service_role（Edge Function 系統身分）改 is_active', 'OK rows=1',
  pg_temp.run_as(NULL, 'service_role',
    $$UPDATE public.accommodation_info SET is_active = true WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003'$$));

SELECT pg_temp.chk('M2-11 hotel_admin 身分新增館並帶 is_active = true（只驗 trigger）', 'ERR %only_super_admin_can_change_is_active%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'owner',
    $$INSERT INTO public.accommodation_info (name, is_active) VALUES ('偷開賣館', true)$$));

SELECT pg_temp.chk('M2-12 hotel_admin 身分新增館 is_active = false（只驗 trigger）', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'owner',
    $$INSERT INTO public.accommodation_info (name, is_active) VALUES ('草稿館', false)$$));

SELECT pg_temp.chk('M2-13 super_admin 經 RLS 新增未開賣館（前端新館流程）', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated',
    $$INSERT INTO public.accommodation_info (name, is_active) VALUES ('新館（未開賣）', false)$$));

SELECT pg_temp.chk('M2-14 結果：A 館目前仍為未開賣', 'false',
  (SELECT is_active::text FROM public.accommodation_info WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001'));

-- ============================= M3：方案自動建專案 =============================
SELECT pg_temp.chk('M3-01 hotel_admin 在開關館新增有主房型＋分日價的方案', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated', $$
    INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, original_price, primary_room_type_id, tier_prices, display_order, included_guest_count)
    VALUES ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '雙人一泊一食', 3000, 3600,
            'bbbbbbbb-0000-0000-0000-000000000001',
            '{"weekday":{"sale":3000,"original":3600},"friday_sunday":{"sale":3400,"original":4000},"weekend":{"sale":3800,"original":4500}}', 3, 2)$$));

SELECT pg_temp.chk('M3-02 自動建立 1 筆綁定專案，房型＝主房型、價格＝各日型原價', '1|雙人一泊一食|bbbbbbbb-0000-0000-0000-000000000001|{bbbbbbbb-0000-0000-0000-000000000001}|3600/t|4000/t|4500/t|3600|3',
  (SELECT count(*) || '|' || max(template_name) || '|' || max(room_type_id::text) || '|' || max(room_type_ids::text) || '|'
          || max(weekday_price) || '/' || bool_and(weekday_enabled)::text::char || '|'
          || max(peak_price) || '/' || bool_and(peak_enabled)::text::char || '|'
          || max(weekend_price) || '/' || bool_and(weekend_enabled)::text::char || '|' || max(price) || '|' || max(display_order)
   FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000001'));

SELECT pg_temp.chk('M3-03 建立沒有主房型的方案（只有平日價）', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated', $$
    INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, tier_prices, included_guest_count)
    VALUES ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '無主房型方案', 2500,
            '{"weekday":{"sale":2500,"original":2500}}', 2)$$));

SELECT pg_temp.chk('M3-04 無主房型：專案成功建立、room_type_id NULL、room_type_ids = {}、假日日型關閉', '1|NULL|{}|2500|f|f',
  (SELECT count(*) || '|' || coalesce(max(room_type_id::text), 'NULL') || '|' || max(room_type_ids::text) || '|' || max(weekday_price)
          || '|' || bool_and(peak_enabled)::text::char || '|' || bool_and(weekend_enabled)::text::char
   FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000002'));

SELECT pg_temp.chk('M3-05 補上主房型（NULL → A-四人房）', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated', $$
    UPDATE public.accommodation_packages SET primary_room_type_id = 'bbbbbbbb-0000-0000-0000-000000000002'
    WHERE id = 'cccccccc-0000-0000-0000-000000000002'$$));

SELECT pg_temp.chk('M3-06 專案房型跟著更新', 'bbbbbbbb-0000-0000-0000-000000000002|{bbbbbbbb-0000-0000-0000-000000000002}',
  (SELECT room_type_id || '|' || room_type_ids::text FROM public.pricing_templates
   WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000002'));

SELECT pg_temp.chk('M3-07 主房型改變（雙人房 → 四人房），專案房型等於舊值', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated', $$
    UPDATE public.accommodation_packages SET primary_room_type_id = 'bbbbbbbb-0000-0000-0000-000000000002'
    WHERE id = 'cccccccc-0000-0000-0000-000000000001'$$));

SELECT pg_temp.chk('M3-08 專案房型同步為四人房', 'bbbbbbbb-0000-0000-0000-000000000002|{bbbbbbbb-0000-0000-0000-000000000002}',
  (SELECT room_type_id || '|' || room_type_ids::text FROM public.pricing_templates
   WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000001'));

-- 業主手動把專案房型改成雙人房（與方案主房型不同）後，方案主房型再改：專案不被覆蓋
UPDATE public.pricing_templates SET room_type_id = 'bbbbbbbb-0000-0000-0000-000000000001',
       room_type_ids = '{bbbbbbbb-0000-0000-0000-000000000001}'
WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000001';
UPDATE public.accommodation_packages SET primary_room_type_id = NULL WHERE id = 'cccccccc-0000-0000-0000-000000000001';
SELECT pg_temp.chk('M3-09 專案房型已被手動改過（≠ 舊主房型、≠ NULL）→ 不覆蓋', 'bbbbbbbb-0000-0000-0000-000000000001|{bbbbbbbb-0000-0000-0000-000000000001}',
  (SELECT room_type_id || '|' || room_type_ids::text FROM public.pricing_templates
   WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000001'));


UPDATE public.accommodation_packages SET primary_room_type_id = NULL WHERE id = 'cccccccc-0000-0000-0000-000000000002';
SELECT pg_temp.chk('M3-10 主房型改回 NULL：專案房型為舊值時寫 {}（不寫 NULL）', 'NULL|{}',
  (SELECT coalesce(room_type_id::text, 'NULL') || '|' || room_type_ids::text FROM public.pricing_templates
   WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000002'));

INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, original_price, included_guest_count)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', '舊格式方案', 3000, 3500, 2);
SELECT pg_temp.chk('M3-11 沒有 tier_prices 的方案：三種日型都用原價且開啟', '3500|3500|3500|t|t|t',
  (SELECT weekday_price || '|' || peak_price || '|' || weekend_price || '|' || weekday_enabled::text::char || '|'
          || peak_enabled::text::char || '|' || weekend_enabled::text::char
   FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000003'));

INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, primary_room_type_id, included_guest_count)
VALUES ('cccccccc-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', '舊館方案', 3000, 'bbbbbbbb-0000-0000-0000-000000000003', 2);
SELECT pg_temp.chk('M3-12 未開開關的館新增方案：不建專案', '0',
  (SELECT count(*)::text FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000009'));

INSERT INTO public.pricing_templates (id, accommodation_id, template_name, room_type_id, room_type_ids, default_package_id)
VALUES ('dddddddd-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', '舊館手動專案',
        'bbbbbbbb-0000-0000-0000-000000000003', '{bbbbbbbb-0000-0000-0000-000000000003}', 'cccccccc-0000-0000-0000-000000000009');
UPDATE public.accommodation_packages SET primary_room_type_id = NULL WHERE id = 'cccccccc-0000-0000-0000-000000000009';
SELECT pg_temp.chk('M3-13 未開開關的館改主房型：既有手動專案不受影響', 'bbbbbbbb-0000-0000-0000-000000000003|{bbbbbbbb-0000-0000-0000-000000000003}',
  (SELECT room_type_id || '|' || room_type_ids::text FROM public.pricing_templates WHERE id = 'dddddddd-0000-0000-0000-000000000009'));

SELECT pg_temp.chk('M3-14 一對一：開關館每個方案剛好 1 筆綁定專案', '3|3',
  (SELECT count(DISTINCT p.id) || '|' || count(t.id) FROM public.accommodation_packages p
   LEFT JOIN public.pricing_templates t ON t.default_package_id = p.id
   WHERE p.accommodation_id = 'aaaaaaaa-0000-0000-0000-000000000001'));

-- 刪除（新規則，只限開關館）：方案有訂單（package_id）或綁定專案被訂單／order_rooms／奧丁丁群組引用 → 拒絕；都沒有 → 連同專案刪除
INSERT INTO public.accommodation_packages (id, accommodation_id, name, sale_price, included_guest_count) VALUES
  ('cccccccc-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', '有訂單的方案', 3000, 2),
  ('cccccccc-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', '沒有任何引用的方案', 3000, 2);

INSERT INTO public.owlting_room_type_groups (id, accommodation_id, canonical_room_type_id, canonical_name)
VALUES ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '雙人房');
INSERT INTO public.owlting_room_type_group_members (group_id, room_type_id, rate_plan_template_id, rate_plan_name)
SELECT 'eeeeeeee-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', id, '一泊一食'
FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000001';

CREATE TEMP TABLE t_tpl AS
SELECT default_package_id AS pkg, id AS tpl FROM public.pricing_templates
WHERE default_package_id IN ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002',
                             'cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000004',
                             'cccccccc-0000-0000-0000-000000000005');

-- 測試訂單：未開賣館會被 validate_order_insert 擋，以既有 import 用的 bypass 旗標建立
SELECT set_config('app.bypass_inventory_check', 'on', true);
INSERT INTO public.orders (id, accommodation_id, order_number, check_in_date, check_out_date, guest_name, guest_phone,
                           total_price, final_price, order_source, package_id, pricing_template_id) VALUES
  ('ffffffff-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-ONB1-1', '2026-12-01', '2026-12-02',
   '刪除測試1', '0911000001', 3000, 3000, 'manual', 'cccccccc-0000-0000-0000-000000000004', NULL),
  ('ffffffff-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-ONB1-2', '2026-12-03', '2026-12-04',
   '刪除測試2', '0911000002', 3000, 3000, 'manual', NULL,
   (SELECT tpl FROM t_tpl WHERE pkg = 'cccccccc-0000-0000-0000-000000000002')),
  ('ffffffff-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'T-ONB1-3', '2026-12-05', '2026-12-06',
   '刪除測試3', '0911000003', 3000, 3000, 'manual', NULL, NULL);
INSERT INTO public.order_rooms (order_id, room_type_id, template_id)
SELECT 'ffffffff-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001', tpl
FROM t_tpl WHERE pkg = 'cccccccc-0000-0000-0000-000000000003';
SELECT set_config('app.bypass_inventory_check', '', true);

SELECT pg_temp.chk('M3-15 方案有訂單（orders.package_id）→ 拒絕刪除（23503）', 'ERR [23503] 此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000004'$$));
SELECT pg_temp.chk('M3-15b 被擋後：方案、專案、訂單 package_id 都還在', '1|1|cccccccc-0000-0000-0000-000000000004',
  (SELECT (SELECT count(*) FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000004') || '|'
       || (SELECT count(*) FROM public.pricing_templates WHERE default_package_id = 'cccccccc-0000-0000-0000-000000000004') || '|'
       || (SELECT package_id::text FROM public.orders WHERE id = 'ffffffff-0000-0000-0000-000000000001')));

SELECT pg_temp.chk('M3-16 綁定專案被訂單 pricing_template_id 引用 → 拒絕刪除', 'ERR [23503] 此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000002'$$));

SELECT pg_temp.chk('M3-17 綁定專案被 order_rooms.template_id 引用 → 拒絕刪除', 'ERR [23503] 此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000003'$$));

SELECT pg_temp.chk('M3-18 綁定專案被奧丁丁群組引用 → 拒絕刪除', 'ERR [23503] 此方案已有訂單或已用於 OTA 對應，無法刪除，請改為停用',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000001'$$));
SELECT pg_temp.chk('M3-18b 被擋的方案 1～4 與其專案全部還在', '4|4',
  (SELECT (SELECT count(*) FROM public.accommodation_packages WHERE id IN ('cccccccc-0000-0000-0000-000000000001',
            'cccccccc-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000004')) || '|'
       || (SELECT count(*) FROM public.pricing_templates t JOIN t_tpl ON t_tpl.tpl = t.id
           WHERE t_tpl.pkg <> 'cccccccc-0000-0000-0000-000000000005')));

SELECT pg_temp.chk('M3-19 沒有任何引用的方案 → 可刪除', 'OK rows=1',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000005'$$));
SELECT pg_temp.chk('M3-19b 方案與綁定專案一起刪除', '0|0',
  (SELECT (SELECT count(*) FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000005') || '|'
       || (SELECT count(*) FROM public.pricing_templates t JOIN t_tpl ON t_tpl.tpl = t.id
           WHERE t_tpl.pkg = 'cccccccc-0000-0000-0000-000000000005')));

-- 沒開開關的館（B）：方案 9 有訂單、也有手動綁定專案 → 維持原本行為（可刪，FK 清空 package_id、專案解除綁定）
SELECT set_config('app.bypass_inventory_check', 'on', true);
INSERT INTO public.orders (id, accommodation_id, order_number, check_in_date, check_out_date, guest_name, guest_phone,
                           total_price, final_price, order_source, package_id)
VALUES ('ffffffff-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000002', 'T-ONB1-9', '2026-12-07', '2026-12-08',
        '刪除測試9', '0911000009', 3000, 3000, 'manual', 'cccccccc-0000-0000-0000-000000000009');
SELECT set_config('app.bypass_inventory_check', '', true);
SELECT pg_temp.chk('M3-19c 沒開開關的館：有訂單的方案照樣可刪（原本行為）', 'OK rows=1',
  pg_temp.run_as(NULL, 'owner',
    $$DELETE FROM public.accommodation_packages WHERE id = 'cccccccc-0000-0000-0000-000000000009'$$));
SELECT pg_temp.chk('M3-19d 沒開開關的館：訂單 package_id 清成 NULL、手動專案保留並解除綁定（原本 FK 行為）', 'NULL|1|NULL',
  (SELECT coalesce((SELECT package_id::text FROM public.orders WHERE id = 'ffffffff-0000-0000-0000-000000000009'), 'NULL') || '|'
       || (SELECT count(*) FROM public.pricing_templates WHERE id = 'dddddddd-0000-0000-0000-000000000009') || '|'
       || coalesce((SELECT default_package_id::text FROM public.pricing_templates WHERE id = 'dddddddd-0000-0000-0000-000000000009'), 'NULL')));

SELECT pg_temp.chk('M3-20 一般登入者不能直接呼叫 trigger 函式', 'ERR %',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'authenticated',
    $$SELECT public.packages_auto_template_on_insert()$$));

-- ============================= 複製民宿（模擬前端：先複製房型取得對應表，再複製專案） =============================
INSERT INTO public.pricing_templates (id, accommodation_id, template_name, room_type_id, room_type_ids, default_package_id)
VALUES
  ('dddddddd-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000003', '來源專案1',
   'bbbbbbbb-0000-0000-0000-000000000004', '{bbbbbbbb-0000-0000-0000-000000000004,bbbbbbbb-0000-0000-0000-000000000005}', NULL),
  ('dddddddd-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000003', '來源專案2（指到別館房型）',
   'bbbbbbbb-0000-0000-0000-000000000003', '{bbbbbbbb-0000-0000-0000-000000000003,bbbbbbbb-0000-0000-0000-000000000005}', NULL);
INSERT INTO public.accommodation_info (id, name, is_active) VALUES ('aaaaaaaa-0000-0000-0000-0000000000c9', '複製館', false);

SELECT pg_temp.chk('C-01 舊流程：房型帶原 numeric_code 複製 → 全域唯一衝突（舊版複製房型一律失敗）', 'ERR %numeric_code%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated', $$
    INSERT INTO public.room_types (accommodation_id, name, capacity, base_price, numeric_code)
    SELECT 'aaaaaaaa-0000-0000-0000-0000000000c9', name, capacity, base_price, numeric_code
    FROM public.room_types WHERE accommodation_id = 'aaaaaaaa-0000-0000-0000-000000000003'$$));

CREATE TEMP TABLE t_map (old_id uuid, new_id uuid);
INSERT INTO t_map
SELECT s.id, gen_random_uuid() FROM public.room_types s WHERE s.accommodation_id = 'aaaaaaaa-0000-0000-0000-000000000003';
GRANT SELECT ON t_map TO PUBLIC;

SELECT pg_temp.chk('C-02 新流程：房型不帶 numeric_code 複製', 'OK rows=2',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated', $$
    INSERT INTO public.room_types (id, accommodation_id, name, capacity, base_price)
    SELECT m.new_id, 'aaaaaaaa-0000-0000-0000-0000000000c9', s.name, s.capacity, s.base_price
    FROM public.room_types s JOIN t_map m ON m.old_id = s.id$$));

SELECT pg_temp.chk('C-03 新流程：專案不帶 numeric_code／default_package_id，房型換成對應、無法對應清空', 'OK rows=2',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a1', 'authenticated', $$
    INSERT INTO public.pricing_templates (accommodation_id, template_name, default_package_id, room_type_id, room_type_ids)
    SELECT 'aaaaaaaa-0000-0000-0000-0000000000c9', t.template_name, NULL,
           (SELECT m.new_id FROM t_map m WHERE m.old_id = t.room_type_id),
           COALESCE((SELECT array_agg(m.new_id ORDER BY m.new_id) FROM unnest(t.room_type_ids) r JOIN t_map m ON m.old_id = r), '{}')
    FROM public.pricing_templates t WHERE t.accommodation_id = 'aaaaaaaa-0000-0000-0000-000000000003'$$));

SELECT pg_temp.chk('C-04 複製後新館專案的房型全部屬於新館', '2|0|0',
  (SELECT count(*) || '|'
          || count(*) FILTER (WHERE t.room_type_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM public.room_types r WHERE r.id = t.room_type_id AND r.accommodation_id = t.accommodation_id)) || '|'
          || count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM unnest(t.room_type_ids) x WHERE NOT EXISTS (
                 SELECT 1 FROM public.room_types r WHERE r.id = x AND r.accommodation_id = t.accommodation_id)))
   FROM public.pricing_templates t WHERE t.accommodation_id = 'aaaaaaaa-0000-0000-0000-0000000000c9'));

SELECT pg_temp.chk('C-05 指到別館房型的專案：room_type_id 清成 NULL，room_type_ids 只留可對應的', 'NULL|1',
  (SELECT coalesce(room_type_id::text, 'NULL') || '|' || cardinality(room_type_ids)
   FROM public.pricing_templates WHERE accommodation_id = 'aaaaaaaa-0000-0000-0000-0000000000c9'
     AND template_name = '來源專案2（指到別館房型）'));

SELECT pg_temp.chk('C-06 複製館專案沒有任何 default_package_id', '0',
  (SELECT count(*)::text FROM public.pricing_templates
   WHERE accommodation_id = 'aaaaaaaa-0000-0000-0000-0000000000c9' AND default_package_id IS NOT NULL));

-- ============================= 現況（M1 不施工）：validate_order_insert 既有開賣閘門 =============================
SELECT pg_temp.chk('O-01 未開賣館：官網匿名 website 單（只驗 trigger）', 'ERR %此民宿不存在或已停用%',
  pg_temp.run_as(NULL, 'owner', $$INSERT INTO public.orders (accommodation_id, order_number, check_in_date, check_out_date,
    guest_name, guest_phone, total_price, final_price, order_source) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '',
    '2027-01-01', '2027-01-02', '現況測試1', '0900000010', 3000, 3000, 'website')$$));
SELECT pg_temp.chk('O-02 未開賣館：後台人員 manual 單', 'ERR %此民宿不存在或已停用%',
  pg_temp.run_as('00000000-0000-0000-0000-0000000000a3', 'owner', $$INSERT INTO public.orders (accommodation_id, order_number,
    check_in_date, check_out_date, guest_name, guest_phone, total_price, final_price, order_source)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '', '2027-01-02', '2027-01-03', '現況測試2', '0900000020', 3000, 3000, 'manual')$$));
SELECT pg_temp.chk('O-03 未開賣館：系統身分 owlting 單（現況同樣被擋，OTA 例外列後續待辦）', 'ERR %此民宿不存在或已停用%',
  pg_temp.run_as(NULL, 'service_role', $$INSERT INTO public.orders (accommodation_id, order_number, check_in_date, check_out_date,
    guest_name, guest_phone, total_price, final_price, order_source) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '',
    '2027-01-03', '2027-01-04', '現況測試3', '0900000030', 3000, 3000, 'owlting')$$));
SELECT pg_temp.chk('O-04 accommodation_id 為 NULL（現況被擋）', 'ERR %此民宿不存在或已停用%',
  pg_temp.run_as(NULL, 'service_role', $$INSERT INTO public.orders (accommodation_id, order_number, check_in_date, check_out_date,
    guest_name, guest_phone, total_price, final_price, order_source) VALUES (NULL, '',
    '2026-12-01', '2026-12-02', '測試', '0912345678', 3000, 3000, 'website')$$));

-- ============================= 結果 =============================
SELECT case_no AS "案例", expect AS "預期", actual AS "實際", CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS "結果"
FROM t_result ORDER BY seq;
SELECT count(*) FILTER (WHERE pass) AS pass, count(*) FILTER (WHERE NOT pass) AS fail, count(*) AS total FROM t_result;

ROLLBACK;
