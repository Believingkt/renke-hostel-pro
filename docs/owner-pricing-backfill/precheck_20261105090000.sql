SELECT '1. 業主月結規則表存在' AS item, to_regclass('public.owner_settlement_pricing_rules') IS NOT NULL AS ok;
SELECT '2. log 表尚未建立（未套用過）' AS item, to_regclass('public.owner_pricing_rule_date_logs') IS NULL AS ok;
SELECT '3. 獎金快照表存在' AS item, to_regclass('public.teamcommission_bonus_snapshots') IS NOT NULL AS ok;
SELECT '4. 生效日不是 1 日的版本數（必須為 0）' AS item, count(*) AS n FROM public.owner_settlement_pricing_rules WHERE EXTRACT(day FROM effective_from) <> 1;
SELECT '5. 目前可修正月份的角色定義' AS item, prosrc FROM pg_proc WHERE proname = 'can_fix_pricing_rule_date';
SELECT '6. 目前政策清單' AS item, polname FROM pg_policy WHERE polrelid = 'public.owner_settlement_pricing_rules'::regclass ORDER BY polname;
SELECT '7. 目前 trigger' AS item, tgname FROM pg_trigger WHERE tgrelid = 'public.owner_settlement_pricing_rules'::regclass AND NOT tgisinternal ORDER BY tgname;
SELECT '8. 各館版本數（參考）' AS item, a.name, count(*) AS versions, min(r.effective_from) AS first_month, max(r.effective_from) AS last_month FROM public.owner_settlement_pricing_rules r JOIN public.accommodation_info a ON a.id = r.accommodation_id GROUP BY a.name ORDER BY a.name;
