#!/usr/bin/env bash
# 建 schema（v2）：直接用 Lovable 匯出檔的 schema（pg_restore --schema-only），不再重播 957 個 migration。
# 理由（2026-09-19 測試 db push 的結論）：migrations 有 schema drift（pricing_rules 未入版控）、含依賴舊資料的
# INSERT（FK 失敗）、含寫死 id 的 seed（之後匯資料會撞 PK）。匯出檔的 schema 就是 production 現況，最忠實。
# 步驟：(1) 清空新專案 public schema（可選） (2) 由匯出檔還原 public 全部 + auth/storage/realtime 內
#       由 postgres 建立的物件（trigger/function/policy） (3) 把 957 個 migration 標記為已套用，之後新 migration 照常 db push。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
[ -f "$DUMP_FILE" ] || { echo "缺 DUMP_FILE"; exit 1; }
ROOT="$(cd ../.. && pwd)"
LIST=./restore-schema.list

echo "== 0. 產生還原清單（過濾 TOC）"
pg_restore -l "$DUMP_FILE" > ./dump-toc.list
python3 - "$LIST" <<'PY'
import re, sys
out = open(sys.argv[1], "w")
TYPES = ["TABLE DATA","SEQUENCE SET","FK CONSTRAINT","ROW SECURITY","EVENT TRIGGER","MATERIALIZED VIEW","DEFAULT ACL",
         "SCHEMA","EXTENSION","TYPE","DOMAIN","TABLE","SEQUENCE","VIEW","FUNCTION","PROCEDURE","AGGREGATE","TRIGGER","POLICY",
         "INDEX","CONSTRAINT","COMMENT","ACL","DEFAULT","PUBLICATION","PUBLICATION TABLE","CAST","OPERATOR","COLLATION"]
SKIP_SCHEMAS = {"cron","net","pgmq","vault","extensions","graphql","graphql_public","pgbouncer","supabase_functions",
                "pg_catalog","supabase_migrations","pgsodium","_realtime"}
keep = skip = 0
for line in open("./dump-toc.list"):
    if not re.match(r"^\d+; \d+ \d+ ", line): continue
    body = line.split(" ", 3)[3].rstrip("\n")
    typ = next((t for t in sorted(TYPES, key=len, reverse=True) if body.startswith(t + " ")), None)
    if not typ: skip += 1; continue
    rest = body[len(typ)+1:]
    parts = rest.split(" ")
    schema, owner = parts[0], parts[-1]
    name = " ".join(parts[1:-1])
    ok = False
    if typ in ("TABLE DATA","SEQUENCE SET","SCHEMA","EXTENSION","EVENT TRIGGER","PUBLICATION","PUBLICATION TABLE","DEFAULT ACL"):
        ok = False
    elif schema == "public":
        ok = True
    elif schema in ("auth","storage","realtime") and owner == "postgres":
        ok = True                       # 使用者在系統 schema 上建的 trigger / function / policy
    elif schema == "-" and typ == "COMMENT":
        ok = False
    if ok: out.write(line); keep += 1
    else: skip += 1
print(f"keep={keep} skip={skip}")
PY

echo "== 1. 新專案 public 目前物件數（若不是空的，會先清空）"
n=$(psql "$NEW_DB_URL" -Atc "select count(*) from pg_tables where schemaname='public'")
echo "public 表數：$n"
if [ "$n" != "0" ]; then
  read -rp "要 DROP SCHEMA public CASCADE 重建、並清掉 migration 紀錄與 cron job 嗎？(yes/no) " a; [ "$a" = yes ] || exit 1
  psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
select cron.unschedule(jobid) from cron.job;
drop schema public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
delete from supabase_migrations.schema_migrations;
-- migrations 在 storage.objects / auth.users 上建的 policy（public 函式已隨 schema 消失，policy 會失效）一併清
do $$ declare r record; begin
  for r in select policyname, schemaname, tablename from pg_policies where schemaname in ('storage','realtime') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;
SQL
fi

echo "== 1b. 建 Lovable 專屬空殼角色（匯出檔的 GRANT 有指向它們；NOLOGIN、無任何權限，只是讓還原不噴 483 個錯）"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='sandbox_exec') then create role sandbox_exec nologin; end if;
  if not exists (select 1 from pg_roles where rolname='sandbox_exec_${OLD_REF}') then execute format('create role %I nologin', 'sandbox_exec_${OLD_REF}'); end if;
end \$\$;"

echo "== 2. 先啟用 extensions"
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -c "create extension if not exists pg_cron; create extension if not exists pg_net; create extension if not exists pgmq; create extension if not exists supabase_vault; create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions; grant usage on schema cron to postgres;"

echo "== 3. pg_restore schema（錯誤會列出但不中止；常見可忽略：sandbox_exec 角色不存在、物件已存在）"
pg_restore --schema-only --no-owner -L "$LIST" -d "$NEW_DB_URL" "$DUMP_FILE" 2> ./restore-schema.err || true
echo "錯誤行數：$(grep -c 'error' ./restore-schema.err || true)（見 restore-schema.err）"
grep -i 'error' ./restore-schema.err | grep -vE 'sandbox_exec|already exists|must be owner|permission denied for (schema|table) (auth|storage|realtime)' | head -20 || true

echo "== 4. 標記 957 個 migration 為已套用（之後 Emergent 新增的 migration 才會被 db push）"
cd "$ROOT"
supabase link --project-ref "$NEW_REF" >/dev/null
versions=$(ls supabase/migrations | grep -oE '^[0-9]{14}' | sort -u | tr '\n' ' ')
supabase migration repair --status applied $versions --linked
supabase migration list --linked | tail -n 3

echo "== 5. 物件數（對照 docs/migration/old-project-facts：246 表）"
psql "$NEW_DB_URL" -Atc "select 'tables='||(select count(*) from pg_tables where schemaname='public')||' functions='||(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')||' policies='||(select count(*) from pg_policies where schemaname='public')||' triggers='||(select count(*) from pg_trigger where not tgisinternal)||' types='||(select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e')"
