#!/usr/bin/env bash
# W7 migration 20261018130000 本機測試：套用、重跑、rollback、再套用、持鎖、遮罩 SQL、orders 無鎖
set -uo pipefail
REPO=/app
DB=w7mig
M=$REPO/supabase/migrations/20261018130000_payuni_refunds.sql
RB=$REPO/docs/payuni-w7/rollback_20261018130000.sql
q() { psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB TEMPLATE hq3"
q -f "$RB" >/dev/null
state() { q -At -c "SELECT '新欄位數=' || (SELECT count(*) FROM information_schema.columns WHERE table_name='payment_transactions' AND column_name IN ('parent_tx_id','refund_source','refund_pending_reason'))
  || '；新表存在=' || (to_regclass('public.refund_bank_accounts') IS NOT NULL)
  || '；索引=' || coalesce((SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE indexname IN ('payment_transactions_parent_tx_id_idx','refund_bank_accounts_order_id_idx')), '無')
  || '；refund_bank_accounts 指向 orders 的 FK 數=' || (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=to_regclass('public.refund_bank_accounts') AND confrelid='public.orders'::regclass)
  || '；指向 payment_transactions 的 FK 數=' || (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=to_regclass('public.refund_bank_accounts') AND confrelid='public.payment_transactions'::regclass)"; }
echo "== 初始（已 rollback）：$(state)"
echo "== 套用"; q -f "$M" && echo ok; echo "$(state)"
echo "== RLS／權限"
q -At -c "SELECT 'rls=' || relrowsecurity || '；policy 數=' || (SELECT count(*) FROM pg_policies WHERE tablename='refund_bank_accounts') FROM pg_class WHERE relname='refund_bank_accounts'"
q -At -c "SELECT 'anon 有 SELECT=' || has_table_privilege('anon','public.refund_bank_accounts','SELECT') || '；authenticated 有 SELECT=' || has_table_privilege('authenticated','public.refund_bank_accounts','SELECT') || '；service_role 有 SELECT=' || has_table_privilege('service_role','public.refund_bank_accounts','SELECT')"
echo "== 重跑（IF NOT EXISTS）"; q -f "$M" 2>&1 | grep -c NOTICE | sed 's/^/NOTICE 數=/'; echo "exit=${PIPESTATUS[0]}"; echo "$(state)"
echo "== 交易內持有的高頻表鎖（COMMIT 前，rollback 狀態下量）"
q -f "$RB" >/dev/null
sed '$d' "$M" > /tmp/w7_inspect.sql
cat >> /tmp/w7_inspect.sql <<'SQL'
SELECT c.relname || ' ' || string_agg(DISTINCT l.mode, ',') FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation' AND c.relname IN ('orders','payment_transactions','accommodation_info')
GROUP BY c.relname ORDER BY 1;
ROLLBACK;
SQL
q -At -f /tmp/w7_inspect.sql
echo "== 另一連線以 ACCESS EXCLUSIVE 鎖住 orders 時從零套用（不應受影響）"
q -f "$RB" >/dev/null
psql -X -q -U postgres -d "$DB" -c "BEGIN; LOCK TABLE orders IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(8); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" >/dev/null 2>&1; rc=$?; e=$(date +%s%N)
echo "orders 被 ACCESS EXCLUSIVE 鎖住時：exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== 另一連線持有 payment_transactions 讀鎖 15 秒時套用（應約 3 秒失敗、無部分變更）"
q -f "$RB" >/dev/null
psql -X -q -U postgres -d "$DB" -c "BEGIN; SELECT id FROM payment_transactions LIMIT 1; SELECT pg_sleep(15); COMMIT;" >/dev/null 2>&1 &
sleep 1; s=$(date +%s%N); q -f "$M" > /tmp/w7_timed.out 2>&1; rc=$?; e=$(date +%s%N)
grep -m1 ERROR /tmp/w7_timed.out; echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms；$(state)"; wait
echo "== 鎖釋放後再套用"; q -f "$M" && echo ok; echo "$(state)"
echo "== rollback → 再套用"; q -f "$RB" && echo "rollback ok；$(state)"; q -f "$M" && echo "再套用 ok；$(state)"
echo "== 遮罩 SQL 試跑（帳號留末 4 碼、戶名留第一字＋**）"
q -At <<'SQL'
BEGIN;
INSERT INTO refund_bank_accounts (order_id, bank_code, account_no, holder_name, purge_after)
VALUES (gen_random_uuid(), '812', '1234567890128901', '王小明', now() - interval '1 day'),
       (gen_random_uuid(), '700', '00012345678', '陳大文', NULL);
UPDATE refund_bank_accounts
SET account_no = repeat('*', greatest(length(account_no) - 4, 0)) || right(account_no, 4),
    holder_name = left(holder_name, 1) || '**',
    purged_at = now()
WHERE purge_after <= now() AND purged_at IS NULL;
SELECT bank_code || ' ' || account_no || ' ' || holder_name || ' purged=' || (purged_at IS NOT NULL) FROM refund_bank_accounts ORDER BY bank_code;
ROLLBACK;
SQL
echo "== bank_code 格式檢查"
q -c "INSERT INTO refund_bank_accounts (order_id, bank_code, account_no, holder_name) VALUES (gen_random_uuid(), '81', '1', 'x')" 2>&1 | grep -m1 -o 'violates check constraint "[a-z_]*"'
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB"
