-- 20261106090000 刪除房型防呆測試（migration 已套用；每案各自 SAVEPOINT，最後 ROLLBACK 不留資料）
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
CREATE FUNCTION pg_temp.chk(p_case text, p_expect text, p_actual text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO t_result (case_no, expect, actual, pass) VALUES (p_case, p_expect, left(COALESCE(p_actual, '(null)'), 220), COALESCE(p_actual, '(null)') LIKE p_expect || '%'); $$;
CREATE FUNCTION pg_temp.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'OK'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLSTATE || ' ' || SQLERRM; END $$;

-- A：清理結果
SELECT pg_temp.chk('A01 方案 9a74a709 只剩有效房型', '{aaaa0000-0000-0000-0000-000000000001}', (SELECT room_type_ids::text FROM public.accommodation_packages WHERE id = '9a74a709-f83b-4a53-a39a-efda917d4802'));
SELECT pg_temp.chk('A02 方案 9a74a709 主房型不變', 'aaaa0000-0000-0000-0000-000000000001', (SELECT primary_room_type_id::text FROM public.accommodation_packages WHERE id = '9a74a709-f83b-4a53-a39a-efda917d4802'));
SELECT pg_temp.chk('A03 四季山宿 3 筆專案不動（仍指向已刪房型）', '3', (SELECT count(*)::text FROM public.pricing_templates WHERE accommodation_id = 'a4bacadc-9b7a-4110-ac04-a1cc6248c822' AND room_type_ids = ARRAY['7f066d8a-5035-4061-8db4-4cf170deda4f']::uuid[]));
SELECT pg_temp.chk('A04 備份表只有 1 列', '1', (SELECT count(*)::text FROM public.room_type_ids_cleanup_backup_20261106));
SELECT pg_temp.chk('A05 不指定房型專案仍為空陣列', '{}', (SELECT room_type_ids::text FROM public.pricing_templates WHERE id = '7e000000-0000-0000-0000-000000000002'));

-- B1：刪除「獨棟」→ 獨棟方案只綁它 → 擋下，訊息含方案名稱
SELECT pg_temp.chk('B01 刪除只被綁定的房型被擋', 'ERR P0001 無法刪除房型「獨棟」：方案「獨棟方案」只綁定這個房型', pg_temp.try($q$DELETE FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000003'$q$));
SELECT pg_temp.chk('B02 被擋後房型仍在', '1', (SELECT count(*)::text FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('B03 被擋後照片仍在（刪房型改為先刪房型）', '1', (SELECT count(*)::text FROM public.room_photos WHERE room_type_id = 'aaaa0000-0000-0000-0000-000000000003'));

-- B2：刪除「海景雙人」→ 海景方案只剩它（清理後）→ 擋下（名稱列出多筆）
SELECT pg_temp.chk('B04 刪除會清空陣列的房型被擋（列出名稱）', 'ERR P0001 無法刪除房型「海景雙人」：方案「海景方案」只綁定這個房型', pg_temp.try($q$DELETE FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000001'$q$));

-- B3：刪除「山景四人」→ 雙房方案／雙房專案都還剩海景雙人 → 允許，自動移除並改主房型
SELECT COALESCE(max(no), 0) AS w FROM t_result \gset
SAVEPOINT s1;
SELECT pg_temp.chk('B05 刪除不會清空陣列的房型成功', 'OK', pg_temp.try($q$DELETE FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000002'$q$));
SELECT pg_temp.chk('B06 雙房方案陣列移除該房型', '{aaaa0000-0000-0000-0000-000000000001}', (SELECT room_type_ids::text FROM public.accommodation_packages WHERE id = '9a000000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('B07 雙房方案主房型改成剩下第一個', 'aaaa0000-0000-0000-0000-000000000001', (SELECT primary_room_type_id::text FROM public.accommodation_packages WHERE id = '9a000000-0000-0000-0000-000000000003'));
SELECT pg_temp.chk('B08 雙房專案陣列移除該房型', '{aaaa0000-0000-0000-0000-000000000001}', (SELECT room_type_ids::text FROM public.pricing_templates WHERE id = '7e000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('B09 雙房專案 room_type_id 改成剩下第一個', 'aaaa0000-0000-0000-0000-000000000001', (SELECT room_type_id::text FROM public.pricing_templates WHERE id = '7e000000-0000-0000-0000-000000000001'));
SELECT pg_temp.chk('B10 照片隨房型 CASCADE 刪除', '0', (SELECT count(*)::text FROM public.room_photos WHERE room_type_id = 'aaaa0000-0000-0000-0000-000000000002'));
SELECT pg_temp.chk('B11 不指定房型專案仍為空陣列', '{}', (SELECT room_type_ids::text FROM public.pricing_templates WHERE id = '7e000000-0000-0000-0000-000000000002'));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result WHERE no > :w ORDER BY no;
ROLLBACK TO SAVEPOINT s1;

-- B4：沒有被任何專案／方案綁定的房型可正常刪除
SELECT COALESCE(max(no), 0) AS w FROM t_result \gset
SAVEPOINT s2;
INSERT INTO public.room_types (id, accommodation_id, name) VALUES ('aaaa0000-0000-0000-0000-000000000009', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '未綁定房');
SELECT pg_temp.chk('B12 未綁定房型可刪', 'OK', pg_temp.try($q$DELETE FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000009'$q$));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result WHERE no > :w ORDER BY no;
ROLLBACK TO SAVEPOINT s2;

-- B5：專案 room_type_ids 為空、但 room_type_id 指向該房型 → 刪掉會變「所有房型」→ 擋
SELECT COALESCE(max(no), 0) AS w FROM t_result \gset
SAVEPOINT s3;
INSERT INTO public.room_types (id, accommodation_id, name) VALUES ('aaaa0000-0000-0000-0000-000000000008', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '舊單選房');
INSERT INTO public.pricing_templates (id, accommodation_id, template_name, room_type_id, room_type_ids) VALUES ('7e000000-0000-0000-0000-000000000008', '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', '舊單選專案', 'aaaa0000-0000-0000-0000-000000000008', '{}');
SELECT pg_temp.chk('B13 僅 room_type_id 綁定也擋', 'ERR P0001 無法刪除房型「舊單選房」：專案「舊單選專案」', pg_temp.try($q$DELETE FROM public.room_types WHERE id = 'aaaa0000-0000-0000-0000-000000000008'$q$));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result WHERE no > :w ORDER BY no;
ROLLBACK TO SAVEPOINT s3;

-- B6：整館刪除（館別列先刪 → CASCADE 房型）不被擋
SELECT COALESCE(max(no), 0) AS w FROM t_result \gset
SAVEPOINT s4;
SELECT pg_temp.chk('B14 整館刪除連帶刪房型不被擋', 'OK', pg_temp.try($q$DELETE FROM public.accommodation_info WHERE id = '11111111-0000-0000-0000-000000000099'$q$));
SELECT pg_temp.chk('B15 整館房型已刪', '0', (SELECT count(*)::text FROM public.room_types WHERE accommodation_id = '11111111-0000-0000-0000-000000000099'));
SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result WHERE no > :w ORDER BY no;
ROLLBACK TO SAVEPOINT s4;

-- B7：一般登入者不能直接呼叫觸發器函式
SELECT pg_temp.chk('B16 authenticated 無函式 EXECUTE 權限', 'false', (SELECT has_function_privilege('authenticated', 'public.room_types_detach_from_plans_before_delete()', 'EXECUTE')::text));
SELECT pg_temp.chk('B17 authenticated 無備份表權限', 'false', (SELECT has_table_privilege('authenticated', 'public.room_type_ids_cleanup_backup_20261106', 'SELECT')::text));

SELECT CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END || ' ' || case_no || ' | 預期 ' || expect || ' | 實際 ' || actual FROM t_result ORDER BY no;
ROLLBACK;
