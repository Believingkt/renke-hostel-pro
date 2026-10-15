-- AI 訂房轉換分析 scratch 自測（本機臨時 PG15；非正式資料庫）
-- 執行：psql -v ON_ERROR_STOP=1 -f stubs → migration → 本檔。每個斷言失敗即 RAISE。
\set ON_ERROR_STOP 1

-- ---------- 測試資料 ----------
INSERT INTO public.accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-4000-8000-000000000001', '甲館', true),
  ('a0000000-0000-4000-8000-000000000002', '乙館', true),
  ('a0000000-0000-4000-8000-000000000003', '丙館（無訂單）', true),
  ('a0000000-0000-4000-8000-000000000009', '停用館', false);
INSERT INTO public.traveler_profiles (id, email) VALUES
  ('70000000-0000-4000-8000-000000000001', 'guest1@example.com'),
  ('70000000-0000-4000-8000-000000000002', 'staff@lakeze.com');
INSERT INTO public.remarketing_campaigns (id, content) VALUES
  ('c0000000-0000-4000-8000-000000000001', '{"accommodation_id":"a0000000-0000-4000-8000-000000000001"}'),
  ('c0000000-0000-4000-8000-000000000002', '{"accommodation_id":"a0000000-0000-4000-8000-000000000002"}');
