#!/usr/bin/env bash
# 上架精靈 migration 鎖測試
#  A. 每支 migration 在 COMMIT 前列出本交易持有的資料表鎖（只看高頻表），量測持鎖到 COMMIT 的時間
#  B. 另一連線持有 accommodation_info 的鎖（開著交易讀一列）時：120000 應約 3 秒內 lock timeout 失敗、資料庫無任何改動
#  C. 同樣情況下 120001、120002 不需要高頻表的鎖，應正常套用
#  D. 回填不改既有館的 updated_at
set -uo pipefail
REPO=/app
DB=wzlock
q() { psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
M0=$REPO/supabase/migrations/20261018120000_onboarding_wizard_state.sql
M1=$REPO/supabase/migrations/20261018120001_onboarding_wizard_rpcs.sql
M2=$REPO/supabase/migrations/20261018120002_m3_first_activation_guard.sql
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB TEMPLATE hq3"
q -f "$REPO/docs/onboarding-3/localtest/seed_venues.sql"
q -c "SET session_replication_role = replica; UPDATE accommodation_info SET updated_at = '2026-01-01 00:00+00'" >/dev/null

LOCKQ="SELECT c.relname || ' ' || string_agg(l.mode, ',' ORDER BY l.mode) FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
WHERE l.pid = pg_backend_pid() AND l.locktype = 'relation'
  AND c.relname IN ('accommodation_info','orders','room_types','accommodation_packages','room_inventory_pricing','accommodation_onboarding_steps')
GROUP BY c.relname ORDER BY 1;"

inspect() {  # $1 檔案：把最後的 COMMIT 換成「列出鎖＋ROLLBACK」
  sed '$d' "$1" > /tmp/lock_inspect.sql
  { echo "\\echo '--- 持有的高頻表鎖'"; echo "$LOCKQ"; echo "ROLLBACK;"; } >> /tmp/lock_inspect.sql
  q -At -f /tmp/lock_inspect.sql 2>&1 | grep -v "^$" || echo "（無）"
}
holder() {  # 另一連線：開交易讀 accommodation_info 一列並保持 $1 秒（持有 ACCESS SHARE 鎖）
  psql -X -q -U postgres -d "$DB" -c "BEGIN; SELECT id FROM accommodation_info LIMIT 1; SELECT pg_sleep($1); COMMIT;" >/dev/null 2>&1 &
  sleep 1
}
timed() { local s=$(date +%s%N); q -f "$1" > /tmp/timed.out 2>&1; local rc=$?; local e=$(date +%s%N); grep -m1 "ERROR" /tmp/timed.out; echo "exit=$rc 耗時=$(( (e - s) / 1000000 )) ms"; }
state() { q -At -c "SELECT 'first_activated_at 欄位存在=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accommodation_info' AND column_name='first_activated_at')
  || '；return_reason 欄位存在=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accommodation_onboarding_steps' AND column_name='return_reason')
  || '；guard trigger 存在=' || EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_onboarding_steps_guard_review')
  || '；status check 含 submitted=' || (SELECT pg_get_constraintdef(oid) LIKE '%submitted%' FROM pg_constraint WHERE conname='accommodation_onboarding_steps_status_check')
  || '；updated_at 被改的館數=' || (SELECT count(*) FROM accommodation_info WHERE updated_at <> '2026-01-01 00:00+00')"; }

echo "===== A0. 120000 持有的鎖（COMMIT 前）====="; inspect "$M0"
echo; echo "===== B. 另一連線持有 accommodation_info 鎖時套用 120000 ====="
echo "套用前：$(state)"
holder 15; timed "$M0"
echo "失敗後：$(state)"
wait
echo; echo "===== B2. 鎖釋放後重新套用 120000（等同 Re-run）====="; timed "$M0"; echo "套用後：$(state)"
echo; echo "===== A1. 120001 持有的鎖（COMMIT 前）====="; inspect "$M1"
echo; echo "===== C1. 另一連線持有 accommodation_info 鎖時套用 120001 ====="; holder 10; timed "$M1"; wait
echo; echo "===== A2. 120002 持有的鎖（COMMIT 前）====="; inspect "$M2"
echo; echo "===== C2. 另一連線持有 accommodation_info 鎖時套用 120002 ====="; holder 10; timed "$M2"; wait
echo; echo "===== D. 最終狀態 ====="; echo "$(state)"
echo; echo "===== E. 120000 交易內持鎖時間（ADD COLUMN 到 COMMIT）====="
q -c "DROP DATABASE IF EXISTS wzlock2" -d postgres >/dev/null 2>&1; psql -X -q -U postgres -d postgres -c "CREATE DATABASE wzlock2 TEMPLATE hq3"
psql -X -q -U postgres -d wzlock2 -f "$REPO/docs/onboarding-3/localtest/seed_venues.sql"
awk '/^ALTER TABLE public.accommodation_info ADD COLUMN/{print "SELECT clock_timestamp() AS t0 \\gset"} {print} /^COMMIT;$/{print "SELECT round(extract(epoch FROM clock_timestamp() - :'"'"'t0'"'"'::timestamptz) * 1000) || '"'"' ms'"'"' AS 持鎖時間;"}' "$M0" > /tmp/m0_timed.sql
psql -X -q -U postgres -d wzlock2 -v ON_ERROR_STOP=1 -At -f /tmp/m0_timed.sql | tail -1
