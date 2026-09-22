#!/usr/bin/env bash
# 切換當晚：把 Lovable 最終匯出檔的「資料」灌進新專案（schema 已由 02 建好）。
# 範圍：public 全部、auth（users/identities/… 讓會員帳號與 UUID 不變）、storage.buckets 不灌（migration 已建）、
#       storage.objects 不灌（由 05 同步時自動產生）、cron/net/vault/supabase_functions/realtime 不灌。
# 密碼：auth.users.encrypted_password 匯出檔若有帶會一併進去；沒有則依「密碼處理方案」首次登入重設。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
[ -f "$DUMP_FILE" ] || { echo "缺 DUMP_FILE"; exit 1; }
LOG=./import-$(date +%Y%m%d-%H%M).log
echo "-- 新專案目前 public 資料列數（應為 0 或只有 seed）"
psql "$NEW_DB_URL" -Atc "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables where schemaname='public'"
read -rp "確認 Lovable 已停止寫入（維護中頁面已上、cron 已停）且以上為 0？(yes/no) " a; [ "$a" = yes ] || exit 1

if ! pg_restore -l "$DUMP_FILE" >/dev/null 2>&1; then echo "DUMP_FILE 不是 pg_dump custom 格式"; exit 1; fi
# 分兩趟：public 用 --disable-triggers（postgres 是 owner）；auth 不能 disable triggers（owner 是 supabase_auth_admin），
# 靠 TOC 順序處理 FK。realtime / pgmq / storage / cron / vault 不灌。
pg_restore -l "$DUMP_FILE" | grep -E 'TABLE DATA|SEQUENCE SET' | grep -E ' public ' > restore-public.list
pg_restore -l "$DUMP_FILE" | grep -E 'TABLE DATA|SEQUENCE SET' | grep -E ' auth ' \
  | grep -vE ' auth (schema_migrations|audit_log_entries|sessions|refresh_tokens|flow_state|mfa_amr_claims|one_time_tokens) ' > restore-auth.tmp
# TOC 內資料是字母序（identities 排在 users 前）→ users 先灌，其餘依原順序
{ grep -E ' auth users ' restore-auth.tmp; grep -vE ' auth users ' restore-auth.tmp; } > restore-auth.list; rm -f restore-auth.tmp
echo "-- 將匯入 public $(grep -c 'TABLE DATA' restore-public.list) 張表、auth $(grep -c 'TABLE DATA' restore-auth.list) 張表（不含 sessions/refresh_tokens：登入狀態不搬）"
t0=$(date +%s)
echo "== 1/2 auth（users, identities, instances, sso…）"
pg_restore --data-only --no-owner --no-privileges --single-transaction \
  --use-list=restore-auth.list -d "$NEW_DB_URL" "$DUMP_FILE" 2>&1 | tee "$LOG"
echo "== 2/2 public（$(grep -c 'TABLE DATA' restore-public.list) 張表，停觸發器）"
pg_restore --data-only --disable-triggers --no-owner --no-privileges --single-transaction \
  --use-list=restore-public.list -d "$NEW_DB_URL" "$DUMP_FILE" 2>&1 | tee -a "$LOG"
echo "-- 耗時 $(( $(date +%s) - t0 )) 秒"

echo "-- 匯入後檢查：列數對照（scratch=舊 vs new）前 25 大表"
psql "$NEW_DB_URL" -Atc "select relname||'='||n_live_tup from pg_stat_user_tables where schemaname='public' order by n_live_tup desc limit 25" | tr '\n' ' '; echo
echo "-- sequences 重設（pg_restore 已含 SEQUENCE SET；保險再對齊一次）"
psql "$NEW_DB_URL" -Atc "
do \$\$ declare r record; begin
  for r in select s.relname seq, t.relname tbl, a.attname col from pg_class s
    join pg_depend d on d.objid=s.oid join pg_class t on t.oid=d.refobjid join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
    join pg_namespace n on n.oid=s.relnamespace where s.relkind='S' and n.nspname='public'
  loop execute format('select setval(%L, coalesce((select max(%I) from public.%I),0)+1, false)', 'public.'||r.seq, r.col, r.tbl); end loop; end \$\$;"
echo "-- auth.users 數："; psql "$NEW_DB_URL" -Atc "select count(*), count(encrypted_password) filter (where encrypted_password<>'') from auth.users"
echo "完成，log：$LOG。接著跑 04-rebuild-cron.sh，再跑 05-storage-sync.sh --since <上次全量時間>"
