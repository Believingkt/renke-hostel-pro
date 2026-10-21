#!/usr/bin/env bash
# 20261107090000 本機循環：套用前 → 套用後 → rollback → 再套用
set -uo pipefail
D=/app/docs/sijishanyu-price-v2; L=$D/localtest
NEW=/app/supabase/migrations/20261107090000_sijishanyu_price_v2_migration.sql
P() { sudo -u postgres psql -X -q "$@"; }
SNAP="SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT 'p' || to_jsonb(p)::text AS x FROM public.accommodation_packages p UNION ALL SELECT 't' || to_jsonb(t)::text FROM public.pricing_templates t UNION ALL SELECT 'd' || to_jsonb(d)::text FROM public.discount_codes d UNION ALL SELECT 'f' || (to_jsonb(f) - 'id' - 'updated_at')::text FROM public.accommodation_info_flags f UNION ALL SELECT 'o' || to_jsonb(o)::text FROM public.orders o) s"
fresh() { P -d postgres -c "DROP DATABASE IF EXISTS sjtest" -c "CREATE DATABASE sjtest" > /dev/null; P -d sjtest -v ON_ERROR_STOP=1 -f "$L/schema.sql" -f "$L/seed.sql" > /dev/null; }

fresh
echo "== 網紅碼不是七折（預期 PRECHECK 擋）"
P -d sjtest -c "UPDATE public.discount_codes SET discount_value = 25 WHERE code = 'MIE20'" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*" | cut -c1-80
fresh
echo "== 有日型例外（預期 PRECHECK 擋）"
P -d sjtest -c "INSERT INTO public.accommodation_day_tier_overrides (accommodation_id, date, tier) VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', CURRENT_DATE + 3, 'weekend')" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*" | cut -c1-60
fresh
BEFORE=$(P -d sjtest -At -c "$SNAP"); echo "套用前快照 $BEFORE"
P -d sjtest -At -f "$D/precheck_20261107090000.sql" > /dev/null 2>&1; echo "precheck exit $?"
P -d sjtest -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 重複套用（預期擋）"; P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*" | cut -c1-60
echo "== postcheck Q1（順序｜方案｜代碼｜人數｜…｜平日售／原／網紅｜旺日…｜假日…）"
P -d sjtest -At -F '|' -f "$D/postcheck_20261107090000.sql" | head -60
echo "== 新專案（複製 24人包棟）"
P -d sjtest -At -F '|' -c "SELECT t.template_name, t.project_name, t.numeric_code, t.room_type_ids, t.room_type_id, t.meal_plans, t.excluded_dates, t.display_order FROM public.pricing_templates t WHERE t.numeric_code >= 1113 ORDER BY t.numeric_code"
echo "== 新包棟方案（複製 24人包棟的內含／分配）"
P -d sjtest -At -F '|' -c "SELECT p.name, p.includes, p.room_allocation, p.room_type_allocation FROM public.accommodation_packages p WHERE p.name IN ('8人包棟', '30人包棟', '雙人房(山景)') ORDER BY p.display_order"
echo "== rollback"; P -d sjtest -At -v ON_ERROR_STOP=1 -f "$D/rollback_20261107090000.sql" && echo "rollback 成功"
AFTER_RB=$(P -d sjtest -At -c "$SNAP"); echo "rollback 後快照 $AFTER_RB"; [ "$BEFORE" = "$AFTER_RB" ] && echo "PASS 還原後與套用前完全相同" || echo "FAIL 還原後不同"
P -d sjtest -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
P -d postgres -c "DROP DATABASE sjtest" > /dev/null
