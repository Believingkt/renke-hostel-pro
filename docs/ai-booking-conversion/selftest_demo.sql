-- L Demo 表自測（單連線部分）；兩連線衝突見 run_selftest.sh
\set ON_ERROR_STOP 1
INSERT INTO public.accommodation_info (id, name, is_active) VALUES
  ('d0000000-0000-4000-8000-000000000001', '示範館一', true), ('d0000000-0000-4000-8000-000000000002', '示範館二', true),
  ('d0000000-0000-4000-8000-000000000003', '示範館三', true), ('d0000000-0000-4000-8000-000000000004', '示範館四', true),
  ('d0000000-0000-4000-8000-000000000005', '示範館五', true);
CREATE OR REPLACE FUNCTION pg_temp.run(rid text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('runId', rid, 'generatedAt', '2026-10-16T09:00:00+08:00', 'demoVersion', 'aibk-demo-v1.0.0',
    'fixtureVersion', 'aibk-fixture-v1.0.0', 'dataNature', 'synthetic_demo',
    'venues', (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id) FROM public.accommodation_info WHERE id::text LIKE 'd0000000%')) $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_err(label text, sql text, code text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql; RAISE EXCEPTION 'FAIL % (no error)', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> code THEN RAISE EXCEPTION 'FAIL % got % %', label, SQLSTATE, SQLERRM; END IF;
  RAISE NOTICE 'PASS % → % %', label, SQLSTATE, SQLERRM;
END $$;

SET test.uid = 'cccccccc-0000-4000-8000-00000000000c'; -- 館主
SELECT pg_temp.expect_err('owner 不能讀', 'SELECT public.hq_ai_booking_demo_get()', '42501');
SET test.uid = 'aaaaaaaa-0000-4000-8000-00000000000a'; -- 全域 admin
DO $$ BEGIN
  IF (public.hq_ai_booking_demo_get())->'dataset' <> 'null'::jsonb OR ((public.hq_ai_booking_demo_get())->>'canWrite')::boolean THEN RAISE EXCEPTION 'FAIL admin get'; END IF;
  RAISE NOTICE 'PASS admin 可讀、空 dataset、canWrite=false';
END $$;
SELECT pg_temp.expect_err('admin 不能寫', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1'))$q$, '42501');
SET test.uid = 'bbbbbbbb-0000-4000-8000-00000000000b'; -- super_admin
SELECT pg_temp.expect_err('多餘欄位', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1') || '{"email":"x@y.z"}')$q$, '22023');
SELECT pg_temp.expect_err('dataNature 非 synthetic', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1') || '{"dataNature":"production"}')$q$, '22023');
SELECT pg_temp.expect_err('runId 格式', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('DEMORUN-20261016-090000-1'))$q$, '22023');
SELECT pg_temp.expect_err('版本格式', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1') || '{"demoVersion":"demo-pres-v1.0.0"}')$q$, '22023');
SELECT pg_temp.expect_err('館名不符', $q$SELECT public.hq_ai_booking_demo_put(0, jsonb_set(pg_temp.run('AIBKRUN-20261016-090000-1'), '{venues,0,name}', '"假館 0912345678"'))$q$, '22023');
SELECT pg_temp.expect_err('館數非 5', $q$SELECT public.hq_ai_booking_demo_put(0, jsonb_set(pg_temp.run('AIBKRUN-20261016-090000-1'), '{venues}', (pg_temp.run('x')->'venues') - 0))$q$, '22023');
SELECT pg_temp.expect_err('超過 2048 bytes', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1') || jsonb_build_object('venues', (SELECT jsonb_agg(jsonb_build_object('id', 'd0000000-0000-4000-8000-000000000001', 'name', repeat('x', 500))) FROM generate_series(1,5))))$q$, '22023');
DO $$ DECLARE r jsonb; BEGIN
  r := public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-1'));
  IF (r->'dataset'->>'revision')::int <> 1 OR r->'dataset'->>'runId' <> 'AIBKRUN-20261016-090000-1' THEN RAISE EXCEPTION 'FAIL first put %', r; END IF;
  RAISE NOTICE 'PASS 首次發布 revision=1';
END $$;
SELECT pg_temp.expect_err('過期 revision → PT409', $q$SELECT public.hq_ai_booking_demo_put(0, pg_temp.run('AIBKRUN-20261016-090000-2'))$q$, 'PT409');
DO $$ DECLARE r jsonb; BEGIN
  r := public.hq_ai_booking_demo_put(1, pg_temp.run('AIBKRUN-20261016-090000-2'));
  IF (r->'dataset'->>'revision')::int <> 2 THEN RAISE EXCEPTION 'FAIL update %', r; END IF;
  IF (SELECT count(*) FROM public.hq_ai_booking_demo_dataset_history) <> 1 THEN RAISE EXCEPTION 'FAIL history'; END IF;
  RAISE NOTICE 'PASS 更新 revision=2、history 1 筆';
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'hq_shared_demo_datasets') THEN RAISE EXCEPTION 'unexpected'; END IF;
  IF has_table_privilege('authenticated', 'public.hq_ai_booking_demo_dataset', 'SELECT') OR has_table_privilege('anon', 'public.hq_ai_booking_demo_dataset_history', 'SELECT') THEN RAISE EXCEPTION 'FAIL table grants'; END IF;
  RAISE NOTICE 'PASS 表不對 anon/authenticated 開放（只能經 RPC）';
END $$;