-- s1 甲館正常；s2 甲館 is_test；s3 甲館 failed；s4 乙館；s5 甲館但收件者在排除名單；s6 甲館較晚發送
INSERT INTO public.remarketing_sends (id, campaign_id, traveler_profile_id, status, is_test, recipient, sent_at) VALUES
  ('50000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-01 00:00+08'),
  ('50000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'sent', true,  'guest1@example.com', '2026-10-01 00:00+08'),
  ('50000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'failed', false, 'guest1@example.com', '2026-10-01 00:00+08'),
  ('50000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-01 00:00+08'),
  ('50000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002', 'sent', false, 'staff@lakeze.com', '2026-10-01 00:00+08'),
  ('50000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-05 12:00+08');
INSERT INTO public.ai_metric_exclusions (kind, value) VALUES ('email', 'staff@lakeze.com');

-- 訂單（全部 2026-10 的台北時間）
INSERT INTO public.orders (id, accommodation_id, order_status, order_source, guest_email, created_at) VALUES
  -- 甲館 AI：first+last 皆指向 s1 → 只算 1 次
  ('00000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-02 10:00+08'),
  -- 甲館 AI：只有 first 指向 s1，last 是 meta 廣告
  ('00000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'checked_out', 'website', 'g@example.com', '2026-10-03 10:00+08'),
  -- 甲館：指向 s6，但訂單早於 send → 不算
  ('00000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-04 10:00+08'),
  -- 甲館：跨館（指向乙館的 s4）→ 不算
  ('00000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-02 11:00+08'),
  -- 甲館：s2 is_test / s3 failed / s5 排除名單收件者 → 不算
  ('00000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'checked_in',  'website', 'g@example.com', '2026-10-02 12:00+08'),
  ('00000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'owlting', 'g@example.com', '2026-10-02 13:00+08'),
  ('00000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'manual',  'g@example.com', '2026-10-02 14:00+08'),
  -- 甲館：跨活動（content 對 s1，但 utm_campaign 是乙館活動）→ 不算
  ('00000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-02 15:00+08'),
  -- 甲館：utm_source 只是含 remarketing 字串（非精確）→ 不算
  ('00000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-02 16:00+08'),
  -- 甲館：cancelled / hold / pending 有 AI 歸因 → 不進分子也不進分母
  ('00000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'cancelled',   'website', 'g@example.com', '2026-10-02 17:00+08'),
  ('00000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000001', 'hold',        'website', 'g@example.com', '2026-10-02 18:00+08'),
  ('00000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000001', 'pending',     'website', 'g@example.com', '2026-10-02 19:00+08'),
  -- 甲館：order_source=test 與排除名單 guest_email（有 AI 歸因）→ 一律排除
  ('00000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'test',    'g@example.com', '2026-10-02 20:00+08'),
  ('00000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'STAFF@lakeze.com', '2026-10-02 21:00+08'),
  -- 台北日界：10/10 23:59:59+08 在 [10/01,10/10] 內；10/11 00:00:00+08 在外；09/30 23:59:59+08 在外
  ('00000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-10 23:59:59+08'),
  ('00000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-10-11 00:00:00+08'),
  ('00000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000001', 'confirmed',   'website', 'g@example.com', '2026-09-30 23:59:59+08'),
  -- 乙館：AI 1 筆（s4）＋一般 1 筆
  ('00000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000002', 'confirmed',   'website', 'g@example.com', '2026-10-03 09:00+08'),
  ('00000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000002', 'confirmed',   'owlting', 'g@example.com', '2026-10-03 09:30+08'),
  -- 停用館：不列
  ('00000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000009', 'confirmed',   'website', 'g@example.com', '2026-10-03 09:00+08');

INSERT INTO public.order_attributions (order_id, first_utm_source, first_utm_content, first_utm_campaign, last_utm_source, last_utm_content, last_utm_campaign) VALUES
  ('00000000-0000-4000-8000-000000000001', 'remarketing', '50000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'remarketing', '50000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, 'meta', 'ad1', 'spring'),
  ('00000000-0000-4000-8000-000000000003', 'remarketing', '50000000-0000-4000-8000-000000000006', NULL, 'remarketing', '50000000-0000-4000-8000-000000000006', NULL),
  ('00000000-0000-4000-8000-000000000004', 'remarketing', '50000000-0000-4000-8000-000000000004', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000005', 'remarketing', '50000000-0000-4000-8000-000000000002', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000006', 'remarketing', '50000000-0000-4000-8000-000000000003', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000007', 'remarketing', '50000000-0000-4000-8000-000000000005', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000008', 'remarketing', '50000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000009', 'ai_remarketing', '50000000-0000-4000-8000-000000000001', NULL, 'Remarketing', '50000000-0000-4000-8000-000000000001', NULL),
  ('00000000-0000-4000-8000-000000000010', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000011', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000012', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000013', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000014', 'remarketing', '50000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL),
  ('00000000-0000-4000-8000-000000000020', NULL, NULL, NULL, 'remarketing', '50000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002');

-- ---------- 斷言 ----------
CREATE OR REPLACE FUNCTION pg_temp.check(label text, ok boolean, got jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %: %', label, got; END IF;
  RAISE NOTICE 'PASS %', label;
END $$;

-- 權限：非 HQ → 42501；未登入 → 42501
SET test.uid = '99999999-0000-4000-8000-000000000001';
DO $$ BEGIN
  PERFORM public.ai_metric_booking_conversion('2026-10-01', '2026-10-10');
  RAISE EXCEPTION 'FAIL non-hq allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS non-hq user → 42501'; END $$;
SET test.uid = '';
DO $$ BEGIN
  PERFORM public.ai_metric_booking_conversion('2026-10-01', '2026-10-10');
  RAISE EXCEPTION 'FAIL anon allowed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS anonymous → 42501'; END $$;
SELECT pg_temp.check('anon role has no EXECUTE', NOT has_function_privilege('anon', 'public.ai_metric_booking_conversion(date,date,uuid[],text[])', 'EXECUTE'), NULL);
SELECT pg_temp.check('PUBLIC has no EXECUTE (proacl)', NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.proname = 'ai_metric_booking_conversion' AND a.grantee = 0), NULL);

SET test.uid = 'aaaaaaaa-0000-4000-8000-00000000000a'; -- admin（HQ）
DO $$ DECLARE r jsonb; BEGIN
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10');
  RAISE NOTICE 'RESULT %', jsonb_pretty(r);
  -- 甲館分母：#1,2,3,4,5,6,7,8,9,15 = 10（排除 cancelled/hold/pending/test/排除名單/日界外）；分子：#1,#2 = 2
  PERFORM pg_temp.check('甲館 effective=10', (SELECT (x->>'effective_orders')::int = 10 FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '甲館'), r);
  PERFORM pg_temp.check('甲館 ai=2（first+last 同單只算一次；sent_at 晚於訂單、跨館、跨活動、is_test、failed、排除收件者、非精確 source 都不算）', (SELECT (x->>'ai_orders')::int = 2 FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '甲館'), r);
  PERFORM pg_temp.check('甲館 attributed=9（#1-9 有歸因列）', (SELECT (x->>'attributed_orders')::int = 9 FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '甲館'), r);
  PERFORM pg_temp.check('甲館 rate=0.2 未捨入、達標', (SELECT (x->>'rate')::numeric = 0.2 AND (x->>'meets_target')::boolean FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '甲館'), r);
  PERFORM pg_temp.check('乙館 effective=2 ai=1 rate=0.5', (SELECT (x->>'effective_orders')::int = 2 AND (x->>'ai_orders')::int = 1 AND (x->>'rate')::numeric = 0.5 FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '乙館'), r);
  PERFORM pg_temp.check('丙館 0 分母：rate=null、不達標、仍列出', (SELECT x->'rate' = 'null'::jsonb AND (x->>'meets_target')::boolean = false AND (x->>'effective_orders')::int = 0 FROM jsonb_array_elements(r->'rows') x WHERE x->>'accommodation_name' = '丙館（無訂單）'), r);
  PERFORM pg_temp.check('停用館不列、選取 3 館、有訂單 2 館', jsonb_array_length(r->'rows') = 3 AND (r->>'selected_venues')::int = 3 AND (r->>'venues_with_orders')::int = 2, r);
  PERFORM pg_temp.check('合計加權 3/12 = 0.25（不是各館比率平均 0.35）', (r->'totals'->>'effective_orders')::int = 12 AND (r->'totals'->>'ai_orders')::int = 3 AND (r->'totals'->>'rate')::numeric = 0.25, r);
  PERFORM pg_temp.check('歸因涵蓋率 10/12', (r->'totals'->>'attributed_orders')::int = 10, r);
END $$;

DO $$ DECLARE r jsonb; BEGIN
  -- 訂單來源篩選同時作用分子分母：只 owlting → 甲#6（無效歸因）+ 乙#21 → 2 / 0
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', NULL, ARRAY['owlting']);
  PERFORM pg_temp.check('來源=owlting：分母 2、分子 0', (r->'totals'->>'effective_orders')::int = 2 AND (r->'totals'->>'ai_orders')::int = 0, r);
  -- 館別篩選
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', ARRAY['a0000000-0000-4000-8000-000000000002'::uuid]);
  PERFORM pg_temp.check('館別=乙館：只 1 列', jsonb_array_length(r->'rows') = 1 AND (r->'totals'->>'ai_orders')::int = 1, r);
  -- 台北日界：只查 10/11 → #16；只查 09/30 → #17
  r := public.ai_metric_booking_conversion('2026-10-11', '2026-10-11', ARRAY['a0000000-0000-4000-8000-000000000001'::uuid]);
  PERFORM pg_temp.check('日界 10/11 只含 00:00:00+08 那筆', (r->'totals'->>'effective_orders')::int = 1, r);
  r := public.ai_metric_booking_conversion('2026-09-30', '2026-09-30', ARRAY['a0000000-0000-4000-8000-000000000001'::uuid]);
  PERFORM pg_temp.check('日界 09/30 只含 23:59:59+08 那筆', (r->'totals'->>'effective_orders')::int = 1, r);
  -- 不提供含內部參數；回傳誠實說明排除方式
  PERFORM pg_temp.check('無 p_include_internal 參數、回傳 internal_exclusion 且 orders_internal_dimension=false',
    NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ai_metric_booking_conversion' AND pronargs <> 4)
    AND (r->'internal_exclusion'->>'orders_internal_dimension')::boolean = false AND NOT r ? 'include_internal_applied', r);
  -- 全域 0 分母
  r := public.ai_metric_booking_conversion('2025-01-01', '2025-01-02');
  PERFORM pg_temp.check('全域 0 分母：totals.rate=null、不達標', r->'totals'->'rate' = 'null'::jsonb AND (r->'totals'->>'meets_target')::boolean = false, r);
END $$;

-- 2.5% 門檻用未捨入值：39 筆中 1 筆 AI = 2.564%（達標）；41 筆中 1 筆 = 2.439%（未達）
INSERT INTO public.accommodation_info (id, name, is_active) VALUES ('a0000000-0000-4000-8000-000000000004', '門檻館', true);
INSERT INTO public.orders (id, accommodation_id, order_status, order_source, guest_email, created_at)
  SELECT gen_random_uuid(), 'a0000000-0000-4000-8000-000000000004', 'confirmed', 'website', 'g@example.com', '2026-10-06 10:00+08' FROM generate_series(1, 40);
INSERT INTO public.remarketing_campaigns (id, content) VALUES ('c0000000-0000-4000-8000-000000000004', '{"accommodation_id":"a0000000-0000-4000-8000-000000000004"}');
INSERT INTO public.remarketing_sends (id, campaign_id, traveler_profile_id, status, is_test, recipient, sent_at) VALUES
  ('50000000-0000-4000-8000-000000000040', 'c0000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-01 00:00+08');
INSERT INTO public.order_attributions (order_id, last_utm_source, last_utm_content)
  SELECT o.id, 'remarketing', '50000000-0000-4000-8000-000000000040' FROM public.orders o WHERE o.accommodation_id = 'a0000000-0000-4000-8000-000000000004' LIMIT 1;
DO $$ DECLARE r jsonb; BEGIN
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', ARRAY['a0000000-0000-4000-8000-000000000004'::uuid]);
  PERFORM pg_temp.check('1/40 = 0.025 剛好達標', (r->'totals'->>'rate')::numeric = 0.025 AND (r->'totals'->>'meets_target')::boolean, r);
END $$;
INSERT INTO public.orders (id, accommodation_id, order_status, order_source, guest_email, created_at)
  VALUES (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000004', 'confirmed', 'website', 'g@example.com', '2026-10-06 11:00+08');
DO $$ DECLARE r jsonb; BEGIN
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', ARRAY['a0000000-0000-4000-8000-000000000004'::uuid]);
  PERFORM pg_temp.check('1/41 = 0.02439… 未達標（捨入成 2.4% 前即比較）', (r->'totals'->>'rate')::numeric < 0.025 AND NOT (r->'totals'->>'meets_target')::boolean, r);
END $$;

-- sent_at 晚於訂單不計：時序館 send 於 10/05 12:00:00+08；訂單 11:59:59（早 1 秒）不計、12:00:00（同時）計
INSERT INTO public.accommodation_info (id, name, is_active) VALUES
  ('a0000000-0000-4000-8000-000000000005', '時序館', true), ('a0000000-0000-4000-8000-000000000006', '活動館', true);
INSERT INTO public.remarketing_campaigns (id, content) VALUES
  ('c0000000-0000-4000-8000-000000000005', '{"accommodation_id":"a0000000-0000-4000-8000-000000000005"}'),
  ('c0000000-0000-4000-8000-000000000006', '{"accommodation_id":"a0000000-0000-4000-8000-000000000006"}');
INSERT INTO public.remarketing_sends (id, campaign_id, traveler_profile_id, status, is_test, recipient, sent_at) VALUES
  ('50000000-0000-4000-8000-000000000050', 'c0000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-05 12:00:00+08'),
  ('50000000-0000-4000-8000-000000000060', 'c0000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000001', 'sent', false, 'guest1@example.com', '2026-10-01 00:00+08');
INSERT INTO public.orders (id, accommodation_id, order_status, order_source, guest_email, created_at) VALUES
  ('00000000-0000-4000-8000-000000000050', 'a0000000-0000-4000-8000-000000000005', 'confirmed', 'website', 'g@example.com', '2026-10-05 11:59:59+08'),
  ('00000000-0000-4000-8000-000000000051', 'a0000000-0000-4000-8000-000000000005', 'confirmed', 'website', 'g@example.com', '2026-10-05 12:00:00+08'),
  ('00000000-0000-4000-8000-000000000060', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08'),
  ('00000000-0000-4000-8000-000000000061', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08'),
  ('00000000-0000-4000-8000-000000000062', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08'),
  ('00000000-0000-4000-8000-000000000063', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08'),
  ('00000000-0000-4000-8000-000000000064', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08'),
  ('00000000-0000-4000-8000-000000000065', 'a0000000-0000-4000-8000-000000000006', 'confirmed', 'website', 'g@example.com', '2026-10-02 10:00+08');
-- 活動館 utm_campaign：#60 正確、#61 NULL、#62 ''（皆計）；#63 ' '、#64 其他活動 id、#65 任意字串（皆不計）
INSERT INTO public.order_attributions (order_id, last_utm_source, last_utm_content, last_utm_campaign) VALUES
  ('00000000-0000-4000-8000-000000000050', 'remarketing', '50000000-0000-4000-8000-000000000050', 'c0000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000051', 'remarketing', '50000000-0000-4000-8000-000000000050', 'c0000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000060', 'remarketing', '50000000-0000-4000-8000-000000000060', 'c0000000-0000-4000-8000-000000000006'),
  ('00000000-0000-4000-8000-000000000061', 'remarketing', '50000000-0000-4000-8000-000000000060', NULL),
  ('00000000-0000-4000-8000-000000000062', 'remarketing', '50000000-0000-4000-8000-000000000060', ''),
  ('00000000-0000-4000-8000-000000000063', 'remarketing', '50000000-0000-4000-8000-000000000060', ' '),
  ('00000000-0000-4000-8000-000000000064', 'remarketing', '50000000-0000-4000-8000-000000000060', 'c0000000-0000-4000-8000-000000000005'),
  ('00000000-0000-4000-8000-000000000065', 'remarketing', '50000000-0000-4000-8000-000000000060', 'spring_sale');
DO $$ DECLARE r jsonb; BEGIN
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', ARRAY['a0000000-0000-4000-8000-000000000005'::uuid]);
  PERFORM pg_temp.check('sent_at 晚於訂單 1 秒不計、同時刻計：分母 2 分子 1', (r->'totals'->>'effective_orders')::int = 2 AND (r->'totals'->>'ai_orders')::int = 1, r);
  r := public.ai_metric_booking_conversion('2026-10-05', '2026-10-05', ARRAY['a0000000-0000-4000-8000-000000000005'::uuid]);
  PERFORM pg_temp.check('sent_at 晚於訂單（同一台北日）仍不計：分母 2 分子 1', (r->'totals'->>'effective_orders')::int = 2 AND (r->'totals'->>'ai_orders')::int = 1, r);
  r := public.ai_metric_booking_conversion('2026-10-01', '2026-10-10', ARRAY['a0000000-0000-4000-8000-000000000006'::uuid]);
  PERFORM pg_temp.check('utm_campaign：正確/NULL/空字串計 3；空白/他活動/任意字串不計（分母 6）', (r->'totals'->>'effective_orders')::int = 6 AND (r->'totals'->>'ai_orders')::int = 3, r);
END $$;

-- 唯讀：RPC 不寫任何表
SELECT pg_temp.check('RPC 為 STABLE（不可寫）', (SELECT provolatile = 's' FROM pg_proc WHERE proname = 'ai_metric_booking_conversion'), NULL);
SELECT pg_temp.check('search_path 固定', (SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE proname = 'ai_metric_booking_conversion'), NULL);
