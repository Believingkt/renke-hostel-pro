#!/usr/bin/env bash
# 20261018090002 本機測試（需先跑過 run.sh，onb1 庫已套用 20261018090000／0001）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DOCS="$REPO/docs/onboarding-1"
MIG="$REPO/supabase/migrations/20261018090002_auto_template_price_fallback.sql"
q() { psql -X -q -U postgres -d onb1 -v ON_ERROR_STOP=1 "$@"; }
echo "=== 1. precheck（唯讀）"; q -f "$DOCS/precheck_20261018090002.sql"
echo "=== 2. 改前（20261018090001 版本）跑測試"; q -f "$HERE/11_price_fallback_tests.sql"
echo "=== 3. 套用 20261018090002"; q -f "$MIG" && echo "套用成功"
echo "=== 4. 重跑應被 PRECHECK 擋下"; if q -f "$MIG" 2>&1; then echo "UNEXPECTED：重跑成功"; else echo "EXPECTED：重跑被擋下"; fi
echo "=== 5. postcheck（唯讀）"; q -f "$DOCS/postcheck_20261018090002.sql"
echo "=== 6. 改後跑測試"; q -f "$HERE/11_price_fallback_tests.sql"
echo "=== 7. 第一批 49 案例回歸"; q -f "$HERE/10_tests.sql" 2>&1 | grep -A2 "pass | fail"
echo "=== 8. rollback"; q -f "$DOCS/rollback_20261018090002.sql" && echo "rollback 成功（md5 已比對為 0001 版本）"
echo "=== 9. rollback 後再次套用"; q -f "$MIG" && echo "再次套用成功"
