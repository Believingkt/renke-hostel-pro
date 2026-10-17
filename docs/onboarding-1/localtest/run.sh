#!/usr/bin/env bash
# 上架引導第一批：本機 PostgreSQL 15 整合測試
# 用法：bash docs/onboarding-1/localtest/run.sh   （SKIP_REPLAY=1 可沿用已重建的 onb1 庫）
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations"
DOCS="$REPO/docs/onboarding-1"
DB=onb1
q() { psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }

if [ "${SKIP_REPLAY:-0}" != "1" ]; then
  echo "=== 步驟 0：以 repo migrations 重建本機 DB（截至 20261017090000）"
  bash "$HERE/replay.sh" "$DB" 2>&1 | grep -v "NOTICE\|WARNING\|HINT"
fi

echo "=== 步驟 1：本機與正式庫查證結果比對（orders BEFORE INSERT 順序、pricing_templates NOT NULL 與索引）"
q -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal AND tgtype & 2 = 2 AND tgtype & 4 = 4 ORDER BY tgname"
q -c "SELECT tgname, tgfoid::regprocedure AS func FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND tgname IN ('validate_order_before_insert', 'validate_order_before_insert_trigger') ORDER BY tgname"
q -c "SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pricing_templates' AND is_nullable = 'NO' ORDER BY ordinal_position"
q -c "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pricing_templates' ORDER BY indexname"

echo "=== 步驟 2：precheck（唯讀）"
q -f "$DOCS/precheck_20261018090000.sql"
q -f "$DOCS/precheck_20261018090001.sql" | head -60

echo "=== 步驟 3：套用 migration"
q -f "$MIG/20261018090000_accommodation_is_active_guard.sql" && echo "20261018090000 套用成功"
q -f "$MIG/20261018090001_auto_template_for_packages.sql" && echo "20261018090001 套用成功"

echo "=== 步驟 4：重跑 migration，應被內建 PRECHECK 擋下"
for f in 20261018090000_accommodation_is_active_guard 20261018090001_auto_template_for_packages; do
  if q -f "$MIG/$f.sql" 2>&1; then echo "UNEXPECTED：$f 重跑成功"; else echo "EXPECTED：$f 重跑被擋下"; fi
done

echo "=== 步驟 5：postcheck（唯讀）"
q -f "$DOCS/postcheck_20261018090000.sql"
q -f "$DOCS/postcheck_20261018090001.sql"

echo "=== 步驟 6：BEGIN…ROLLBACK 測試案例"
q -f "$HERE/10_tests.sql" 2>&1 | grep -v "^ chk\|^-----\|^ $\|^(1 row)\|^$\|^ on$\|^ set_config"

echo "=== 步驟 7：測試交易已 ROLLBACK，資料未殘留"
q -c "SELECT count(*) AS leftover FROM public.accommodation_info WHERE name LIKE '測試%' OR name IN ('草稿館', '偷開賣館', '新館（未開賣）', '複製館', '複製來源館S')"

echo "=== 步驟 8：rollback"
q -f "$DOCS/rollback_20261018090001.sql" && echo "rollback 20261018090001 成功"
q -f "$DOCS/rollback_20261018090000.sql" && echo "rollback 20261018090000 成功"
q -c "SELECT to_regprocedure('public.accommodation_info_guard_is_active()') AS guard_fn, to_regprocedure('public.packages_auto_template_on_insert()') AS ins_fn, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accommodation_info_flags' AND column_name = 'auto_template_enabled') AS has_col"

echo "=== 步驟 9：rollback 後可再次套用"
q -f "$MIG/20261018090000_accommodation_is_active_guard.sql" && echo "20261018090000 再次套用成功"
q -f "$MIG/20261018090001_auto_template_for_packages.sql" && echo "20261018090001 再次套用成功"
echo "=== 全部完成"
