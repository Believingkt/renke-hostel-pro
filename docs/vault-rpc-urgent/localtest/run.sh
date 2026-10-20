#!/usr/bin/env bash
# 20261102100000 本機完整循環（前置：pbase，見 docs/definer-rpc-a/localtest/build_pbase.sh）
set -uo pipefail
REPO=/app; D=$REPO/docs/vault-rpc-urgent; L=$D/localtest
NEW=$REPO/supabase/migrations/20261102100000_revoke_vault_rpc_urgent.sql
P() { sudo -u postgres psql -X -q "$@"; }
SB=sandbox_exec_dmafqwfynatdvnaeovhz
PROD='{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_dmafqwfynatdvnaeovhz=X/postgres}'
FIVE="'claim_hotelnabe_ari_push_batch','gbp_vault_get','gbp_vault_set','get_ai_ops_metrics','get_rpc_contract'"
ACLTXT="SELECT string_agg(p.proname || ' ' || p.proacl::text, E'\n' ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($FIVE)"
SAME="SELECT count(*) FILTER (WHERE p.proacl::text = '$PROD') || ' / 5 支 proacl 文字與正式庫原狀完全相同' FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($FIVE)"
FPS="SELECT md5(string_agg(p.oid::regprocedure::text || md5(replace(p.prosrc, E'\r', '')) || p.prosecdef, ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace"
T() { P -d da4 -At -v POST="$1" -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS da4" -c "CREATE DATABASE da4 TEMPLATE pbase" > /dev/null
P -d da4 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
echo "== 0. 對齊正式庫授權（含建立 $SB）"
P -d da4 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$SB') THEN CREATE ROLE $SB NOLOGIN; END IF; END \$\$" > /dev/null
P -d da4 -At -c "SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($FIVE)" | while read -r f; do
  P -d da4 -c "REVOKE ALL ON FUNCTION $f FROM PUBLIC, anon, authenticated, service_role, $SB" -c "GRANT EXECUTE ON FUNCTION $f TO anon, authenticated, service_role, $SB" > /dev/null; done
P -d da4 -At -c "$SAME"; S0=$(P -d da4 -At -c "$FPS")
echo "== 1. 套用前測試"; T false
echo "== 2. precheck"; P -d da4 -At -F' | ' -f "$D/precheck_20261102100000.sql"
echo "== 3. 套用"; P -d da4 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 4. postcheck"; P -d da4 -At -F' | ' -f "$D/postcheck_20261102100000.sql"
echo "public 全部函式指紋與套用前相同：$([ "$(P -d da4 -At -c "$FPS")" = "$S0" ] && echo t || echo f)"
echo "== 5. 重複套用（權限已收回）"; P -d da4 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "重複套用成功"
echo "== 5b. 模擬同事已在後台手動收回其中 2 支後再套用"
P -d da4 -c "GRANT EXECUTE ON FUNCTION public.gbp_vault_get(text) TO anon" -c "REVOKE EXECUTE ON FUNCTION public.get_rpc_contract(text[]) FROM service_role" > /dev/null
P -d da4 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "部分手動變更後套用成功；postcheck t 數：$(P -d da4 -At -F' | ' -f "$D/postcheck_20261102100000.sql" | grep -E '^[0-9]\. ' | grep -c '| t$') / 5"
echo "== 6. 套用後測試"; T true
echo "== 7. rollback"; P -d da4 -v ON_ERROR_STOP=1 -f "$D/rollback_20261102100000.sql" > /dev/null && echo "rollback 成功"
P -d da4 -At -c "$SAME"; P -d da4 -At -c "$ACLTXT"
echo "== 8. rollback 後測試"; T false
echo "== 9. 再套用＋postcheck＋測試"; P -d da4 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
echo "postcheck t 數：$(P -d da4 -At -F' | ' -f "$D/postcheck_20261102100000.sql" | grep -E '^[0-9]\. ' | grep -c '| t$') / 5"
T true
P -d postgres -c "DROP DATABASE da4" > /dev/null
