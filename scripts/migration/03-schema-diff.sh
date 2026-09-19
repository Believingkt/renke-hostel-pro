#!/usr/bin/env bash
# 比對 Lovable 匯出的 schema 與新專案（db push 後）的 schema。
# 做法：把匯出檔還原到本機 scratch DB，兩邊各 pg_dump --schema-only，正規化後 diff。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
[ -f "$DUMP_FILE" ] || { echo "缺 DUMP_FILE"; exit 1; }
OUT=./diff; mkdir -p "$OUT"
echo "-- 還原匯出檔到 scratch DB（$SCRATCH_DB_URL）"
if pg_restore -l "$DUMP_FILE" >/dev/null 2>&1; then
  pg_restore --no-owner --no-privileges --clean --if-exists -d "$SCRATCH_DB_URL" "$DUMP_FILE" || true   # 有些 Supabase 內部物件會報錯，可忽略
else
  psql "$SCRATCH_DB_URL" -v ON_ERROR_STOP=0 -q -f "$DUMP_FILE" > "$OUT/restore.log" 2>&1 || true
  echo "restore 錯誤數：$(grep -c ERROR "$OUT/restore.log" || true)（見 diff/restore.log）"
fi
norm() { # 去掉會自然不同的東西：owner、註解、空行、supabase 內部 schema
  sed -E '/^--/d;/^$/d;/^SET /d;/^SELECT pg_catalog\.set_config/d;s/OWNER TO [a-z_]+;//' | grep -vE 'supabase_migrations|schema_migrations' ;
}
for s in public auth storage; do
  pg_dump --schema-only --no-owner --no-privileges --schema="$s" "$SCRATCH_DB_URL" | norm > "$OUT/old-$s.sql"
  pg_dump --schema-only --no-owner --no-privileges --schema="$s" "$NEW_DB_URL"     | norm > "$OUT/new-$s.sql"
  echo "== schema $s：$(diff "$OUT/old-$s.sql" "$OUT/new-$s.sql" | grep -cE '^[<>]' || true) 行差異 → diff/$s.diff"
  diff -u "$OUT/old-$s.sql" "$OUT/new-$s.sql" > "$OUT/$s.diff" || true
done
echo "-- 物件數量對照（old | new）"
for q in "select count(*) from pg_tables where schemaname='public'" \
         "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'" \
         "select count(*) from pg_policies where schemaname='public'" \
         "select count(*) from pg_trigger where not tgisinternal" \
         "select count(*) from pg_indexes where schemaname='public'" \
         "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'"; do
  printf "%-110s %6s | %6s\n" "$q" "$(psql "$SCRATCH_DB_URL" -Atc "$q")" "$(psql "$NEW_DB_URL" -Atc "$q")"
done
echo "-- 匯出檔內的 cron job（供 04 使用）"
psql "$SCRATCH_DB_URL" -Atc "select jobname||' | '||schedule from cron.job order by jobid" 2>/dev/null || echo "（匯出檔不含 cron.job，Day 4 改從 Lovable 端 SQL 取）"
