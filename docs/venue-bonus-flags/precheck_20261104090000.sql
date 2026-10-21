SELECT '1. 覆蓋表存在（已套用 20261103090000）' AS item, to_regclass('public.teamcommission_venue_revenue_source_overrides') IS NOT NULL AS ok
UNION ALL SELECT '2. 尚未套用（無 venue_source_overrides_month_start）', NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_source_overrides_month_start')
UNION ALL SELECT '3. 沒有生效日不是 1 日的版本', NOT EXISTS (SELECT 1 FROM public.teamcommission_venue_revenue_source_overrides WHERE EXTRACT(day FROM effective_from) <> 1)
UNION ALL SELECT '4. 寫入政策 insert／update／delete 三條都在', (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.teamcommission_venue_revenue_source_overrides'::regclass AND polname IN ('venue_source_overrides_insert', 'venue_source_overrides_update', 'venue_source_overrides_delete')) = 3;

SELECT o.accommodation_id, a.name, o.track, o.effective_from, o.included_order_sources FROM public.teamcommission_venue_revenue_source_overrides o JOIN public.accommodation_info a ON a.id = o.accommodation_id ORDER BY a.name, o.track, o.effective_from;
