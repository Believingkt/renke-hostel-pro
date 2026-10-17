#!/usr/bin/env bash
# 以 repo 的 supabase/migrations 依序重建本機 DB（截至 20261017090000，不含本批），記錄失敗的檔案。
# 用法：bash docs/onboarding-1/localtest/replay.sh <dbname>
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
DB="${1:-onb1}"
LOG="${LOG:-/root/onb1/replay_$DB.log}"
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" \
  -c "ALTER DATABASE $DB SET search_path = public, extensions"
psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 -f "$HERE/00_platform_stubs.sql" > /dev/null
: > "$LOG"
ok=0; fail=0
for f in "$REPO"/supabase/migrations/*.sql; do
  b="$(basename "$f")"
  [[ "$b" > "20261017090000_zzzz" ]] && continue
  if psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$f" > /tmp/replay_one.log 2>&1; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
    echo "FAIL $b :: $(grep -m1 ERROR /tmp/replay_one.log | cut -c1-220)" >> "$LOG"
  fi
done
echo "replay 完成：成功 $ok 支、失敗 $fail 支（明細 $LOG）"
# 補建：20260629093258 因正式庫資料 seed（第 64 行起的 DO 區塊）在空庫失敗，只補跑第 1–63 行的 DDL
sed -n 1,63p "$REPO/supabase/migrations/20260629093258_332f2374-5161-4f1c-abb9-a8f43acdc09c.sql" \
  | psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 -1 && echo "補建 owlting_room_type_groups／members DDL 完成"
# 補建：20260703060834 第 37 行起為正式庫資料，只補跑第 1–35 行 DDL；再補跑因此表不存在而失敗、只含 GRANT／POLICY 的兩支
sed -n 1,35p "$REPO/supabase/migrations/20260703060834_5d008bfa-be4f-452f-82d2-9026941cd9d6.sql" \
  | psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 -1 && echo "補建 owlting_room_type_sync DDL 完成"
for f in 20260703070031_b74162f0-4916-4a7c-87bd-511646318616 20260717051119_8e77c93c-979e-45c0-a4da-7d83cc6e486b; do
  psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 -1 -f "$REPO/supabase/migrations/$f.sql" && echo "補跑 $f 完成"
done
