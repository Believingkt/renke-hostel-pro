#!/usr/bin/env bash
# 20261031090000：本機完整循環（前置：pbase 已建好）
set -uo pipefail
REPO=/app; D=$REPO/docs/order-rpc-guard; L=$D/localtest
NEW=$REPO/supabase/migrations/20261031090000_order_rpc_guard.sql
P() { sudo -u postgres psql -X -q "$@"; }
FP="SELECT string_agg(p.proname || '=' || md5(replace(p.prosrc, E'\r', '')), ',' ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'change_order_dates'"
COD="SELECT md5(replace(prosrc, E'\r', '')) FROM pg_proc WHERE proname = 'change_order_dates'"
T() { P -d gd1 -At -v POST="$1" -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS gd1" -c "CREATE DATABASE gd1 TEMPLATE pbase" > /dev/null
P -d gd1 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
P -d gd1 -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/20261030090000_revoke_order_context_rpc.sql" > /dev/null && echo "== 0a. 已套用 20261030090000（正式庫已上線）"
echo "== 0b. 對齊正式庫授權：7 支函式 anon 可執行"
for f in "admin_delete_order(uuid, text)" "attach_trip_products_to_recent_order(jsonb, uuid)" "clear_order_room_pricing_template(uuid)" "sync_order_rooms_v1(uuid, timestamp with time zone, jsonb)" "update_order_fields_v1(uuid, jsonb, text, text)" "update_paid_order_addons_v3(uuid, timestamp with time zone, text, text, boolean, jsonb, integer, text, integer, boolean, boolean, boolean)" "update_paid_order_discount_v2(uuid, timestamp with time zone, text, text, integer, text, boolean, text, integer, boolean)"; do P -d gd1 -c "GRANT EXECUTE ON FUNCTION public.$f TO PUBLIC, anon"; done
P -d gd1 -At -c "$FP" | md5sum > "$L/fp_before.txt"; P -d gd1 -At -c "$COD" > "$L/cod_before.txt"
echo "== 1. 套用前測試"; T false
echo "== 2. precheck"; P -d gd1 -At -F' | ' -f "$D/precheck_20261031090000.sql"
echo "== 3. 套用"; P -d gd1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 4. postcheck"; P -d gd1 -At -F' | ' -f "$D/postcheck_20261031090000.sql"
echo "其他所有 public 函式指紋與套用前相同：$(diff -q "$L/fp_before.txt" <(P -d gd1 -At -c "$FP" | md5sum) > /dev/null && echo t || echo f)"
echo "== 5. 重複套用必須被擋"; OUT=$(P -d gd1 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1); echo "$OUT" | grep -m1 -o "PRECHECK 失敗.*" || echo "（未被擋下）"
echo "== 6. 套用後測試"; T true
echo "== 7. rollback"; P -d gd1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261031090000.sql" > /dev/null && echo "rollback 成功"
echo "rollback 後 change_order_dates 指紋等於套用前：$([ "$(P -d gd1 -At -c "$COD")" = "$(cat "$L/cod_before.txt")" ] && echo t || echo f)"
echo "rollback 後其他函式指紋與套用前相同：$(diff -q "$L/fp_before.txt" <(P -d gd1 -At -c "$FP" | md5sum) > /dev/null && echo t || echo f)"
echo "== 8. rollback 後測試（回到套用前行為）"; T false
echo "== 9. 再套用＋測試"; P -d gd1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"; T true
P -d postgres -c "DROP DATABASE gd1" > /dev/null
