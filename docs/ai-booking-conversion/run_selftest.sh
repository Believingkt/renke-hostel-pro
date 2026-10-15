#!/bin/bash
# 本機臨時 PG15：initdb → stub → migration → 自測；結束即刪除，不連任何正式資料庫
set -e
B=/usr/lib/postgresql/15/bin; D=/tmp/pg_aibk; rm -rf $D; mkdir -p $D; chown postgres $D
su postgres -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p 55433 -k $D' -l $D/log start >/dev/null"
sleep 2
P="psql -h $D -p 55433 -U postgres -v ON_ERROR_STOP=1 -q -X"
$P -c "create database t" >/dev/null
P="$P -d t"
cd "$(dirname "$0")"
$P -f selftest_stubs.sql
$P -f ../../supabase/migrations/20261016120000_ai_booking_conversion.sql
echo "== migration 重跑（idempotent）"; $P -f ../../supabase/migrations/20261016120000_ai_booking_conversion.sql && echo "OK"
echo "== conversion"; $P -f selftest_conversion.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
echo "== demo"; $P -f selftest_demo.sql 2>&1 | grep -E "PASS|FAIL|ERROR"
echo "== 兩連線：A 持鎖未提交時 B 以相同 revision=2 發布 → A 提交後 B 得 PT409"
RUN3="'{\"runId\":\"AIBKRUN-20261016-100000-3\",\"generatedAt\":\"2026-10-16T10:00:00+08:00\",\"demoVersion\":\"aibk-demo-v1.0.0\",\"fixtureVersion\":\"aibk-fixture-v1.0.0\",\"dataNature\":\"synthetic_demo\",\"venues\":'||(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY id) FROM accommodation_info WHERE id::text LIKE 'd0000000%')::text||'}'"
( $P -c "SET test.uid='bbbbbbbb-0000-4000-8000-00000000000b'; BEGIN; SELECT (public.hq_ai_booking_demo_put(2, ($RUN3)::jsonb))->'dataset'->>'revision' AS a_rev; SELECT pg_sleep(2); COMMIT;" 2>&1 | sed 's/^/[A] /' ) &
sleep 0.7
$P -c "SET test.uid='bbbbbbbb-0000-4000-8000-00000000000b'; SELECT public.hq_ai_booking_demo_put(2, ($RUN3)::jsonb);" 2>&1 | grep -E "revision_conflict|ERROR|DETAIL" | sed 's/^/[B] /' || true
wait
echo "== 跨 client 同 run：兩條連線讀到相同 runId／revision"
for c in 1 2; do $P -tA -c "SET test.uid='aaaaaaaa-0000-4000-8000-00000000000a'; SELECT 'client$c ' || ((public.hq_ai_booking_demo_get())->'dataset'->>'runId') || ' rev=' || ((public.hq_ai_booking_demo_get())->'dataset'->>'revision');"; done
echo "== 兩連線首次發布（空表）：scratch 清空後 A、B 同時 put(0) → B 得 PT409"
$P -c "TRUNCATE public.hq_ai_booking_demo_dataset, public.hq_ai_booking_demo_dataset_history;"
( $P -c "SET test.uid='bbbbbbbb-0000-4000-8000-00000000000b'; BEGIN; SELECT (public.hq_ai_booking_demo_put(0, ($RUN3)::jsonb))->'dataset'->>'revision' AS a_first_rev; SELECT pg_sleep(2); COMMIT;" 2>&1 | grep -E "^ +[0-9]|ERROR" | sed 's/^/[A] /' ) &
sleep 0.7
$P -c "SET test.uid='bbbbbbbb-0000-4000-8000-00000000000b'; SELECT public.hq_ai_booking_demo_put(0, ($RUN3)::jsonb);" 2>&1 | grep -E "revision_conflict|ERROR|DETAIL" | sed 's/^/[B] /' || true
wait
$P -tA -c "SELECT 'rows=' || count(*) || ' max_rev=' || max(revision) FROM public.hq_ai_booking_demo_dataset;"
su postgres -c "$B/pg_ctl -D $D/data stop" >/dev/null; rm -rf $D
