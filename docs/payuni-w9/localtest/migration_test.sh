#!/usr/bin/env bash
# W9 草稿 migration 本機測試：套用、重跑、限制條件、RLS、rollback、再套用、鎖測試
# 最小 schema 同 W8：app_role、user_roles、auth.uid()、is_super_admin 取自 repo migration 原文
set -uo pipefail
REPO=/app
DB=w9mig
M=$REPO/docs/payuni-w9/draft_20261024090000_payuni_platform_fee.sql
RB=$REPO/docs/payuni-w9/rollback_20261024090000.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null 2>&1
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
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES
  ('11111111-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','hotel_admin'),
  ('11111111-0000-4000-8000-000000000003',NULL,'super_admin');
SQL
awk '/CREATE OR REPLACE FUNCTION public.is_super_admin/,/\$\$;/' $REPO/supabase/migrations/20260124102710_3edab0d2-4f8b-4101-81ab-83b6044cfc65.sql | q >/dev/null
state() { q -At -c "SELECT 'tables=' || (SELECT count(*) FROM pg_tables WHERE tablename LIKE 'payuni_platform_fee_%') || '；policy=' || (SELECT count(*) FROM pg_policies WHERE tablename LIKE 'payuni_platform_fee_%') || '；index=' || (SELECT count(*) FROM pg_indexes WHERE tablename LIKE 'payuni_platform_fee_%')"; }
try() { local label="$1"; shift; local out; out=$(q -At -c "$*" 2>&1); if [ $? -eq 0 ]; then echo "$label：成功"; else echo "$label：被擋（$(echo "$out" | grep -oE 'violates [a-z ]+ "[a-z_]+"|duplicate key value violates unique constraint "[a-z_]+"|permission denied[^.]*' | head -1)）"; fi; }
echo "== 初始：$(state)"
echo "== 套用"; q -f "$M" >/dev/null && echo ok; echo "$(state)"
echo "== 欄位"
for t in payuni_platform_fee_batches payuni_platform_fee_items; do
  q -At -c "SELECT '$t: ' || string_agg(column_name || ':' || data_type || CASE WHEN is_nullable='NO' THEN '!' ELSE '' END, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_name='$t'"
done
q -At -c "SELECT conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid::regclass::text LIKE '%platform_fee%' AND contype IN ('u','f') ORDER BY 1"
q -At -c "SELECT indexname || ' ' || indexdef FROM pg_indexes WHERE indexname = 'payuni_platform_fee_batches_period_active_key'"
echo "== 重跑"; q -f "$M" >/dev/null 2>&1 && echo "exit=0"; echo "$(state)"
echo "== 限制條件"
q -c "INSERT INTO payuni_platform_fee_batches (id, period) VALUES ('bbbbbbbb-0000-4000-8000-000000000001','2026-11')" >/dev/null
try "同 period 第二個非 cancelled 批次" "INSERT INTO payuni_platform_fee_batches (period) VALUES ('2026-11')"
q -c "UPDATE payuni_platform_fee_batches SET status='cancelled' WHERE id='bbbbbbbb-0000-4000-8000-000000000001'" >/dev/null
try "原批次 cancelled 後再建同 period" "INSERT INTO payuni_platform_fee_batches (id, period) VALUES ('bbbbbbbb-0000-4000-8000-000000000002','2026-11')"
try "period 格式 2026-13" "INSERT INTO payuni_platform_fee_batches (period) VALUES ('2026-13')"
try "batch status 不在清單" "INSERT INTO payuni_platform_fee_batches (period, status) VALUES ('2026-10','bogus')"
I="INSERT INTO payuni_platform_fee_items (batch_id, accommodation_id, mer_id, amount, fee_type, bal_type, trade_no) VALUES ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','M_A'"
try "正向明細" "$I, 2250, 2, 1, 'LKZ2026110001')"
try "同批同館同 bal_type 第二筆" "$I, 100, 2, 1, 'LKZ2026110001')"
try "同批同館負向修正" "$I, 300, 3, 2, 'LKZ2026110001N')"
try "amount 超過 9,999,999" "INSERT INTO payuni_platform_fee_items (batch_id, accommodation_id, mer_id, amount, fee_type, bal_type, trade_no) VALUES ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000002','M_B', 10000000, 2, 1, 'X')"
try "trade_no 21 字" "INSERT INTO payuni_platform_fee_items (batch_id, accommodation_id, mer_id, amount, fee_type, bal_type, trade_no) VALUES ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000002','M_B', 1, 2, 1, 'LKZ123456789012345678')"
try "bal_type=3" "INSERT INTO payuni_platform_fee_items (batch_id, accommodation_id, mer_id, amount, fee_type, bal_type, trade_no) VALUES ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000002','M_B', 1, 2, 3, 'X')"
try "batch_id 不存在" "INSERT INTO payuni_platform_fee_items (batch_id, accommodation_id, mer_id, amount, fee_type, bal_type, trade_no) VALUES (gen_random_uuid(),'aaaaaaaa-0000-4000-8000-000000000002','M_B', 1, 2, 1, 'X')"
echo "== RLS"
rls() { q -At -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$1', true); SELECT '$2 batches=' || (SELECT count(*) FROM payuni_platform_fee_batches) || ' items=' || (SELECT count(*) FROM payuni_platform_fee_items); COMMIT;" | tail -1; }
rls 11111111-0000-4000-8000-000000000003 "super_admin（應 2／2）"
rls 11111111-0000-4000-8000-000000000001 "A館 hotel_admin（應 0／0，改經 my_items）"
q -At -c "BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM payuni_platform_fee_items; COMMIT;" 2>&1 | grep -o "permission denied.*" | sed 's/^/anon：/'
q -At -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','11111111-0000-4000-8000-000000000003',true); UPDATE payuni_platform_fee_items SET amount = 1; COMMIT;" 2>&1 | grep -o "permission denied.*" | sed 's/^/super_admin 直接更新：/'
q -At -c "BEGIN; SET LOCAL ROLE service_role; UPDATE payuni_platform_fee_items SET status='sent'; SELECT 'service_role 更新 ok'; ROLLBACK;" | tail -1
echo "== rollback"; q -f "$RB" >/dev/null && echo ok; echo "$(state)"
echo "== 再套用"; q -f "$M" >/dev/null && echo ok; echo "$(state)"
echo "== 重跑時兩張表正被讀取 15 秒（RLS 已開不再 ALTER，應立即成功）"
P -d "$DB" -c "BEGIN; SELECT count(*) FROM payuni_platform_fee_batches, payuni_platform_fee_items; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms"; wait
echo "== 從零套用時 pg_policy 被持 ACCESS EXCLUSIVE（應約 3 秒失敗、無部分變更）"
q -f "$RB" >/dev/null
P -d "$DB" -c "BEGIN; LOCK TABLE pg_catalog.pg_policy IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" > /tmp/w9_timed.out 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；錯誤=$(grep -o 'canceling statement due to lock timeout' /tmp/w9_timed.out | head -1)；$(state)"; wait
echo "== 結束後再套用一次"; q -f "$M" >/dev/null && echo ok; echo "$(state)"
