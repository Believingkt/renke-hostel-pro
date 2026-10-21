#!/usr/bin/env bash
# 20261103090000 本機循環（前置：pbase）
set -uo pipefail
REPO=/app; D=$REPO/docs/venue-bonus-flags; L=$D/localtest
NEW=$REPO/supabase/migrations/20261103090000_venue_bonus_flags_source_overrides.sql
P() { sudo -u postgres psql -X -q "$@"; }
T() { P -d vb2 -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS vb2" -c "CREATE DATABASE vb2 TEMPLATE pbase" > /dev/null
P -d vb2 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
P -d vb2 -c "INSERT INTO accommodation_info (id, name, is_active) VALUES ('f8000000-0000-0000-0000-000000000001', '旅行日 台北館', true), ('f8000000-0000-0000-0000-000000000002', '旅行日 台中館', true), ('f8000000-0000-0000-0000-000000000003', '我的旅行日民宿', true)" > /dev/null
echo "== precheck"; P -d vb2 -At -F' | ' -f "$D/precheck_20261103090000.sql"
echo "== 套用"; P -d vb2 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo 套用成功
echo "== postcheck"; P -d vb2 -At -F' | ' -f "$D/postcheck_20261103090000.sql"
echo "== 重複套用必須被擋"; P -d vb2 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1 | grep -o "PRECHECK 失敗：[^（]*" | head -1
echo "== 測試"; T
echo "== rollback"; P -d vb2 -v ON_ERROR_STOP=1 -f "$D/rollback_20261103090000.sql" > /dev/null && echo rollback 成功
P -d vb2 -At -F' | ' -f "$D/precheck_20261103090000.sql" | head -3
echo "== 再套用＋postcheck＋測試"; P -d vb2 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo 再套用成功
P -d vb2 -At -F' | ' -f "$D/postcheck_20261103090000.sql" | grep -E "^[0-9]\. " | grep -c "| t$" | sed 's/$/ \/ 5 項為 t/'
T
P -d postgres -c "DROP DATABASE vb2" > /dev/null
