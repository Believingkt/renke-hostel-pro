#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f migration.env ] || { echo "缺 migration.env（cp migration.env.example migration.env）"; exit 1; }
set -a; source migration.env; set +a
for t in supabase psql pg_restore pg_dump deno jq; do command -v $t >/dev/null || { echo "缺工具：$t"; exit 1; }; done
echo "supabase CLI: $(supabase --version)"; echo "psql: $(psql --version)"
# Lovable 匯出檔是 pg_dump 18 產生的 custom 格式（archive v1.16），pg_restore 必須 ≥ 17（brew install libpq@17 或 postgresql@17）
pgv=$(pg_restore --version | grep -oE '[0-9]+' | head -1); [ "$pgv" -ge 17 ] || { echo "pg_restore 版本 $pgv 太舊，需 ≥ 17 才能讀 Lovable 匯出檔"; exit 1; }
for v in NEW_REF NEW_DB_URL NEW_SERVICE_ROLE_KEY NEW_ANON_KEY OLD_ANON_KEY; do [ -n "${!v:-}" ] || { echo "migration.env 缺 $v"; exit 1; }; done
echo "-- 新專案 DB 連線測試"; psql "$NEW_DB_URL" -Atc "select version(), current_setting('max_connections')"
echo "-- 新專案 extensions"; psql "$NEW_DB_URL" -Atc "select string_agg(extname||' '||extversion, ', ') from pg_extension"
echo "-- 需要的 extensions：pg_cron pg_net pgmq supabase_vault pgcrypto uuid-ossp pg_graphql pgjwt"
echo "-- 新專案 secrets 目前有："; supabase secrets list --project-ref "$NEW_REF" | tail -n +2 | awk '{print $1}' | tr '\n' ' '; echo
[ -n "${DUMP_FILE:-}" ] && [ -f "$DUMP_FILE" ] && echo "匯出檔：$DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))" || echo "尚無匯出檔（DUMP_FILE）"
echo "preflight OK"
