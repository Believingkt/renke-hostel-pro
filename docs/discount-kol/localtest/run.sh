#!/usr/bin/env bash
# 20261028090000_evaluate_discount_code：本機完整循環（前置：pbase 已建好且含 20261027090000）
set -uo pipefail
REPO=/app; D=$REPO/docs/discount-kol; L=$D/localtest
NEW=$REPO/supabase/migrations/20261028090000_evaluate_discount_code.sql
P() { sudo -u postgres psql -X -q "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS dk1" -c "CREATE DATABASE dk1 TEMPLATE pbase" > /dev/null
P -d dk1 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
P -d dk1 -q -c "UPDATE discount_codes SET used_count = 7 WHERE code = 'PV2KOL1'" > /dev/null
echo "== 1. precheck"; P -d dk1 -At -F' | ' -f "$D/precheck_20261028090000.sql"
P -d dk1 -At -f "$D/precheck_20261028090000.sql" | tail -1 > "$L/before.txt"
P -d dk1 -At -c "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'sync_discount_code_used_count'" > "$L/sync_before.txt"
echo "== 2. 套用"; P -d dk1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 3. postcheck"; P -d dk1 -At -F' | ' -f "$D/postcheck_20261028090000.sql"
echo "使用次數指紋與 validate_discount_code 指紋與套用前相同：$(diff -q "$L/before.txt" <(P -d dk1 -At -f "$D/postcheck_20261028090000.sql" | sed -n 8p) > /dev/null && echo t || echo f)"
echo "== 4. 重複套用必須被擋"; OUT=$(P -d dk1 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1); echo "$OUT" | grep -m1 -o "PRECHECK 失敗.*" || echo "（未被擋下）"
echo "== 5. 功能測試"; P -d dk1 -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL|ROLE)|ERROR"
echo "== 6. rollback"; P -d dk1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261028090000.sql" > /dev/null && echo "rollback 成功"
echo "rollback 後 sync 函式與套用前相同：$(diff -q "$L/sync_before.txt" <(P -d dk1 -At -c "SELECT md5(prosrc) FROM pg_proc WHERE proname = 'sync_discount_code_used_count'") > /dev/null && echo t || echo f)"
echo "rollback 後 precheck："; P -d dk1 -At -F' | ' -f "$D/precheck_20261028090000.sql" | head -6
echo "== 7. 再套用＋功能測試"; P -d dk1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"; P -d dk1 -At -f "$L/tests.sql" 2>&1 | grep -E "^PASS [0-9]|^FAIL|ERROR"
P -d postgres -c "DROP DATABASE dk1" > /dev/null
