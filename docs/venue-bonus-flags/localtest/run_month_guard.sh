#!/usr/bin/env bash
# 20261104090000 本機循環（前置：pbase；先套 20261103090000）
set -uo pipefail
REPO=/app; D=$REPO/docs/venue-bonus-flags; L=$D/localtest
PREV=$REPO/supabase/migrations/20261103090000_venue_bonus_flags_source_overrides.sql
NEW=$REPO/supabase/migrations/20261104090000_venue_source_override_month_guard.sql
P() { sudo -u postgres psql -X -q "$@"; }
T() { P -d vb3 -At -f "$L/tests_month_guard.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS vb3" -c "CREATE DATABASE vb3 TEMPLATE pbase" > /dev/null
P -d vb3 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
P -d vb3 -c "INSERT INTO accommodation_info (id, name, is_active) VALUES ('f8000000-0000-0000-0000-000000000001', '旅行日 台北館', true), ('f8000000-0000-0000-0000-000000000002', '旅行日 台中館', true), ('f8000000-0000-0000-0000-000000000003', '我的旅行日民宿', true)" > /dev/null
P -d vb3 -v ON_ERROR_STOP=1 -f "$PREV" > /dev/null && echo 前置 20261103090000 套用成功
echo "== precheck"; P -d vb3 -At -F' | ' -f "$D/precheck_20261104090000.sql"
echo "== 套用"; P -d vb3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo 套用成功
echo "== postcheck"; P -d vb3 -At -F' | ' -f "$D/postcheck_20261104090000.sql"
echo "== 重複套用必須被擋"; P -d vb3 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1 | grep -o "PRECHECK 失敗：[^（]*" | head -1
echo "== 測試"; T
echo "== 20261103090000 原測試（O02 補登過去月份預期改為 FAIL，其餘 PASS）"; P -d vb3 -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"
echo "== rollback"; P -d vb3 -v ON_ERROR_STOP=1 -f "$D/rollback_20261104090000.sql" > /dev/null && echo rollback 成功
P -d vb3 -At -F' | ' -f "$D/precheck_20261104090000.sql" | head -4
echo "== rollback 後 20261103090000 原測試應全 PASS"; P -d vb3 -At -f "$L/tests.sql" 2>&1 | grep -E "^PASS [0-9]|^FAIL|ERROR"
echo "== 再套用＋postcheck＋測試"; P -d vb3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo 再套用成功
P -d vb3 -At -F' | ' -f "$D/postcheck_20261104090000.sql" | grep -c "| t$" | sed 's/$/ \/ 5 項為 t/'
T | tail -1
P -d postgres -c "DROP DATABASE vb3" > /dev/null
