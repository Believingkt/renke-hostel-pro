#!/usr/bin/env bash
# W6 migration 20261020090000 本機測試（最小 schema：payment_transactions 取自 foundation migration＋W7）
# 套用、重跑、rollback、再套用、payment_transactions 被鎖時 3 秒放棄、orders 被鎖不受影響、權限、去重索引
set -uo pipefail
REPO=/app
DB=w6mig
M=$REPO/supabase/migrations/20261020090000_payuni_reconcile.sql
RB=$REPO/docs/payuni-w6/rollback_20261020090000.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
q >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text);
CREATE TABLE public.orders (id uuid PRIMARY KEY, accommodation_id uuid);
SQL
sed -n '/CREATE TABLE IF NOT EXISTS public.payment_transactions/,/^);/p' $REPO/supabase/migrations/20261015110000_payuni_foundation.sql | q >/dev/null
q -f $REPO/supabase/migrations/20261018130000_payuni_refunds.sql >/dev/null
state() { q -At -c "SELECT 'provider_fee=' || (SELECT count(*) FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name='provider_fee')
  || '；runs=' || (to_regclass('public.payuni_reconcile_runs') IS NOT NULL) || '；diffs=' || (to_regclass('public.payuni_reconcile_diffs') IS NOT NULL)"; }
echo "== 初始：$(state)"
echo "== 套用"; q -f "$M" && echo ok; echo "$(state)"
echo "== RLS／權限"
q -At -c "SELECT relname || ' rls=' || relrowsecurity || ' policy=' || (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname) FROM pg_class c WHERE relname IN ('payuni_reconcile_runs','payuni_reconcile_diffs') ORDER BY 1"
q -At -c "SELECT t || ' anon=' || has_table_privilege('anon',t,'SELECT') || ' authenticated=' || has_table_privilege('authenticated',t,'SELECT') || ' service_role=' || has_table_privilege('service_role',t,'SELECT') FROM unnest(ARRAY['public.payuni_reconcile_runs','public.payuni_reconcile_diffs']) t"
q -At -c "SELECT 'FK 指向 orders/payment_transactions 數=' || count(*) FROM pg_constraint WHERE contype='f' AND conrelid IN ('public.payuni_reconcile_runs'::regclass,'public.payuni_reconcile_diffs'::regclass) AND confrelid IN ('public.orders'::regclass,'public.payment_transactions'::regclass)"
echo "== 重跑（IF NOT EXISTS）"; q -f "$M" 2>&1 | grep -c NOTICE | sed 's/^/NOTICE 數=/'; echo "$(state)"
echo "== 未解決差異去重（同 mer_trade_no＋類型）／已處理可重複"
q -At <<'SQL'
BEGIN;
INSERT INTO payuni_reconcile_runs (run_date) VALUES ('2026-11-01');
INSERT INTO payuni_reconcile_diffs (run_id, mer_trade_no, diff_type) SELECT id, 'X-P1', 'amount_mismatch' FROM payuni_reconcile_runs;
SAVEPOINT a;
\set ON_ERROR_STOP off
INSERT INTO payuni_reconcile_diffs (run_id, mer_trade_no, diff_type) SELECT id, 'X-P1', 'amount_mismatch' FROM payuni_reconcile_runs;
ROLLBACK TO a;
INSERT INTO payuni_reconcile_runs (run_date) VALUES ('2026-11-01');
ROLLBACK TO a;
INSERT INTO payuni_reconcile_diffs (run_id, mer_trade_no, diff_type) SELECT id, 'X-P1', 'bogus' FROM payuni_reconcile_runs;
ROLLBACK TO a;
\set ON_ERROR_STOP on
UPDATE payuni_reconcile_diffs SET resolved_at = now(), resolved_by = 'hq';
INSERT INTO payuni_reconcile_diffs (run_id, mer_trade_no, diff_type) SELECT id, 'X-P1', 'amount_mismatch' FROM payuni_reconcile_runs;
INSERT INTO payuni_reconcile_diffs (run_id, mer_trade_no, diff_type, resolved_at, resolved_by) SELECT id, 'X-P1', 'status_fixed', now(), 'system' FROM payuni_reconcile_runs;
SELECT '差異列數=' || count(*) || '（已處理 1＋未處理 1＋status_fixed 1）' FROM payuni_reconcile_diffs;
ROLLBACK;
SQL
echo "== orders 被 ACCESS EXCLUSIVE 鎖住時從零套用（不應受影響）"
q -f "$RB" >/dev/null
P -d "$DB" -c "BEGIN; LOCK TABLE orders IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== payment_transactions 被讀鎖 15 秒時套用（應約 3 秒失敗、無部分變更）"
q -f "$RB" >/dev/null
P -d "$DB" -c "BEGIN; SELECT id FROM payment_transactions LIMIT 1; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" > /tmp/w6_timed.out 2>&1; rc=$?; e=$(date +%s%N)
grep -m1 ERROR /tmp/w6_timed.out; echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== 鎖釋放後再套用"; q -f "$M" && echo ok; echo "$(state)"
echo "== rollback → 再套用"; q -f "$RB" && echo "rollback ok；$(state)"; q -f "$M" && echo "再套用 ok；$(state)"
P -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null
