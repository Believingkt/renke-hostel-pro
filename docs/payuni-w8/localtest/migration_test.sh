#!/usr/bin/env bash
# W8 migration 20261023090000 本機測試：套用、重跑、rollback、再套用、鎖測試、權限、RLS、去重鍵
# 最小 schema：app_role、user_roles、auth.uid()（讀 request.jwt.claim.sub）、is_super_admin／user_has_role 取自 repo migration 原文
set -uo pipefail
REPO=/app
DB=w8mig
M=$REPO/supabase/migrations/20261023090000_payuni_grant_records.sql
RB=$REPO/docs/payuni-w8/rollback_20261023090000.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
q >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('super_admin', 'hotel_admin', 'staff');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, accommodation_id uuid, role public.app_role NOT NULL);
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text);
CREATE TABLE public.payment_transactions (id uuid PRIMARY KEY, mer_trade_no text);
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
awk '/CREATE OR REPLACE FUNCTION public.is_super_admin/,/\$\$;/' $REPO/supabase/migrations/20260124102710_3edab0d2-4f8b-4101-81ab-83b6044cfc65.sql | q >/dev/null
awk '/CREATE OR REPLACE FUNCTION public.user_has_role\(/,/^\$\$;/' $REPO/supabase/migrations/20260124090703_a7e1150d-7dc2-41bb-b25b-2c122091e615.sql | q >/dev/null
q >/dev/null <<'SQL'
INSERT INTO accommodation_info VALUES ('aaaaaaaa-0000-4000-8000-000000000001','A館'),('aaaaaaaa-0000-4000-8000-000000000002','B館');
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','hotel_admin'),
  ('11111111-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','staff'),
  ('11111111-0000-4000-8000-000000000003',NULL,'super_admin');
SQL
state() { q -At -c "SELECT 'table=' || (to_regclass('public.payuni_grant_records') IS NOT NULL) || '；policy=' || (SELECT count(*) FROM pg_policies WHERE tablename='payuni_grant_records') || '；index=' || (SELECT count(*) FROM pg_indexes WHERE tablename='payuni_grant_records')"; }
echo "== 初始：$(state)"
echo "== 套用"; q -f "$M" && echo ok; echo "$(state)"
echo "== 欄位／唯一鍵"
q -At -c "SELECT string_agg(column_name || ':' || data_type || CASE WHEN is_nullable='NO' THEN '!' ELSE '' END, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='payuni_grant_records'"
q -At -c "SELECT conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.payuni_grant_records'::regclass AND contype IN ('u','f') ORDER BY 1"
echo "== 權限"
q -At -c "SELECT p || ' anon=' || has_table_privilege('anon','public.payuni_grant_records',p) || ' authenticated=' || has_table_privilege('authenticated','public.payuni_grant_records',p) || ' service_role=' || has_table_privilege('service_role','public.payuni_grant_records',p) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p"
q -At -c "SELECT 'rls=' || relrowsecurity FROM pg_class WHERE relname='payuni_grant_records'"
echo "== 重跑（IF NOT EXISTS）"; q -f "$M" >/dev/null 2>&1 && echo "exit=0"; echo "$(state)"
echo "== 去重鍵：同鍵 upsert 覆蓋；同額兩筆不同 row_seq 都保留；row_seq 負數被擋"
q -At <<'SQL'
BEGIN;
INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, execute_amt, type, match_status) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-01',0,15,'出帳','no_order'),
  ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-01',1,15,'出帳','no_order'),
  ('aaaaaaaa-0000-4000-8000-000000000002','M2','2026-11-01',0,1000,'入帳','matched');
INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, execute_amt, type, match_status)
  VALUES ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-01',0,15,'出帳','no_order')
  ON CONFLICT (mer_id, query_date, row_seq) DO UPDATE SET synced_at = now();
SELECT '同額提領費 2 筆 + B 館 1 筆 = ' || count(*) FROM payuni_grant_records;
SAVEPOINT a;
\set ON_ERROR_STOP off
INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, match_status) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-01',0,'matched');
ROLLBACK TO a;
INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, match_status) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-02',-1,'matched');
ROLLBACK TO a;
INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, match_status) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','M1','2026-11-02',0,'bogus');
ROLLBACK TO a;
\set ON_ERROR_STOP on
COMMIT;
SQL
echo "== RLS（authenticated + request.jwt.claim.sub）"
rls() { q -At -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$1', true); SELECT '$2 可讀筆數=' || count(*) || ' 館=' || coalesce(string_agg(DISTINCT mer_id, ','), '-') FROM payuni_grant_records; COMMIT;" | tail -1; }
rls 11111111-0000-4000-8000-000000000001 "A館 hotel_admin（應 2 筆、M1）"
rls 11111111-0000-4000-8000-000000000002 "A館 staff（應 0）"
rls 11111111-0000-4000-8000-000000000003 "super_admin（應 3 筆）"
rls 11111111-0000-4000-8000-000000000009 "無角色（應 0）"
q -At -c "BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM payuni_grant_records; COMMIT;" 2>&1 | grep -o "permission denied.*" | sed 's/^/anon：/'
q -At -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-0000-4000-8000-000000000003',true); INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, match_status) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','X','2026-11-01',0,'matched'); COMMIT;" 2>&1 | grep -o "permission denied.*" | sed 's/^/super_admin 寫入：/'
q -At -c "BEGIN; SET LOCAL ROLE service_role; INSERT INTO payuni_grant_records (accommodation_id, mer_id, query_date, row_seq, match_status) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','S','2026-11-01',0,'matched'); SELECT 'service_role 寫入 ok'; ROLLBACK;" | tail -1
echo "== rollback"; q -f "$RB" >/dev/null && echo ok; echo "$(state)"
echo "== 再套用"; q -f "$M" >/dev/null && echo ok; echo "$(state)"
echo "== accommodation_info／payment_transactions 被 ACCESS EXCLUSIVE 鎖住時從零套用（不應受影響）"
q -f "$RB" >/dev/null
P -d "$DB" -c "BEGIN; LOCK TABLE accommodation_info, payment_transactions IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== 重跑時 payuni_grant_records 正被讀取 15 秒（RLS 已開不再 ALTER，其餘語句不需強鎖，應立即成功）"
P -d "$DB" -c "BEGIN; SELECT count(*) FROM payuni_grant_records; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms"; wait
echo "== 從零套用時 pg_policy 被持 ACCESS EXCLUSIVE（模擬拿不到鎖：應約 3 秒失敗、無部分變更）"
q -f "$RB" >/dev/null
P -d "$DB" -c "BEGIN; SELECT pg_advisory_xact_lock(1); LOCK TABLE pg_catalog.pg_policy IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" > /tmp/w8_timed.out 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；錯誤=$(grep -o 'canceling statement due to lock timeout' /tmp/w8_timed.out | head -1)；$(state)"; wait
echo "== 結束後再套用一次"; q -f "$M" >/dev/null && echo ok; echo "$(state)"
