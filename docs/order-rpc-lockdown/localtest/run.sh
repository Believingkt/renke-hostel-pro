#!/usr/bin/env bash
# 20261030090000：本機完整循環（前置：pbase 已建好）
set -uo pipefail
REPO=/app; D=$REPO/docs/order-rpc-lockdown; L=$D/localtest
NEW=$REPO/supabase/migrations/20261030090000_revoke_order_context_rpc.sql
P() { sudo -u postgres psql -X -q "$@"; }
U="public.update_order_with_context(uuid, jsonb, text, text, text, text, jsonb, jsonb)"; C="public.change_order_dates(uuid, date, date, text, text, text)"
FP="SELECT string_agg(p.proname || '=' || md5(replace(p.prosrc, E'\r', '')), ',' ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace"
T() { P -d lk1 -At -v PHASE="$1" -v EXP_U_ANON="$2" -v EXP_U_AUTH="$3" -v EXP_C_ANON="$4" -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS lk1" -c "CREATE DATABASE lk1 TEMPLATE pbase" > /dev/null
P -d lk1 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
echo "== 0. 對齊正式庫授權（anon、authenticated 可執行兩支函式）"
P -d lk1 -c "GRANT EXECUTE ON FUNCTION $U TO PUBLIC, anon, authenticated" -c "GRANT EXECUTE ON FUNCTION $C TO PUBLIC, anon"
P -d lk1 -At -c "SELECT oid::regprocedure || ' ' || proacl::text FROM pg_proc WHERE proname IN ('update_order_with_context','change_order_dates') ORDER BY 1"
P -d lk1 -At -c "$FP" | md5sum > "$L/fp_before.txt"
echo "== 1. 套用前測試（對齊正式庫：anon、authenticated 都能呼叫＝漏洞重現）"; T 套用前 OK OK OK
echo "== 2. precheck"; P -d lk1 -At -F' | ' -f "$D/precheck_20261030090000.sql"
echo "== 3. 套用"; P -d lk1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 4. postcheck"; P -d lk1 -At -F' | ' -f "$D/postcheck_20261030090000.sql"
echo "public 所有函式內容指紋與套用前相同：$(diff -q "$L/fp_before.txt" <(P -d lk1 -At -c "$FP" | md5sum) > /dev/null && echo t || echo f)"
echo "== 5. 套用後測試"; T 套用後 DENIED DENIED DENIED
echo "== 6. rollback"; P -d lk1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261030090000.sql" > /dev/null && echo "rollback 成功"
P -d lk1 -At -c "SELECT oid::regprocedure || ' ' || proacl::text FROM pg_proc WHERE proname IN ('update_order_with_context','change_order_dates') ORDER BY 1"
echo "== 7. rollback 後測試（回到套用前行為）"; T rollback後 OK OK OK
echo "== 8. 再套用"; P -d lk1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"; T 再套用後 DENIED DENIED DENIED
P -d postgres -c "DROP DATABASE lk1" > /dev/null
