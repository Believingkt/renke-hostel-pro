-- 價格頁整合第 1 批本機測試（seed_pre.sql → migration 之後執行；整段交易最後 ROLLBACK）
\set ON_ERROR_STOP 1
BEGIN;
CREATE TEMP TABLE t_result (no serial, case_no text, expect text, actual text, pass boolean);
CREATE FUNCTION pg_temp.try(p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text; r text;
BEGIN
  PERFORM set_config('request.jwt.claims', CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', 'authenticated')::text END, true);
  IF p_uid IS NOT NULL THEN SET LOCAL ROLE authenticated; ELSE SET LOCAL ROLE anon; END IF;
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
CREATE FUNCTION pg_temp.su(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN 'OK ' || COALESCE(v, '');
EXCEPTION WHEN OTHERS THEN RETURN 'ERR [' || SQLSTATE || '] ' || SQLERRM;
END $$;
CREATE FUNCTION pg_temp.mon(n int) RETURNS date LANGUAGE sql AS $$
  SELECT (CURRENT_DATE + 14 + ((8 - extract(isodow FROM CURRENT_DATE + 14)::int) % 7)) + n $$;
CREATE FUNCTION pg_temp.row(p_pkg uuid, n int) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE((SELECT source || '|' || COALESCE(applied_tier, '-') || '|' || sale_price::int || '|' || COALESCE(original_price::int::text, 'null')
                   FROM public.package_date_prices WHERE package_id = p_pkg AND date = pg_temp.mon(n)), 'none') $$;
CREATE FUNCTION pg_temp.ids(p_code uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(t.template_name, ',' ORDER BY u.o), '')
  FROM public.discount_codes dc, jsonb_array_elements_text(dc.applicable_pricing_template_ids) WITH ORDINALITY u(v, o)
  JOIN public.pricing_templates t ON t.id::text = u.v
  WHERE dc.id = p_code $$;

\set SUPER '''a1000000-0000-0000-0000-000000000001'''
\set HA '''a2000000-0000-0000-0000-000000000002'''
\set STE '''a3000000-0000-0000-0000-000000000003'''
\set STR '''a4000000-0000-0000-0000-000000000004'''
\set ADM '''a5000000-0000-0000-0000-000000000005'''
\set ADMB '''a6000000-0000-0000-0000-000000000006'''
\set OTH '''a7000000-0000-0000-0000-000000000007'''
\set HAOFF '''a8000000-0000-0000-0000-000000000008'''
\set P1 '''c1000000-0000-0000-0000-000000000001'''
\set P2 '''c2000000-0000-0000-0000-000000000002'''
\set YX '''f1000000-0000-0000-0000-000000000001'''

SELECT format($f$SELECT (public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, '寒假', %L, %L,
  '{"weekday":{"sale":20000,"original":24000},"friday_sunday":{"sale":21000,"original":25000},"weekend":{"sale":22000,"original":26000}}'))::text$f$,
  pg_temp.mon(0), pg_temp.mon(6)) AS sql_season \gset
SELECT format($f$SELECT (public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, '春假', %L, %L,
  '{"weekday":{"sale":20000,"original":24000},"friday_sunday":{"sale":21000,"original":25000},"weekend":{"sale":22000,"original":26000}}'))::text$f$,
  pg_temp.mon(30), pg_temp.mon(31)) AS sql_season_b \gset

-- ===== A. 既有資料 =====
SELECT pg_temp.chk('A01 既有單日價套用後是 manual', 'manual|-|9000|12000', pg_temp.row(:P1, 2));

-- ===== P. 權限 =====
SELECT pg_temp.chk('P01 anon 不能呼叫', 'ERR [42501]', pg_temp.try(NULL, :'sql_season'));
SELECT pg_temp.chk('P02 本館 staff 房價唯讀 → 拒絕', 'ERR [42501]', pg_temp.try(:STR, :'sql_season'));
SELECT pg_temp.chk('P03 總部 admin（不綁館）→ 拒絕', 'ERR [42501]', pg_temp.try(:ADM, :'sql_season'));
SELECT pg_temp.chk('P04 總部 admin（綁本館）→ 拒絕', 'ERR [42501]', pg_temp.try(:ADMB, :'sql_season'));
SELECT pg_temp.chk('P05 他館 hotel_admin → 拒絕', 'ERR [42501]', pg_temp.try(:OTH, :'sql_season'));
SELECT pg_temp.chk('P06 未開新版的館（本館 hotel_admin）→ 拒絕', 'ERR [42501] 此館尚未啟用新價格頁', pg_temp.try(:HAOFF, format($f$SELECT (public.save_package_season('c3000000-0000-0000-0000-000000000003', NULL, 'x', %L, %L, '{"weekday":{"sale":9000,"original":10000}}'))::text$f$, pg_temp.mon(0), pg_temp.mon(1))));
SELECT pg_temp.chk('P07 總部 admin 不能設日型例外', 'ERR [42501]', pg_temp.try(:ADM, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], 'weekend')::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(1))));
SELECT pg_temp.chk('P08 總部 admin 不能重新展開', 'ERR [42501]', pg_temp.try(:ADM, format($f$SELECT public.rebuild_package_date_prices(%L, %L, %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(0), pg_temp.mon(6))));
SELECT pg_temp.chk('P09 新表不能直接寫入（hotel_admin）', 'ERR [42501]', pg_temp.try(:HA, $s$INSERT INTO public.package_seasons (accommodation_id, package_id, name, date_from, date_to, tier_prices) VALUES ('f1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','x',CURRENT_DATE,CURRENT_DATE,'{}') RETURNING id::text$s$));
SELECT pg_temp.chk('P10 本館 staff 房價可編輯 → 可存（另一區段）', 'OK {', pg_temp.try(:STE, :'sql_season_b'));
SELECT pg_temp.chk('P11 super_admin 可刪除剛才的區段', 'OK {', pg_temp.try(:SUPER, (SELECT format('SELECT public.delete_package_season(%L)::text', id) FROM public.package_seasons WHERE name = '春假')));
SELECT pg_temp.chk('P12 hotel_admin 可讀季節區段', 'OK 0', pg_temp.try(:HA, 'SELECT count(*)::text FROM public.package_seasons'));
SELECT pg_temp.chk('P13 他館 hotel_admin 讀不到本館季節區段', 'OK 0', pg_temp.try(:OTH, 'SELECT count(*)::text FROM public.package_seasons'));

-- ===== V. 季節價驗證 =====
SELECT pg_temp.chk('V01 日型和方案不同（少假日）→ 拒絕', 'ERR [22023] 季節價的日型必須與方案相同', pg_temp.try(:HA, format($f$SELECT public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, 'x', %L, %L, '{"weekday":{"sale":1,"original":2},"friday_sunday":{"sale":1,"original":2}}')::text$f$, pg_temp.mon(0), pg_temp.mon(1))));
SELECT pg_temp.chk('V02 原價沒填 → 拒絕', 'ERR [22023] 售價與原價都必須', pg_temp.try(:HA, format($f$SELECT public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, 'x', %L, %L, '{"weekday":{"sale":1},"friday_sunday":{"sale":1,"original":2},"weekend":{"sale":1,"original":2}}')::text$f$, pg_temp.mon(0), pg_temp.mon(1))));
SELECT pg_temp.chk('V03 原價低於售價 → 拒絕', 'ERR [22023] 原價不得低於售價', pg_temp.try(:HA, format($f$SELECT public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, 'x', %L, %L, '{"weekday":{"sale":5,"original":2},"friday_sunday":{"sale":1,"original":2},"weekend":{"sale":1,"original":2}}')::text$f$, pg_temp.mon(0), pg_temp.mon(1))));
SELECT pg_temp.chk('V04 區段全部在過去 → 拒絕', 'ERR [22023] 區段已全部過去', pg_temp.try(:HA, $f$SELECT public.save_package_season('c1000000-0000-0000-0000-000000000001', NULL, 'x', CURRENT_DATE - 10, CURRENT_DATE - 5, '{"weekday":{"sale":1,"original":2},"friday_sunday":{"sale":1,"original":2},"weekend":{"sale":1,"original":2}}')::text$f$));

