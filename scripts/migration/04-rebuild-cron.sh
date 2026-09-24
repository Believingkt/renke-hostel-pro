#!/usr/bin/env bash
# 從匯出檔的 cron.job 產生 rebuild-cron.sql（換舊 URL / 舊 anon key → 新），套到新專案。
# 不需要 scratch DB：直接用 pg_restore 只吐 cron.job 那張表的資料。產生的 SQL 含新 anon key，不進 git。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
[ -f "$DUMP_FILE" ] || { echo "缺 DUMP_FILE"; exit 1; }
OLD_URL="https://${OLD_REF}.supabase.co"; NEW_URL="https://${NEW_REF}.supabase.co"

# 1. 抽 cron.job 的 COPY 資料（TOC 只選那一筆）
pg_restore -l "$DUMP_FILE" | grep -E 'TABLE DATA cron job ' > cron.list
pg_restore --data-only --use-list=cron.list -f - "$DUMP_FILE" > cron-job.sql
# COPY 欄位順序：jobid, schedule, command, nodename, nodeport, database, username, active, jobname
python3 - "$OLD_URL" "$NEW_URL" "$OLD_ANON_KEY" "$NEW_ANON_KEY" "$NEW_SERVICE_ROLE_KEY" <<'PY' > rebuild-cron.sql
import sys, re
old_url, new_url, old_key, new_key, srk = sys.argv[1:6]
rows = []; inside = False
for line in open("cron-job.sql", encoding="utf-8"):
    if line.startswith("COPY cron.job"): inside = True; continue
    if inside and line.startswith("\\."): break
    if inside: rows.append(line.rstrip("\n"))
def unesc(s):  # COPY text 格式的跳脫
    return s.replace("\\n","\n").replace("\\t","\t").replace("\\r","\r").replace("\\\\","\\")
def q(s): return "'" + s.replace("'", "''") + "'"
print("-- generated from cron.job of old project export")
print("SELECT cron.unschedule(jobid) FROM cron.job;")
n=0
for r in rows:
    f = r.split("\t")
    jobid, schedule, command, active, jobname = f[0], f[1], unesc(f[2]), f[7], f[8]
    cmd = command.replace(old_url, new_url).replace(old_key, new_key)
    cmd = cmd.replace("current_setting('app.settings.service_role_key', true)", "'" + srk + "'")  # 新專案不能 ALTER DATABASE
    print(f"SELECT cron.schedule({q(jobname)}, {q(schedule)}, {q(cmd)});")
    if active == "f":
        print(f"SELECT cron.alter_job((select jobid from cron.job where jobname = {q(jobname)}), active := false);")
    n+=1
print(f"-- {n} jobs")
print("-- rpc-contract-check 用到的 DB 設定（匯出不含）")
print("-- app.settings.service_role_key：新專案 postgres 無 ALTER DATABASE 權限，rpc-contract-check 已改為直接帶 key")
PY
rm -f cron.list cron-job.sql
echo "-- 產生 rebuild-cron.sql：$(grep -c 'cron.schedule' rebuild-cron.sql) 個 job；殘留舊 ref：$(grep -c "$OLD_REF" rebuild-cron.sql || true)（應為 0）"
grep -oE "cron\.schedule\('[^']+'" rebuild-cron.sql | sed "s/cron.schedule('//;s/'//" | tr '\n' ' '; echo
read -rp "套用到新專案 ${NEW_REF}？(yes/no) " a; [ "$a" = yes ] || exit 0
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q -f rebuild-cron.sql
psql "$NEW_DB_URL" -Atc "select jobid||' '||jobname||' '||schedule||' active='||active from cron.job order by jobid"
