#!/usr/bin/env bash
# 把 vitest 全套輸出轉成摘要：通過／失敗題數、失敗檔案與失敗題目清單
# 用法：bash summarize_vitest.sh <完整輸出檔> <標題> > 摘要檔
set -uo pipefail
IN="$1"; TITLE="$2"
clean() { sed 's/\x1b\[[0-9;]*m//g' "$IN"; }
echo "# $TITLE"
echo "# 指令：npx vitest run（repo 根目錄，全部 workspace）"
echo
echo "## 總計"
clean | grep -E "^\s+(Test Files|Tests)\s" | sed 's/^ *//'
clean | grep -E "^exit=" || true
echo
echo "## 失敗檔案"
clean | grep -E "^ FAIL .* > " | sed -e "s/^ FAIL *//" -e "s/ > .*//" | sort -u
echo
echo "## 失敗題目（$(clean | grep -E '^ FAIL .* > ' | sort -u | wc -l) 題）"
clean | grep -E "^ FAIL .* > " | sed 's/^ FAIL *//' | sort -u
