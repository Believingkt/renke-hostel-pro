#!/usr/bin/env bash
# 20261105090000 本機循環（前置：pbase）
set -uo pipefail
REPO=/app; D=$REPO/docs/owner-pricing-backfill; L=$D/localtest
NEW=$REPO/supabase/migrations/20261105090000_owner_pricing_rule_backfill_log.sql
P() { sudo -u postgres psql -X -q "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS opb" -c "CREATE DATABASE opb TEMPLATE pbase" > /dev/null
P -d opb -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
if P -d opb -tAc "SELECT to_regclass('public.owner_pricing_rule_date_logs') IS NOT NULL" | grep -q t; then
  P -d opb -v ON_ERROR_STOP=1 -f "$D/rollback_20261105090000.sql" > /dev/null && echo "基準含新 migration，先 rollback"
fi
echo "== precheck"; P -d opb -At -f "$D/precheck_20261105090000.sql" | head -8
P -d opb -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 重複套用（預期 PRECHECK 擋）"; P -d opb -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
echo "== postcheck"; P -d opb -At -f "$D/postcheck_20261105090000.sql"
echo "== 測試"; P -d opb -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"
echo "== rollback"; P -d opb -v ON_ERROR_STOP=1 -f "$D/rollback_20261105090000.sql" > /dev/null && echo "rollback 成功"
P -d opb -At -c "SELECT count(*) FROM pg_policy WHERE polrelid = 'public.owner_settlement_pricing_rules'::regclass" -c "SELECT to_regclass('public.owner_pricing_rule_date_logs') IS NULL"
P -d opb -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
P -d postgres -c "DROP DATABASE opb" > /dev/null
