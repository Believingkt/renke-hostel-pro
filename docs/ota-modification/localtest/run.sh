#!/usr/bin/env bash
# 2b-1 本機 PostgreSQL 15 最小副本整合測試。用法：bash docs/ota-modification/localtest/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
MIG="$REPO/supabase/migrations"
WORK="${WORK:-/root/ota2b-work}"
DB=ota2b
mkdir -p "$WORK"

q() { psql -X -v ON_ERROR_STOP=1 -U postgres -d "$DB" "$@"; }
adm() { psql -X -q -U postgres -d postgres -c "$1"; }

# 1) 從最新 migration 原文逐字擷取函式與 trigger
: > "$WORK/02_copied.sql"
while IFS=: read -r file start end label; do
  [ -z "$file" ] && continue
  echo "-- >>> $label ← $file 第 $start–$end 行" >> "$WORK/02_copied.sql"
  sed -n "${start},${end}p" "$MIG/$file" >> "$WORK/02_copied.sql"
  printf '\n' >> "$WORK/02_copied.sql"
done < "$HERE/sources.txt"

# 2) 重建資料庫
adm "DROP DATABASE IF EXISTS $DB"
for r in anon authenticated service_role; do adm "DROP ROLE IF EXISTS $r" 2>/dev/null || true; done
adm "CREATE DATABASE $DB"
cp "$HERE"/00_env.sql "$HERE"/01_schema.sql "$HERE"/03_stubs.sql "$HERE"/10_tests.sql "$WORK"/
cp "$REPO/docs/ota-modification/rollback_20261017090000.sql" "$WORK"/
q -q -f "$WORK/00_env.sql"
q -q -f "$WORK/01_schema.sql"
q -q -f "$WORK/03_stubs.sql"
q -q -f "$WORK/02_copied.sql"

# 3) 本機實測指紋；只在副本替換（正式 migration 檔不動）
read -r SYNC_MD5 SYNC_LEN < <(q -tA -F' ' -c "select md5(pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)'))), length(pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)')))")
read -r UOWC_MD5 UOWC_LEN < <(q -tA -F' ' -c "select md5(pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)'))), length(pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)')))")
echo "LOCAL sync_order_rooms_v1       md5=$SYNC_MD5 len=$SYNC_LEN"
echo "LOCAL update_order_with_context md5=$UOWC_MD5 len=$UOWC_LEN"
sed -e "s/8cc1ae289015f64c2d16801600af8cb2/$SYNC_MD5/g" -e "s/<> 4767/<> $SYNC_LEN/g" \
    -e "s/7d7e88fcecddcab46c798c5916a1bed0/$UOWC_MD5/g" -e "s/<> 3508/<> $UOWC_LEN/g" \
    "$MIG/20261017090000_apply_ota_modification_v1.sql" > "$WORK/migration_local.sql"
sed -e "s/8cc1ae289015f64c2d16801600af8cb2/$SYNC_MD5/g" -e "s/7d7e88fcecddcab46c798c5916a1bed0/$UOWC_MD5/g" \
    "$WORK/rollback_20261017090000.sql" > "$WORK/rollback_local.sql"

echo "=== 案例 1a：套用 migration（本機副本）"
q -f "$WORK/migration_local.sql"
echo "=== 案例 1b：重跑 migration，應被 precheck 擋下"
if q -f "$WORK/migration_local.sql" 2>&1; then echo "UNEXPECTED: 重跑成功"; exit 1; else echo "EXPECTED: 重跑被擋下"; fi

echo "=== 案例 2～10"
q -f "$WORK/10_tests.sql"

echo "=== 案例 11：rollback"
q -f "$WORK/rollback_local.sql"
q -tA -c "select 'apply_ota_modification_v1 存在=' || (to_regprocedure('public.apply_ota_modification_v1(uuid,jsonb,jsonb,text,text,text,boolean,jsonb)') IS NOT NULL) || '，mail_sent_at 存在=' || exists(select 1 from information_schema.columns where table_name='owlting_email_orders_raw' and column_name='mail_sent_at') || '，sync md5=' || md5(pg_get_functiondef(to_regprocedure('public.sync_order_rooms_v1(uuid,timestamp with time zone,jsonb)'))) || '，uowc md5=' || md5(pg_get_functiondef(to_regprocedure('public.update_order_with_context(uuid,jsonb,text,text,text,text,jsonb,jsonb)')))"
echo "=== 全部完成"
