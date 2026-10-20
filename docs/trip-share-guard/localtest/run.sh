#!/usr/bin/env bash
# 20261102090000：本機完整循環（前置：bash docs/definer-rpc-a/localtest/build_pbase.sh 建好 pbase，含已上線的 20261101090000）
set -uo pipefail
REPO=/app; D=$REPO/docs/trip-share-guard; L=$D/localtest
NEW=$REPO/supabase/migrations/20261102090000_trip_share_guard_hotelnabe_revoke.sql
P() { sudo -u postgres psql -X -q "$@"; }
SB=sandbox_exec_dmafqwfynatdvnaeovhz
ACL="SELECT md5(string_agg(x, ',' ORDER BY x)) FROM (SELECT p.oid::regprocedure::text || ':' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type AS x FROM pg_proc p, aclexplode(p.proacl) a WHERE p.proname IN ('ensure_trip_share_slug', '_hotelnabe_enqueue_days')) s"
FPSCHEMA="SELECT md5(string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')) || p.prosecdef || COALESCE(p.proconfig::text, ''), ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace"
FPOTHER="SELECT md5(string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')) || p.prosecdef, ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname <> 'ensure_trip_share_slug'"
T() { P -d da3 -At -v POST="$1" -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
P -d postgres -c "DROP DATABASE IF EXISTS da3" -c "CREATE DATABASE da3 TEMPLATE pbase" > /dev/null
P -d da3 -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null
echo "== 0. 對齊正式庫授權（含 $SB）"
P -d da3 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$SB') THEN CREATE ROLE $SB NOLOGIN; END IF; END \$\$" \
  -c "REVOKE ALL ON FUNCTION public.ensure_trip_share_slug(uuid) FROM PUBLIC, anon, authenticated, service_role" \
  -c "GRANT EXECUTE ON FUNCTION public.ensure_trip_share_slug(uuid) TO PUBLIC, anon, authenticated, service_role, $SB" \
  -c "REVOKE ALL ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) FROM PUBLIC, anon, authenticated, service_role" \
  -c "GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) TO authenticated, service_role, $SB" > /dev/null
P -d da3 -At -c "SELECT p.proname || ' ' || p.proacl::text || ' ' || md5(replace(p.prosrc, E'\r', '')) FROM pg_proc p WHERE p.proname IN ('ensure_trip_share_slug', '_hotelnabe_enqueue_days') ORDER BY 1"
ACL0=$(P -d da3 -At -c "$ACL"); S0=$(P -d da3 -At -c "$FPSCHEMA"); O0=$(P -d da3 -At -c "$FPOTHER")
echo "== 1. 套用前測試（漏洞重現）"; T false
echo "== 2. precheck"; P -d da3 -At -F' | ' -f "$D/precheck_20261102090000.sql"
echo "== 3. 套用"; P -d da3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 4. postcheck"; P -d da3 -At -F' | ' -f "$D/postcheck_20261102090000.sql"
echo "ensure_trip_share_slug 以外的 public 函式指紋與套用前相同：$([ "$(P -d da3 -At -c "$FPOTHER")" = "$O0" ] && echo t || echo f)"
echo "== 5. 重複套用必須被擋"; P -d da3 -v ON_ERROR_STOP=1 -f "$NEW" 2>&1 | grep -o "PRECHECK 失敗：[^,]*指紋" | head -1
echo "== 6. 套用後測試"; T true
echo "== 7. rollback"; P -d da3 -v ON_ERROR_STOP=1 -f "$D/rollback_20261102090000.sql" > /dev/null && echo "rollback 成功"
echo "rollback 後兩支授權與套用前（正式庫原狀）完全相同：$([ "$(P -d da3 -At -c "$ACL")" = "$ACL0" ] && echo t || echo f)"
echo "rollback 後 public 全部函式（內容＋DEFINER＋search_path）與套用前相同：$([ "$(P -d da3 -At -c "$FPSCHEMA")" = "$S0" ] && echo t || echo f)"
echo "rollback 後 precheck 第 1 段："; P -d da3 -At -F' | ' -f "$D/precheck_20261102090000.sql" | grep -E "^[0-9]+\. " | grep -c "| t$" | sed 's/$/ \/ 10 項為 t/'
echo "== 8. rollback 後測試（回到套用前行為）"; T false
echo "== 9. 再套用＋postcheck＋測試"; P -d da3 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
P -d da3 -At -F' | ' -f "$D/postcheck_20261102090000.sql" | grep -E "^[0-9]+\. " | grep -c "| t$" | sed 's/$/ \/ 9 項為 t/'
T true
P -d postgres -c "DROP DATABASE da3" > /dev/null
