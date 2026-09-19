#!/usr/bin/env bash
# 在新專案用 957 個 migration 建 schema。第一次請對「測試專案」跑，確認全部能過。
# 用法：./02-build-schema.sh [ref]   （不給 ref 則用 migration.env 的 NEW_REF）
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
REF="${1:-$NEW_REF}"
ROOT="$(cd ../.. && pwd)"
cd "$ROOT"
# config.toml 的 project_id 仍是舊 ref；link 用 --project-ref 明示，不改檔案
supabase link --project-ref "$REF"
echo "-- 先啟用 migrations 會用到的 extensions（pg_cron 在 migrations 中第一次被引用前就要存在）"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -c "create extension if not exists pg_cron; create extension if not exists pg_net; create extension if not exists pgmq; create extension if not exists supabase_vault; create extension if not exists pgcrypto; create extension if not exists \"uuid-ossp\"; grant usage on schema cron to postgres;"
echo "-- 舊專案有 22 個 active cron job；db push 只會建 migrations 內的 7 個，其餘由 04-rebuild-cron.sh 從匯出檔重建"
echo "-- 先看新專案已套用的 migration 版本（應為空或少量）"
supabase migration list --linked | tail -n 5
echo "-- db push（--include-all 保證全部按檔名順序套用）"
if ! supabase db push --linked --include-all 2>&1 | tee "$ROOT/scripts/migration/db-push.log"; then
  echo; echo "!! db push 失敗，最後套用/卡住的 migration："
  grep -E 'Applying migration|ERROR' "$ROOT/scripts/migration/db-push.log" | tail -n 5
  echo "處理：找出該檔的問題（常見：cron.alter_job 寫死 jobid、引用不存在的 job、Lovable 專屬 role），"
  echo "      在該 migration 加保護（DO \$\$ ... IF EXISTS ... \$\$）後重跑；不要刪 migration。"
  exit 1
fi
echo "-- 完成。表數 / 函式數 / policy 數："
psql "$NEW_DB_URL" -Atc "select (select count(*) from pg_tables where schemaname='public'), (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'), (select count(*) from pg_policies where schemaname='public')"
