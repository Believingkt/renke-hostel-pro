#!/usr/bin/env bash
# 重建本機基準 pbase：hq3（rebuild_hq3.sh）＋ 20261018120000 以後全部 repo migration（含已上線的 20261101090000）
set -uo pipefail
cd /app
mkdir -p /root/onb4
bash docs/onboarding-4/localtest/rebuild_hq3.sh > /tmp/hq3.out 2>&1
P() { sudo -u postgres psql -X -q "$@"; }
P -d postgres -c "DROP DATABASE IF EXISTS pbase" -c "CREATE DATABASE pbase TEMPLATE hq3" > /dev/null 2>&1
for f in supabase/migrations/*.sql; do
  b=$(basename "$f"); [[ "$b" < "20261018120000" ]] && continue
  [[ -n "${STOP_BEFORE:-}" && ! "$b" < "$STOP_BEFORE" ]] && continue
  P -d pbase -v ON_ERROR_STOP=1 -f "$f" > /tmp/one.log 2>&1 && echo "ok $b" || echo "FAIL $b $(grep -m1 ERROR /tmp/one.log)"
done
