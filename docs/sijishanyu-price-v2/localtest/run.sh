#!/usr/bin/env bash
# 20261107090000 本機循環：套用前 → 套用後 → rollback → 再套用；再測建單（觸發器、validate-order-prices）
set -uo pipefail
D=/app/docs/sijishanyu-price-v2; L=$D/localtest
NEW=/app/supabase/migrations/20261107090000_sijishanyu_price_v2_migration.sql
TRG=/app/supabase/migrations/20261013210002_fix_package_date_price_and_discount_in_order_trigger.sql
TIER=/app/supabase/migrations/20260910193704_5bba20ae-ece2-4aad-b86b-d58636ea4d90.sql
P() { sudo -u postgres psql -X -q "$@"; }
SNAP="SELECT md5(string_agg(x, '|' ORDER BY x)) FROM (SELECT 'p' || to_jsonb(p)::text AS x FROM public.accommodation_packages p UNION ALL SELECT 't' || to_jsonb(t)::text FROM public.pricing_templates t UNION ALL SELECT 'd' || to_jsonb(d)::text FROM public.discount_codes d UNION ALL SELECT 'f' || (to_jsonb(f) - 'id' - 'updated_at')::text FROM public.accommodation_info_flags f UNION ALL SELECT 'o' || to_jsonb(o)::text FROM public.orders o) s"
fresh() { P -d postgres -c "DROP DATABASE IF EXISTS sjtest" -c "CREATE DATABASE sjtest" > /dev/null; P -d sjtest -v ON_ERROR_STOP=1 -f "$L/schema.sql" -f "$L/seed.sql" > /dev/null; }

fresh
echo "== 網紅碼不是七折（預期 PRECHECK 擋）"
P -d sjtest -c "UPDATE public.discount_codes SET discount_value = 25 WHERE code = 'MIE20'" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
fresh
echo "== 有日型例外（預期 PRECHECK 擋）"
P -d sjtest -c "INSERT INTO public.accommodation_day_tier_overrides (accommodation_id, date, tier) VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', CURRENT_DATE + 3, 'weekend')" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
fresh
echo "== 有奧丁丁設定（預期 PRECHECK 擋）"
P -d sjtest -c "INSERT INTO public.accommodation_owlting_config (accommodation_id, sync_enabled) VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', false)" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
fresh
echo "== 有旭海設定（預期 PRECHECK 擋）"
P -d sjtest -c "INSERT INTO public.accommodation_hotelnabe_config (accommodation_id, sync_enabled) VALUES ('a4bacadc-9b7a-4110-ac04-a1cc6248c822', false)" > /dev/null
P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
fresh

echo "== 套用前：precheck 文件輸出"
P -d sjtest -At -F '|' -f "$D/precheck_20261107090000.sql" | tee /tmp/sj_pre.txt
BEFORE=$(P -d sjtest -At -c "$SNAP"); echo "套用前快照 $BEFORE"
P -d sjtest -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "套用成功"
echo "== 重複套用（預期擋）"; P -d sjtest -f "$NEW" 2>&1 | grep -m1 -o "PRECHECK[^\"]*"
echo "== 套用後：postcheck 文件輸出"
P -d sjtest -At -F '|' -f "$D/postcheck_20261107090000.sql" | tee /tmp/sj_post.txt
echo "== 單間專案指紋：precheck P11 vs postcheck Q7"
diff <(tail -4 /tmp/sj_pre.txt) <(tail -4 /tmp/sj_post.txt) && echo "PASS 單間專案 4 個與套用前完全相同"
echo "== rollback"; P -d sjtest -At -F '|' -v ON_ERROR_STOP=1 -f "$D/rollback_20261107090000.sql" && echo "rollback 成功"
AFTER_RB=$(P -d sjtest -At -c "$SNAP"); echo "rollback 後快照 $AFTER_RB"; [ "$BEFORE" = "$AFTER_RB" ] && echo "PASS 還原後與套用前完全相同" || echo "FAIL 還原後不同"
P -d sjtest -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "再套用成功"
echo "== 上線後有人改單間專案 → rollback 不得蓋掉"
P -d sjtest -c "UPDATE public.pricing_templates SET weekday_price = 4999 WHERE id = 'a247bcaf-74df-49e6-a1e1-d12b1d681263'" > /dev/null
P -d sjtest -At -v ON_ERROR_STOP=1 -f "$D/rollback_20261107090000.sql" > /dev/null && echo "rollback 成功"
P -d sjtest -At -c "SELECT CASE WHEN weekday_price = 4999 THEN 'PASS rollback 沒碰單間專案（仍是 4999）' ELSE 'FAIL 單間專案被 rollback 改成 ' || weekday_price END FROM public.pricing_templates WHERE id = 'a247bcaf-74df-49e6-a1e1-d12b1d681263'"
P -d sjtest -c "UPDATE public.pricing_templates SET weekday_price = 4800 WHERE id = 'a247bcaf-74df-49e6-a1e1-d12b1d681263'" > /dev/null
P -d sjtest -v ON_ERROR_STOP=1 -f "$NEW" > /dev/null && echo "第三次套用成功"
P -d sjtest -At -c "SELECT '再套用後 啟用 ' || count(*) FILTER (WHERE enabled) || '／停用 ' || count(*) FILTER (WHERE NOT enabled) || '／停用名單 ' || string_agg(name, ',' ORDER BY display_order) FILTER (WHERE NOT enabled) FROM public.accommodation_packages"

echo "== 建單觸發器（正式函式原文：classify_day_tier、resolve_template_night_price、validate_order_before_insert）"
TDAY=$(P -d sjtest -At -c "SELECT d::date FROM generate_series(CURRENT_DATE + 14, CURRENT_DATE + 20, '1 day') d WHERE EXTRACT(DOW FROM d) = 2 LIMIT 1")
echo "測試入住日（平日週二）$TDAY"
P -d sjtest -v ON_ERROR_STOP=1 -f "$L/order_schema.sql" > /dev/null
{ sed -n '15,41p' "$TIER"; sed -n '67,245p' "$TIER"; sed -n '89,538p' "$TRG"; echo "CREATE TRIGGER validate_order_before_insert_trigger BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_before_insert();"; } > /tmp/sj_trigger.sql
P -d sjtest -v ON_ERROR_STOP=1 -f /tmp/sj_trigger.sql > /dev/null && echo "觸發器載入成功"
P -d sjtest -At -v tday="$TDAY" -f "$L/order_tests.sql" | grep -v "^$"

echo "== validate-order-prices（正式 index.ts，假 Supabase 回應）"
P -d sjtest -At -c "SELECT json_build_object(
  'room_types', (SELECT json_agg(r) FROM public.room_types r),
  'accommodation_packages', (SELECT json_agg(p) FROM public.accommodation_packages p),
  'pricing_templates', (SELECT json_agg(t) FROM public.pricing_templates t),
  'room_inventory_pricing', (SELECT json_agg(i) FROM public.room_inventory_pricing i WHERE i.date = '$TDAY'),
  'accommodation_info', (SELECT json_agg(a) FROM public.accommodation_info a))" > /tmp/sj_vop_fixture.json
( cd /app && /root/.deno/bin/deno run -A --no-check --no-lock "$L/vop_harness.ts" /tmp/sj_vop_fixture.json "$TDAY" 2>&1 | grep -E "^V[0-9]|error:" )
P -d postgres -c "DROP DATABASE sjtest" > /dev/null
