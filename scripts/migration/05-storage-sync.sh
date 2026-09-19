#!/usr/bin/env bash
# 前置：(1) supabase/functions/migration-storage-sync 已部署在舊專案（Lovable 端，需併入 main 讓 Lovable 自動部署）
#       (2) Lovable 後台 Secrets 設好 MIGRATION_KEY（與 migration.env 相同）
#       (3) 新專案已 db push（bucket 與 storage policies 由 migration 建立）
set -euo pipefail
cd "$(dirname "$0")"
deno run -A 05-storage-sync.ts "$@"
