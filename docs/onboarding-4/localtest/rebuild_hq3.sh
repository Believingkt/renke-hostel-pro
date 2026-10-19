#!/usr/bin/env bash
# 重建 hq3：以 repo supabase/migrations 依序套用（< 20261018120000，即上架精靈 2b 之前），作為 cycle.sh 的範本庫
# 作法同 docs/onboarding-1/localtest/replay.sh（平台 stub＋逐支套用＋補建空庫無法跑的資料 seed 段）
set -uo pipefail
REPO=/app
HERE=$REPO/docs/onboarding-1/localtest
DB=hq3
LOG=/root/onb4/replay_hq3.log
P() { sudo -u postgres psql -X -q "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS wz" -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" -c "ALTER DATABASE $DB SET search_path = public, extensions"
P -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/00_platform_stubs.sql" > /dev/null
: > "$LOG"; ok=0; fail=0
for f in "$REPO"/supabase/migrations/*.sql; do
  b="$(basename "$f")"
  [[ "$b" < "20261018120000" ]] || continue
  if P -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$f" > /tmp/replay_one.log 2>&1; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $b :: $(grep -m1 ERROR /tmp/replay_one.log | cut -c1-220)" >> "$LOG"; fi
done
echo "replay 完成：成功 $ok 支、失敗 $fail 支（明細 $LOG）"
sed -n 1,63p "$REPO/supabase/migrations/20260629093258_332f2374-5161-4f1c-abb9-a8f43acdc09c.sql" | P -d "$DB" -v ON_ERROR_STOP=1 -1 && echo "補建 owlting_room_type_groups／members DDL 完成"
sed -n 1,35p "$REPO/supabase/migrations/20260703060834_5d008bfa-be4f-452f-82d2-9026941cd9d6.sql" | P -d "$DB" -v ON_ERROR_STOP=1 -1 && echo "補建 owlting_room_type_sync DDL 完成"
for f in 20260703070031_b74162f0-4916-4a7c-87bd-511646318616 20260717051119_8e77c93c-979e-45c0-a4da-7d83cc6e486b; do
  P -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$REPO/supabase/migrations/$f.sql" > /dev/null && echo "補跑 $f 完成"
done
# 090001／090002 需要上面補建的 owlting 表，replay 迴圈中會因順序失敗，補建後再套用（檔案自帶 BEGIN/COMMIT，不加 -1）
for f in 20261018090001_auto_template_for_packages 20261018090002_auto_template_price_fallback; do
  P -d "$DB" -v ON_ERROR_STOP=1 -f "$REPO/supabase/migrations/$f.sql" > /dev/null && echo "補跑 $f 完成"
done
