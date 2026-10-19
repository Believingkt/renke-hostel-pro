#!/usr/bin/env bash
# 上架精靈 2d：本機測試（最小 schema → 套用 120001、120002 原檔 → 套用 2d → 行為測試 → 重跑被擋 → rollback → 再套用）
set -uo pipefail
REPO=/app
DB=wz2d
D=$REPO/docs/onboarding-4
M=$REPO/supabase/migrations/20261022090000_onboarding_wizard_2d.sql
P() { sudo -u postgres psql -X -q "$@"; }
q() { P -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
q -f "$D/localtest/schema.sql" >/dev/null
for m in 20261018120001_onboarding_wizard_rpcs 20261018120002_m3_first_activation_guard; do
  q -f "$REPO/supabase/migrations/$m.sql" >/dev/null && echo "基準：套用 $m"
done
q -f "$D/localtest/seed.sql" >/dev/null
echo "== 套用前（120001 版本）：OwlTing 未對應時 red_ok"; q -At -f "$D/localtest/before.sql"
echo "== 套用 2d"; q -f "$M" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  //'
echo "== 行為測試"; q -At -f "$D/localtest/tests.sql" 2>&1 | grep -vE "^(SET|ROLLBACK|BEGIN)?$|^[0-9a-f-]{36}$"
echo "== 重跑 2d（應被 precheck 擋）"; q -f "$M" 2>&1 | grep -o "PRECHECK 失敗：[^\"]*" | head -1
echo "== rollback"; q -f "$D/rollback_20261022090000.sql" >/dev/null && echo "rollback 成功"
q -At -c "SELECT 'rollback 後：needs_ack 回來=' || (position('needs_ack' IN pg_get_functiondef('public.wizard_precheck_core(uuid)'::regprocedure)) > 0)
  || '；ota 勾選檢查回來=' || (position('p_ota_ack IS NOT TRUE' IN pg_get_functiondef('public.wizard_submit(uuid, boolean)'::regprocedure)) > 0)
  || '；新函式剩下=' || (SELECT count(*) FROM pg_proc WHERE proname IN ('wizard_save_basic_info','wizard_precheck_redact','wizard_basic_info_errors'))"
echo "== 與 120001 原定義比對（rollback 後 3 個函式 md5）"
q -At -c "SELECT string_agg(proname || '=' || md5(prosrc), '，' ORDER BY proname) FROM pg_proc WHERE proname IN ('wizard_precheck_core','wizard_precheck','wizard_submit')" > /tmp/wz2d_after_rb.txt
P -d postgres -c "DROP DATABASE IF EXISTS ${DB}_ref" -c "CREATE DATABASE ${DB}_ref" >/dev/null
P -d ${DB}_ref -v ON_ERROR_STOP=1 -f "$D/localtest/schema.sql" >/dev/null
P -d ${DB}_ref -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/20261018120001_onboarding_wizard_rpcs.sql" >/dev/null
P -d ${DB}_ref -At -c "SELECT string_agg(proname || '=' || md5(prosrc), '，' ORDER BY proname) FROM pg_proc WHERE proname IN ('wizard_precheck_core','wizard_precheck','wizard_submit')" > /tmp/wz2d_ref.txt
diff -q /tmp/wz2d_after_rb.txt /tmp/wz2d_ref.txt >/dev/null && echo "完全相同" || { echo "不同"; cat /tmp/wz2d_after_rb.txt /tmp/wz2d_ref.txt; }
echo "== 再套用"; q -f "$M" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  //'
