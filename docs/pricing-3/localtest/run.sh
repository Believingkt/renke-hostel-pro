#!/usr/bin/env bash
# update_order_fields_v1 加 pricing_template_id：本機完整循環（前置：pricing-2 的 pbase 已建好且含 20261026090000）
set -uo pipefail
REPO=/app; D=$REPO/docs/pricing-3; L=$D/localtest
NEW=$REPO/supabase/migrations/20261027090000_update_order_fields_pricing_template.sql
P() { sudo -u postgres psql -X -q "$@"; }
SIG="'public.update_order_fields_v1(uuid, jsonb, text, text)'::regprocedure"
P -d postgres -c "DROP DATABASE IF EXISTS pt3" -c "CREATE DATABASE pt3 TEMPLATE pbase" > /dev/null
P -d pt3 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
echo "== 1. precheck"; P -d pt3 -At -F' | ' -f "$D/precheck_20261027090000.sql"
P -d pt3 -At -c "SELECT pg_get_functiondef($SIG)" > "$L/def_before.sql"
P -d pt3 -At -c "SELECT md5(prosrc) || ' ' || COALESCE(array_to_string(proacl, ','), '-') || ' ' || prosecdef FROM pg_proc WHERE oid = $SIG" > "$L/meta_before.txt"
echo "== 2. 套用"; P -d pt3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
P -d pt3 -At -c "SELECT pg_get_functiondef($SIG)" > "$L/def_after.sql"
echo "== 3. postcheck"; P -d pt3 -At -F' | ' -f "$D/postcheck_20261027090000.sql"
echo "去掉兩處後指紋等於套用前：$( [ "$(P -d pt3 -At -f "$D/postcheck_20261027090000.sql" | tail -1 | cut -d'|' -f1)" = "$(cut -d' ' -f1 "$L/meta_before.txt")" ] && echo t || echo f)"
echo "== 4. 套用前後函式 diff"; diff -u "$L/def_before.sql" "$L/def_after.sql" > "$L/def_apply.diff"; cat "$L/def_apply.diff"
echo "== 5. 重複套用必須被擋"; OUT=$(P -d pt3 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1); echo "$OUT" | grep -m1 -o "PRECHECK 失敗.*" || echo "（未被擋下）"
echo "== 6. 功能測試"; P -d pt3 -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)"
echo "== 7. rollback"; P -d pt3 -v ON_ERROR_STOP=1 -f "$D/rollback_20261027090000.sql" > /dev/null && echo "rollback 成功"
P -d pt3 -At -c "SELECT pg_get_functiondef($SIG)" > "$L/def_rolledback.sql"
P -d pt3 -At -c "SELECT md5(prosrc) || ' ' || COALESCE(array_to_string(proacl, ','), '-') || ' ' || prosecdef FROM pg_proc WHERE oid = $SIG" > "$L/meta_rolledback.txt"
echo "rollback 後函式定義與套用前完全相同：$(diff -q "$L/def_before.sql" "$L/def_rolledback.sql" > /dev/null && echo t || echo f)"
echo "rollback 後內容指紋／權限／SECURITY 與套用前相同：$(diff -q "$L/meta_before.txt" "$L/meta_rolledback.txt" > /dev/null && echo t || echo f)"
echo "rollback 後 precheck："; P -d pt3 -At -F' | ' -f "$D/precheck_20261027090000.sql" | head -7
echo "== 8. 再套用＋功能測試"; P -d pt3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"; P -d pt3 -At -f "$L/tests.sql" 2>&1 | grep -E "^PASS [0-9]"
P -d postgres -c "DROP DATABASE pt3" > /dev/null
