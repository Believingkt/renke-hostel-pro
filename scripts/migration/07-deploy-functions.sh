#!/usr/bin/env bash
# 部署全部 edge functions 到新專案（verify_jwt 依 supabase/config.toml）。
# 用法：./07-deploy-functions.sh            # 全部
#       ./07-deploy-functions.sh fn1 fn2    # 指定
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
ROOT="$(cd ../.. && pwd)"; cd "$ROOT"
if [ $# -gt 0 ]; then fns=("$@"); else mapfile -t fns < <(ls supabase/functions | grep -vE '^_shared$|^migration-storage-sync$'); fi
echo "-- 部署 ${#fns[@]} 個函式到 $NEW_REF"
fail=()
for f in "${fns[@]}"; do
  if supabase functions deploy "$f" --project-ref "$NEW_REF" >/dev/null 2>"scripts/migration/deploy-$f.err"; then
    printf "ok   %s\n" "$f"; rm -f "scripts/migration/deploy-$f.err"
  else printf "FAIL %s  (見 scripts/migration/deploy-%s.err)\n" "$f" "$f"; fail+=("$f"); fi
done
echo "-- 遠端函式數：$(supabase functions list --project-ref "$NEW_REF" | tail -n +2 | grep -c .)"
[ ${#fail[@]} -eq 0 ] && echo "全部成功" || { echo "失敗：${fail[*]}"; exit 1; }
