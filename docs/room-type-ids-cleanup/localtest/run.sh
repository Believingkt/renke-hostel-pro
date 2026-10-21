#!/usr/bin/env bash
# 20261106090000 本機循環（最小 schema）
set -uo pipefail
REPO=/app; D=$REPO/docs/room-type-ids-cleanup; L=$D/localtest
NEW=$REPO/supabase/migrations/20261106090000_room_type_ids_cleanup_and_delete_guard.sql
P() { sudo -u postgres psql -X -q "$@"; }
fresh() { P -d postgres -c "DROP DATABASE IF EXISTS rtic" -c "CREATE DATABASE rtic" > /dev/null; P -d rtic -v ON_ERROR_STOP=1 -f "$L/schema.sql" -f "$L/seed.sql" > /dev/null; }

fresh
echo "== 殘留多 1 筆（預期 PRECHECK 擋）"
P -d rtic -c "UPDATE public.pricing_templates SET room_type_ids = room_type_ids || '99999999-0000-0000-0000-000000000000'::uuid WHERE id = '7e000000-0000-0000-0000-000000000001'" > /dev/null
P -d rtic -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*" | cut -c1-120
fresh
echo "== precheck"; P -d rtic -At -f "$D/precheck_20261106090000.sql" 2>&1 | head -20
echo "== 清理前"; P -d rtic -At -c "SELECT 'pkg', id, room_type_ids FROM public.accommodation_packages ORDER BY id" -c "SELECT 'tpl', id, room_type_id, room_type_ids FROM public.pricing_templates ORDER BY id"
P -d rtic -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 清理後"; P -d rtic -At -c "SELECT 'pkg', id, room_type_ids FROM public.accommodation_packages ORDER BY id" -c "SELECT 'tpl', id, room_type_id, room_type_ids FROM public.pricing_templates ORDER BY id"
echo "== 重複套用（預期 PRECHECK 擋）"; P -d rtic -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
echo "== postcheck"; P -d rtic -At -f "$D/postcheck_20261106090000.sql"
echo "== 測試"; P -d rtic -At -f "$L/tests.sql" 2>&1 | grep -E "^(PASS|FAIL)|ERROR"
echo "== rollback"; P -d rtic -At -v ON_ERROR_STOP=1 -f "$D/rollback_20261106090000.sql" && echo "rollback 成功"
P -d rtic -At -c "SELECT id, room_type_ids FROM public.accommodation_packages WHERE id = '9a74a709-f83b-4a53-a39a-efda917d4802'"
P -d rtic -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
P -d postgres -c "DROP DATABASE rtic" > /dev/null
