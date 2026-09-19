#!/usr/bin/env bash
# 用法：./01-set-secrets.sh            # 寫入 + 比對
#       ./01-set-secrets.sh --check   # 只比對（哪些 key 缺、哪些多）
set -euo pipefail
cd "$(dirname "$0")"
set -a; source migration.env; set +a
SECRETS=secrets.env   # 由 secrets.template.env 複製填值；一行 KEY=value；不進 git
[ -f "$SECRETS" ] || { echo "缺 $SECRETS（cp secrets.template.env secrets.env 後填值）"; exit 1; }
# 檢查空值
empty=$(grep -E '^[A-Z0-9_]+=$' "$SECRETS" || true)
if [ -n "$empty" ]; then echo "以下 key 尚未填值（若確定不需要請整行刪除）："; echo "$empty"; [ "${1:-}" = "--check" ] || exit 1; fi
# 程式碼實際用到的 key（排除 Supabase 自動注入與 Lovable 專用）
want=$(grep -rhoE 'Deno\.env\.get\(\s*["'"'"'][A-Z0-9_]+["'"'"']' ../../supabase/functions | sed -E 's/.*\(\s*["'"'"']//;s/["'"'"']$//' | sort -u \
  | grep -vE '^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|VITE_.*|LOVABLE_.*)$')
have=$(grep -E '^[A-Z0-9_]+=' "$SECRETS" | cut -d= -f1 | sort -u)
echo "-- 程式用到但 secrets.env 沒有："; comm -23 <(echo "$want") <(echo "$have") | tr '\n' ' '; echo
echo "-- secrets.env 有但程式沒用到（可能是新加的，如 AUTH_HOOK_SECRET / GEMINI_API_KEY）："; comm -13 <(echo "$want") <(echo "$have") | tr '\n' ' '; echo
[ "${1:-}" = "--check" ] && exit 0
supabase secrets set --project-ref "$NEW_REF" --env-file "$SECRETS"
echo "-- 寫入後新專案的 key 清單 vs secrets.env："
remote=$(supabase secrets list --project-ref "$NEW_REF" | tail -n +2 | awk '{print $1}' | sort -u)
comm -23 <(echo "$have") <(echo "$remote") | sed 's/^/  未寫入：/'
echo "完成"
