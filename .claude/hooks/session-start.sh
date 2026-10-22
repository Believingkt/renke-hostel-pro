#!/bin/bash
# Claude Code 雲端 session 啟動時安裝依賴，讓 lint / test / typecheck 可直接執行。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Monorepo 以 yarn workspaces 管理（scripts 皆用 yarn）。
# --pure-lockfile：不改寫 yarn.lock，避免每次開 session 都讓工作目錄變髒
yarn install --non-interactive --prefer-offline --pure-lockfile
