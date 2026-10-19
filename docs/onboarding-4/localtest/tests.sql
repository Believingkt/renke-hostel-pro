-- 上架精靈 2d 行為測試（整支在一個交易內、最後 ROLLBACK；依序執行）
BEGIN;
CREATE FUNCTION pg_temp.t(label text, uid text, stmt text, expect text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE res text; out text; det text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(uid, ''), true);
  IF uid IS NOT NULL THEN EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
  BEGIN
    EXECUTE stmt INTO res;
    out := 'ok:' || COALESCE(res, '');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS det = PG_EXCEPTION_DETAIL;
    out := 'err:' || SQLSTATE || ':' || SQLERRM || COALESCE('｜' || NULLIF(det, ''), '');
  END;
  EXECUTE 'RESET ROLE';
  RETURN CASE WHEN out LIKE expect THEN 'PASS  ' ELSE 'FAIL  ' END || label || ' → ' || left(out, 200);
END $$;
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set OWNER '00000000-0000-0000-0000-0000000000a1'
\set OTHER '00000000-0000-0000-0000-0000000000c1'
\set SU '00000000-0000-0000-0000-0000000000f1'
\set FLAGS 'SELECT (SELECT e->>''label'' || ''|'' || (e->>''detail'') || ''|'' || (e ? ''hq_detail'')::text || ''|'' || COALESCE(e->>''hq_detail'', '''') FROM jsonb_array_elements(public.wizard_precheck(' :A ')->''red'') e WHERE e->>''key''=''flags'')'
\set SAVE 'SELECT public.wizard_save_basic_info(' :A ', '

SELECT pg_temp.t('業主：館別開關顯示「系統設定（總部）」，不含技術名稱', :'OWNER', :'FLAGS', 'ok:系統設定（總部）|已完成|false|');
SELECT pg_temp.t('總部：館別開關附技術名稱', :'SU', :'FLAGS', 'ok:系統設定（總部）|已完成|true|新版價格頁、自動建立專案已開啟；價格同步方式 = package_original');
SELECT pg_temp.t('業主：沒有 ota_status、黃色項目 0、紅色無 OTA', :'OWNER',
  'SELECT (p ? ''ota_status'')::text || ''|'' || jsonb_array_length(p->''yellow'') || ''|'' || (SELECT count(*) FROM jsonb_array_elements(p->''red'') e WHERE e->>''key'' LIKE ''ota%'') FROM (SELECT public.wizard_precheck(' || :'A' || ') p) s', 'ok:false|0|0');
SELECT pg_temp.t('總部：ota_status 只顯示（OwlTing 已開同步、房型未對應）', :'SU',
  'SELECT public.wizard_precheck(' || :'A' || ')->''ota_status''->>''detail''', 'ok:OwlTing：已開同步（未完成對應：整棟包棟）；Hotelnabe：未串接');
SELECT pg_temp.t('OTA 未對應不影響 red_ok', :'OWNER', 'SELECT public.wizard_precheck(' || :'A' || ')->>''red_ok''', 'ok:true');

UPDATE accommodation_info_flags SET new_price_ui_enabled = false, price_sync_mode = 'room_type' WHERE accommodation_id = :A;
SELECT pg_temp.t('開關未開：業主只看到「請聯絡總部」', :'OWNER', :'FLAGS', 'ok:系統設定（總部）|系統設定尚未完成，請聯絡總部|false|');
SELECT pg_temp.t('開關未開：總部看到完整技術名稱', :'SU', :'FLAGS', 'ok:%新版價格頁（new_price_ui_enabled）未開；價格同步方式（price_sync_mode）應為 package_original，目前為 room_type');
UPDATE accommodation_info_flags SET new_price_ui_enabled = true, price_sync_mode = 'package_original' WHERE accommodation_id = :A;

