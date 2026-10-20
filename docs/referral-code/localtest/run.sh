#!/usr/bin/env bash
# 20261029090000 只補記推薦碼：本機完整循環（前置：pbase 已建好且含 20261027090000）
set -uo pipefail
REPO=/app; D=$REPO/docs/referral-code; L=$D/localtest
NEW=$REPO/supabase/migrations/20261029090000_referral_code_only.sql
P() { sudo -u postgres psql -X -q "$@"; }
FP="SELECT string_agg(p.proname || '=' || md5(replace(p.prosrc, E'\r', '')), ',' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname <> 'update_order_referral_code_v1'"
TG="SELECT string_agg(tgname || ':' || pg_get_triggerdef(oid), ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal"
P -d postgres -c "DROP DATABASE IF EXISTS rc1" -c "CREATE DATABASE rc1 TEMPLATE pbase" > /dev/null
P -d rc1 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
P -d rc1 -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/20261028090000_evaluate_discount_code.sql" > /dev/null && echo "== 0. 對齊正式庫：已套用 20261028090000"
echo "== 1. precheck"; P -d rc1 -At -F' | ' -f "$D/precheck_20261029090000.sql"
P -d rc1 -At -c "$FP" | md5sum > "$L/fp_before.txt"; P -d rc1 -At -c "$TG" | md5sum > "$L/tg_before.txt"
echo "== 2. 套用"; P -d rc1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 3. postcheck"; P -d rc1 -At -F' | ' -f "$D/postcheck_20261029090000.sql"
echo "public 所有既有函式（排除新函式）指紋與套用前相同：$(diff -q "$L/fp_before.txt" <(P -d rc1 -At -c "$FP" | md5sum) > /dev/null && echo t || echo f)"
echo "orders 觸發器定義與套用前相同：$(diff -q "$L/tg_before.txt" <(P -d rc1 -At -c "$TG" | md5sum) > /dev/null && echo t || echo f)"
echo "== 4. 重複套用必須被擋"; OUT=$(P -d rc1 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1); echo "$OUT" | grep -m1 -o "PRECHECK 失敗.*" || echo "（未被擋下）"
echo "== 5. 功能測試"; P -d rc1 -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"
echo "== 6. rollback"; P -d rc1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261029090000.sql" > /dev/null && echo "rollback 成功"
echo "rollback 後新函式不存在：$(P -d rc1 -At -c "SELECT to_regprocedure('public.update_order_referral_code_v1(uuid, timestamp with time zone, text, text, boolean, boolean)') IS NULL")"
echo "rollback 後 public 函式指紋與套用前相同：$(diff -q "$L/fp_before.txt" <(P -d rc1 -At -c "$FP" | md5sum) > /dev/null && echo t || echo f)"
echo "rollback 後 precheck："; P -d rc1 -At -F' | ' -f "$D/precheck_20261029090000.sql" | head -1
echo "== 7. 再套用＋功能測試"; P -d rc1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"; P -d rc1 -At -f "$L/tests.sql" 2>&1 | grep -E "^PASS [0-9]|^FAIL|ERROR"
P -d postgres -c "DROP DATABASE rc1" > /dev/null
