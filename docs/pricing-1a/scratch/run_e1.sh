#!/usr/bin/env bash
# E1：scratch 資料庫依序套用 ①②③ → 各重跑一次（應中止）→ rollback ③②① → 再套用一次（供 E2 使用）
set -u
cd /app
P="psql -h /tmp/pg1a -p 55432 -U postgres -X -v ON_ERROR_STOP=1 -d s1a"
M1=supabase/migrations/20261014090000_accommodation_info_flags_price_ui.sql
M2=supabase/migrations/20261014090001_save_package_tier_prices.sql
M3=supabase/migrations/20261014090002_yunxiu_tier_price_conversion.sql
R=docs/pricing-1a
run() { echo "---- $1 ----"; $P -1 -f "$2" 2>&1; echo "exit=$?"; }
snap() {
  $P -At -c "select 'pkg '||numeric_code||' '||tier_prices::text||' sale='||sale_price||' orig='||original_price from accommodation_packages where accommodation_id='7690a606-6bac-4cd5-a3e7-2fa754b318e8' order by numeric_code" \
         -c "select 'tpl '||template_name||' price='||coalesce(price::text,'∅')||' wd='||coalesce(weekday_price::text,'∅')||' pk='||coalesce(peak_price::text,'∅')||'/'||peak_enabled||' we='||coalesce(weekend_price::text,'∅')||'/'||weekend_enabled from pricing_templates where accommodation_id='7690a606-6bac-4cd5-a3e7-2fa754b318e8' order by numeric_code nulls last, template_name" \
         -c "select 'flags '||coalesce((select new_price_ui_enabled||'/'||price_sync_mode||'/'||new_order_dialog_enabled from accommodation_info_flags where accommodation_id='7690a606-6bac-4cd5-a3e7-2fa754b318e8'),'(無列)')" 2>&1
}
echo "==== 初始狀態 ===="; snap
echo "==== 1. 依序套用 ①②③ ===="
run "① 套用" $M1; run "② 套用" $M2; run "③ 套用" $M3
echo "==== 套用後狀態 ===="; snap
$P -At -c "select 'backup acl packages='||coalesce(array_to_string(relacl,','),'(預設)')||' rls='||relrowsecurity from pg_class where relname='backup_20261014_yunxiu_packages'" \
       -c "select 'fn prosecdef='||prosecdef||' cfg='||array_to_string(proconfig,',')||' acl='||array_to_string(proacl,',') from pg_proc where proname='save_package_tier_prices'"
echo "==== 2. 重複套用（應全部中止） ===="
run "① 重跑" $M1; run "② 重跑" $M2; run "③ 重跑" $M3
echo "==== 3. rollback ③ → ② → ① ===="
run "③ rollback" $R/rollback_20261014090002.sql; run "② rollback" $R/rollback_20261014090001.sql; run "① rollback" $R/rollback_20261014090000.sql
echo "==== rollback 後狀態 ===="; snap
$P -At -c "select 'columns left='||count(*) from information_schema.columns where table_name='accommodation_info_flags' and column_name in ('new_price_ui_enabled','new_order_dialog_enabled','price_sync_mode')" \
       -c "select 'fn exists='||(to_regprocedure('public.save_package_tier_prices(uuid,jsonb)') is not null)" \
       -c "select 'policy left='||count(*) from pg_policies where policyname='accommodation_flags_select_own_accommodation'"
echo "==== 4. 清掉備份表後重新套用 ①②③（供 E2） ===="
$P -c "drop table public.backup_20261014_yunxiu_packages, public.backup_20261014_yunxiu_templates" 2>&1
run "① 再套用" $M1; run "② 再套用" $M2; run "③ 再套用" $M3