SELECT pg_temp.t('存基本資料：去頭尾空白、PMS 代號不變', :'OWNER',
  :'SAVE' || '''  新名稱民宿 '', ''宜蘭縣礁溪鄉溫泉路 2 號'', '' 03-987-6543 '', ''' || repeat('好', 30) || ''')::text', 'ok:%"name": "新名稱民宿"%"phone": "03-987-6543"%"short_url_alias": "testa"%');
SELECT pg_temp.t('名稱 1 字', :'OWNER', :'SAVE' || '''甲'', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:22023:基本資料有誤｜名稱需 2～50 字');
SELECT pg_temp.t('名稱 51 字', :'OWNER', :'SAVE' || '''' || repeat('名', 51) || ''', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:22023:%名稱需 2～50 字');
SELECT pg_temp.t('地址 4 字', :'OWNER', :'SAVE' || '''測試館'', ''台北市內'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:22023:%地址需 5～200 字');
SELECT pg_temp.t('電話含英文字', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''03-ABC-6543'', ''' || repeat('好', 30) || ''')::text', 'err:22023:%電話格式不正確%');
SELECT pg_temp.t('電話只有 7 位數字', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:22023:%電話格式不正確%');
SELECT pg_temp.t('電話 16 位數字', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''0912345678901234'', ''' || repeat('好', 30) || ''')::text', 'err:22023:%電話格式不正確%');
SELECT pg_temp.t('電話分機 #123 可以', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''02-2345-6789#123'', ''' || repeat('好', 30) || ''')->>''phone''', 'ok:02-2345-6789#123');
SELECT pg_temp.t('電話 +886 國碼可以', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''+886 912 345 678'', ''' || repeat('好', 30) || ''')->>''phone''', 'ok:+886 912 345 678');
SELECT pg_temp.t('電話 (02) 括號可以', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''(02)2345-6789'', ''' || repeat('好', 30) || ''')->>''phone''', 'ok:(02)2345-6789');
SELECT pg_temp.t('介紹 29 字', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 29) || ''')::text', 'err:22023:%介紹至少 30 字（目前 29 字）');
SELECT pg_temp.t('介紹 3001 字', :'OWNER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 3001) || ''')::text', 'err:22023:%介紹最多 3000 字');
SELECT pg_temp.t('多個錯誤一次列出', :'OWNER', :'SAVE' || ''''', '''', '''', '''')::text', 'err:22023:基本資料有誤｜名稱必填；地址必填；電話必填；介紹必填');
SELECT pg_temp.t('其他館管理員 → 42501', :'OTHER', :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:42501:%');
SELECT pg_temp.t('super_admin 可以', :'SU', :'SAVE' || '''測試館A'', ''宜蘭縣礁溪鄉溫泉路 1 號'', ''03-987-6543'', ''' || repeat('好', 30) || ''')->>''name''', 'ok:測試館A');
SELECT pg_temp.t('已開賣的館 → 42501', :'SU', 'SELECT public.wizard_save_basic_info(' || :'B' || ', ''測試館B'', ''台北市信義區'', ''02-2345-6789'', ''' || repeat('好', 30) || ''')::text', 'err:42501:%');
SELECT pg_temp.t('未登入 → 42501', NULL, :'SAVE' || '''測試館'', ''宜蘭縣礁溪鄉'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:42501:%');
SELECT 'PASS  anon 不能執行、authenticated 可以' WHERE NOT has_function_privilege('anon', 'public.wizard_save_basic_info(uuid,text,text,text,text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.wizard_save_basic_info(uuid,text,text,text,text)', 'EXECUTE');

UPDATE accommodation_info SET description = '太短的介紹' WHERE id = :A;
SELECT pg_temp.t('開賣前檢查與存檔同規則：介紹太短 → basic_info 不通過', :'OWNER',
  'SELECT (SELECT (e->>''ok'') || ''|'' || (e->>''detail'') FROM jsonb_array_elements(public.wizard_precheck(' || :'A' || ')->''red'') e WHERE e->>''key''=''basic_info'')', 'ok:false|介紹至少 30 字（目前 5 字）');
SELECT pg_temp.t('紅色未過 → 不能送審', :'OWNER', 'SELECT public.wizard_submit(' || :'A' || ', true)::text', 'err:P0001:%基本資料%');
UPDATE accommodation_info SET description = repeat('好', 30), short_url_alias = NULL WHERE id = :A;
SELECT pg_temp.t('PMS 代號空白 → basic_info 不通過', :'OWNER',
  'SELECT (SELECT e->>''detail'' FROM jsonb_array_elements(public.wizard_precheck(' || :'A' || ')->''red'') e WHERE e->>''key''=''basic_info'')', 'ok:PMS 代號未設定（請聯絡總部）');
UPDATE accommodation_info SET short_url_alias = 'testa' WHERE id = :A;

SELECT pg_temp.t('送審：不勾 OTA（false）也能送審，回傳不含 ota_status', :'OWNER',
  'SELECT (public.wizard_submit(' || :'A' || ', false) ? ''ota_status'')::text', 'ok:false');
SELECT pg_temp.t('已送審 → 存基本資料 P0001', :'OWNER', :'SAVE' || '''測試館A'', ''宜蘭縣礁溪鄉溫泉路 1 號'', ''03-987-6543'', ''' || repeat('好', 30) || ''')::text', 'err:P0001:%已送審%');
UPDATE accommodation_info_flags SET auto_template_enabled = false WHERE accommodation_id = :A;
SELECT pg_temp.t('M3：開關未開時總部核准被擋', :'SU', 'UPDATE accommodation_info SET is_active = true WHERE id = ' || :'A' || ' RETURNING is_active::text', 'err:42501:%first_activation_precheck_failed%系統設定（總部）%');
UPDATE accommodation_info_flags SET auto_template_enabled = true WHERE accommodation_id = :A;
SELECT pg_temp.t('M3：OTA 未對應不擋總部核准', :'SU', 'UPDATE accommodation_info SET is_active = true WHERE id = ' || :'A' || ' RETURNING (first_activated_at IS NOT NULL)::text', 'ok:true');
ROLLBACK;
