#!/usr/bin/env bash
# 舊資料清理 步驟 2：產生預覽檔與執行 SQL（不連資料庫）
# 用法：bash docs/kol-1/legacy-links/build.sh <scan.json> [輸出資料夾，預設 docs/kol-1/legacy-links/out]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
IN="$(realpath "$1")"
OUT="$(realpath -m "${2:-$HERE/out}")"
cd "$REPO/apps/booking"
npx esbuild "$HERE/build.ts" --bundle --platform=node --log-level=warning --alias:@=./src --outfile=/tmp/kol_legacy_build.cjs
KOL_LEGACY_DIR="$HERE" node /tmp/kol_legacy_build.cjs "$IN" "$OUT"
