#!/usr/bin/env bash
# 上架精靈 2b＋2c：本機 migration 完整循環（precheck → 套用 → postcheck → 重跑被擋 → rollback → 再套用）
# 用法：bash docs/onboarding-3/localtest/cycle.sh   （以 hq3〔repo 全部 migrations 重建〕為範本複製出 wz 庫）
set -uo pipefail
REPO=/app
D=$REPO/docs/onboarding-3
DB=wz
q() { psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB TEMPLATE hq3"
# 種子：3 間館（開賣中且有訂單、停用但有訂單、停用無訂單）＋測試館
q -f "$D/localtest/seed_venues.sql"
M="20261018120000_onboarding_wizard_state 20261018120001_onboarding_wizard_rpcs 20261018120002_m3_first_activation_guard"
step() { echo; echo "===== $1 ====="; }
for m in $M; do
  ts=${m%%_*}
  step "precheck $ts"; q -At -F' | ' -f "$D/precheck_$ts.sql"
  step "套用 $m"; q -1 -f "$REPO/supabase/migrations/$m.sql" > /dev/null && echo "套用成功"
  step "postcheck $ts"; q -At -F' | ' -f "$D/postcheck_$ts.sql"
  step "重跑 $m（應被擋）"; out=$(q -1 -f "$REPO/supabase/migrations/$m.sql" 2>&1); rc=$?
  echo "$out" | grep -m1 -E "ERROR"; [ $rc -ne 0 ] && echo "已被擋（exit=$rc，整支交易未套用）" || echo "（沒有被擋！）"
done
step "既有館 first_activated_at 判斷"; q -At -F' | ' -c "SELECT name, is_active, (SELECT count(*) FROM orders o WHERE o.accommodation_id=a.id) AS orders, first_activated_at IS NOT NULL AS treated_as_activated FROM accommodation_info a ORDER BY name"
for m in 20261018120002 20261018120001 20261018120000; do step "rollback $m"; q -f "$D/rollback_$m.sql" > /dev/null && echo "rollback 成功"; done
step "rollback 後再跑 precheck（應全 true）"; for m in $M; do ts=${m%%_*}; [ "$ts" = 20261018120000 ] && q -At -F' | ' -f "$D/precheck_$ts.sql"; done
step "guard 已還原為 090000 版本"; q -At -c "SELECT position('first_activated_at' IN pg_get_functiondef('public.accommodation_info_guard_is_active()'::regprocedure)) = 0"
for m in $M; do step "再套用 $m"; q -1 -f "$REPO/supabase/migrations/$m.sql" > /dev/null && echo "套用成功"; done
for m in $M; do ts=${m%%_*}; step "再套用後 postcheck $ts"; q -At -F' | ' -f "$D/postcheck_$ts.sql"; done
