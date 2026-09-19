#!/usr/bin/env bash
# 從 scratch DB（已還原匯出檔）的 cron.job 產生 rebuild-cron.sql：換掉舊 URL 與舊 anon key，套到新專案。
# 產生的 rebuild-cron.sql 含新 anon key，不進 git。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
OLD_URL="https://${OLD_REF}.supabase.co"; NEW_URL="https://${NEW_REF}.supabase.co"
{
  echo "-- generated $(date -u +%FT%TZ) from cron.job of old project"
  echo "SELECT cron.unschedule(jobid) FROM cron.job;"
  psql "$SCRATCH_DB_URL" -Atc "
    select format('SELECT cron.schedule(%L, %L, %L);', jobname, schedule,
      replace(replace(command, '$OLD_URL', '$NEW_URL'), '$OLD_ANON_KEY', '$NEW_ANON_KEY'))
    from cron.job where active order by jobid"
  echo "-- rpc-contract-check 用到的 DB 設定（匯出不含）"
  echo "ALTER DATABASE postgres SET app.settings.service_role_key = '$NEW_SERVICE_ROLE_KEY';"
} > rebuild-cron.sql
echo "-- 產生 rebuild-cron.sql，內容檢查（不應再出現舊 ref）："
grep -c "$OLD_REF" rebuild-cron.sql && { echo "!! 仍有舊 ref"; exit 1; } || echo "OK 無舊 ref"
grep -oE "cron\.schedule\('[^']+'" rebuild-cron.sql
read -rp "套用到新專案？(yes/no) " a; [ "$a" = yes ] || exit 0
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f rebuild-cron.sql
psql "$NEW_DB_URL" -Atc "select jobid, jobname, schedule, active from cron.job order by jobid"