-- ===== E. 展開寫入 =====
SELECT pg_temp.chk('E01 寒假 7 天：寫 6 天、手動 1 天保留', 'OK {"deleted": 0, "written": 6, "season_id": "%", "kept_manual": 1, "dropped_missing_price": 0}', pg_temp.try(:HA, :'sql_season'));
SELECT pg_temp.chk('E02 週一＝季節平日，售價原價都寫', 'season|weekday|20000|24000', pg_temp.row(:P1, 0));
SELECT pg_temp.chk('E03 週五＝季節旺日', 'season|friday_sunday|21000|25000', pg_temp.row(:P1, 4));
SELECT pg_temp.chk('E04 週六＝季節假日', 'season|weekend|22000|26000', pg_temp.row(:P1, 5));
SELECT pg_temp.chk('E05 週日＝季節旺日', 'season|friday_sunday|21000|25000', pg_temp.row(:P1, 6));
SELECT pg_temp.chk('E06 週三手動價不被覆蓋', 'manual|-|9000|12000', pg_temp.row(:P1, 2));
SELECT pg_temp.chk('E07 區段重疊 → 拒絕', 'ERR [22023] 與同方案其他季節區段的日期重疊', pg_temp.try(:HA, :'sql_season'));
SELECT pg_temp.chk('E08 改寒假價格後重新展開（只更新平日 4 天）', 'OK {"deleted": 0, "written": 3, "season_id": "%", "kept_manual": 1, "dropped_missing_price": 0}', pg_temp.try(:HA, (SELECT format($f$SELECT public.save_package_season('c1000000-0000-0000-0000-000000000001', %L, '寒假', %L, %L, '{"weekday":{"sale":20500,"original":24000},"friday_sunday":{"sale":21000,"original":25000},"weekend":{"sale":22000,"original":26000}}')::text$f$, id, pg_temp.mon(0), pg_temp.mon(6)) FROM public.package_seasons WHERE name = '寒假')));
SELECT pg_temp.chk('E09 週一改為 20500', 'season|weekday|20500|24000', pg_temp.row(:P1, 0));
SELECT pg_temp.chk('E10 舊頁直接改季節列（RLS 允許的寫法）', 'OK 1', pg_temp.try(:HA, format($f$WITH u AS (UPDATE public.package_date_prices SET sale_price = 19999 WHERE package_id = 'c1000000-0000-0000-0000-000000000001' AND date = %L RETURNING 1) SELECT count(*)::text FROM u$f$, pg_temp.mon(0))));
SELECT pg_temp.chk('E11 被手動改過的列變成 manual', 'manual|-|19999|24000', pg_temp.row(:P1, 0));
SELECT pg_temp.chk('E12 重新展開不覆蓋手動列', 'OK {"deleted": 0, "written": 0, "kept_manual": 2', pg_temp.try(:HA, format($f$SELECT public.rebuild_package_date_prices(%L, %L, %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(0), pg_temp.mon(6))));
SELECT pg_temp.chk('E13 週一仍是手動 19999', 'manual|-|19999|24000', pg_temp.row(:P1, 0));
SELECT pg_temp.chk('E14 整欄套用假日：4人平日方案沒有假日價 → 拒絕', 'ERR [22023] 方案「4人平日」', pg_temp.try(:HA, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], 'weekend')::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(1))));
SELECT pg_temp.chk('E15 只對 8人包棟 週二套用假日（在寒假內 → 寒假假日價）', 'OK {"deleted": 0, "written": 1', pg_temp.try(:HA, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], 'weekend', %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(1), 'c1000000-0000-0000-0000-000000000001')));
SELECT pg_temp.chk('E16 週二＝日型例外、寒假假日價', 'day_tier|weekend|22000|26000', pg_temp.row(:P1, 1));
SELECT pg_temp.chk('E17 下週二（區段外）套用假日 → 方案假日價', 'OK {"deleted": 0, "written": 1', pg_temp.try(:STE, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], 'weekend', %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(8), 'c1000000-0000-0000-0000-000000000001')));
SELECT pg_temp.chk('E18 下週二＝方案假日價', 'day_tier|weekend|14000|16000', pg_temp.row(:P1, 8));
SELECT pg_temp.chk('E19 4人平日套平日：原價缺 → 拒絕（原價必填）', 'ERR [22023] 方案「4人平日」', pg_temp.try(:HA, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], 'weekday', %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(9), 'c2000000-0000-0000-0000-000000000002')));
SELECT pg_temp.chk('E20 今天以前的日期 → 拒絕', 'ERR [22023] 不能設定今天以前', pg_temp.try(:HA, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[CURRENT_DATE - 1], 'weekend')::text$f$, 'f1000000-0000-0000-0000-000000000001')));
-- 方案改價：日型例外列自動重新展開（舊頁、上架精靈、save_package_tier_prices 都適用）
UPDATE public.accommodation_packages SET tier_prices = jsonb_set(tier_prices, '{weekend,sale}', '15000') WHERE id = 'c1000000-0000-0000-0000-000000000001';
SELECT pg_temp.chk('E21 方案假日價改 15000 → 下週二自動更新', 'day_tier|weekend|15000|16000', pg_temp.row(:P1, 8));
SELECT pg_temp.chk('E22 寒假內的週二不受方案改價影響', 'day_tier|weekend|22000|26000', pg_temp.row(:P1, 1));
-- 國定假日：寒假週四改成假日 → 季節假日價
INSERT INTO public.public_holidays (accommodation_id, holiday_date, holiday_name, holiday_type) VALUES ('f1000000-0000-0000-0000-000000000001', pg_temp.mon(3), '測試假日', 'holiday');
SELECT pg_temp.chk('E23 新增國定假日 → 寒假週四改為季節假日價', 'season|weekend|22000|26000', pg_temp.row(:P1, 3));
DELETE FROM public.public_holidays WHERE accommodation_id = 'f1000000-0000-0000-0000-000000000001' AND holiday_date = pg_temp.mon(3);
SELECT pg_temp.chk('E24 刪除國定假日 → 寒假週四改回季節平日價', 'season|weekday|20500|24000', pg_temp.row(:P1, 3));
SELECT pg_temp.chk('E25 清除週二日型例外 → 改回寒假平日價', 'OK {"deleted": 0, "written": 1', pg_temp.try(:HA, format($f$SELECT public.set_day_tier_overrides(%L, ARRAY[%L::date], NULL, %L)::text$f$, 'f1000000-0000-0000-0000-000000000001', pg_temp.mon(1), 'c1000000-0000-0000-0000-000000000001')));
SELECT pg_temp.chk('E26 週二＝寒假平日', 'season|weekday|20500|24000', pg_temp.row(:P1, 1));
SELECT pg_temp.chk('E27 刪除寒假：季節列 5 筆刪除、手動列保留', 'OK {"deleted": 5, "written": 0, "kept_manual": 0', pg_temp.try(:HA, (SELECT format('SELECT public.delete_package_season(%L)::text', id) FROM public.package_seasons WHERE name = '寒假')));
SELECT pg_temp.chk('E28 刪除後週一仍是手動 19999', 'manual|-|19999|24000', pg_temp.row(:P1, 0));
SELECT pg_temp.chk('E29 刪除後週四沒有單日價（回到一般價格）', 'none', pg_temp.row(:P1, 3));
SELECT pg_temp.chk('E30 區段外日型例外仍在', 'day_tier|weekend|15000|16000', pg_temp.row(:P1, 8));
SELECT pg_temp.chk('E31 過去日期的資料不被展開碰到', 'OK 0', pg_temp.try(:SUPER, 'SELECT count(*)::text FROM public.package_date_prices WHERE date < CURRENT_DATE AND source <> ''manual'''));

