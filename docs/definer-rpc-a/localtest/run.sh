#!/usr/bin/env bash
# 20261101090000：本機完整循環（前置：pbase＝hq3＋20261018120000～20261031090000 全部 migration）
set -uo pipefail
REPO=/app; D=$REPO/docs/definer-rpc-a; L=$D/localtest
NEW=$REPO/supabase/migrations/20261101090000_revoke_definer_rpc_a.sql
P() { sudo -u postgres psql -X -q "$@"; }
A19="'_hotelnabe_enqueue_days','acquire_group_buy_payment_hold','bulk_upsert_room_inventory_pricing','cleanup_old_error_logs','cleanup_old_monitoring_logs','consume_trip_product_stock','convert_group_buy_payment_draft','delete_group_buy_campaign','gbp_save_accommodation_oauth_client_secret','gbp_vault_delete','import_ryoan_order_bypass','increment_member_push_badge','recalc_course_profit_payouts','scan_stuck_group_buy_paid_drafts','seed_app_review_account','verify_accommodation_ai_api_key','verify_accommodation_api_key','verify_owlting_service_account'"
ALL28="$A19,'ensure_trip_share_slug','delete_package_season','delete_pricing_template_group','set_discount_code_template_groups','set_pricing_template_group_members','wizard_open_inventory','wizard_save_basic_info','wizard_save_package','wizard_save_room_type'"
ACL="SELECT md5(string_agg(x, ',' ORDER BY x)) FROM (SELECT p.oid::regprocedure::text || ':' || a.grantee::regrole::text || ':' || a.privilege_type AS x FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($ALL28) AND a.grantee <> 0 UNION ALL SELECT p.oid::regprocedure::text || ':PUBLIC:' || a.privilege_type FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($ALL28) AND a.grantee = 0) s"
FPALL="SELECT md5(string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')), ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($ALL28)"
FPSCHEMA="SELECT md5(string_agg(p.oid::regprocedure::text || '=' || md5(replace(p.prosrc, E'\r', '')) || p.prosecdef, ',' ORDER BY p.oid::regprocedure::text)) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace"
T() { P -d "$1" -At -v POST="$2" -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"; }
align() { # 對齊附件正式庫：A 類 19 支＋ensure_trip_share_slug 為 anon、authenticated 可執行（預設不含 PUBLIC）；C 類 8 支本機已是 anon 不可、authenticated 可
  P -d "$1" -At -c "SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($A19,'ensure_trip_share_slug')" | while read -r f; do
    P -d "$1" -c "REVOKE EXECUTE ON FUNCTION $f FROM PUBLIC, anon, authenticated, service_role" -c "GRANT EXECUTE ON FUNCTION $f TO anon, authenticated, service_role"; done
}
mkdb() { P -d postgres -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1 TEMPLATE pbase" > /dev/null; P -d "$1" -v ON_ERROR_STOP=1 -f "$REPO/docs/pricing-2/localtest/seed_pre.sql" > /dev/null; }
post() { sed "s/__PASTE_PRECHECK_FP_ALL__/$2/" "$D/postcheck_20261101090000.sql" > /tmp/post_local.sql; P -d "$1" -At -F' | ' -f /tmp/post_local.sql; }

mkdb da1
echo "== 0. 對齊正式庫授權（附件 28 列）"; align da1
P -d da1 -At -F' | ' -c "SELECT count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) || ' 支 anon 可執行、' || count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE')) || ' 支 authenticated 可執行（附件：20／28）' FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ($ALL28)"
ACL0=$(P -d da1 -At -c "$ACL"); FP0=$(P -d da1 -At -c "$FPALL"); S0=$(P -d da1 -At -c "$FPSCHEMA")
echo "== 1. 套用前測試（漏洞重現）"; T da1 false
echo "== 2. precheck"; P -d da1 -At -F' | ' -f "$D/precheck_20261101090000.sql"
echo "== 3. 套用"; P -d da1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 4. postcheck（FP_ALL=$FP0）"; post da1 "$FP0"
echo "public 全部函式（內容＋DEFINER）指紋與套用前相同：$([ "$(P -d da1 -At -c "$FPSCHEMA")" = "$S0" ] && echo t || echo f)"
ACL1=$(P -d da1 -At -c "$ACL")
echo "== 5. 重複套用（純授權、可重入）"; P -d da1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "重複套用成功；授權與第一次相同：$([ "$(P -d da1 -At -c "$ACL")" = "$ACL1" ] && echo t || echo f)"
echo "== 6. 套用後測試"; T da1 true
echo "== 7. rollback（repo 預填版本）"; P -d da1 -v ON_ERROR_STOP=1 -f "$D/rollback_20261101090000.sql" > /dev/null && echo "rollback 成功"
echo "rollback 後 28 支授權與套用前完全相同：$([ "$(P -d da1 -At -c "$ACL")" = "$ACL0" ] && echo t || echo f)"
echo "rollback 後 public 全部函式指紋與套用前相同：$([ "$(P -d da1 -At -c "$FPSCHEMA")" = "$S0" ] && echo t || echo f)"
echo "== 8. rollback 後測試（回到套用前行為）"; T da1 false
echo "== 9. 再套用＋postcheck＋測試"; P -d da1 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
post da1 "$FP0" | grep -v "| t$" | grep -E "^[0-9]\. " || echo "再套用後 postcheck 7 項全部 t"
T da1 true
P -d postgres -c "DROP DATABASE da1" > /dev/null

echo "== 10. PUBLIC 變體：部分函式原本含 PUBLIC，rollback 以 precheck 第 4 段產生的行還原"
mkdb da2; align da2
P -d da2 -c "GRANT EXECUTE ON FUNCTION public.cleanup_old_error_logs() TO PUBLIC" -c "GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) TO PUBLIC" -c "REVOKE EXECUTE ON FUNCTION public.verify_owlting_service_account(text, text) FROM anon, authenticated" > /dev/null
ACLV=$(P -d da2 -At -c "$ACL")
P -d da2 -At -f "$D/precheck_20261101090000.sql" | grep -E "^(GRANT EXECUTE|-- public\.)" > /tmp/rb_lines.sql
echo "precheck 第 4 段產生 $(wc -l < /tmp/rb_lines.sql) 行，其中含 PUBLIC：$(grep -c 'TO PUBLIC' /tmp/rb_lines.sql) 行"; grep -E "TO PUBLIC|verify_owlting" /tmp/rb_lines.sql
awk 'BEGIN{s=0} /-- 還原段 BEGIN/{print; while ((getline l < "/tmp/rb_lines.sql") > 0) print l; s=1; next} /-- 還原段 END/{s=0} !s{print}' "$D/rollback_20261101090000.sql" > /tmp/rb_generated.sql
P -d da2 -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
P -d da2 -v ON_ERROR_STOP=1 -f /tmp/rb_generated.sql > /dev/null && echo "rollback（貼入 precheck 輸出）成功"
echo "rollback 後授權與原狀（含 PUBLIC 兩支、owlting 無 anon/authenticated）完全相同：$([ "$(P -d da2 -At -c "$ACL")" = "$ACLV" ] && echo t || echo f)"
P -d postgres -c "DROP DATABASE da2" > /dev/null
