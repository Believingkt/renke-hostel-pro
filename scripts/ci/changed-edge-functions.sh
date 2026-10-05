#!/usr/bin/env bash
# 列出 BASE..HEAD 之間有變動、需要重新部署的 edge function 名稱（每行一個）。
# - 直接改到 supabase/functions/<name>/ 底下的檔案 → 部署該 function
# - 改到 supabase/functions/_shared/ 的檔案 → 找出（含間接）引用它的 function 一併部署
# - 已刪除的 function 資料夾會略過（刪除線上 function 請手動處理）
# 用法：scripts/ci/changed-edge-functions.sh <BASE_SHA> [HEAD_SHA]
set -euo pipefail
BASE="${1:?需要 BASE commit}"
HEAD="${2:-HEAD}"
FN_DIR="supabase/functions"
declare -A fns=()
declare -A shared=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  rel="${f#"$FN_DIR"/}"
  top="${rel%%/*}"
  [ "$top" = "$rel" ] && continue            # supabase/functions 根目錄的檔案，不屬於任何 function
  if [ "$top" = "_shared" ]; then
    shared["$rel"]=1
  else
    fns["$top"]=1
  fi
done < <(git diff --name-only "$BASE" "$HEAD" -- "$FN_DIR")
# 找出直接或間接 import 某個檔名的檔案（寧可多抓，不要漏抓）
importers_of() {
  local base="$1" where="$2"
  grep -rlF -e "/$base\"" -e "/$base'" "$where" \
    --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' 2>/dev/null || true
}
# _shared 內部的連鎖引用，展開到不再增加為止
grew=1
while [ "$grew" = 1 ]; do
  grew=0
  for s in "${!shared[@]}"; do
    for g in $(importers_of "$(basename "$s")" "$FN_DIR/_shared"); do
      k="${g#"$FN_DIR"/}"
      if [ -z "${shared[$k]:-}" ]; then shared["$k"]=1; grew=1; fi
    done
  done
done
# 引用到變動 _shared 檔案的 function
for s in "${!shared[@]}"; do
  for g in $(importers_of "$(basename "$s")" "$FN_DIR"); do
    rel="${g#"$FN_DIR"/}"
    top="${rel%%/*}"
    [ "$top" = "_shared" ] && continue
    fns["$top"]=1
  done
done
for fn in "${!fns[@]}"; do
  # 只輸出目前還存在、有進入點的 function
  if [ -f "$FN_DIR/$fn/index.ts" ] || [ -f "$FN_DIR/$fn/index.tsx" ]; then
    echo "$fn"
  fi
done | sort
