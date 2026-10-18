#!/usr/bin/env bash
# 本機演練「正式庫測試計畫」：super_admin 走精靈 → 送審 → 退回 → 再送審（不核准）→ 清理還原
set -uo pipefail
D=/app/docs/onboarding-3
DB=wz3
T=ea55e271-15f8-4e63-9c4f-69fbd2022bc5
SU=44444444-0000-0000-0000-000000000004
q() { psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
psql -X -q -U postgres -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB TEMPLATE wz"
# 測試前狀態：測試館已有 1 個舊房型（測試前建立）與一筆 pending 的 final_check
q <<SQL
SET session_replication_role = replica;
INSERT INTO auth.users (id) VALUES ('$SU');
INSERT INTO user_roles (user_id, accommodation_id, role) VALUES ('$SU', NULL, 'super_admin');
INSERT INTO accommodation_info_flags (accommodation_id, new_price_ui_enabled, auto_template_enabled, price_sync_mode) VALUES ('$T', true, true, 'package_original');
UPDATE accommodation_info SET address='測試路', phone='049', description='介紹' WHERE id='$T';
INSERT INTO room_types (id, accommodation_id, name, capacity, base_price, room_count, created_at) VALUES ('99999999-0000-0000-0000-000000000009', '$T', '測試前既有房型', 2, 1000, 1, now() - interval '3 days');
SET session_replication_role = origin;
SQL
echo "===== 第 1 步唯讀檢查 ====="; q -At -F' | ' -f "$D/prod_test_step1_readonly.sql" > /tmp/step1.out; cat /tmp/step1.out
BEFORE_COUNTS=$(q -At -F'|' -c "SELECT (SELECT count(*) FROM room_types WHERE accommodation_id='$T')||','||(SELECT count(*) FROM accommodation_packages WHERE accommodation_id='$T')||','||(SELECT count(*) FROM pricing_templates WHERE accommodation_id='$T')||','||(SELECT count(*) FROM package_date_prices WHERE accommodation_id='$T')||','||(SELECT count(*) FROM room_inventory_pricing r JOIN room_types t ON t.id=r.room_type_id WHERE t.accommodation_id='$T')")
PREV_ROW=$(q -At -c "SELECT to_jsonb(s) - 'id' - 'created_at' - 'updated_at' FROM accommodation_onboarding_steps s WHERE accommodation_id='$T' AND step_key='final_check'")
START=$(q -At -c "SELECT quote_literal(now())")
PREV=$(q -At -c "SELECT COALESCE(quote_literal((SELECT to_jsonb(s) FROM accommodation_onboarding_steps s WHERE accommodation_id='$T' AND step_key='final_check')), 'NULL')")
sleep 1
echo; echo "===== super_admin 走精靈（不核准）====="
as_su() { q -At -c "SELECT set_config('request.jwt.claims', '{\"sub\":\"$SU\",\"role\":\"authenticated\"}', false); SET ROLE authenticated; $1" | tail -1; }
RT=$(as_su "SELECT public.wizard_save_room_type('$T', NULL, '演練包棟', 6, 9000, 1);"); echo "房型 $RT"
PKG=$(as_su "SELECT public.wizard_save_package('$T', NULL, '包棟演練包棟', '$RT', 6, '{\"weekday\":{\"sale\":8000,\"original\":9000},\"friday_sunday\":{\"sale\":9000,\"original\":10000},\"weekend\":{\"sale\":11000,\"original\":12000}}') ->> 'package_id';"); echo "方案 $PKG"
echo "季節價 $(as_su "SELECT public.wizard_apply_season_prices('$PKG', current_date + 5, current_date + 9, 9500, 10500)::text;")"
echo "庫存 $(as_su "SELECT public.wizard_open_inventory('$T')::text;" | cut -c1-120)"
echo "送審 red_ok=$(as_su "SELECT public.wizard_submit('$T', true) ->> 'red_ok';")"
as_su "SELECT public.wizard_return('$T', '演練退回');" >/dev/null && echo "退回：$(q -At -c "SELECT status||'|'||return_reason FROM accommodation_onboarding_steps WHERE accommodation_id='$T' AND step_key='final_check'")"
echo "再送審 red_ok=$(as_su "SELECT public.wizard_submit('$T', true) ->> 'red_ok';")"
echo "測試館 is_active=$(q -At -c "SELECT is_active FROM accommodation_info WHERE id='$T'")（未核准）"
echo; echo "===== 清理 ====="
sed -e "s/timestamptz '2026-10-20 10:00+08'/timestamptz $START/" -e "s/NULL::jsonb AS prev/${PREV//\//\\/}::jsonb AS prev/" "$D/prod_test_cleanup.sql" > /tmp/cleanup_run.sql
q -At -F' | ' -f /tmp/cleanup_run.sql
AFTER_COUNTS=$(q -At -F'|' -c "SELECT (SELECT count(*) FROM room_types WHERE accommodation_id='$T')||','||(SELECT count(*) FROM accommodation_packages WHERE accommodation_id='$T')||','||(SELECT count(*) FROM pricing_templates WHERE accommodation_id='$T')||','||(SELECT count(*) FROM package_date_prices WHERE accommodation_id='$T')||','||(SELECT count(*) FROM room_inventory_pricing r JOIN room_types t ON t.id=r.room_type_id WHERE t.accommodation_id='$T')")
AFTER_ROW=$(q -At -c "SELECT to_jsonb(s) - 'id' - 'created_at' - 'updated_at' FROM accommodation_onboarding_steps s WHERE accommodation_id='$T' AND step_key='final_check'")
echo; echo "===== 比對 ====="
echo "筆數 測試前=$BEFORE_COUNTS 清理後=$AFTER_COUNTS → $([ "$BEFORE_COUNTS" = "$AFTER_COUNTS" ] && echo PASS || echo FAIL)"
echo "送審狀態（除 updated_at 外）與測試前完全相同 → $([ "$PREV_ROW" = "$AFTER_ROW" ] && echo PASS || echo FAIL)"
echo "測試前既有房型仍在 → $(q -At -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM room_types WHERE id='99999999-0000-0000-0000-000000000009') THEN 'PASS' ELSE 'FAIL' END")"
echo "is_active=false → $(q -At -c "SELECT CASE WHEN NOT is_active THEN 'PASS' ELSE 'FAIL' END FROM accommodation_info WHERE id='$T'")"