-- ===== G. 專案群組＋折扣碼同步 =====
SELECT pg_temp.chk('G01 總部 admin 不能建群組', 'ERR [42501]', pg_temp.try(:ADM, $s$SELECT public.save_pricing_template_group('f1000000-0000-0000-0000-000000000001', NULL, '平日少人不含餐')::text$s$));
SELECT pg_temp.chk('G02 hotel_admin 建群組', 'OK ', pg_temp.try(:HA, $s$SELECT public.save_pricing_template_group('f1000000-0000-0000-0000-000000000001', NULL, '平日少人不含餐')::text$s$));
SELECT id::text AS g1 FROM public.pricing_template_groups WHERE name = '平日少人不含餐' \gset
SELECT pg_temp.chk('G03 名稱重複 → 拒絕', 'ERR [23505]', pg_temp.try(:HA, $s$SELECT public.save_pricing_template_group('f1000000-0000-0000-0000-000000000001', NULL, '平日少人不含餐')::text$s$));
SELECT pg_temp.chk('G04 成員設為 專案一、專案二', 'OK 2', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002']::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G05 折扣碼一還沒連群組 → 不變', '專案三', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.chk('G06 折扣碼權限唯讀的 staff 不能連群組', 'ERR [42501]', pg_temp.try(:STR, format($f$SELECT public.set_discount_code_template_groups('e1000000-0000-0000-0000-0000000000c1', ARRAY[%L]::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G07 總部 admin 不能連群組', 'ERR [42501]', pg_temp.try(:ADM, format($f$SELECT public.set_discount_code_template_groups('e1000000-0000-0000-0000-0000000000c1', ARRAY[%L]::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G08 折扣碼可編輯的 staff 連群組', 'OK [', pg_temp.try(:STE, format($f$SELECT public.set_discount_code_template_groups('e1000000-0000-0000-0000-0000000000c1', ARRAY[%L]::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G09 連群組後：手動的專案三＋群組成員', '專案三,專案一,專案二', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.chk('G10 專案三加入群組（本來就手動勾）', 'OK 3', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000003']::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G11 不重複加入', '專案三,專案一,專案二', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.chk('G12 專案一移出群組 → 折扣碼自動移除', 'OK 2', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d2000000-0000-0000-0000-000000000002','d3000000-0000-0000-0000-000000000003']::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G13 折扣碼＝專案三、專案二', '專案三,專案二', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.chk('G14 專案三移出群組 → 手動勾選保留', 'OK 1', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d2000000-0000-0000-0000-000000000002']::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G15 折扣碼仍有專案三', '專案三,專案二', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1'));
SELECT pg_temp.chk('G16 他館專案不能加入', 'ERR [22023] 專案不存在或不屬於本館', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d9000000-0000-0000-0000-000000000009']::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G17 第二個群組', 'OK ', pg_temp.try(:HA, $s$SELECT public.save_pricing_template_group('f1000000-0000-0000-0000-000000000001', NULL, '假日包棟')::text$s$));
SELECT id::text AS g2 FROM public.pricing_template_groups WHERE name = '假日包棟' \gset
SELECT pg_temp.chk('G18 已在其他群組的專案不能加入', 'ERR [22023] 專案已屬於其他群組', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d2000000-0000-0000-0000-000000000002']::uuid[])::text$f$, :'g2')));
SELECT pg_temp.chk('G19 他館折扣碼不能連本館群組（他館 hotel_admin）', 'ERR [22023] 群組不存在或不屬於本館', pg_temp.try(:OTH, format($f$SELECT public.set_discount_code_template_groups('e9000000-0000-0000-0000-0000000000c9', ARRAY[%L]::uuid[])::text$f$, :'g1')));
SELECT pg_temp.chk('G20 群組二加專案一，折扣碼二連群組一＋群組二', 'OK 1', pg_temp.try(:HA, format($f$SELECT public.set_pricing_template_group_members(%L, ARRAY['d1000000-0000-0000-0000-000000000001']::uuid[])::text$f$, :'g2')));
SELECT pg_temp.chk('G21 折扣碼二連兩個群組', 'OK [', pg_temp.try(:HA, format($f$SELECT public.set_discount_code_template_groups('e2000000-0000-0000-0000-0000000000c2', ARRAY[%L, %L]::uuid[])::text$f$, :'g1', :'g2')));
SELECT pg_temp.chk('G22 折扣碼二＝專案一、專案二', '專案一,專案二', pg_temp.ids('e2000000-0000-0000-0000-0000000000c2'));
SELECT pg_temp.chk('G23 刪除群組二 → 折扣碼二剩專案二', 'OK ', pg_temp.try(:HA, format('SELECT public.delete_pricing_template_group(%L)::text', :'g2')));
SELECT pg_temp.chk('G24 折扣碼二＝專案二', '專案二', pg_temp.ids('e2000000-0000-0000-0000-0000000000c2'));
DELETE FROM public.pricing_templates WHERE id = 'd2000000-0000-0000-0000-000000000002';
SELECT pg_temp.chk('G25 刪除專案二 → 兩個折扣碼都移除、同步紀錄清掉', '專案三|', pg_temp.ids('e1000000-0000-0000-0000-0000000000c1') || '|' || pg_temp.ids('e2000000-0000-0000-0000-0000000000c2')
  || (SELECT CASE WHEN count(*) = 0 THEN '' ELSE ' synced=' || count(*) END FROM public.discount_code_group_synced_templates));
SELECT pg_temp.chk('G26 取消折扣碼一的群組連結 → 只剩手動的專案三', 'OK ["d3000000-0000-0000-0000-000000000003"]', pg_temp.try(:HA, $s$SELECT public.set_discount_code_template_groups('e1000000-0000-0000-0000-0000000000c1', ARRAY[]::uuid[])::text$s$) || (SELECT CASE WHEN pg_temp.ids('e1000000-0000-0000-0000-0000000000c1') = '專案三' THEN '' ELSE ' 錯誤' END));

-- ===== X. 奧丁丁／旭海互斥 =====
SELECT pg_temp.chk('X01 已開奧丁丁的館開旭海 → 擋', 'ERR [23514] 此館已開啟奧丁丁同步', pg_temp.su($s$INSERT INTO public.accommodation_hotelnabe_config (accommodation_id, hotelnabe_hotel_code, sync_enabled) VALUES ('f1000000-0000-0000-0000-000000000001','HN-YX',true) RETURNING 'x'$s$));
SELECT pg_temp.chk('X02 已開旭海的館開奧丁丁 → 擋', 'ERR [23514] 此館已開啟旭海同步', pg_temp.su($s$INSERT INTO public.accommodation_owlting_config (accommodation_id, owlting_hotel_code, sync_enabled) VALUES ('f2000000-0000-0000-0000-000000000002','OWL-V2',true) RETURNING 'x'$s$));
SELECT pg_temp.chk('X03 不開同步可以建設定', 'OK x', pg_temp.su($s$INSERT INTO public.accommodation_owlting_config (accommodation_id, owlting_hotel_code, sync_enabled) VALUES ('f2000000-0000-0000-0000-000000000002','OWL-V2',false) RETURNING 'x'$s$));
SELECT pg_temp.chk('X04 之後再打開 → 擋', 'ERR [23514]', pg_temp.su($s$UPDATE public.accommodation_owlting_config SET sync_enabled = true WHERE accommodation_id = 'f2000000-0000-0000-0000-000000000002' RETURNING 'x'$s$));
UPDATE public.accommodation_owlting_config SET sync_enabled = false WHERE accommodation_id = 'f1000000-0000-0000-0000-000000000001';
SELECT pg_temp.chk('X05 關掉奧丁丁後可以開旭海', 'OK x', pg_temp.su($s$INSERT INTO public.accommodation_hotelnabe_config (accommodation_id, hotelnabe_hotel_code, sync_enabled) VALUES ('f1000000-0000-0000-0000-000000000001', 'HN-YX', true) RETURNING 'x'$s$));
SELECT pg_temp.chk('X06 改其他欄位不受影響', 'OK x', pg_temp.su($s$UPDATE public.accommodation_hotelnabe_config SET hotelnabe_hotel_code = 'HN-YX2' WHERE accommodation_id = 'f1000000-0000-0000-0000-000000000001' RETURNING 'x'$s$));

SELECT no, case_no, CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END AS r, expect, actual FROM t_result ORDER BY no;
SELECT 'PASS ' || count(*) FILTER (WHERE pass) || ' / FAIL ' || count(*) FILTER (WHERE NOT pass) FROM t_result;
ROLLBACK;
