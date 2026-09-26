#!/usr/bin/env bash
# 補還原 storage.objects / realtime.messages 的 RLS policy（02 v2 之前漏掉：TOC 裡 policy 的 owner 是表 owner，被 owner==postgres 過濾掉）
# 冪等：先 drop 同名 policy 再 create。只動 policy，不動資料。
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
[ -f "$DUMP_FILE" ] || { echo "缺 DUMP_FILE"; exit 1; }
pg_restore -l "$DUMP_FILE" | grep -E '^[0-9]+; [0-9]+ [0-9]+ POLICY (storage|realtime) ' > ./restore-policies.list
n=$(wc -l < ./restore-policies.list | tr -d ' ')
echo "== 匯出檔內 storage/realtime policy：$n 條"
pg_restore --schema-only --no-owner --no-acl -L ./restore-policies.list -f ./restore-policies.sql "$DUMP_FILE"
# 轉成冪等
python3 - <<'PY'
import re
s=open("./restore-policies.sql").read()
out=[]
for m in re.finditer(r'CREATE POLICY ("[^"]+"|\S+) ON (storage\.objects|realtime\.messages)', s):
    out.append(f"DROP POLICY IF EXISTS {m.group(1)} ON {m.group(2)};")
open("./restore-policies.sql","w").write("\n".join(out)+"\n\n"+s)
print(f"drop 語句：{len(out)}")
PY
before=$(psql "$NEW_DB_URL" -Atc "select count(*) from pg_policies where schemaname in ('storage','realtime')")
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -q -f ./restore-policies.sql
after=$(psql "$NEW_DB_URL" -Atc "select count(*) from pg_policies where schemaname in ('storage','realtime')")
echo "== 新專案 storage+realtime policy：${before} → ${after}（預期 ${n}）"
